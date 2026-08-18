// Transfer Detail — review header, lines table, and conditional action buttons.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §3 (route), §4 (state model/commands)
//   specs/11-transfer-and-inspection/requirements.md R7.1
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1 elevation),
//     §1.3 (status badge colors), §9 (tables, Roboto Mono for IDs/codes/quantities)
//
// Surface: Office. Permission gate: transfer.view.
//
// Conditional action buttons:
//   staged       → "Start Transfer" form calling updateTransferStatus(..., 'in_progress') (gate: transfer.execute)
//   in_progress  → "Execute Transfer" link + "Cancel" form + "Open Inspection" link
//   completed    → (read-only, no action)
//   cancelled    → (read-only, no action)

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getTransferRequest } from "@/lib/db/queries/transfers";
import { updateTransferStatus } from "@/lib/actions/transfers";
import type { TransferLineRow } from "@/lib/db/queries/transfers";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  staged: "STAGED",
  in_progress: "IN PROGRESS",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

const STATUS_CLASSES: Record<string, string> = {
  staged: "bg-status-neutral/10 text-status-neutral",
  in_progress: "bg-status-pending/10 text-status-pending",
  completed: "bg-status-available/10 text-status-available",
  cancelled: "bg-status-held/10 text-status-held",
};

const LINE_STATUS_LABELS: Record<string, string> = {
  pending: "PENDING",
  in_transit: "IN TRANSIT",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

const LINE_STATUS_CLASSES: Record<string, string> = {
  pending: "bg-status-neutral/10 text-status-neutral",
  in_transit: "bg-status-pending/10 text-status-pending",
  completed: "bg-status-available/10 text-status-available",
  cancelled: "bg-status-held/10 text-status-held",
};

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ transferId: string }>;
  searchParams: Promise<{ actionError?: string }>;
}

export default async function TransferDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { transferId } = await params;
  const { actionError } = await searchParams;
  const resolver = await createPageResolver();

  // Gate: transfer.view required to view transfer detail.
  const permResult = await requirePermission(resolver, "transfer.view");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  // Check execute capability for conditional action rendering.
  const canExecute =
    (await requirePermission(resolver, "transfer.execute")).kind === "authorized";

  const transfer = await getTransferRequest(db, transferId);
  if (!transfer) {
    notFound();
  }

  // ─── Inline server action: start transfer ───────────────────────────────────
  async function handleStartTransfer(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const result = await updateTransferStatus(
      actionResolver,
      transferId,
      "in_progress"
    );
    if (result.ok) {
      redirect(`/transfers/${transferId}`);
    }
    const encodedError = encodeURIComponent(result.reason);
    redirect(`/transfers/${transferId}?actionError=${encodedError}`);
  }

  // ─── Inline server action: cancel transfer ──────────────────────────────────
  async function handleCancelTransfer(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const result = await updateTransferStatus(
      actionResolver,
      transferId,
      "cancelled"
    );
    if (result.ok) {
      redirect(`/transfers/${transferId}`);
    }
    const encodedError = encodeURIComponent(result.reason);
    redirect(`/transfers/${transferId}?actionError=${encodedError}`);
  }

  // Parse action error if present
  const actionErrorMsg = actionError
    ? decodeURIComponent(actionError)
    : null;

  return (
    <div className="mx-auto max-w-container">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1 font-body text-body-sm text-text-grey">
          <li>
            <Link
              href="/transfers"
              className="inline-flex h-11 items-center rounded hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Transfer Queue
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li
            aria-current="page"
            className="font-mono text-mono-md text-on-surface"
          >
            {transferId}
          </li>
        </ol>
      </nav>

      {/* Page heading + status badge */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Transfer Request
        </h1>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[transfer.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
        >
          {STATUS_LABELS[transfer.status] ?? transfer.status.toUpperCase()}
        </span>
      </div>

      {/* Action error banner */}
      {actionErrorMsg && (
        <div
          role="alert"
          className="mt-4 rounded-md bg-status-held/10 px-4 py-3"
        >
          <p className="font-label text-label uppercase text-status-held">
            Action failed
          </p>
          <p className="mt-1 font-body text-body-md text-status-held">
            {actionErrorMsg}
          </p>
        </div>
      )}

      {/* Transfer summary card — Level 1 office elevation */}
      <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Transfer Details
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-label text-label text-text-grey">Status</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[transfer.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
              >
                {STATUS_LABELS[transfer.status] ?? transfer.status.toUpperCase()}
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Flow Type</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {FLOW_LABELS[transfer.flowType] ?? transfer.flowType}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              From Location
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {transfer.fromLocationId}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              To Location
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {transfer.toLocationId}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Requested By
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {transfer.requestedBy}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Created At</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {transfer.createdAt.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Requires Approval
            </dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {transfer.requiresApproval ? "Yes" : "No"}
            </dd>
          </div>
        </dl>
      </div>

      {/* Action buttons — conditional on transfer status and execute capability */}
      {canExecute && (
        <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 p-6">
          <h2 className="font-heading font-semibold text-data-display text-on-surface">
            Actions
          </h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {transfer.status === "staged" && (
              <form action={handleStartTransfer}>
                <button
                  type="submit"
                  className="flex h-11 items-center justify-center rounded bg-primary px-4 font-label text-label text-surface-white hover:bg-primary-hover motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Start Transfer
                </button>
              </form>
            )}

            {transfer.status === "in_progress" && (
              <>
                {/* Execute Transfer — links to floor execution interface */}
                <Link
                  href={`/transfers/${transferId}/execute`}
                  className="inline-flex h-11 items-center justify-center rounded bg-primary px-4 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Execute Transfer
                </Link>

                {/* Open Inspection — links to the inspect interface */}
                <Link
                  href={`/transfers/${transferId}/inspect`}
                  className="inline-flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Open Inspection
                </Link>

                {/* Cancel — inline server action */}
                <form action={handleCancelTransfer}>
                  <button
                    type="submit"
                    className="flex h-11 items-center justify-center rounded bg-status-held px-4 font-label text-label text-surface-white hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    Cancel Transfer
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Lines table — Level 1 office elevation */}
      <div className="mt-6 overflow-hidden rounded-md bg-surface-white shadow-elevation-1">
        <div className="px-6 py-4">
          <h2 className="font-heading font-semibold text-data-display text-on-surface">
            Transfer Lines ({transfer.lines.length})
          </h2>
        </div>
        {transfer.lines.length === 0 ? (
          <div className="px-6 pb-8 text-center">
            <p className="font-body text-body-md text-text-grey">
              No lines on this transfer.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  {/* Epilogue SemiBold uppercase headers per §9 tables */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Lot ID
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Item ID
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Qty Requested
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Qty Transferred
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {transfer.lines.map((line: TransferLineRow) => (
                  <tr key={line.id} className="hover:bg-surface-light-grey/50">
                    {/* Roboto Mono for lot/item IDs per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {line.lotId}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {line.itemId}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-mono-md text-on-surface">
                      {line.qtyRequested}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-mono-md text-on-surface">
                      {line.qtyTransferred}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${LINE_STATUS_CLASSES[line.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
                      >
                        {LINE_STATUS_LABELS[line.status] ??
                          line.status.toUpperCase()}
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
