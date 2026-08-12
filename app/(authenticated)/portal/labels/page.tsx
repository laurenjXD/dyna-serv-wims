// `/portal/labels` — Party Portal: Supplier-initiated barcode pre-labeling.
//
// Traceability:
//   specs/22-parties-portal/design.md §7c (the full workflow: thin form —
//     item, non-authoritative per-label quantity, optional supplier lot
//     number; 1D/Code 128 `WAN:<uuid>` payload; writes a new
//     `wrr_advance_notices` row, never into 07's `wrr_items`/WRR-creation
//     path), §4 (capability: shipment_labels.generate, assigned_party scope,
//     restricted to inbound-supplying vendor/supplier party_roles, excluding
//     any hybrid party that also holds a customer/end_customer role).
//   specs/02-rbac-roles/design.md §3.2/§7.4 (shipment_labels.generate
//     catalog addition, 2026-08-06 — the four-condition RLS pattern).
//   specs/00-steering/brand-design-system.md §9 (office forms: Inter Regular,
//     brand-navy focus ring, 44px touch targets), §1.1a (left-accent-bar
//     pattern for the non-authoritative-quantity and eligibility notices).
//
// Surface: Party (office-style presentation per design.md §3.3).
// Capability gate: shipment_labels.generate, scoped to the caller's own
//   party. UNLIKE /portal/notifications, this capability is explicitly
//   BLOCKED per design.md §7c's closing paragraph pending FOUR separate
//   cross-spec approval/verification processes completing: (a) 02's own
//   sign-off for the shipment_labels.generate catalog addition, (b) 01's
//   dedicated db-migration-verifier pass for the new wrr_advance_notices
//   table (an unverified schema amendment to an already-Approved spec), (c)
//   07's sign-off for the confirmed matching flow (R1a/§5.5), and (d) 18's
//   sign-off for the FR-2.3 1D-decode exception. None of those four have
//   closed yet, so this capability does not exist in the seeded RBAC catalog
//   — requirePermission below will correctly deny every caller until it
//   does. This page renders the form UI only, per design.md §7c's already-
//   settled field list, so the shape is ready the moment the backend lands;
//   it submits nothing (no server action exists to call).
// Offline: explicitly online-only (Tier 2) once implemented — design.md §9.

import { Tag, AlertTriangle, Info } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { resolveActivePartyScope } from "@/lib/portal/resolve-party-scope";

// ─── Mock data ────────────────────────────────────────────────────────────────
// TODO: replace with a party_visible_items query (specs/02-rbac-roles/
// design.md §7.4) once that view exists — item selection is scoped to items
// the party has already shipped before (design.md §7c "Scope boundary"), not
// the party's full catalog.

