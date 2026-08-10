// Transfer Queue — transfer request list page.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §3 (route), §4 (state model)
//   specs/11-transfer-and-inspection/requirements.md §3 (actors and surfaces)
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1 elevation;
//     floor — solid bg-brand-navy, no glassmorphism), §1.3 (status badge colors),
//     §3 (floor — mobile-first base styles, 64px CTAs, one primary action,
//     active: not hover:), §9 (tables — Epilogue headers, Roboto Mono IDs)
//
// Surface: SHARED — warehouse_staff see a floor card list (bg-brand-navy, 64px CTAs,
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

// ─── Floor mock data (TODO: wire to real staff-scoped query) ─────────────────

interface FloorTransferCard {
  id: string;
  reference: string;
  flowType: string;
  fromLocation: string;
  toLocation: string;
  itemCount: number;
  status: "staged" | "in_progress";
}

// TODO: replace with real query filtered to the current warehouse_staff user's
// assigned transfers (staged and in_progress only).
const MOCK_FLOOR_TRANSFERS: FloorTransferCard[] = [
  {
    id: "mock-tr-001",
    reference: "TRF-2026-001",
    flowType: "VMI",
    fromLocation: "LOC-A01",
    toLocation: "LOC-B02",
    itemCount: 3,
    status: "staged",
  },
  {
    id: "mock-tr-002",
    reference: "TRF-2026-002",
    flowType: "Trading",
    fromLocation: "LOC-C03",
    toLocation: "LOC-D04",
    itemCount: 1,
    status: "in_progress",
  },
];

// TODO: replace with real query — check if any inspections are assigned to
// this warehouse_staff member for today.
const MOCK_HAS_INSPECTIONS_TODAY = true;

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

  // Surface detection — brand-design-system.md §3: warehouse_staff → floor surface
  // (bg-brand-navy, no glassmorphism, 64px CTAs, active: not hover:).
  // supervisors/admins → office surface (glassmorphism, h-11, hover:).
  const isFloor = permResult.context.activeRoleKeys.includes("warehouse_staff");

  // Floor branch: render simplified card list for warehouse staff.
  // brand-design-system.md §3: one primary action per screen, primary action in
  // bottom third full-width, no dense tables on floor screens.
  if (isFloor) {
    return (
      <div className="flex min-h-screen flex-col bg-brand-navy px-4 py-4">
        {/* Floor top bar */}
        <div className="flex items-center justify-between pb-4">
          <h1 className="font-heading font-extrabold text-headline-md text-white">
            Transfers
          </h1>
          {/* Daily Inspection shortcut — prominent if inspections exist today */}
          {MOCK_HAS_INSPECTIONS_TODAY && (
            <Link
              href="/inspection"
              className="inline-flex h-14 items-center gap-2 rounded-xl bg-status-pending/20 border border-status-pending/30 px-4 font-label text-body-md text-status-pending
                         active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100
                         focus:outline-none focus:ring-2 focus:ring-white"
            >
              {/* Icon paired with text — §1.3 floor color-blind rule */}
              <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
              <span>Daily Inspection</span>
            </Link>
          )}
        </div>

        {/* Open transfers — card list, one item per row.
            brand-design-system.md §9: floor tables are a fail case;
            card-based list per item. */}
        {MOCK_FLOOR_TRANSFERS.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <CheckCircle2 size={48} strokeWidth={1.5} className="text-status-available" aria-hidden="true" />
            <p className="font-heading font-semibold text-headline-md text-white">
              All caught up
            </p>
            <p className="font-body text-body-md text-white/70">
              No open transfers assigned to you right now.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {MOCK_FLOOR_TRANSFERS.map((transfer) => (
              <Link
                key={transfer.id}
                href={`/transfers/${transfer.id}`}
                // Floor card: solid bg-white/10 over navy, no glassmorphism — §6; entire card is tap target
                className="block rounded-xl bg-white/10 border border-white/20 p-4 h-auto min-h-16 active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Transfer reference — Roboto Mono per §9; text-mono-lg (18px) per floor 16px minimum */}
                    <p className="font-mono text-mono-lg font-bold text-white">
                      {transfer.reference}
                    </p>
                    {/* Route line — icon + text, never icon alone */}
                    <div className="mt-2 flex items-center gap-2">
                      <ArrowLeftRight
                        size={16}
                        strokeWidth={2}
                        className="shrink-0 text-white/70"
                        aria-hidden="true"
                      />
                      <span className="font-body text-body-md text-white/70">
                        {transfer.fromLocation} → {transfer.toLocation}
                      </span>
                    </div>
                    {/* Item count + flow type */}
                    <p className="mt-1 font-body text-body-md text-white/70">
                      {transfer.itemCount}{" "}
                      {transfer.itemCount === 1 ? "item" : "items"} ·{" "}
                      {transfer.flowType}
                    </p>
                    {/* Status badge — always icon + color per §1.3 floor rule */}
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-label text-body-md uppercase ${
                          transfer.status === "in_progress"
                            ? "bg-status-pending/20 text-status-pending"
                            : "bg-status-neutral/20 text-white/70"
                        }`}
                      >
                        {transfer.status === "in_progress"
                          ? <Activity size={20} strokeWidth={2} aria-hidden="true" className="text-status-available" />
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
          <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
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
      <div className="mt-4 overflow-hidden rounded-md bg-surface-white shadow-elevation-1">
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
