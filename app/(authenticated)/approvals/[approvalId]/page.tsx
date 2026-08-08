// Approval Queue — request detail, target snapshot, and approve/reject controls.
//
// Traceability:
//   specs/09-approval-queue/design.md §3 (FifoOverrideSnapshot), §5 (state machine),
//     §6 (authorization), §7 (queue UI)
//   specs/00-steering/brand-design-system.md (office surface, WCAG AA, §7 diagonal-cut)
//
// This page is UI-only for design review. Mock data is used in place of real
// DB queries. Server Actions are stubbed with TODO comments — see below.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "consumed";

type ApprovalType = "fifo_override";

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

interface ApprovalDecision {
  id: string;
  decision: "approved" | "rejected";
  reviewerName: string;
  decidedAt: Date;
  reason: string;
}

interface ApprovalRequestDetail {
  id: string;
  referenceNumber: string;
  type: ApprovalType;
  status: ApprovalStatus;
  requesterName: string;
  requesterUserId: string;
  requestedAt: Date;
  expiresAt: Date;
  reason: string;
  snapshot: FifoOverrideSnapshot;
  decisions: ApprovalDecision[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────
// TODO: replace with real DB query (getApprovalRequestDetail) once Track 1
// delivers the approval_requests and approval_decisions migrations.
// The stub function signature matches what backend-builder will implement.

const MOCK_REQUESTS: ApprovalRequestDetail[] = [
  {
    id: "apr-001",
    referenceNumber: "APQ-2026-001",
    type: "fifo_override",
    status: "pending",
    requesterName: "Maria Santos",
    requesterUserId: "user-maria-santos-001",
    requestedAt: new Date("2026-08-08T09:15:00Z"),
    expiresAt: new Date("2026-08-08T09:45:00Z"),
    reason:
      "Lot DYNA-LOT-2456 has a manufacturing date six months earlier than DYNA-LOT-2455. Per the client's VMI contractual requirement, the older lot must be consumed first regardless of default FIFO sequencing.",
    snapshot: {
      item_id: "item-uuid-00a1b2c3",
      item_code: "ITEM-A100",
      lot_id: "lot-uuid-00d4e5f6",
      lot_number: "DYNA-LOT-2456",
      location_id: "loc-uuid-00g7h8i9",
      location_code: "WH-A-12",
      requested_qty: "250.00",
      available_qty_at_request: "312.50",
      flow_type: "vmi",
      actor_user_id: "user-maria-santos-001",
      reason:
        "Lot DYNA-LOT-2456 has a manufacturing date six months earlier than DYNA-LOT-2455. Per the client's VMI contractual requirement, the older lot must be consumed first regardless of default FIFO sequencing.",
      allocation_version: 7,
      requested_at: "2026-08-08T09:15:00Z",
    },
    decisions: [],
  },
  {
    id: "apr-002",
    referenceNumber: "APQ-2026-002",
    type: "fifo_override",
    status: "approved",
    requesterName: "Carlos Reyes",
    requesterUserId: "user-carlos-reyes-002",
    requestedAt: new Date("2026-08-07T14:30:00Z"),
    expiresAt: new Date("2026-08-07T15:00:00Z"),
    reason:
      "Lot B-2299 has reached its best-before threshold and must be picked before B-2301 to avoid expiry write-off.",
    snapshot: {
      item_id: "item-uuid-00b3c4d5",
      item_code: "ITEM-B220",
      lot_id: "lot-uuid-00e6f7g8",
      lot_number: "B-2299",
      location_id: "loc-uuid-00h9i0j1",
      location_code: "WH-B-04",
      requested_qty: "100.00",
      available_qty_at_request: "150.00",
      flow_type: "trading",
      actor_user_id: "user-carlos-reyes-002",
      reason:
        "Lot B-2299 has reached its best-before threshold and must be picked before B-2301 to avoid expiry write-off.",
      allocation_version: 3,
      requested_at: "2026-08-07T14:30:00Z",
    },
    decisions: [
      {
        id: "dec-002-a",
        decision: "approved",
        reviewerName: "Supervisor Diaz",
        decidedAt: new Date("2026-08-07T14:42:00Z"),
        reason:
          "Confirmed: best-before threshold verified against lot record. Override approved.",
      },
    ],
  },
  {
    id: "apr-003",
    referenceNumber: "APQ-2026-003",
    type: "fifo_override",
    status: "expired",
    requesterName: "Ana Lim",
    requesterUserId: "user-ana-lim-003",
    requestedAt: new Date("2026-08-06T11:00:00Z"),
    expiresAt: new Date("2026-08-06T11:30:00Z"),
    reason:
      "Customer specifically requested lot C-0078 for traceability purposes.",
    snapshot: {
      item_id: "item-uuid-00c5d6e7",
      item_code: "ITEM-C040",
      lot_id: "lot-uuid-00f8g9h0",
      lot_number: "C-0078",
      location_id: "loc-uuid-00i1j2k3",
      location_code: "WH-C-08",
      requested_qty: "50.00",
      available_qty_at_request: "75.00",
      flow_type: "supplies",
      actor_user_id: "user-ana-lim-003",
      reason:
        "Customer specifically requested lot C-0078 for traceability purposes.",
      allocation_version: 12,
      requested_at: "2026-08-06T11:00:00Z",
    },
    decisions: [],
  },
];

// TODO: replace with real DB query once Track 1 delivers migration.
async function getMockApprovalRequest(
  id: string,
): Promise<ApprovalRequestDetail | null> {
  return MOCK_REQUESTS.find((r) => r.id === id) ?? null;
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

// ─── Mock viewer ──────────────────────────────────────────────────────────────
// In production this will be the authenticated reviewer's auth.uid() from
// the Supabase session. The server-side command always re-checks self-approval
// regardless of what the UI shows (design.md §5, §6; 02-rbac-roles §3.4).
// Mock value differs from all MOCK_REQUESTS requesterUserIds so decision
// controls are visible for the pending request in design review.
const MOCK_VIEWER_USER_ID = "user-supervisor-viewer-999";

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

  // TODO: replace with real DB query once Track 1 delivers migration.
  const request = await getMockApprovalRequest(approvalId);
  if (!request) {
    notFound();
  }

  // Self-approval UI guard — client-side check only. The server command always
  // re-checks this independently (design.md §5; 02-rbac-roles §3.4).
  const isSelfApproval = MOCK_VIEWER_USER_ID === request.requesterUserId;

  // Show decision controls only for pending requests where the viewer is not
  // the requester. Both conditions must be true.
  const showDecisionControls =
    request.status === "pending" && !isSelfApproval;

  // Stale indicator — mock: always shown to surface the design pattern.
  // In production: compare snapshot.allocation_version against the current
  // lot_location_balances.version read from the DB.
  const isStale = true; // TODO: compare allocation_version against live lot_location_balances.version

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
            {request.referenceNumber}
          </li>
        </ol>
      </nav>

      {/* Page heading — Fira Sans SemiBold per §2 type scale */}
      <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
        {request.referenceNumber}
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
              FIFO Override
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Status</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[request.status]}`}
              >
                {STATUS_LABELS[request.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Requester</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {request.requesterName}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Requested At
            </dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {request.requestedAt.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Expires At</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {request.expiresAt.toLocaleString()}
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
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-label text-label text-text-grey">Item Code</dt>
            {/* Roboto Mono for codes per §9 tables */}
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {request.snapshot.item_code}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Lot Number</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {request.snapshot.lot_number}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Location</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {request.snapshot.location_code}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Requested Qty
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {request.snapshot.requested_qty}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Available Qty at Request
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {request.snapshot.available_qty_at_request}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Flow Type</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface capitalize">
              {request.snapshot.flow_type}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Allocation Version
            </dt>
            {/* Mono for numeric/version values per §9 */}
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {request.snapshot.allocation_version}
            </dd>
          </div>
        </dl>
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
                      dec.decision === "approved"
                        ? "bg-status-available/10 text-status-available"
                        : "bg-status-held/10 text-status-held"
                    }`}
                  >
                    {dec.decision === "approved" ? "APPROVED" : "REJECTED"}
                  </span>
                  <span className="font-body text-body-md text-on-surface">
                    {dec.reviewerName}
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
          {/* Approve form */}
          <div className="rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
            <h2 className="font-heading font-semibold text-data-display text-brand-navy">
              Approve Request
            </h2>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Verify the target snapshot above before approving. Approving
              authorizes a one-time FIFO override for exactly this item, lot,
              location, and quantity.
            </p>
            {/*
              TODO: implement approveRequest Server Action and replace the
              action URL below with the imported server action reference.
              The Server Action must re-check: pending status, expiry,
              reviewer capability, self-approval prohibition, and
              allocation_version before recording the decision.
            */}
            <form
              method="POST"
              action={`/api/approvals/${request.id}/approve`}
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="requestId" value={request.id} />
              <div>
                <label
                  htmlFor="approve-reason"
                  className="block font-label text-label text-text-grey"
                >
                  Reason for approval{" "}
                  <span aria-hidden="true" className="text-status-held">
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

          {/* Reject form — secondary style, clearly separated from approve */}
          <div className="rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
            <h2 className="font-heading font-semibold text-data-display text-on-surface">
              Reject Request
            </h2>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Rejection is recorded and cannot be undone. The requester must
              submit a new override request if needed.
            </p>
            {/*
              TODO: implement rejectRequest Server Action and replace the
              action URL below with the imported server action reference.
              The Server Action must re-check: pending status, expiry,
              reviewer capability, and self-approval prohibition.
            */}
            <form
              method="POST"
              action={`/api/approvals/${request.id}/reject`}
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="requestId" value={request.id} />
              <div>
                <label
                  htmlFor="reject-reason"
                  className="block font-label text-label text-text-grey"
                >
                  Reason for rejection{" "}
                  <span aria-hidden="true" className="text-status-held">
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
              {/* Secondary button: brand-navy solid, no diagonal cut per §9 */}
              <button
                type="submit"
                className="flex h-11 items-center justify-center rounded bg-brand-navy px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-red"
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
              {STATUS_LABELS[request.status]}
            </span>{" "}
            and no further action is available.
          </p>
        </div>
      )}
    </div>
  );
}
