// Transfer Queue — transfer request list page.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §3 (route), §4 (state model)
//   specs/11-transfer-and-inspection/requirements.md §3 (actors and surfaces)
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1 elevation;
//     floor — solid bg-primary, no glassmorphism), §1.3 (status badge colors),
//     §3 (floor — mobile-first base styles, 64px CTAs, one primary action,
//     active: not hover:), §9 (tables — Epilogue headers, Roboto Mono IDs)
//
// Surface: SHARED — warehouse_staff see a floor card list (bg-primary, 64px CTAs,
//   no glassmorphism); supervisors/admins see the office table view (glassmorphism,
//   h-11 buttons, hover states).
// Permission gate: transfer.view
//
// Floor mock data: TODO — wire to a staff-scoped transfer query that returns only
//   transfers assigned to the current warehouse_staff member.

import Link from "next/link";
import { CheckCircle2, AlertTriangle, ArrowLeftRight, Activity, Clock, ChevronRight } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listTransferRequests } from "@/lib/db/queries/transfers";
import type { TransferRequestRow } from "@/lib/db/queries/transfers";

// TODO: wire to real query — check if any inspections are assigned to
// this warehouse_staff member for today.
const MOCK_HAS_INSPECTIONS_TODAY = true;

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// Status badge labels and classes — brand-design-system.md §1.3 semantic color mapping:
// staged → status-neutral (slate); in_progress → status-warning (amber);
// completed → status-success (green); cancelled → status-error (red).
const STATUS_LABELS: Record<string, string> = {
  staged: "STAGED",
  in_progress: "IN PROGRESS",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

const STATUS_CLASSES: Record<string, string> = {
  staged: "bg-status-neutral/10 text-status-neutral",
  in_progress: "bg-status-warning/10 text-status-warning",
  completed: "bg-status-success/10 text-status-success",
  cancelled: "bg-status-error/10 text-status-error",
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
        <p className="font-body text-body-md text-on-surface-variant">
          You do not have permission to view the transfer queue.
        </p>
        <p className="mt-2 font-body text-body-sm text-on-surface-variant">
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

  // Surface detection — brand-design-system.md §3: warehouse_staff → floor surface
  // (bg-primary, no glassmorphism, 64px CTAs, active: not hover:).
  // supervisors/admins → office surface (glassmorphism, h-11, hover:).
  const isFloor = permResult.context.activeRoleKeys.includes("warehouse_staff");

  // Floor branch: render simplified card list for warehouse staff.
  // brand-design-system.md §3: one primary action per screen, primary action in
  // bottom third full-width, no dense tables on floor screens.
  if (isFloor) {
    const floorRows = rows.filter(r => r.status === "staged" || r.status === "in_progress");

    return (
      <div className="flex min-h-screen flex-col bg-primary px-4 py-4">
        {/* Floor top bar */}
        <div className="flex items-center justify-between pb-4">
          <h1 className="font-heading font-extrabold text-headline-md text-white">
            Transfers
          </h1>
          {/* Daily Inspection shortcut */}
          <Link
            href="/inspection"
            className="inline-flex h-14 items-center gap-2 rounded-xl bg-status-warning/20 border border-status-warning/30 px-4 font-label text-body-md text-status-warning
                        active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100
                        focus:outline-none focus:ring-2 focus:ring-white"
          >
            <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
            <span>Daily Inspection</span>
          </Link>
        </div>

        {floorRows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <CheckCircle2 size={48} strokeWidth={1.5} className="text-status-success" aria-hidden="true" />
            <p className="font-heading font-semibold text-headline-md text-white">
              All caught up
            </p>
            <p className="font-body text-body-md text-white/70">
              No open transfers assigned to you right now.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {floorRows.map((transfer) => (
              <Link
                key={transfer.id}
                href={`/transfers/${transfer.id}/execute`}
                className="block rounded-xl bg-white/10 border border-white/20 p-4 h-auto min-h-16 active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-mono-lg font-bold text-white">
                      {transfer.reference ?? transfer.id.split('-')[0].toUpperCase()}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <ArrowLeftRight
                        size={16}
                        strokeWidth={2}
                        className="shrink-0 text-white/70"
                        aria-hidden="true"
                      />
                      <span className="font-body text-body-md text-white/70">
                        {transfer.fromLocationId} → {transfer.toLocationId}
                      </span>
                    </div>
                    <p className="mt-1 font-body text-body-md text-white/70">
                      {FLOW_LABELS[transfer.flowType] ?? transfer.flowType}
                    </p>
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-label text-body-md uppercase ${
                          transfer.status === "in_progress"
                            ? "bg-status-warning/20 text-status-warning"
                            : "bg-status-neutral/20 text-white/70"
                        }`}
                      >
                        {transfer.status === "in_progress"
                          ? <Activity size={20} strokeWidth={2} aria-hidden="true" className="text-status-success" />
                          : <Clock size={20} strokeWidth={2} aria-hidden="true" className="text-white/50" />}
                        {transfer.status === "in_progress"
                          ? "In Progress"
                          : "Staged"}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={24} strokeWidth={2} aria-hidden="true" className="shrink-0 text-white/50 self-center" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }



  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
            Transfer Queue
          </h1>
          <p className="mt-1 font-body text-body-md text-on-surface-variant">
            Internal location-to-location transfer requests.
          </p>
        </div>
        {/* New Transfer button — h-11 (44px) per brand-design-system.md §3 office target */}
        {canRequest && (
          <Link
            href="/transfers/new"
            className="inline-flex h-11 items-center justify-center rounded bg-action-blue px-4 font-label text-label text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
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
              className="font-label text-label text-on-surface-variant"
            >
              Status
            </label>
            <select
              id="status-filter"
              name="status"
              defaultValue={statusFilter ?? ""}
              className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
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
            className="flex h-11 items-center justify-center rounded bg-primary px-4 font-label text-label text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Apply
          </button>
          {status && (
            <Link
              href="/transfers"
              className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-dim focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Transfer table — Level 1 office elevation per brand-design-system.md §6 */}
      <div className="mt-4 overflow-hidden rounded-md bg-white shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-on-surface-variant">
              {status
                ? "No transfers match the current filter."
                : "No transfer requests yet."}
            </p>
            {!status && canRequest && (
              <p className="mt-2 font-body text-body-sm text-on-surface-variant">
                Create a new transfer to move stock between locations.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-dim">
                  {/* Epilogue SemiBold uppercase headers per §9 tables */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Flow Type
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    From Location
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    To Location
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Requested By
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Created At
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row: TransferRequestRow) => (
                  <tr key={row.id} className="hover:bg-surface-dim/50">
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
                    <td className="px-4 py-3 font-body text-body-md text-on-surface-variant">
                      {row.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* View link — h-11 (44px) touch target */}
                      <Link
                        href={`/transfers/${row.id}`}
                        className="inline-flex h-11 items-center font-label text-label text-primary underline hover:text-secondary focus:outline-none focus:ring-2 focus:ring-primary"
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
        <div className="mt-4 flex items-center justify-between font-body text-body-sm text-on-surface-variant">
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
                className="inline-flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-dim focus:outline-none focus:ring-2 focus:ring-primary"
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
                className="inline-flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-dim focus:outline-none focus:ring-2 focus:ring-primary"
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
