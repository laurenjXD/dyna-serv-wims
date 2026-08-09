// Approval Queue — pending/review queue list.
//
// Traceability:
//   specs/09-approval-queue/design.md §7 (queue UI routes, office shell)
//   specs/09-approval-queue/requirements.md R3 (queue filtering), R7 (audit/security)
//   specs/00-steering/brand-design-system.md §2 (typography), §6 (office Level 1
//     elevation: bg-surface-white), §9 (office table pattern)
//
// Surface: Office. Capability gate: fifo_override.approve (supervisor, global scope).
// Design.md §4: fifo_override.approve granted to supervisor only.
// Offline: approval queue operations are Tier 2 — online only, never cached.

import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listPendingApprovalRequests } from "@/lib/db/queries/approvals";
// TODO: wire to real query from approval_requests table (listPendingApprovalRequests
// already implemented — integration under specs/09-approval-queue tasks.md §6)

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Status badge helpers ─────────────────────────────────────────────────────
// Tokens sourced from tailwind.config.ts — no raw hex values.
// brand-design-system.md §1.3:
//   pending  → status-pending (amber)
//   approved → status-available (green)
//   rejected/expired/cancelled → status-held (red)
//   consumed → status-neutral

type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "consumed";

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

type ApprovalType = "fifo_override";

const TYPE_LABELS: Record<ApprovalType, string> = {
  fifo_override: "FIFO Override",
};

// Reason category labels — tasks.md §1 resolved categories.
const REASON_CATEGORY_LABELS: Record<string, string> = {
  customer_preference: "Customer Preference",
  lot_condition: "Lot Condition",
  partial_lot: "Partial Lot",
  other: "Other",
};

// ─── Time helpers (server-side, computed at render time) ──────────────────────

/** Returns a human-readable relative age: "just now", "5m ago", "2h ago", "3d ago". */
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

