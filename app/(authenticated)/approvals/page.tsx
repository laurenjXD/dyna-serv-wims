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
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import {
  listApprovalQueueRequests,
  listPendingApprovalRequests,
} from "@/lib/db/queries/approvals";
import {
  approveRequest,
  rejectRequest,
  archiveExpiredApprovalRequest,
  archiveAllExpiredApprovals,
  createFifoOverrideRequest,
} from "@/lib/actions/approvals";
import { listStockView, type StockViewRow } from "@/lib/db/queries/inventory";
import { approvalRequests } from "@/lib/db/schema/approvals";
import { eq, and, isNull, isNotNull, lte, sql } from "drizzle-orm";
import { ApprovalsFilterableTable } from "./_components/ApprovalsFilterableTable";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{
    status?: string;
    type?: string;
    page?: string;
    tab?: string;
    error?: string;
    success?: string;
    q?: string;
  }>;
}

export default async function ApprovalQueuePage({ searchParams }: PageProps) {
  const {
    type: typeFilter,
    page: pageParam,
    tab: tabParam,
    error: actionError,
    success: actionSuccess,
    q: searchQuery,
  } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: fifo_override.approve required (supervisor, global scope).
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

  const currentUserId = permResult.context.userId;
  const showDeleted = tabParam === "deleted";
  const currentPage = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  // Type filter: URL param "type" maps to approvalType; "all" means no filter.
  const approvalType =
    typeFilter && typeFilter !== "all" ? typeFilter : undefined;

  // Load requests, stock balance rows for create-override modal, and metric aggregates in parallel
  const [requestData, stockRows, metricCounts] = await Promise.all([
    (async () => {
      try {
        return await listApprovalQueueRequests(db, {
          limit: PAGE_SIZE,
          offset,
          approvalType,
          deleted: showDeleted,
        });
      } catch {
        if (showDeleted) {
          throw new Error(
            "Archived approvals are not available until the database migration is applied.",
          );
        }
        return await listPendingApprovalRequests(db, {
          limit: PAGE_SIZE,
          offset,
          approvalType,
        });
      }
    })(),
    listStockView(db).catch(() => [] as StockViewRow[]),
    (async () => {
      try {
        const now = new Date();
        const [pendingRow] = await db
          .select({ count: sql<string>`count(*)` })
          .from(approvalRequests)
          .where(
            and(
              isNull(approvalRequests.deletedAt),
              eq(approvalRequests.status, "pending"),
              sql`${approvalRequests.expiryAt} > ${now}`,
            ),
          );
        const [expiredRow] = await db
          .select({ count: sql<string>`count(*)` })
          .from(approvalRequests)
          .where(
            and(
              isNull(approvalRequests.deletedAt),
              sql`(${approvalRequests.status} = 'expired' OR (${approvalRequests.status} = 'pending' AND ${approvalRequests.expiryAt} <= ${now}))`,
            ),
          );
        const [archivedRow] = await db
          .select({ count: sql<string>`count(*)` })
          .from(approvalRequests)
          .where(isNotNull(approvalRequests.deletedAt));
        const [approvedRow] = await db
          .select({ count: sql<string>`count(*)` })
          .from(approvalRequests)
          .where(eq(approvalRequests.status, "approved"));

        return {
          pending: Number(pendingRow?.count ?? 0),
          expired: Number(expiredRow?.count ?? 0),
          archived: Number(archivedRow?.count ?? 0),
          approved: Number(approvedRow?.count ?? 0),
        };
      } catch {
        return { pending: 0, expired: 0, archived: 0, approved: 0 };
      }
    })(),
  ]);

  const { rows, total } = requestData;

  // ─── Server Actions ──────────────────────────────────────────────────────────

  async function handleArchive(formData: FormData) {
    "use server";
    const requestId = String(formData.get("requestId") ?? "");
    let result;
    try {
      result = await archiveExpiredApprovalRequest(
        await createPageResolver(),
        requestId,
      );
    } catch {
      redirect(
        "/approvals?error=Archive%20could%20not%20be%20completed.%20Please%20try%20again.",
      );
    }
    if (result.ok) {
      revalidatePath("/approvals");
      redirect("/approvals?success=Request%20archived%20successfully.");
    }
    redirect(`/approvals?error=${encodeURIComponent(result.error)}`);
  }

  async function handleArchiveAll() {
    "use server";
    let result;
    try {
      result = await archiveAllExpiredApprovals(await createPageResolver());
    } catch {
      redirect(
        "/approvals?error=Failed%20to%20archive%20expired%20requests.",
      );
    }
    if (result.ok) {
      revalidatePath("/approvals");
      redirect(
        `/approvals?success=${encodeURIComponent(`Successfully archived ${result.count ?? 0} expired request(s).`)}`,
      );
    }
    redirect(`/approvals?error=${encodeURIComponent(result.error)}`);
  }

  async function handleApprove(formData: FormData) {
    "use server";
    const requestId = String(formData.get("requestId") ?? "");
    const reason = String(formData.get("reason") ?? "");
    const actionResolver = await createPageResolver();
    const result = await approveRequest(actionResolver, requestId, reason);
    if (result.ok) {
      revalidatePath("/approvals");
      redirect("/approvals?success=Request%20approved%20successfully.");
    }
    redirect(`/approvals?error=${encodeURIComponent(result.error)}`);
  }

  async function handleReject(formData: FormData) {
    "use server";
    const requestId = String(formData.get("requestId") ?? "");
    const category = String(formData.get("reason_category") ?? "other");
    const note = String(formData.get("reason_note") ?? "");
    const reason = note ? `${category}: ${note}` : category;
    const actionResolver = await createPageResolver();
    const result = await rejectRequest(actionResolver, requestId, reason);
    if (result.ok) {
      revalidatePath("/approvals");
      redirect("/approvals?success=Request%20rejected.");
    }
    redirect(`/approvals?error=${encodeURIComponent(result.error)}`);
  }

  async function handleCreateOverride(formData: FormData) {
    "use server";
    const itemId = String(formData.get("itemId") ?? "");
    const itemCode = String(formData.get("itemCode") ?? "");
    const lotId = String(formData.get("lotId") ?? "");
    const lotNumber = String(formData.get("lotNumber") ?? "");
    const locationId = String(formData.get("locationId") ?? "");
    const locationCode = String(formData.get("locationCode") ?? "");
    const requestedQty = String(formData.get("requestedQty") ?? "1");
    const reasonCategory = String(formData.get("reasonCategory") ?? "customer_preference");
    const reasonNote = String(formData.get("reasonNote") ?? "");

    const actionResolver = await createPageResolver();
    const result = await createFifoOverrideRequest(actionResolver, {
      itemId,
      itemCode,
      lotId,
      lotNumber,
      locationId,
      locationCode,
      requestedQty,
      reasonCategory,
      reasonNote,
    });

    if (result.ok) {
      revalidatePath("/approvals");
      redirect("/approvals?success=FIFO%20override%20request%20submitted%20successfully.");
    }
    redirect(`/approvals?error=${encodeURIComponent(result.error)}`);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-container space-y-6">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-label text-label-xs font-bold uppercase tracking-wider text-brand-royal-blue bg-brand-royal-blue/10 px-2.5 py-0.5 rounded-full">
              Operational Governance
            </span>
            <span className="text-text-grey text-xs">•</span>
            <span className="font-body text-xs text-text-grey">
              Warehouse Floor Controls
            </span>
          </div>
          <h1 className="mt-1 font-heading font-extrabold text-headline-xl text-on-surface">
            {showDeleted ? "Archived Approvals" : "Approval Queue"}
          </h1>
          <p className="mt-1 font-body text-body-sm text-text-grey max-w-2xl">
            {showDeleted
              ? "Historical and archived approval decisions retained permanently for compliance and audit logs."
              : "Review FIFO override requests, evaluate inventory allocation deviations, and govern warehouse compliance."}
          </p>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-outline-variant/30 bg-surface-white p-1 shadow-2xs">
          <Link
            href={`/approvals${typeFilter ? `?type=${typeFilter}` : ""}`}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-label text-label font-bold transition-all ${
              !showDeleted
                ? "bg-brand-navy text-surface-white shadow-xs"
                : "text-text-grey hover:text-on-surface hover:bg-surface-light-grey"
            }`}
          >
            <span>Active Queue</span>
            {metricCounts.pending > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  !showDeleted
                    ? "bg-white/20 text-white"
                    : "bg-status-pending/20 text-status-pending font-bold"
                }`}
              >
                {metricCounts.pending}
              </span>
            )}
          </Link>
          <Link
            href={`/approvals?tab=deleted${typeFilter ? `&type=${typeFilter}` : ""}`}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-label text-label font-bold transition-all ${
              showDeleted
                ? "bg-brand-navy text-surface-white shadow-xs"
                : "text-text-grey hover:text-on-surface hover:bg-surface-light-grey"
            }`}
          >
            <span>Archived</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                showDeleted
                  ? "bg-white/20 text-white"
                  : "bg-surface-light-grey text-text-grey font-bold"
              }`}
            >
              {metricCounts.archived}
            </span>
          </Link>
        </div>
      </div>

      {/* ── Status Banner (Error or Success feedback) ───────────────── */}
      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-status-held/30 bg-status-held/10 p-4 font-body text-body-sm text-status-held"
        >
          <span className="font-bold">Error:</span>
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-status-available/30 bg-status-available/10 p-4 font-body text-body-sm text-status-available"
        >
          <span className="font-bold">Success:</span>
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* ── Interactive Approvals Filterable Table Component ────────── */}
      <ApprovalsFilterableTable
        rows={rows}
        showDeleted={showDeleted}
        currentUserId={currentUserId}
        stockRows={stockRows}
        metrics={metricCounts}
        initialSearch={searchQuery}
        archiveAction={handleArchive}
        archiveAllAction={handleArchiveAll}
        approveAction={handleApprove}
        rejectAction={handleReject}
        createOverrideAction={handleCreateOverride}
      />

      {/* ── Pagination ──────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-outline-variant/30 bg-surface-white px-4 py-3 font-body text-body-sm text-text-grey">
          <span>
            Showing Page <strong className="text-on-surface">{currentPage}</strong> of{" "}
            <strong className="text-on-surface">{totalPages}</strong> ({total} total requests)
          </span>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/approvals?${new URLSearchParams({
                  ...(typeFilter ? { type: typeFilter } : {}),
                  ...(showDeleted ? { tab: "deleted" } : {}),
                  page: String(currentPage - 1),
                })}`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-outline-variant/30 bg-surface px-3 font-label text-label-xs font-bold text-on-surface hover:bg-surface-light-grey"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/approvals?${new URLSearchParams({
                  ...(typeFilter ? { type: typeFilter } : {}),
                  ...(showDeleted ? { tab: "deleted" } : {}),
                  page: String(currentPage + 1),
                })}`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-outline-variant/30 bg-surface px-3 font-label text-label-xs font-bold text-on-surface hover:bg-surface-light-grey"
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
