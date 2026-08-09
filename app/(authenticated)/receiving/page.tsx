// Receiving — WRR work-queue list page, with a Ledger tab for confirmed WRRs.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §3 (route), §4 (state model), §10
//     (putaway and incoming ledger — the Ledger tab merged here 2026-08-09)
//   specs/07-incoming-receiving/requirements.md R2.5, R9
//   specs/00-steering/brand-design-system.md §3 (office tab pattern), §6
//     (office surface, Level 1 elevation)
//   specs/00-steering/revision-log.md (2026-08-09 restructuring — merge the
//     standalone /incoming-ledger route into this page as a "Ledger" tab)
//
// Surface: Office — desktop-first, secondary mobile support. This page is a
// list/review surface (glassmorphism cards, table, hover states), not a scan
// flow — see the tab-placement note below for why a tab switcher is used
// here despite the shell route registry currently tagging `/receiving` as
// "floor" (lib/shell/registry.ts). Per brand-design-system.md §3, "Multi-step
// forms, tabs, and side-by-side panels are office patterns" and are
// explicitly NOT appropriate for a scan-driven floor screen (e.g. the WRR
// scan/reconciliation flow at /receiving/[wrrId]/receive, which stays a
// single-column, one-primary-action screen and is unaffected by this
// change). This exact page, however, has always been built as an
// office-style desktop list/table (see the pre-existing "Surface: Office"
// header comment below, predating this change) — it is the pre-receiving
// office surface described in design.md §1, not the floor receiving
// surface. The registry's "floor" tag on the `/receiving` path is therefore
// a pre-existing mismatch between the route's registered surface and what
// was actually built at that path (matching several other already-flagged
// registry/reality mismatches in this codebase); tabs are used here because
// this specific screen is functionally an office review screen, not because
// the registry's surface tag was overridden. Flagged for a future registry
// correction rather than silently worked around.
// Permission gate: receiving.confirm

import Link from "next/link";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listWrrDocuments } from "@/lib/db/queries/receiving";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";

// ─── Constants ────────────────────────────────────────────────────────────────

const QUEUE_PAGE_SIZE = 20;
const LEDGER_PAGE_SIZE = 50;

// Status badges — brand-design-system.md §1.3 semantic color mapping:
// staged/in_progress → status-pending (amber); confirmed → status-available (green);
// cancelled → status-held (red).
const STATUS_LABELS: Record<string, string> = {
  staged_pending_arrival: "STAGED",
  receiving_in_progress: "IN PROGRESS",
  confirmed: "CONFIRMED",
  cancelled: "CANCELLED",
};

const STATUS_CLASSES: Record<string, string> = {
  staged_pending_arrival: "bg-status-pending/10 text-status-pending",
  receiving_in_progress: "bg-status-pending/10 text-status-pending",
  confirmed: "bg-status-available/10 text-status-available",
  cancelled: "bg-status-held/10 text-status-held",
};

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "staged_pending_arrival", label: "Staged" },
  { value: "receiving_in_progress", label: "In Progress" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
];

type TabKey = "queue" | "ledger";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "queue", label: "Work Queue" },
  { key: "ledger", label: "Ledger" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ tab?: string; status?: string; page?: string }>;
}

