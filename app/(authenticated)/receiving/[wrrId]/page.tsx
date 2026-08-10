// WRR detail — review, action buttons, and item line table.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §3 (route), §4 (state model/commands),
//     §5.2 (scan-line state), §7 (disposition)
//   specs/07-incoming-receiving/requirements.md R2, R7
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1 elevation)
//
// Surface: Office. Permission gate: receiving.confirm.
//
// Action buttons are shown conditionally by WRR status:
//   staged_pending_arrival → "Start Receiving"
//   receiving_in_progress  → "Scan / Receive Items" link (per-line commit now
//     happens on the floor scan screen — [wrrId]/receive/page.tsx — per
//     design.md §9's 2026-08-10 per-line-commit reversal; this detail page no
//     longer offers a whole-WRR commit action)
//   confirmed              → "Print Receipt" link

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import { startReceiving } from "@/lib/actions/receiving";
import type { WrrItemRow } from "@/lib/db/queries/receiving";
import { WRRUnitLabelGenerator } from "@/components/barcode/WRRUnitLabelGenerator";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  staged_pending_arrival: "STAGED",
  receiving_in_progress: "IN PROGRESS",
  confirmed: "CONFIRMED",
  cancelled: "CANCELLED",
};

const STATUS_CLASSES: Record<string, string> = {
  staged_pending_arrival: "bg-status-pending/10 text-status-pending",
  receiving_in_progress: "bg-status-pending/10 text-status-pending",
  confirmed: "bg-status-available/10 text-status-available",
  cancelled: "bg-status-held/10 text-status-held",
};

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

// Disposition badge: store → status-available tint, inspect → status-pending tint
// per task specification.
const DISPOSITION_CLASSES: Record<string, string> = {
  store: "bg-status-available/10 text-status-available",
  inspect: "bg-status-pending/10 text-status-pending",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ wrrId: string }>;
}

export default async function WrrDetailPage({ params }: PageProps) {
  const { wrrId } = await params;
  const resolver = await createPageResolver();

  // Gate: receiving.view — read-only detail/review surface visible to any staff
  // who can view WRRs, not only those who can confirm.
  const permResult = await requirePermission(resolver, "receiving.view");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const wrr = await getWrrDocument(db, wrrId);
  if (!wrr) {
    notFound();
  }

  // ─── Inline server action: startReceiving ──────────────────────────────────
  async function handleStartReceiving(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    await startReceiving(actionResolver, wrrId);
    // Revalidate by redirecting back to this page so the updated status renders.
    redirect(`/receiving/${wrrId}`);
  }

  return (
    <div className="mx-auto max-w-container">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1 font-body text-body-sm text-text-grey">
          <li>
            <Link
              href="/receiving"
              className="inline-flex h-11 items-center rounded hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Receiving Queue
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li
            aria-current="page"
            className="font-mono text-mono-md text-on-surface"
          >
            {wrr.wrrNumber}
          </li>
        </ol>
      </nav>

      {/* Page heading + status badge */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          {wrr.wrrNumber}
        </h1>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[wrr.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
        >
          {STATUS_LABELS[wrr.status] ?? wrr.status.toUpperCase()}
        </span>
      </div>

      {/* WRR summary card — Level 1 office elevation */}
      <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Document Details
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-label text-label text-text-grey">WRR Number</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {wrr.wrrNumber}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Flow Type</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {FLOW_LABELS[wrr.flowType] ?? wrr.flowType}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Vendor Party ID
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {wrr.vendorPartyId}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Staged By</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {wrr.stagedByUserId}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Created At</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {wrr.createdAt.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Status</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[wrr.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
              >
                {STATUS_LABELS[wrr.status] ?? wrr.status.toUpperCase()}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Action buttons — conditional on WRR status */}
      <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Actions
        </h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {wrr.status === "staged_pending_arrival" && (
            <form action={handleStartReceiving}>
              <button
                type="submit"
                className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Start Receiving
              </button>
            </form>
          )}

          {wrr.status === "receiving_in_progress" && (
            // Scan / Receive — links to the floor scan-and-per-line-commit
            // interface. Per-line "Store"/"Hold" commits happen there
            // (design.md §6.2/§6.3/§9); this office detail page does not
            // offer a whole-WRR commit action.
            <Link
              href={`/receiving/${wrrId}/receive`}
              className="inline-flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Scan / Receive Items
            </Link>
          )}

          {wrr.status === "confirmed" && (
            <Link
              href={`/receiving/${wrrId}/print`}
              className="inline-flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Print Receipt
            </Link>
          )}
        </div>
      </div>

      {/* Items table — Level 1 office elevation */}
      <div className="mt-6 overflow-hidden rounded-md bg-surface-white shadow-elevation-1">
        <div className="px-6 py-4">
          <h2 className="font-heading font-semibold text-data-display text-on-surface">
            Expected Lines ({wrr.items.length})
          </h2>
        </div>
        {wrr.items.length === 0 ? (
          <div className="px-6 pb-8 text-center">
            <p className="font-body text-body-md text-text-grey">
              No line items on this WRR.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Lot Number
                  </th>
                  {/* Note: itemCode and UOM are not available in the current
                      WrrItemRow query result. Extend getWrrDocument to include
                      these when the query is updated. */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Item ID
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Expected Qty
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Scanned Qty
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Disposition
                  </th>
                  <th className="px-4 py-3 text-center font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Labels
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {wrr.items.map((item: WrrItemRow) => (
                  <tr key={item.id} className="hover:bg-surface-light-grey/50">
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {item.lotNumber}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {item.itemId ?? (
                        <span className="text-status-neutral">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-mono-md text-on-surface">
                      {item.expectedQty}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-mono-md text-on-surface">
                      {item.scannedQty}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${DISPOSITION_CLASSES[item.disposition] ?? "bg-status-neutral/10 text-status-neutral"}`}
                      >
                        {item.disposition === "store" ? "STORE" : "INSPECT"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <WRRUnitLabelGenerator
                        wrrItemId={item.id}
                        wrrNumber={wrr.wrrNumber}
                        itemCode={item.itemId ?? item.lotNumber}
                        lotNumber={item.lotNumber}
                        expectedQty={item.expectedQty}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
