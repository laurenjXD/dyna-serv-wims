// Approval Queue — request detail, target snapshot, and approve/reject controls.
//
// Traceability:
//   specs/09-approval-queue/design.md §3 (FifoOverrideSnapshot), §5 (state machine),
//     §6 (authorization), §7 (queue UI)
//   specs/00-steering/brand-design-system.md (office surface, WCAG AA, §7 diagonal-cut)

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getApprovalRequest } from "@/lib/db/queries/approvals";
import { approveRequest, rejectRequest } from "@/lib/actions/approvals";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "consumed";

// FifoOverrideSnapshot — v1 shape per design.md §3.
// Field names align with canonical 01-core-data-model column names.
interface FifoOverrideSnapshot {
  item_id: string;
  item_code: string;
  lot_id: string;
  lot_number: string;
  location_id: string;
  location_code: string;
  requested_qty: string;
  available_qty_at_request: string;
  flow_type: "vmi" | "trading" | "supplies";
  actor_user_id: string;
  reason: string;
  allocation_version: number;
  requested_at: string;
}

// ─── Status badge helpers ─────────────────────────────────────────────────────

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
  expired: "EXPIRED",
  cancelled: "CANCELLED",
  consumed: "CONSUMED",
};

const STATUS_CLASSES: Record<ApprovalStatus, string> = {
  pending: "bg-status-pending/10 text-status-pending",
  approved: "bg-status-available/10 text-status-available",
  rejected: "bg-status-held/10 text-status-held",
  expired: "bg-status-held/10 text-status-held",
  cancelled: "bg-status-held/10 text-status-held",
  consumed: "bg-status-neutral/10 text-status-neutral",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ approvalId: string }>;
}