export default async function ReceivingListPage({ searchParams }: PageProps) {
  const {
    tab: tabParam,
    status: statusFilter,
    page: pageParam,
  } = await searchParams;
  const activeTab: TabKey = tabParam === "ledger" ? "ledger" : "queue";

  const resolver = await createPageResolver();

  // Gate: receiving.confirm required to view the receiving queue and ledger.
  const permResult = await requirePermission(resolver, "receiving.confirm");
  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view the receiving queue.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">receiving.confirm</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
            Receiving
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Warehouse receipt records — work queue and confirmed-receipt
            ledger.
          </p>
        </div>
        {/* New WRR button — h-11 (44px) per brand-design-system.md §3 office target */}
        <Link
          href="/receiving/new"
          className="inline-flex h-11 items-center justify-center rounded bg-brand-red px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          New WRR
        </Link>
      </div>

      {/* Tab switcher — office pattern per brand-design-system.md §3 (see
          the header comment above for why this page qualifies as office
          despite the route registry's current "floor" tag). */}
      <div
        role="tablist"
        aria-label="Receiving sections"
        className="mt-6 flex gap-2 border-b border-outline-variant/30"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <Link
              key={tab.key}
              href={tab.key === "queue" ? "/receiving" : "/receiving?tab=ledger"}
              role="tab"
              aria-selected={isActive}
              className={`flex h-11 items-center border-b-2 px-4 font-label text-label uppercase tracking-[0.05em] focus:outline-none focus:ring-2 focus:ring-brand-navy ${
                isActive
                  ? "border-brand-red text-brand-navy"
                  : "border-transparent text-text-grey hover:text-brand-navy"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "queue" ? (
        <WorkQueueTab statusFilter={statusFilter} pageParam={pageParam} />
      ) : (
        <LedgerTab pageParam={pageParam} />
      )}
    </div>
  );
}

// ─── Work Queue tab (default) ─────────────────────────────────────────────────

async function WorkQueueTab({
  statusFilter,
  pageParam,
}: {
  statusFilter?: string;
  pageParam?: string;
}) {
  const currentPage = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (currentPage - 1) * QUEUE_PAGE_SIZE;
  const status =
    statusFilter && statusFilter !== "" ? statusFilter : undefined;

  const { rows, total } = await listWrrDocuments(db, {
    limit: QUEUE_PAGE_SIZE,
    offset,
    status,
  });

  const totalPages = Math.ceil(total / QUEUE_PAGE_SIZE);

  return (
    <div>
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
              href="/receiving"
              className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* WRR table — Level 1 office elevation per brand-design-system.md §6 */}
      <div className="mt-4 overflow-hidden rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              {status
                ? "No WRRs match the current filter."
                : "No warehouse receipt records yet."}
            </p>
            {!status && (
              <p className="mt-2 font-body text-body-sm text-text-grey">
                Create a new WRR when a shipment is expected.
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
                    WRR Number
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Flow Type
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Staged By
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Created At
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row: WrrDocumentRow) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/50">
                    {/* Roboto Mono for reference numbers per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.wrrNumber}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {FLOW_LABELS[row.flowType] ?? row.flowType}
                    </td>
                    <td className="px-4 py-3">
                      {/* Status badge — radius-full, §1.3 semantic colors */}
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[row.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
                      >
                        {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.stagedByUserId}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {row.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* View link — h-11 (44px) touch target */}
                      <Link
                        href={`/receiving/${row.id}`}
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
                href={`/receiving?${new URLSearchParams({
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
                href={`/receiving?${new URLSearchParams({
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

// ─── Ledger tab ───────────────────────────────────────────────────────────────
//
// Confirmed-only view, no status filter shown (always confirmed per task
// spec). The authoritative incoming ledger view is over inventory_transactions
// (requirements.md R9.1); this queries wrr_documents as a proxy pending full
// inventory_transactions integration (unchanged from the former standalone
// incoming-ledger/page.tsx).

async function LedgerTab({ pageParam }: { pageParam?: string }) {
  const currentPage = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (currentPage - 1) * LEDGER_PAGE_SIZE;

  // Always confirmed — ledger shows only committed receipts.
  const { rows, total } = await listWrrDocuments(db, {
    limit: LEDGER_PAGE_SIZE,
    offset,
    status: "confirmed",
  });

  const totalPages = Math.ceil(total / LEDGER_PAGE_SIZE);

  return (
    <div>
      <p className="mt-6 font-body text-body-md text-text-grey">
        Read-only view of confirmed warehouse receipts. Corrections create new
        transactions; history is immutable per design.md §10.
      </p>

      {/* Ledger table — Level 1 office elevation per brand-design-system.md §6 */}
      <div className="mt-4 overflow-hidden rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              No confirmed receipts in the ledger yet.
            </p>
            <p className="mt-2 font-body text-body-sm text-text-grey">
              Confirmed WRRs appear here after the receipt commit succeeds.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  {/* Epilogue SemiBold uppercase headers per §9 */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    WRR Number
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Flow Type
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Vendor Party
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Confirmed At
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row: WrrDocumentRow) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/50">
                    {/* WRR number — Roboto Mono per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.wrrNumber}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {FLOW_LABELS[row.flowType] ?? row.flowType}
                    </td>
                    {/* Vendor party ID — Mono for identifiers per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.vendorPartyId}
                    </td>
                    {/*
                     * Note: confirmedAt is on wrr_documents but not in the
                     * current WrrDocumentRow query result. Showing createdAt
                     * as a proxy; extend getWrrDocument/listWrrDocuments to
                     * include confirmedAt when the query is updated.
                     */}
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {row.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/receiving/${row.id}`}
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
                href={`/receiving?tab=ledger&page=${currentPage - 1}`}
                className="inline-flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/receiving?tab=ledger&page=${currentPage + 1}`}
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
