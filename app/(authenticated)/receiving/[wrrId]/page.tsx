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
//   staged_pending_arrival → "Start Receiving" (TODO: startReceiving action not yet in lib/actions/receiving.ts)
//   receiving_in_progress  → "Scan Items" link + "Commit" button
//   confirmed              → "Print Receipt" link

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import { commitWrr } from "@/lib/actions/receiving";
import type { WrrItemRow } from "@/lib/db/queries/receiving";

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
  searchParams: Promise<{ commitError?: string }>;
}

export default async function WrrDetailPage({ params, searchParams }: PageProps) {
  const { wrrId } = await params;
  const { commitError } = await searchParams;
  const resolver = await createPageResolver();

  // Gate: receiving.confirm required to view WRR detail.
  const permResult = await requirePermission(resolver, "receiving.confirm");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const wrr = await getWrrDocument(db, wrrId);
  if (!wrr) {
    notFound();
  }

  // ─── Inline server action: commitWrr ────────────────────────────────────────
  async function handleCommit(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const result = await commitWrr(actionResolver, db, wrrId);
    if (result.ok) {
      redirect(`/receiving/${wrrId}`);
    }
    const encodedErrors = encodeURIComponent(result.errors.join("|"));
    redirect(`/receiving/${wrrId}?commitError=${encodedErrors}`);
  }

  // Parse commit errors if present
  const commitErrors = commitError
    ? decodeURIComponent(commitError).split("|").filter(Boolean)
    : [];

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
        <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
          {wrr.wrrNumber}
        </h1>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[wrr.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
        >
          {STATUS_LABELS[wrr.status] ?? wrr.status.toUpperCase()}
        </span>
      </div>

      {/* Commit error banner */}
      {commitErrors.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-md bg-status-held/10 px-4 py-3"
        >
          <p className="font-label text-label uppercase text-status-held">
            Commit failed
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {commitErrors.map((err) => (
              <li
                key={err}
                className="font-body text-body-md text-status-held"
              >
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* WRR summary card — Level 1 office elevation */}
      <div className="mt-6 rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-brand-navy">
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
      <div className="mt-6 rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-brand-navy">
          Actions
        </h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {wrr.status === "staged_pending_arrival" && (
            <>
              {/*
               * TODO: Wire to startReceiving server action once added to
               * lib/actions/receiving.ts. The action should transition
               * wrr_documents.status from 'staged_pending_arrival' to
               * 'receiving_in_progress'. Currently rendered as disabled.
               */}
              <button
                type="button"
                disabled
                title="Start Receiving action is not yet implemented in lib/actions/receiving.ts"
                className="flex h-11 cursor-not-allowed items-center justify-center rounded bg-brand-navy/40 px-4 font-label text-label text-surface-white"
              >
                Start Receiving
              </button>
              <p className="flex items-center font-body text-body-sm text-text-grey">
                Start Receiving is pending implementation.
              </p>
            </>
          )}

          {wrr.status === "receiving_in_progress" && (
            <>
              {/* Scan Items — links to floor scan interface */}
              <Link
                href={`/receiving/${wrrId}/receive`}
                className="inline-flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Scan Items
              </Link>

              {/* Commit — inline server action */}
              <form action={handleCommit}>
                <button
                  type="submit"
                  className="flex h-11 items-center justify-center rounded bg-brand-red px-4 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Commit Receipt
                </button>
              </form>
            </>
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
      <div className="mt-6 overflow-hidden rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1">
        <div className="px-6 py-4">
          <h2 className="font-heading font-semibold text-data-display text-brand-navy">
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