export default async function ApprovalDetailPage({ params }: PageProps) {
  const { approvalId } = await params;
  const resolver = await createPageResolver();

  // Gate on fifo_override.approve — reviewers only.
  const permResult = await requirePermission(resolver, "fifo_override.approve");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  // Reviewer's userId from the authenticated session — used for self-approval
  // UI guard. The server action re-checks this independently.
  const reviewerUserId = permResult.context.userId;

  // Load real request with its decisions from the DB.
  const request = await getApprovalRequest(db, approvalId);
  if (!request) {
    notFound();
  }

  // Cast targetSnapshot — FifoOverrideSnapshot shape per design.md §3.
  // The server action validates the snapshot contents; the UI just displays it.
  const snapshot = request.targetSnapshot as FifoOverrideSnapshot | null;
  const status = request.status as ApprovalStatus;

  // Self-approval UI guard — client-side check only. The server command always
  // re-checks this independently (design.md §5; 02-rbac-roles §3.4).
  const isSelfApproval = reviewerUserId === request.requesterUserId;

  // Show decision controls only for pending requests where the viewer is not
  // the requester. Both conditions must be true.
  const showDecisionControls = request.status === "pending" && !isSelfApproval;

  // Stale indicator — compare snapshot.allocation_version against current
  // lot_location_balances.version. Simplified: shown when request is pending.
  // TODO: query lot_location_balances.version and compare to snapshot.allocation_version.
  const isStale = request.status === "pending";

  // ─── Server Actions (inline, closed over approvalId and resolver factory) ───

  async function handleApprove(formData: FormData) {
    "use server";
    const reason = (formData.get("reason") as string | null) ?? "";
    const actionResolver = await createPageResolver();
    const result = await approveRequest(actionResolver, db, approvalId, reason);
    if (result.ok) {
      redirect(`/approvals/${approvalId}`);
    }
    // On error the redirect doesn't fire; the page re-renders with current state.
    // Full error surface is deferred to the Realtime/notification integration task.
  }

  async function handleReject(formData: FormData) {
    "use server";
    const reason = (formData.get("reason") as string | null) ?? "";
    const actionResolver = await createPageResolver();
    const result = await rejectRequest(actionResolver, db, approvalId, reason);
    if (result.ok) {
      redirect(`/approvals/${approvalId}`);
    }
  }

  return (
    <div className="mx-auto max-w-container">
      {/* Breadcrumb — touch target h-11 per §3 */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1 font-body text-body-sm text-text-grey">
          <li>
            <Link
              href="/approvals"
              className="inline-flex h-11 items-center rounded hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Approval Queue
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-mono text-mono-md text-on-surface">
            {request.requestNumber}
          </li>
        </ol>
      </nav>

      {/* Page heading — Fira Sans SemiBold per §2 type scale */}
      <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
        {request.requestNumber}
      </h1>

      {/* Stale indicator — shown when allocation_version has advanced past snapshot.
          Uses status-pending (amber) background at /10 opacity — not brand-red.
          design.md §5: stale requests must not show an approvable UI state. */}
      {isStale && request.status === "pending" && (
        <div
          role="alert"
          className="mt-4 rounded-md bg-status-pending/10 px-4 py-3"
        >
          <p className="font-body text-body-md text-status-pending">
            <span className="font-label text-label uppercase">Warning:</span>{" "}
            Target state may have changed — verify before approving. The lot
            allocation may have been modified since this request was submitted.
          </p>
        </div>
      )}

      {/* Request info card — Level 1 office elevation per §6 */}
      <div className="mt-6 rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-brand-navy">
          Request Details
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-label text-label text-text-grey">Type</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {request.approvalType === "fifo_override" ? "FIFO Override" : request.approvalType}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Status</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[status] ?? ""}`}
              >
                {STATUS_LABELS[status] ?? status.toUpperCase()}
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Requester</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {request.requesterUserId}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Requested At
            </dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {request.createdAt.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Expires At</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {request.expiryAt.toLocaleString()}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-label text-label text-text-grey">Reason</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {request.reason}
            </dd>
          </div>
        </dl>
      </div>

      {/* Target Snapshot — FifoOverrideSnapshot fields per design.md §3 */}
      <div className="mt-6 rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-brand-navy">
          Target Snapshot
        </h2>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          State captured at the moment the override was submitted. Review
          carefully — the current lot state may have changed.
        </p>
        {snapshot ? (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="font-label text-label text-text-grey">Item Code</dt>
              {/* Roboto Mono for codes per §9 tables */}
              <dd className="mt-1 font-mono text-mono-md text-on-surface">
                {snapshot.item_code}
              </dd>
            </div>
            <div>
              <dt className="font-label text-label text-text-grey">Lot Number</dt>
              <dd className="mt-1 font-mono text-mono-md text-on-surface">
                {snapshot.lot_number}
              </dd>
            </div>
            <div>
              <dt className="font-label text-label text-text-grey">Location</dt>
              <dd className="mt-1 font-mono text-mono-md text-on-surface">
                {snapshot.location_code}
              </dd>
            </div>
            <div>
              <dt className="font-label text-label text-text-grey">
                Requested Qty
              </dt>
              <dd className="mt-1 font-mono text-mono-md text-on-surface">
                {snapshot.requested_qty}
              </dd>
            </div>
            <div>
              <dt className="font-label text-label text-text-grey">
                Available Qty at Request
              </dt>
              <dd className="mt-1 font-mono text-mono-md text-on-surface">
                {snapshot.available_qty_at_request}
              </dd>
            </div>
            <div>
              <dt className="font-label text-label text-text-grey">Flow Type</dt>
              <dd className="mt-1 font-body text-body-md text-on-surface capitalize">
                {snapshot.flow_type}
              </dd>
            </div>
            <div>
              <dt className="font-label text-label text-text-grey">
                Allocation Version
              </dt>
              {/* Mono for numeric/version values per §9 */}
              <dd className="mt-1 font-mono text-mono-md text-on-surface">
                {snapshot.allocation_version}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 font-body text-body-sm text-text-grey">
            Snapshot not available.
          </p>
        )}
      </div>

      {/* Decision history */}
      <div className="mt-6 rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-brand-navy">
          Decision History
        </h2>
        {request.decisions.length === 0 ? (
          <p className="mt-4 font-body text-body-md text-text-grey">
            No decisions recorded yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {request.decisions.map((dec) => (
              <li
                key={dec.id}
                className="rounded border border-outline-variant/30 p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${
                      dec.outcome === "approved"
                        ? "bg-status-available/10 text-status-available"
                        : "bg-status-held/10 text-status-held"
                    }`}
                  >
                    {dec.outcome === "approved" ? "APPROVED" : "REJECTED"}
                  </span>
                  <span className="font-mono text-mono-md text-on-surface">
                    {dec.reviewerUserId}
                  </span>
                  <span className="font-body text-body-sm text-text-grey">
                    {dec.decidedAt.toLocaleString()}
                  </span>
                </div>
                {dec.reason && (
                  <p className="mt-2 font-body text-body-md text-text-grey">
                    {dec.reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Decision controls — only for pending requests where viewer is not the requester.
          design.md §5, §6: self-approval is always blocked server-side. This UI guard
          is a client-side UX improvement only — the server command re-checks independently.
          design.md §7: one primary action emphasized, rejection clearly separated. */}
      {showDecisionControls && (
        <div className="mt-6 space-y-4">
          {/* Approve form — wired to handleApprove Server Action */}
          <div className="rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
            <h2 className="font-heading font-semibold text-data-display text-brand-navy">
              Approve Request
            </h2>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Verify the target snapshot above before approving. Approving
              authorizes a one-time FIFO override for exactly this item, lot,
              location, and quantity.
            </p>
            <form action={handleApprove} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="approve-reason"
                  className="block font-label text-label text-text-grey"
                >
                  Reason for approval{" "}
                  <span aria-hidden="true" className="text-brand-red">
                    *
                  </span>
                  <span className="sr-only">(required, minimum 10 characters)</span>
                </label>
                <textarea
                  id="approve-reason"
                  name="reason"
                  required
                  minLength={10}
                  rows={3}
                  placeholder="Describe why this FIFO override is authorized…"
                  className="mt-1 w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
                />
              </div>
              {/* Primary CTA: brand-red, btn-diagonal-cut, h-11 — §7, §9 */}
              <button
                type="submit"
                className="btn-diagonal-cut flex h-11 items-center justify-center rounded bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Approve
              </button>
            </form>
          </div>

          {/* Reject form — wired to handleReject Server Action */}
          <div className="rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
            <h2 className="font-heading font-semibold text-data-display text-on-surface">
              Reject Request
            </h2>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Rejection is recorded and cannot be undone. The requester must
              submit a new override request if needed.
            </p>
            <form action={handleReject} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="reject-reason"
                  className="block font-label text-label text-text-grey"
                >
                  Reason for rejection{" "}
                  <span aria-hidden="true" className="text-brand-red">
                    *
                  </span>
                  <span className="sr-only">(required, minimum 10 characters)</span>
                </label>
                <textarea
                  id="reject-reason"
                  name="reason"
                  required
                  minLength={10}
                  rows={3}
                  placeholder="Describe why this FIFO override is not authorized…"
                  className="mt-1 w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
                />
              </div>
              {/* Destructive button: status-held per §9 — rejection is irreversible */}
              <button
                type="submit"
                className="flex h-11 items-center justify-center rounded bg-status-held px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Reject
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Self-approval notice — shown when viewer is the requester */}
      {request.status === "pending" && isSelfApproval && (
        <div className="mt-6 rounded-md bg-surface-light-grey p-6">
          <p className="font-body text-body-md text-text-grey">
            You submitted this request and cannot approve or reject it.
            Another supervisor must review this request.
          </p>
        </div>
      )}

      {/* Non-pending notice — shown for terminal/non-pending states */}
      {request.status !== "pending" && (
        <div className="mt-6 rounded-md bg-surface-light-grey p-6">
          <p className="font-body text-body-md text-text-grey">
            This request is{" "}
            <span className="font-label text-label uppercase">
              {STATUS_LABELS[status] ?? status.toUpperCase()}
            </span>{" "}
            and no further action is available.
          </p>
        </div>
      )}
    </div>
  );
}
