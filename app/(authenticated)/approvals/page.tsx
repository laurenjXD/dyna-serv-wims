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

import { ApprovalsFilterableTable } from "./_components/ApprovalsFilterableTable";

export default async function ApprovalQueuePage({ searchParams }: PageProps) {
  const {
    type: typeFilter,
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

  const { rows, total } = await listPendingApprovalRequests(db, {
    limit: PAGE_SIZE,
    offset,
    approvalType,
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-container">
      {/* Page header — text-headline-xl Fira Sans Bold per brand-design-system.md §2 */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          Approval Queue
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Pending FIFO override requests awaiting supervisor review.
        </p>
      </div>

      <div role="status" className="mt-6 flex items-start gap-3 rounded border border-status-held/30 bg-status-held/10 px-4 py-4">
        <span className="font-heading text-body-lg text-status-held" aria-hidden="true">⚖</span>
        <div><p className="font-label text-label font-bold text-status-held">COMPLIANCE ENFORCEMENT ACTIVE</p><p className="mt-1 font-body text-body-sm text-text-grey">Self-approval of override requests is blocked. Exceptions require the appropriate approval authority.</p></div>
      </div>

      <div className="mt-6">
        <ApprovalsFilterableTable rows={rows} />
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