/** Returns expiry countdown: "expired", "expires in 5m", "expires in 18h". */
function expiryCountdown(expiryAt: Date, now: Date = new Date()): string {
  const diffMs = expiryAt.getTime() - now.getTime();
  if (diffMs <= 0) return "expired";
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `expires in ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  return `expires in ${diffHours}h`;
}

// ─── Snapshot helpers ─────────────────────────────────────────────────────────
// FifoOverrideSnapshot shape per design.md §3 — JSONB so we guard narrowly.

function getSnapshotItemLotRef(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") return "—";
  const s = snapshot as Record<string, unknown>;
  const itemCode = typeof s.item_code === "string" ? s.item_code : null;
  const lotNumber = typeof s.lot_number === "string" ? s.lot_number : null;
  if (itemCode && lotNumber) return `${itemCode} / ${lotNumber}`;
  if (itemCode) return itemCode;
  if (lotNumber) return lotNumber;
  return "—";
}

/** Returns the reason category chip label from snapshot.reason or request.reason. */
function getReasonCategoryLabel(reason: string | undefined | null): string {
  if (!reason) return "—";
  return REASON_CATEGORY_LABELS[reason] ?? reason;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ status?: string; type?: string; sort?: string; page?: string }>;
}

export default async function ApprovalQueuePage({ searchParams }: PageProps) {
  const {
    status: statusFilter,
    type: typeFilter,
    sort: sortParam,
    page: pageParam,
  } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: fifo_override.approve required (supervisor, global scope).
  // Not notFound — this route's existence is safe to disclose per design.md §7.
  const permResult = await requirePermission(resolver, "fifo_override.approve");
  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view the approval queue.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">fifo_override.approve</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  const currentPage = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  // Type filter: URL param "type" maps to approvalType; "all" means no filter.
  const approvalType =
    typeFilter && typeFilter !== "all" ? typeFilter : undefined;

  // Sort param: "oldest" (default) or "newest"
  const sortOrder = sortParam === "newest" ? "newest" : "oldest";

  const { rows, total } = await listPendingApprovalRequests(db, {
    limit: PAGE_SIZE,
    offset,
    approvalType,
  });

  // Client-side sort by age when "newest" is selected (query defaults oldest-first).
  const sortedRows =
    sortOrder === "newest" ? [...rows].reverse() : rows;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasActiveFilter = approvalType !== undefined;

  // Snapshot current time once for consistent relative-time rendering.
  const now = new Date();

  return (
    <div className="mx-auto max-w-container">
      {/* Page header — text-headline-xl Fira Sans Bold per brand-design-system.md §2 */}
      <div>
        <h1 className="font-heading font-bold text-headline-xl text-brand-navy">
          Approval Queue
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Pending FIFO override requests awaiting supervisor review.
        </p>
      </div>

      {/* Filter bar */}
      <div className="mt-6">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          {/* Type filter — v1: only fifo_override registered per requirements.md §3 */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="type-filter"
              className="font-label text-label text-text-grey"
            >
              Type
            </label>
            <select
              id="type-filter"
              name="type"
              defaultValue={typeFilter ?? "all"}
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="all">All types</option>
              <option value="fifo_override">FIFO Override</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="status-filter"
              className="font-label text-label text-text-grey"
            >
              Status
            </label>
            <select
              id="status-filter"
              name="status"
              defaultValue={statusFilter ?? "pending"}
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="pending">Pending</option>
              <option value="all">All statuses</option>
            </select>
          </div>

          {/* Age sort */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="sort-filter"
              className="font-label text-label text-text-grey"
            >
              Age Sort
            </label>
            <select
              id="sort-filter"
              name="sort"
              defaultValue={sortParam ?? "oldest"}
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
            </select>
          </div>

          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-opacity motion-safe:duration-150"
          >
            Apply
          </button>

          {hasActiveFilter && (
            <Link
              href="/approvals"
              className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Queue table — Level 1 office elevation per brand-design-system.md §6:
          bg-surface-white (glassmorphism, office-only) */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {sortedRows.length === 0 ? (
          /* Empty state — CheckCircle2 icon + copy */
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <CheckCircle2
              size={40}
              className="text-status-available"
              aria-hidden="true"
            />
            <p className="font-body text-body-md text-text-grey">
              {hasActiveFilter
                ? "No approval requests match the current filters."
                : "No pending approvals."}
            </p>
            {!hasActiveFilter && (
              <p className="font-body text-body-sm text-text-grey">
                New requests appear here when warehousemen submit FIFO override
                requests during picking.
              </p>
            )}
            {hasActiveFilter && (
              <p className="font-body text-body-sm text-text-grey">
                Try clearing the filters or check back later.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  {/* Epilogue SemiBold uppercase headers per brand-design-system.md §9 */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Requested By
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Item / Lot
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Reason
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Age
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Expiry
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {sortedRows.map((req) => {
                  const status = req.status as ApprovalStatus;
                  const approvalTypeCast = req.approvalType as ApprovalType;
                  const itemLotRef = getSnapshotItemLotRef(req.targetSnapshot);
                  const reasonLabel = getReasonCategoryLabel(req.reason);
                  const age = relativeTime(req.createdAt, now);
                  const expiry = expiryCountdown(req.expiryAt, now);
                  const isExpired = req.expiryAt.getTime() <= now.getTime();

                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-surface-light-grey/50"
                    >
                      {/* Type — body text */}
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        {TYPE_LABELS[approvalTypeCast] ?? req.approvalType}
                      </td>

                      {/* Requested By — Roboto Mono for user IDs per §9 */}
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                        {req.requesterUserId}
                      </td>

                      {/* Item / Lot reference — Roboto Mono for codes */}
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                        {itemLotRef}
                      </td>

                      {/* Reason category chip */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-status-neutral/10 px-2 py-0.5 font-label text-label text-status-neutral uppercase tracking-[0.05em]">
                          {reasonLabel}
                        </span>
                      </td>

                      {/* Age — relative time with Clock icon */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 font-body text-body-md text-text-grey">
                          <Clock size={16} className="shrink-0" aria-hidden="true" />
                          {age}
                        </span>
                      </td>

                      {/* Expiry countdown — amber when soon, held-red when expired */}
                      <td className="px-4 py-3 font-body text-body-md">
                        <span
                          className={
                            isExpired
                              ? "text-status-held"
                              : "text-text-grey"
                          }
                        >
                          {expiry}
                        </span>
                      </td>

                      {/* Status badge — radius-full, §1.3 semantic colors */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${STATUS_CLASSES[status] ?? ""}`}
                        >
                          {STATUS_LABELS[status] ?? req.status.toUpperCase()}
                        </span>
                      </td>

                      {/* Review action — h-11 (44px) office touch target */}
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/approvals/${req.id}`}
                          className="inline-flex h-11 items-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-opacity motion-safe:duration-150"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between font-body text-body-sm text-text-grey">
          <span>
            Page {currentPage} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/approvals?${new URLSearchParams({
                  ...(typeFilter ? { type: typeFilter } : {}),
                  ...(sortParam ? { sort: sortParam } : {}),
                  page: String(currentPage - 1),
                })}`}
                className="inline-flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/approvals?${new URLSearchParams({
                  ...(typeFilter ? { type: typeFilter } : {}),
                  ...(sortParam ? { sort: sortParam } : {}),
                  page: String(currentPage + 1),
                })}`}
                className="inline-flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
