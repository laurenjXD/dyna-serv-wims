// `/portal/inventory` — Party Portal: My Inventory (read-only).
//
// Traceability:
//   specs/22-parties-portal/design.md §5 (VMI inventory-position view),
//     §4 (authorization: reporting.read, assigned_party scope), §8
//     (no offline caching — fresh authoritative reads only).
//   specs/22-parties-portal/requirements.md R2 (scoped lot_location_balances
//     read), R2.4 (no inventory_transactions query from this view).
//   specs/22-parties-portal/tasks.md Task 3 (VMI inventory-position view).
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation),
//     §2 (typography), §9 (office table pattern, Roboto Mono for numeric cols).
//
// Surface: Party (office-style glassmorphism per design.md §3.3).
// Capability gate: reporting.read, scoped to the caller's own party + the
//   'vmi' flow (this view is VMI-only per design.md §5).
// Offline: no offline caching (design.md Task 8, requirements.md R8).
// Supplies-flow: NEVER rendered — design.md constraints, requirements.md R1.
//
// Party scope is resolved from lib/rbac/session.ts's
// AuthorizationContext.partyScopes via lib/portal/resolve-party-scope.ts —
// never from a client-supplied party_id/flow_type. Task 2's full
// multi-assignment switcher is not yet built; see that helper's docstring.

import { Package, Download } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { resolveActivePartyScope } from "@/lib/portal/resolve-party-scope";
import { db } from "@/lib/db/client";
import {
  listPartyVmiInventory,
  type PartyVmiInventoryRow,
} from "@/lib/db/queries/inventory";

// ─── Types ────────────────────────────────────────────────────────────────────

type LotStatus = "staged" | "available" | "quarantined" | "depleted" | "expired";

