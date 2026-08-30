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
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listApprovalQueueRequests, listPendingApprovalRequests } from "@/lib/db/queries/approvals";
import { archiveExpiredApprovalRequest } from "@/lib/actions/approvals";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ status?: string; type?: string; sort?: string; page?: string; tab?: string; error?: string }>;
}

import { ApprovalsFilterableTable } from "./_components/ApprovalsFilterableTable";

export default async function ApprovalQueuePage({ searchParams }: PageProps) {
  const {
    type: typeFilter,
    page: pageParam,
    tab: tabParam,
    error: actionError,
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

  const showDeleted = tabParam === "deleted";
  const currentPage = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  // Type filter: URL param "type" maps to approvalType; "all" means no filter.
  const approvalType =
    typeFilter && typeFilter !== "all" ? typeFilter : undefined;

  let rows;
  let total;
  try {
    ({ rows, total } = await listApprovalQueueRequests(db, {
      limit: PAGE_SIZE,
      offset,
      approvalType,
      deleted: showDeleted,
    }));
  } catch {
    // Keep the Open queue available while a deployment is waiting for the
    // soft-archive migration. Deleted remains intentionally unavailable until
    // its durable columns exist rather than pretending the archive is empty.
    if (showDeleted) throw new Error("Deleted approvals are not available until the database migration is applied.");
    ({ rows, total } = await listPendingApprovalRequests(db, {
      limit: PAGE_SIZE,
      offset,
      approvalType,
    }));
  }

  async function handleArchive(formData: FormData) {
    "use server";
    const requestId = String(formData.get("requestId") ?? "");
    let result;
    try {
      result = await archiveExpiredApprovalRequest(await createPageResolver(), requestId);
    } catch {
      redirect("/approvals?error=Delete%20could%20not%20be%20completed.%20Please%20try%20again.");
    }
    if (result.ok) {
      redirect("/approvals?tab=deleted");
    }
    redirect(`/approvals?error=${encodeURIComponent(result.error)}`);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-container">
      {/* Page header — text-headline-xl Fira Sans Bold per brand-design-system.md §2 */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          {showDeleted ? "Deleted Approvals" : "Approval Queue"}
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          {showDeleted ? "Expired requests retained for audit monitoring." : "Review FIFO override requests and clear expired work safely."}
        </p>
      </div>

      <nav aria-label="Approval views" className="mt-6 flex gap-1 border-b border-outline-variant/30">
        <Link href={`/approvals${typeFilter ? `?type=${typeFilter}` : ""}`} className={`inline-flex h-11 items-center border-b-2 px-4 font-label text-label font-bold ${!showDeleted ? "border-brand-navy text-brand-navy" : "border-transparent text-text-grey hover:text-on-surface"}`}>Open</Link>
        <Link href={`/approvals?tab=deleted${typeFilter ? `&type=${typeFilter}` : ""}`} className={`inline-flex h-11 items-center border-b-2 px-4 font-label text-label font-bold ${showDeleted ? "border-brand-navy text-brand-navy" : "border-transparent text-text-grey hover:text-on-surface"}`}>Deleted</Link>
      </nav>

      {actionError && (
        <div role="alert" className="mt-4 rounded-xl border border-status-held/30 bg-status-held/10 px-4 py-3 font-body text-body-sm text-text-grey">
          <span className="font-label text-label font-bold text-status-held">Delete could not be completed. </span>
          {actionError}
        </div>
      )}

      <div role="status" className="mt-6 flex items-start gap-3 rounded border border-status-held/30 bg-status-held/10 px-4 py-4">
        <span className="font-heading text-body-lg text-status-held" aria-hidden="true">⚖</span>
        <div><p className="font-label text-label font-bold text-status-held">COMPLIANCE ENFORCEMENT ACTIVE</p><p className="mt-1 font-body text-body-sm text-text-grey">Self-approval of override requests is blocked. Exceptions require the appropriate approval authority.</p></div>
      </div>

      <div className="mt-6">
        <ApprovalsFilterableTable rows={rows} showDeleted={showDeleted} archiveAction={handleArchive} />
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
                  ...(showDeleted ? { tab: "deleted" } : {}),
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
