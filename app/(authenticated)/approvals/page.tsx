// Approval Queue — pending/review queue list.
//
// Traceability:
//   specs/09-approval-queue/design.md §7 (queue UI routes, office shell)
//   specs/00-steering/brand-design-system.md (office surface, WCAG AA)

import Link from "next/link";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listPendingApprovalRequests } from "@/lib/db/queries/approvals";

// ─── Types ───────────────────────────────────────────────────────────────────

type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "consumed";

type ApprovalType = "fifo_override";

const PAGE_SIZE = 20;

// ─── Status badge helpers ─────────────────────────────────────────────────────
// Tokens sourced from tailwind.config.ts — no raw hex values.
// Note: brand-design-system.md §1.3 maps "approved" → status-available (green)
// and "pending" → status-pending (amber). status-held covers rejected/expired/cancelled.

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
  expired: "EXPIRED",
  cancelled: "CANCELLED",
  consumed: "CONSUMED",
};

const STATUS_CLASSES: Record<ApprovalStatus, string> = {
  // status-pending (amber) — "Pending, in-transit, under inspection" per §1.3
  pending: "bg-status-pending/10 text-status-pending",
  // status-available (green) — "Available, passed inspection, approved" per §1.3
  approved: "bg-status-available/10 text-status-available",
  // status-held (red) — "Held, failed, rejected" per §1.3
  rejected: "bg-status-held/10 text-status-held",
  expired: "bg-status-held/10 text-status-held",
  cancelled: "bg-status-held/10 text-status-held",
  // status-neutral — "Depleted, on-hold, draft" per §1.3; consumed is terminal/neutral
  consumed: "bg-status-neutral/10 text-status-neutral",
};

const TYPE_LABELS: Record<ApprovalType, string> = {
  fifo_override: "FIFO Override",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ status?: string; type?: string; page?: string }>;
}

export default async function ApprovalQueuePage({ searchParams }: PageProps) {
  const { status: statusFilter, type: typeFilter, page: pageParam } = await searchParams;
  const resolver = await createPageResolver();

  // Gate on fifo_override.approve — reviewers only (supervisor role, global scope).
  // design.md §4: fifo_override.approve is granted to supervisor only.
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

  // Resolve approvalType filter: URL param "type" maps to approvalType; "all"
  // means no type filter. Only "fifo_override" is a registered type in v1.
  const approvalType =
    typeFilter && typeFilter !== "all" ? typeFilter : undefined;

  const { rows: filtered, total } = await listPendingApprovalRequests(db, {
    limit: PAGE_SIZE,
    offset,
    approvalType,
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasActiveFilter = approvalType !== undefined;

  return (
    <div className="mx-auto max-w-container">
      {/* Page header — headline-md is Fira Sans SemiBold per §2 type scale */}
      <div>
        <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
          Approval Queue
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Pending FIFO override requests awaiting supervisor review.
        </p>
      </div>

      {/* Filter bar — font-body text-body-md on select elements per brief */}
      <div className="mt-6">
        <form method="GET" className="flex flex-wrap items-end gap-3">
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

          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
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

      {/* Queue table — Level 1 office elevation per brand-design-system.md §6 */}
      <div className="mt-4 overflow-hidden rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1">
        {filtered.length === 0 ? (
          // Empty state — appears when no requests match filters or queue is empty
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              {hasActiveFilter
                ? "No approval requests match the current filters."
                : "No approval requests in the queue."}
            </p>
            {hasActiveFilter && (
              <p className="mt-2 font-body text-body-sm text-text-grey">
                Try clearing the filters or check back later.
              </p>
            )}
            {!hasActiveFilter && (
              <p className="mt-2 font-body text-body-sm text-text-grey">
                New requests appear here when warehousemen submit FIFO override
                requests during picking.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  {/* Epilogue SemiBold uppercase per brand-design-system.md §9 tables */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Reference #
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Requester
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Requested At
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Expires At
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {filtered.map((req) => {
                  const status = req.status as ApprovalStatus;
                  const approvalTypeCast = req.approvalType as ApprovalType;
                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-surface-light-grey/50"
                    >
                      {/* Roboto Mono for reference numbers per §9 tables */}
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                        {req.requestNumber}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        {TYPE_LABELS[approvalTypeCast] ?? req.approvalType}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        {/* requesterUserId is available; requesterName requires a join not in this query */}
                        <span className="font-mono text-mono-md">{req.requesterUserId}</span>
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-text-grey">
                        {req.createdAt.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-text-grey">
                        {req.expiryAt.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {/* Status badge — radius-full, Epilogue SemiBold uppercase, §1.3 colors at /10 opacity */}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[status] ?? ""}`}
                        >
                          {STATUS_LABELS[status] ?? status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {/* Touch target ≥ 44px (h-11) per brand-design-system.md §3 */}
                        <Link
                          href={`/approvals/${req.id}`}
                          className="inline-flex h-11 items-center font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        >
                          View
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
                href={`/approvals?${new URLSearchParams({ ...(typeFilter ? { type: typeFilter } : {}), page: String(currentPage - 1) })}`}
                className="inline-flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/approvals?${new URLSearchParams({ ...(typeFilter ? { type: typeFilter } : {}), page: String(currentPage + 1) })}`}
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
