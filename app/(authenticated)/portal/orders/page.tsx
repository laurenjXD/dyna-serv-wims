// `/portal/orders` — Party Portal: My Orders (read-only).
//
// Traceability:
//   specs/22-parties-portal/design.md §6 (Trading order/document history view),
//     §4 (authorization: pick_list.read, assigned_party scope), §8 (no offline).
//   specs/22-parties-portal/requirements.md R3 (scoped pick_lists read),
//     R3.3 (snapshot fields only — no live lots join), R3.4 (margin/cost
//     fields are NEVER selected or rendered in any query).
//   specs/22-parties-portal/tasks.md Task 4 (Trading order/document history).
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation),
//     §2 (typography), §9 (office table pattern, Roboto Mono for codes).
//
// Surface: Party (office-style glassmorphism per design.md §3.3).
// Capability gate: pick_list.read, scoped to the caller's own party + the
//   'trading' flow (this view is Trading-only per design.md §6).
// Offline: no offline caching (design.md Task 8, requirements.md R8).
// Pricing: Trading prices shown on pick list items are FINAL (brand-design-system.md
//   "Trading/3PL" note). Margin, buying_price, and cost fields are NEVER
//   rendered — requirements.md R3.4, tasks.md Task 4 query-shape assertion.
//
// Party scope is resolved from lib/rbac/session.ts's
// AuthorizationContext.partyScopes via lib/portal/resolve-party-scope.ts —
// never from a client-supplied party_id/flow_type.

import Link from "next/link";
import { ListChecks, FileText } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { resolveActivePartyScope } from "@/lib/portal/resolve-party-scope";
import { db } from "@/lib/db/client";
import { listPartyPickLists } from "@/lib/db/queries/withdrawals";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = "allocated" | "picked" | "dispatched";

interface OrderRow {
  id: string;
  pickListNumber: string;
  date: string;
  itemsCount: number;
  status: OrderStatus;
}

// ─── Status helpers — tokens from tailwind.config.ts, no raw hex ──────────────
// brand-design-system.md §1.3. Values mirror lib/db/schema/enums.ts's
// pickListStatusEnum exactly.

const STATUS_CLASSES: Record<OrderStatus, string> = {
  allocated: "bg-status-pending/10 text-status-pending",
  picked: "bg-status-pending/10 text-status-pending",
  dispatched: "bg-status-available/10 text-status-available",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  allocated: "ALLOCATED",
  picked: "PICKED",
  dispatched: "DISPATCHED",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PortalOrdersPage() {
  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();

  if (resolution.kind !== "authorized") {
    return <PermissionDenied />;
  }

  const partyScope = resolveActivePartyScope(resolution.context);
  if (!partyScope) {
    return <NoPartyScope />;
  }

  const permResult = await requirePermission(resolver, "pick_list.read", {
    partyId: partyScope.partyId,
    flowType: "trading",
  });

  if (permResult.kind !== "authorized") {
    return <PermissionDenied />;
  }

  const rawRows = await listPartyPickLists(db, partyScope.partyId);
  const orders: OrderRow[] = rawRows.map((row) => ({
    id: row.id,
    pickListNumber: row.pickListNumber,
    date: row.createdAt.toISOString().slice(0, 10),
    itemsCount: row.itemsCount,
    status: (row.status as OrderStatus) ?? "allocated",
  }));

  return (
    <div className="mx-auto max-w-container">
      {/* Page header — Fira Sans Bold headline-xl per §2 */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          My Orders
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Your pick lists and order history. All data scoped to your account.
        </p>
      </div>

      {/* ── Orders table — Level 1 glassmorphism (office/party surface) ──────
          Epilogue SemiBold uppercase headers, Outfit Regular body,
          Roboto Mono for codes per §9. */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <ListChecks
              size={40}
              className="text-text-grey"
              aria-hidden="true"
            />
            <p className="font-body text-body-md text-text-grey">
              No orders found.
            </p>
            <p className="font-body text-body-sm text-text-grey">
              Orders appear here once pick lists have been committed for your
              account.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Pick List #
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Items
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                  <th className="sr-only px-4 py-3">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-surface-light-grey/50"
                  >
                    {/* Pick list number — Roboto Mono for codes per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {order.pickListNumber}
                    </td>
                    {/* Date — body text */}
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {order.date}
                    </td>
                    {/* Items count — Roboto Mono for numeric columns */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {order.itemsCount}
                    </td>
                    {/* Status badge — §1.3 semantic colors */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${STATUS_CLASSES[order.status]}`}
                      >
                        {STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    {/* Documents link — shown once dispatched; the documents
                        list itself is independently party-scoped, so no
                        document id needs to be threaded through here. */}
                    <td className="px-4 py-3 text-right">
                      {order.status === "dispatched" ? (
                        <Link
                          href="/portal/documents"
                          className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97]"
                        >
                          <FileText size={16} aria-hidden="true" />
                          Documents
                        </Link>
                      ) : (
                        <span className="font-body text-body-sm text-text-grey">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trading price note — PRODUCT/2026-08-09: Trading prices shown on
          pick list documents are FINAL. No price/cost columns are rendered
          in this orders table — prices live in the document view only. */}
    </div>
  );
}

// ─── Denial states ──────────────────────────────────────────────────────────

function PermissionDenied() {
  return (
    <div className="mx-auto max-w-container px-8 py-12 text-center">
      <ListChecks
        size={40}
        className="mx-auto mb-3 text-text-grey"
        aria-hidden="true"
      />
      <p className="font-body text-body-md text-text-grey">
        You do not have permission to view orders.
      </p>
      <p className="mt-2 font-body text-body-sm text-text-grey">
        This page requires the{" "}
        <span className="font-mono text-mono-md">pick_list.read</span>{" "}
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
      <ListChecks
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
