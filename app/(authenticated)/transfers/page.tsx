// Transfer Queue — transfer request list page.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §3 (route), §4 (state model)
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1 elevation),
//     §1.3 (status badge colors), §9 (tables — Epilogue headers, Roboto Mono IDs)
//
// Surface: Office — desktop-first, secondary mobile support.
// Permission gate: transfer.view

import Link from "next/link";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listTransferRequests } from "@/lib/db/queries/transfers";
import type { TransferRequestRow } from "@/lib/db/queries/transfers";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// Status badge labels and classes — brand-design-system.md §1.3 semantic color mapping:
// staged → status-neutral (slate); in_progress → status-pending (amber);
// completed → status-available (green); cancelled → status-held (red).
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

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "staged", label: "Staged" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function TransferListPage({ searchParams }: PageProps) {
  const { status: statusFilter, page: pageParam } = await searchParams;
  const resolver = await createPageResolver();

  // Gate: transfer.view required to view the transfer queue.
  const permResult = await requirePermission(resolver, "transfer.view");
  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view the transfer queue.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">transfer.view</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  // Gate: check transfer.request capability for "New Transfer" button visibility.
  const canRequest =
    (await requirePermission(resolver, "transfer.request")).kind === "authorized";

  const currentPage = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const status =
    statusFilter && statusFilter !== "" ? statusFilter : undefined;

  const { rows, total } = await listTransferRequests(db, {
    limit: PAGE_SIZE,
    offset,
    status,
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
            Transfer Queue
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Internal location-to-location transfer requests.
          </p>
        </div>
        {/* New Transfer button — h-11 (44px) per brand-design-system.md §3 office target */}
        {canRequest && (
          <Link
            href="/transfers/new"
            className="inline-flex h-11 items-center justify-center rounded bg-brand-red px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            New Transfer
          </Link>
        )}
      </div>

      {/* Status filter bar */}
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
              defaultValue={statusFilter ?? ""}
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Apply
          </button>
          {status && (
            <Link
              href="/transfers"
              className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Transfer table — Level 1 office elevation per brand-design-system.md §6 */}
      <div className="mt-4 overflow-hidden rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              {status
                ? "No transfers match the current filter."
                : "No transfer requests yet."}
            </p>
            {!status && canRequest && (
              <p className="mt-2 font-body text-body-sm text-text-grey">
                Create a new transfer to move stock between locations.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  {/* Epilogue SemiBold uppercase headers per §9 tables */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Flow Type
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    From Location
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    To Location
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Requested By
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Created At
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row: TransferRequestRow) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/50">
                    <td className="px-4 py-3">
                      {/* Status badge — radius-full, §1.3 semantic colors */}
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[row.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
                      >
                        {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {FLOW_LABELS[row.flowType] ?? row.flowType}
                    </td>
                    {/* Roboto Mono for location IDs per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.fromLocationId}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.toLocationId}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.requestedBy}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {row.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* View link — h-11 (44px) touch target */}
                      <Link
                        href={`/transfers/${row.id}`}
                        className="inline-flex h-11 items-center font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
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
                href={`/transfers?${new URLSearchParams({
                  ...(status ? { status } : {}),
                  page: String(currentPage - 1),
                })}`}
                className="inline-flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/transfers?${new URLSearchParams({
                  ...(status ? { status } : {}),
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