interface InventoryRow {
  id: string;
  itemCode: string;
  itemName: string;
  lotNumber: string;
  location: string;
  qtyOnHand: number;
  status: LotStatus;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
// brand-design-system.md §1.3 semantic colors — never raw hex.
// Values mirror lib/db/schema/enums.ts's lotStatusEnum exactly.

const STATUS_CLASSES: Record<LotStatus, string> = {
  staged: "bg-status-pending/10 text-status-pending",
  available: "bg-status-available/10 text-status-available",
  quarantined: "bg-status-held/10 text-status-held",
  depleted: "bg-status-neutral/10 text-status-neutral",
  expired: "bg-status-held/10 text-status-held",
};

const STATUS_LABELS: Record<LotStatus, string> = {
  staged: "STAGED",
  available: "AVAILABLE",
  quarantined: "QUARANTINED",
  depleted: "DEPLETED",
  expired: "EXPIRED",
};

function toInventoryRow(row: PartyVmiInventoryRow): InventoryRow {
  return {
    id: row.id,
    itemCode: row.itemCode,
    itemName: row.itemName,
    lotNumber: row.lotNumber,
    location: row.locationLabel,
    qtyOnHand: row.qtyOnHand,
    status: (row.lotStatus as LotStatus) ?? "staged",
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ location?: string; category?: string }>;
}

export default async function PortalInventoryPage({ searchParams }: PageProps) {
  await searchParams; // consumed for future filter wiring — TODO

  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();

  if (resolution.kind !== "authorized") {
    return <PermissionDenied />;
  }

  const partyScope = resolveActivePartyScope(resolution.context);
  if (!partyScope) {
    return <NoPartyScope />;
  }

  const permResult = await requirePermission(resolver, "reporting.read", {
    partyId: partyScope.partyId,
    flowType: "vmi",
  });

  if (permResult.kind !== "authorized") {
    return <PermissionDenied />;
  }

  const rows = (await listPartyVmiInventory(db, partyScope.partyId)).map(
    toInventoryRow,
  );

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
            My Inventory
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Your current stock position. All data scoped to your account.
          </p>
        </div>

        {/* Export CSV — h-11 (44px) office touch target */}
        {/* TODO: wire to CSV export server action scoped to session party */}
        <button
          type="button"
          className="flex h-11 items-center gap-2 rounded bg-brand-navy px-4 font-label text-label text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97] hover:opacity-90"
        >
          <Download size={16} aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────────
          TODO: wire to real filters once lot_location_balances query is built */}
      <div className="mt-6">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="location-filter"
              className="font-label text-label text-text-grey"
            >
              Location
            </label>
            <select
              id="location-filter"
              name="location"
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="">All locations</option>
              {/* TODO: wire to locations query */}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="category-filter"
              className="font-label text-label text-text-grey"
            >
              Item category
            </label>
            <select
              id="category-filter"
              name="category"
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="">All categories</option>
              {/* TODO: wire to item categories via party_visible_items */}
            </select>
          </div>
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97] hover:opacity-90"
          >
            Apply
          </button>
        </form>
      </div>

      {/* ── Inventory table — Level 1 glassmorphism (office/party surface) ─── */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Package size={40} className="text-text-grey" aria-hidden="true" />
            <p className="font-body text-body-md text-text-grey">
              No inventory items found.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  {/* Epilogue SemiBold uppercase headers per §9 */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Item Code
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Item Name
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Lot #
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Location
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Qty on Hand
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Flow
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/50">
                    {/* Item code — Roboto Mono for codes */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.itemCode}
                    </td>
                    {/* Item name — Outfit Regular body */}
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {row.itemName}
                    </td>
                    {/* Lot number — Roboto Mono */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.lotNumber}
                    </td>
                    {/* Location — Roboto Mono */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.location}
                    </td>
                    {/* Qty on hand — Roboto Mono, right-aligned per §9 */}
                    <td className="px-4 py-3 text-right font-mono text-mono-md text-on-surface">
                      {row.qtyOnHand.toLocaleString()}
                    </td>
                    {/* Flow type badge — this view is VMI-only by query
                        construction (lots.flow_type = 'vmi'), design.md §5 */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-brand-royal-blue/10 px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] text-brand-royal-blue">
                        VMI
                      </span>
                    </td>
                    {/* Status badge — §1.3 semantic colors */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${STATUS_CLASSES[row.status]}`}
                      >
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* VMI pricing disclaimer — requirements.md R2, design.md §5.
          VMI prices shown are a per-release reference only — NOT the
          authoritative bill. The real VMI bill is always the period average.
          NOTE: NO price columns are rendered in this table by design. */}
      <p className="mt-3 font-body text-body-sm text-text-grey">
        Quantities shown are live on-hand balances. VMI billing is based on the
        period-average consumption rate, not this snapshot.
      </p>
    </div>
  );
}

// ─── Denial states ──────────────────────────────────────────────────────────

function PermissionDenied() {
  return (
    <div className="mx-auto max-w-container px-8 py-12 text-center">
      <Package
        size={40}
        className="mx-auto mb-3 text-text-grey"
        aria-hidden="true"
      />
      <p className="font-body text-body-md text-text-grey">
        You do not have permission to view inventory.
      </p>
      <p className="mt-2 font-body text-body-sm text-text-grey">
        This page requires the{" "}
        <span className="font-mono text-mono-md">reporting.read</span>{" "}
        capability.
      </p>
    </div>
  );
}

// Fail-safe empty state: no active party scope resolved for this session —
// never falls through to an unscoped query (see resolve-party-scope.ts).
function NoPartyScope() {
  return (
    <div className="mx-auto max-w-container px-8 py-12 text-center">
      <Package
        size={40}
        className="mx-auto mb-3 text-text-grey"
        aria-hidden="true"
      />
      <p className="font-body text-body-md text-text-grey">
        No party assignment is linked to your account.
      </p>
      <p className="mt-2 font-body text-body-sm text-text-grey">
        Contact your administrator to request portal access.
      </p>
    </div>
  );
}
