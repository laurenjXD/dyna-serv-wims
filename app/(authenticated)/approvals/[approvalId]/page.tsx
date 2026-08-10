// Approval Queue — request detail, target snapshot, and approve/reject controls.
//
// Traceability:
//   specs/09-approval-queue/design.md §3 (FifoOverrideSnapshot), §5 (state
//     machine / expiry / self-approval / concurrent reviewers), §6 (authorization),
//     §7 (queue UI — office surface, one primary action, rejection secondary)
//   specs/09-approval-queue/requirements.md R4 (decision recording), R4.5
//     (self-approval prohibition), R5 (consumption), R8 (offline: Tier 2 only)
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation:
//     bg-surface-white), §9 (buttons: h-11 office target, brand-red
//     primary, diagonal-cut motif), §10 (motion: motion-safe: prefix always)
//
// Surface: Office. Capability gate: fifo_override.approve.
// Self-approval: blocked both here (UX) and in approveRequest/rejectRequest
//   server actions (authoritative — design.md §5).
// Offline: Tier 2 — all approval actions are online-only, never queued.
// TODO: wire to approval_requests + approval_decisions query (getApprovalRequest
//   already implemented — integration under specs/09-approval-queue tasks.md §6)

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, User, Clock, AlertTriangle } from "lucide-react";
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
  reason_note?: string;       // optional free-text note, if set at submission time
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

// ─── Reason categories ───────────────────────────────────────────────────────
// Fixed categories per tasks.md §1: customer_preference | lot_condition |
// partial_lot | other. Used for the rejection reason select and reason display.

const REASON_CATEGORIES = [
  { value: "customer_preference", label: "Customer Preference" },
  { value: "lot_condition", label: "Lot Condition" },
  { value: "partial_lot", label: "Partial Lot" },
  { value: "other", label: "Other" },
] as const;

const REASON_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  REASON_CATEGORIES.map((c) => [c.value, c.label])
);

// ─── Time helpers (server-side) ───────────────────────────────────────────────

function relativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function expiryCountdown(expiryAt: Date, now: Date = new Date()): string {
  const diffMs = expiryAt.getTime() - now.getTime();
  if (diffMs <= 0) return "Expired";
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `Expires in ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  return `Expires in ${diffHours}h`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ approvalId: string }>;
}

export default async function ApprovalDetailPage({ params }: PageProps) {
  const { approvalId } = await params;
  const resolver = await createPageResolver();

  // Gate on fifo_override.approve — reviewers only.
  // notFound rather than forbidden: existence of a specific approval ID should
  // not be disclosed to non-reviewers (design.md §7, requirements.md R7.5).
  const permResult = await requirePermission(resolver, "fifo_override.approve");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  // Reviewer's userId — used for self-approval UI guard.
  // The server actions re-check this independently (design.md §5; 02 §3.4).
  const reviewerUserId = permResult.context.userId;

  // Load request with decisions.
  const request = await getApprovalRequest(db, approvalId);
  if (!request) {
    notFound();
  }

  // Cast targetSnapshot — FifoOverrideSnapshot per design.md §3.
  const snapshot = request.targetSnapshot as FifoOverrideSnapshot | null;
  const status = request.status as ApprovalStatus;

  // Self-approval UI guard — client-side UX only. Server action re-checks.
  const isSelfApproval = reviewerUserId === request.requesterUserId;

  // Show decision controls only for pending requests where viewer is not requester.
  const showDecisionControls = request.status === "pending" && !isSelfApproval;

  // Stale indicator — shown when status is pending (snapshot may have diverged).
  // TODO: query lot_location_balances.version and compare to snapshot.allocation_version.
  const isStale = request.status === "pending";

  const now = new Date();

  // ─── Server Actions (inline, closed over approvalId) ──────────────────────

  async function handleApprove(formData: FormData) {
    "use server";
    const reason = (formData.get("reason") as string | null) ?? "";
    const actionResolver = await createPageResolver();
    const result = await approveRequest(actionResolver, approvalId, reason);
    if (result.ok) {
      redirect(`/approvals/${approvalId}`);
    }
    // On error the redirect doesn't fire; page re-renders with current state.
    // Full error surface deferred to Realtime/notification integration (tasks.md §8).
  }

  async function handleReject(formData: FormData) {
    "use server";
    const category = (formData.get("reason_category") as string | null) ?? "";
    const note = (formData.get("reason_note") as string | null) ?? "";
    // Combine category + optional note into the reason string written to the DB.
    const reason = note ? `${category}: ${note}` : category;
    const actionResolver = await createPageResolver();
    const result = await rejectRequest(actionResolver, approvalId, reason);
    if (result.ok) {
      redirect(`/approvals/${approvalId}`);
    }
  }

  return (
    <div className="mx-auto max-w-container">
      {/* Back link — ChevronLeft + touch target h-11 (44px) */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <Link
          href="/approvals"
          className="inline-flex h-11 items-center gap-1 rounded font-label text-label text-brand-navy hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Approval Queue
        </Link>
      </nav>

      {/* Page heading — Fira Sans SemiBold per §2 type scale */}
      <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
        {request.requestNumber}
      </h1>

      {/* Stale indicator — amber warning when target may have changed.
          design.md §5: stale requests should not present an approvable state without warning. */}
      {isStale && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-md bg-status-pending/10 px-4 py-3"
        >
          <AlertTriangle
            size={20}
            className="mt-0.5 shrink-0 text-status-pending"
            aria-hidden="true"
          />
          <p className="font-body text-body-md text-status-pending">
            <span className="font-label text-label uppercase">Warning — </span>
            target state may have changed since this request was submitted.
            Verify the current lot availability before approving.
          </p>
        </div>
      )}

      {/* Request header card — Level 1 office elevation */}
      <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-heading font-semibold text-data-display text-on-surface">
              Request Details
            </h2>
            <div className="mt-2 flex items-center gap-2">
              {/* Status badge — radius-full, §1.3 semantic colors */}
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${STATUS_CLASSES[status] ?? ""}`}
              >
                {STATUS_LABELS[status] ?? status.toUpperCase()}
              </span>
              <span className="inline-flex items-center gap-1 font-body text-body-sm text-text-grey">
                <Clock size={16} aria-hidden="true" />
                {relativeTime(request.createdAt, now)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="font-label text-label text-text-grey">Expiry</p>
            <p
              className={`mt-0.5 font-body text-body-md ${
                request.expiryAt.getTime() <= now.getTime()
                  ? "text-status-held"
                  : "text-on-surface"
              }`}
            >
              {expiryCountdown(request.expiryAt, now)}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-label text-label text-text-grey">Type</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {request.approvalType === "fifo_override"
                ? "FIFO Override"
                : request.approvalType}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Created</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {request.createdAt.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Expires</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {request.expiryAt.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Reference #
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {request.requestNumber}
            </dd>
          </div>
        </dl>
      </div>

      {/* Requester info — office Level 1 card */}
      <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1 p-6">
        <h2 className="flex items-center gap-2 font-heading font-semibold text-data-display text-on-surface">
          <User size={20} aria-hidden="true" />
          Requester
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-label text-label text-text-grey">User ID</dt>
            {/* Roboto Mono for user IDs per §9 */}
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {request.requesterUserId}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Requested At</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {request.createdAt.toLocaleString()}
            </dd>
          </div>
          {snapshot?.actor_user_id && (
            <div>
              <dt className="font-label text-label text-text-grey">
                Acting User ID
              </dt>
              <dd className="mt-1 font-mono text-mono-md text-on-surface">
                {snapshot.actor_user_id}
              </dd>
            </div>
          )}
          {snapshot?.flow_type && (
            <div>
              <dt className="font-label text-label text-text-grey">Flow</dt>
              <dd className="mt-1 font-body text-body-md text-on-surface capitalize">
                {snapshot.flow_type}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Item / Lot snapshot — FifoOverrideSnapshot per design.md §3 */}
      <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Item / Lot Snapshot
        </h2>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          State captured at submission time. Current lot state may differ.
        </p>
        {snapshot ? (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="font-label text-label text-text-grey">
                Item Code
              </dt>
              <dd className="mt-1 font-mono text-mono-md text-on-surface">
                {snapshot.item_code}
              </dd>
            </div>
            <div>
              <dt className="font-label text-label text-text-grey">
                Lot Number
              </dt>
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
              <dt className="font-label text-label text-text-grey">
                Allocation Version
              </dt>
              {/* Mono for numeric version values per §9 */}
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

      {/* Reason section — category chip + optional free-text note */}
      <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Reason
        </h2>
        <div className="mt-3 flex flex-wrap items-start gap-3">
          {/* Category chip — Epilogue SemiBold uppercase, neutral color by default */}
          <span className="inline-flex items-center rounded-full bg-status-neutral/10 px-3 py-1 font-label text-label text-status-neutral uppercase tracking-[0.05em]">
            {REASON_CATEGORY_LABELS[request.reason] ?? request.reason}
          </span>
          {/* Optional reason note from snapshot */}
          {snapshot?.reason_note && (
            <p className="font-body text-body-md text-on-surface">
              {snapshot.reason_note}
            </p>
          )}
          {/* Fallback: display raw reason if it doesn't match a category key */}
          {!REASON_CATEGORY_LABELS[request.reason] && (
            <p className="font-body text-body-md text-text-grey">
              {request.reason}
            </p>
          )}
        </div>
      </div>

      {/* FIFO allocation context — side-by-side comparison (system recommendation vs override) */}
      {/* TODO: populate system FIFO recommendation by querying lot_location_balances at
          snapshot.allocation_version for the affected lot/location. The override side
          is fully populated from the snapshot; the system side requires the allocation
          engine query result from 08 (tasks.md §7). */}
      <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          FIFO Allocation Context
        </h2>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          What the system would have allocated (FIFO/FEFO order) vs what the
          requester is asking for. Verify before approving.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* System FIFO recommendation */}
          <div className="rounded-lg border border-outline-variant/30 p-4">
            <h3 className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
              System FIFO Order
            </h3>
            <p className="mt-2 font-body text-body-sm text-text-grey">
              Standard FIFO/FEFO sequence from{" "}
              <span className="font-mono text-mono-md">
                lot_location_balances
              </span>
              . Lot and quantity determined by earliest expiry/receipt date.
            </p>
            <p className="mt-2 font-body text-body-sm text-status-neutral italic">
              {/* TODO: populate from lot_location_balances query at allocation_version */}
              Recommendation requires allocation engine query — see tasks.md §7.
            </p>
          </div>

          {/* Override request */}
          <div className="rounded-lg border border-status-pending/40 bg-status-pending/5 p-4">
            <h3 className="font-label text-label uppercase tracking-[0.05em] text-status-pending">
              Override Request
            </h3>
            {snapshot ? (
              <dl className="mt-2 space-y-2">
                <div className="flex items-baseline gap-2">
                  <dt className="shrink-0 font-label text-label text-text-grey">
                    Item:
                  </dt>
                  <dd className="font-mono text-mono-md text-on-surface">
                    {snapshot.item_code}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="shrink-0 font-label text-label text-text-grey">
                    Lot:
                  </dt>
                  <dd className="font-mono text-mono-md text-on-surface">
                    {snapshot.lot_number}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="shrink-0 font-label text-label text-text-grey">
                    Location:
                  </dt>
                  <dd className="font-mono text-mono-md text-on-surface">
                    {snapshot.location_code}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="shrink-0 font-label text-label text-text-grey">
                    Qty:
                  </dt>
                  <dd className="font-mono text-mono-md text-on-surface">
                    {snapshot.requested_qty}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 font-body text-body-sm text-text-grey">
                Snapshot not available.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Decision section — only shown when status is pending and viewer is not requester.
          design.md §7: one primary action emphasized; rejection secondary/separated. */}
      {showDecisionControls && (
        <div className="mt-6 space-y-4">
          {/* Approve form */}
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1 p-6">
            <h2 className="font-heading font-semibold text-data-display text-on-surface">
              Approve Request
            </h2>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Verify the snapshot and FIFO context above before approving.
              Approval authorizes a one-time FIFO override for exactly this
              item, lot, location, and quantity.
            </p>
            <form action={handleApprove} className="mt-4">
              {/* Approve — primary CTA: brand-red h-11 px-6 per task spec */}
              <button
                type="submit"
                className="flex h-11 items-center justify-center rounded-xl bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
              >
                Approve
              </button>
            </form>
          </div>

          {/* Reject form */}
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1 p-6">
            <h2 className="font-heading font-semibold text-data-display text-on-surface">
              Reject Request
            </h2>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Rejection is recorded and cannot be undone. The requester must
              submit a new override request if needed.
            </p>
            <form action={handleReject} className="mt-4 space-y-4">
              {/* Reason category — required select per tasks.md §1 */}
              <div>
                <label
                  htmlFor="reject-reason-category"
                  className="block font-label text-label text-text-grey"
                >
                  Reason for rejection{" "}
                  <span aria-hidden="true" className="text-brand-red">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <select
                  id="reject-reason-category"
                  name="reason_category"
                  required
                  defaultValue=""
                  className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  <option value="" disabled>
                    Select a reason…
                  </option>
                  {REASON_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional additional note */}
              <div>
                <label
                  htmlFor="reject-reason-note"
                  className="block font-label text-label text-text-grey"
                >
                  Additional note{" "}
                  <span className="text-text-grey font-body text-body-sm">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="reject-reason-note"
                  name="reason_note"
                  rows={2}
                  placeholder="Any additional context for the requester…"
                  className="mt-1 w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
                />
              </div>

              {/* Reject — outline secondary button per task spec */}
              <button
                type="submit"
                className="flex h-11 items-center justify-center rounded-xl border border-outline-variant/30 px-6 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
              >
                Reject
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Self-approval notice — shown when viewer is the requester and status is pending */}
      {request.status === "pending" && isSelfApproval && (
        <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-light-grey p-6">
          <p className="font-body text-body-md text-text-grey">
            You cannot approve your own request. Another supervisor must review
            this request.
          </p>
        </div>
      )}

      {/* Non-pending notice — terminal/decided states */}
      {request.status !== "pending" && (
        <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-light-grey p-6">
          <p className="font-body text-body-md text-text-grey">
            This request is{" "}
            <span className="font-label text-label uppercase">
              {STATUS_LABELS[status] ?? status.toUpperCase()}
            </span>{" "}
            and no further action is available.
          </p>
        </div>
      )}

      {/* Decision history — append-only per design.md §3 (no update/delete path) */}
      <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
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
                className="rounded-lg border border-outline-variant/30 p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${
                      dec.outcome === "approved"
                        ? "bg-status-available/10 text-status-available"
                        : "bg-status-held/10 text-status-held"
                    }`}
                  >
                    {dec.outcome === "approved" ? "APPROVED" : "REJECTED"}
                  </span>
                  {/* Reviewer user ID — Roboto Mono per §9 */}
                  <span className="font-mono text-mono-md text-on-surface">
                    {dec.reviewerUserId}
                  </span>
                  <span className="inline-flex items-center gap-1 font-body text-body-sm text-text-grey">
                    <Clock size={16} aria-hidden="true" />
                    {dec.decidedAt.toLocaleString()}
                  </span>
                </div>
                {dec.reason && (
                  <p className="mt-2 font-body text-body-md text-text-grey">
                    {dec.reason}
                  </p>
                )}
                {dec.consumedAt && (
                  <p className="mt-1 font-body text-body-sm text-status-neutral">
                    Consumed at {dec.consumedAt.toLocaleString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