const MOCK_VISIBLE_ITEMS = [
  { id: "item-1", code: "ITM-4092", name: "Industrial Bearings" },
  { id: "item-2", code: "ITM-2210", name: "Hydraulic Fittings" },
  { id: "item-3", code: "ITM-7731", name: "Steel Bracket Assembly" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PortalLabelsPage() {
  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();

  if (resolution.kind !== "authorized") {
    return <PermissionDenied />;
  }

  const partyScope = resolveActivePartyScope(resolution.context);
  if (!partyScope) {
    return <NoPartyScope />;
  }

  // Pre-labeling is inbound-supplying only (VMI vendor, or Trading
  // vendor/supplier) — never a Trading customer/end_customer, and never a
  // hybrid party holding both roles (design.md §7c, R11.1a). That role check
  // itself lives in RLS (02 design.md §7.4's four-condition WITH CHECK); this
  // capability check is the first, coarser gate.
  const permResult = await requirePermission(resolver, "shipment_labels.generate", {
    partyId: partyScope.partyId,
    flowType: partyScope.flowType ?? "vmi",
  });

  if (permResult.kind !== "authorized") {
    return <NotYetAvailable />;
  }

  // Unreachable today (requirePermission above always denies until 02/01/07/18
  // all close their respective processes — see file header) — kept so the
  // authorized branch's UI is ready the moment that changes, not backfilled
  // later as a rush job.
  return (
    <div className="mx-auto max-w-container">
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          Pre-Ship Label
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Generate a barcode label for your next outbound dispatch to the warehouse.
        </p>
      </div>

      <LabelForm />
    </div>
  );
}

// ─── The thin form — design.md §7c's exact three fields, nothing else ────────

function LabelForm() {
  return (
    <div className="mt-6 max-w-xl">
      {/* Non-authoritative quantity disclaimer — design.md §7c: "The UI
          states this non-authority explicitly and prominently." */}
      <div className="mb-5 flex gap-3 rounded-lg border-l-4 border-status-pending border border-outline-variant/30 bg-status-pending/10 px-4 py-3">
        <Info size={20} className="mt-0.5 shrink-0 text-status-pending" aria-hidden="true" />
        <p className="font-body text-body-sm text-on-surface">
          The quantity you declare here is for labeling purposes only and is{" "}
          <strong>not authoritative</strong>. The actual received quantity is
          always determined by the physical count at receiving.
        </p>
      </div>

      <form className="flex flex-col gap-5 rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
        <div>
          <label
            htmlFor="label-item"
            className="mb-1.5 block font-label text-label text-on-surface"
          >
            Item
          </label>
          <select
            id="label-item"
            name="item"
            disabled
            className="h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:bg-surface-light-grey"
          >
            {MOCK_VISIBLE_ITEMS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} — {item.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="label-quantity"
            className="mb-1.5 block font-label text-label text-on-surface"
          >
            Quantity for this label
          </label>
          <input
            id="label-quantity"
            name="quantity"
            type="number"
            min={1}
            disabled
            placeholder="e.g. 50"
            className="h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:bg-surface-light-grey"
          />
        </div>

        <div>
          <label
            htmlFor="label-lot-number"
            className="mb-1.5 block font-label text-label text-on-surface"
          >
            Your lot number <span className="font-body text-body-sm text-text-grey">(optional)</span>
          </label>
          <input
            id="label-lot-number"
            name="lotNumber"
            type="text"
            disabled
            placeholder="Your own shipment lot reference"
            className="h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:bg-surface-light-grey"
          />
        </div>

        {/* TODO: submit action — writes a wrr_advance_notices row per
            design.md §7c. No server action exists yet; see file header. */}
        <button
          type="button"
          disabled
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-brand-red font-label text-label font-bold text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Tag size={18} aria-hidden="true" />
          Generate Label
        </button>
      </form>
    </div>
  );
}

// ─── Denial states ──────────────────────────────────────────────────────────

// This is the branch every caller hits today — shipment_labels.generate is
// not yet a real grant in the seeded RBAC catalog (see file header's four
// blocking processes), so this reads as "not built yet," not "you lack
// permission," which would misleadingly suggest a role change could fix it.
function NotYetAvailable() {
  return (
    <div className="mx-auto max-w-container">
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          Pre-Ship Label
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Generate a barcode label for your next outbound dispatch to the warehouse.
        </p>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <AlertTriangle size={40} className="text-status-pending" aria-hidden="true" />
        <p className="font-body text-body-md text-on-surface">
          Pre-ship labeling is not available yet.
        </p>
        <p className="max-w-md font-body text-body-sm text-text-grey">
          This feature is pending backend approval across several dependent
          systems. It will become available here automatically once that
          work is complete — no action is needed on your part.
        </p>
      </div>
    </div>
  );
}

function PermissionDenied() {
  return (
    <div className="mx-auto max-w-container px-8 py-12 text-center">
      <Tag size={40} className="mx-auto mb-3 text-text-grey" aria-hidden="true" />
      <p className="font-body text-body-md text-text-grey">
        You do not have permission to view this page.
      </p>
    </div>
  );
}

// Fail-safe empty state: no active party scope resolved for this session —
// never falls through to an unscoped query (see resolve-party-scope.ts).
function NoPartyScope() {
  return (
    <div className="mx-auto max-w-container px-8 py-12 text-center">
      <Tag size={40} className="mx-auto mb-3 text-text-grey" aria-hidden="true" />
      <p className="font-body text-body-md text-text-grey">
        No party assignment is linked to your account.
      </p>
      <p className="mt-2 font-body text-body-sm text-text-grey">
        Contact your administrator to request portal access.
      </p>
    </div>
  );
}
