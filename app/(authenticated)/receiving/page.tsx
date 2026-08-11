// Receiving — WRR work-queue list page, with WRRs and Incoming Ledger tabs.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §3 (route), §4 (state model), §10
//     (putaway and incoming ledger — the Ledger tab merged here 2026-08-09)
//   specs/07-incoming-receiving/requirements.md R2.5, R9
//   specs/00-steering/brand-design-system.md §3 (office tab pattern), §6
//     (office surface, Level 1 elevation)
//   specs/00-steering/revision-log.md (2026-08-09 restructuring — merge the
//     standalone /incoming-ledger route into this page; 2026-08-09 PO change —
//     three-tab layout: Receive / WRRs / Incoming Ledger; New WRR moved inside
//     WRRs tab gated by receiving.create)
//
// Surface: Shared (floor staff see Receive tab; supervisors see WRRs tab with
// New WRR button). Permission gate: receiving.confirm for all tabs.

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

type TabKey = "receive" | "wrrs" | "ledger";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "receive", label: "Receive" },
  { key: "wrrs", label: "WRRs" },
  { key: "ledger", label: "Incoming Ledger" },
];

function WrrMobileCards({
  rows,
  actionForRow,
  secondaryLabel,
  secondaryValue,
}: {
  rows: WrrDocumentRow[];
  actionForRow: (row: WrrDocumentRow) => { href: string; label: string; primary?: boolean };
  secondaryLabel: (row: WrrDocumentRow) => string;
  secondaryValue: (row: WrrDocumentRow) => string;
}) {
  return (
    <div className="divide-y divide-outline-variant/30 md:hidden">
      {rows.map((row) => {
        const action = actionForRow(row);
        return (
          <article key={row.id} className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-mono-md font-bold text-on-surface">
                  {row.wrrNumber}
                </p>
                <p className="mt-1 font-body text-body-md text-text-grey">
                  {FLOW_LABELS[row.flowType] ?? row.flowType}
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 font-label text-label uppercase ${STATUS_CLASSES[row.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
              >
                {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-y border-outline-variant/30 py-3 font-body text-body-md">
              <div>
                <dt className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  {secondaryLabel(row)}
                </dt>
                <dd className="mt-1 truncate font-mono text-mono-md text-on-surface">
                  {secondaryValue(row)}
                </dd>
              </div>
              <div>
                <dt className="font-label text-label uppercase tracking-[0.05em] text-text-grey">Created</dt>
                <dd className="mt-1 text-on-surface">{row.createdAt.toLocaleString()}</dd>
              </div>
            </dl>
            <Link
              href={action.href}
              className={`flex w-full items-center justify-center rounded px-4 font-label text-body-md uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand-navy focus:ring-offset-2 active:scale-[0.97] ${
                action.primary
                  ? "min-h-16 bg-brand-red text-surface-white"
                  : "min-h-14 bg-brand-navy text-surface-white"
              }`}
            >
              {action.label}
            </Link>
          </article>
        );
      })}
    </div>
  );
}

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

  const activeTab: TabKey =
    tabParam === "wrrs" ? "wrrs" :
    tabParam === "ledger" ? "ledger" :
    "receive";

  const resolver = await createPageResolver();

  // Gate: receiving.confirm required to view any tab.
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

  // Additional check: can this user create WRRs? Used in WRRs tab.
  const canCreate = (await requirePermission(resolver, "receiving.create")).kind === "authorized";

  return (
    <div className="mx-auto max-w-container">
      {/* Page header — "New WRR" button removed from here (moved into WRRs tab) */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Receiving / Incoming
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Warehouse receipt records — work queue and confirmed-receipt
          ledger.
        </p>
      </div>

      {/* Tab switcher — office pattern per brand-design-system.md §3 */}
      <div
        role="tablist"
        aria-label="Receiving sections"
        className="mt-6 flex gap-2 overflow-x-auto border-b border-outline-variant/30"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const href =
            tab.key === "receive"
              ? "/receiving"
              : tab.key === "wrrs"
              ? "/receiving?tab=wrrs"
              : "/receiving?tab=ledger";
          return (
            <Link
              key={tab.key}
              href={href}
              role="tab"
              aria-selected={isActive}
              className={`flex h-14 shrink-0 items-center border-b-2 px-4 font-label text-body-md uppercase tracking-[0.05em] focus:outline-none focus:ring-2 focus:ring-brand-navy md:h-11 md:text-label ${
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

      {activeTab === "receive" ? (
        <ReceiveTab statusFilter={statusFilter} pageParam={pageParam} />
      ) : activeTab === "wrrs" ? (
        <WrrsTab statusFilter={statusFilter} pageParam={pageParam} canCreate={canCreate} />
      ) : (
        <LedgerTab pageParam={pageParam} />
      )}
    </div>
  );
}

// ─── Receive tab (default) — staged/in-progress WRRs ready to be received ────

async function ReceiveTab({
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
          <input type="hidden" name="tab" value="receive" />
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
              className="h-14 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy md:h-11"
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
            className="flex h-14 items-center justify-center rounded bg-brand-navy px-4 font-label text-body-md text-surface-white active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy md:h-11 md:text-label md:hover:opacity-90"
          >
            Apply
          </button>
          {status && (
            <Link
              href="/receiving"
              className="flex h-14 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-body-md text-on-surface active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy md:h-11 md:text-label md:hover:bg-surface-light-grey"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* WRR table — Level 1 office elevation per brand-design-system.md §6 */}
      <div className="mt-4 overflow-hidden rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-2 md:shadow-elevation-1">
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
          <>
          <WrrMobileCards
            rows={rows}
            secondaryLabel={() => "Staged by"}
            secondaryValue={(row) => row.stagedByUserId}
            actionForRow={(row) =>
              row.status === "confirmed" || row.status === "cancelled"
                ? { href: `/receiving/${row.id}`, label: "View WRR" }
                : { href: `/receiving/${row.id}/receive`, label: "Receive items", primary: true }
            }
          />
          <div className="hidden overflow-x-auto md:block">
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
          </>
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

// ─── WRRs tab — all statuses, "New WRR" button gated by receiving.create ──────

async function WrrsTab({
  statusFilter,
  pageParam,
  canCreate,
}: {
  statusFilter?: string;
  pageParam?: string;
  canCreate: boolean;
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
      {/* Tab header with "New WRR" button — gated by receiving.create */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value="wrrs" />
            <div className="flex flex-col gap-1">
              <label
                htmlFor="wrrs-status-filter"
                className="font-label text-label text-text-grey"
              >
                Status
              </label>
              <select
                id="wrrs-status-filter"
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
                href="/receiving?tab=wrrs"
                className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Clear
              </Link>
            )}
          </form>
        </div>
        {/* New WRR button — receiving.create gated, h-11 (44px) office target */}
        {canCreate && (
          <Link
            href="/receiving/new"
                className="inline-flex h-14 items-center justify-center rounded bg-brand-red px-4 font-label text-body-md text-surface-white active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy md:h-11 md:text-label md:hover:opacity-90"
          >
            New WRR
          </Link>
        )}
      </div>

      {/* WRR table — Level 1 office elevation */}
      <div className="mt-4 overflow-hidden rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-2 md:shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              {status
                ? "No WRRs match the current filter."
                : "No warehouse receipt records yet."}
            </p>
          </div>
        ) : (
          <>
          <WrrMobileCards
            rows={rows}
            secondaryLabel={() => "Staged by"}
            secondaryValue={(row) => row.stagedByUserId}
            actionForRow={(row) => ({ href: `/receiving/${row.id}`, label: "View WRR" })}
          />
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
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
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.wrrNumber}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {FLOW_LABELS[row.flowType] ?? row.flowType}
                    </td>
                    <td className="px-4 py-3">
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
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between font-body text-body-sm text-text-grey">
          <span>
            Page {currentPage} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/receiving?tab=wrrs&${new URLSearchParams({
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
                href={`/receiving?tab=wrrs&${new URLSearchParams({
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

// ─── Incoming Ledger tab ──────────────────────────────────────────────────────
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
      <div className="mt-4 overflow-hidden rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-2 md:shadow-elevation-1">
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
          <>
          <WrrMobileCards
            rows={rows}
            secondaryLabel={() => "Vendor party"}
            secondaryValue={(row) => row.vendorPartyId}
            actionForRow={(row) => ({ href: `/receiving/${row.id}`, label: "View WRR" })}
          />
          <div className="hidden overflow-x-auto md:block">
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
          </>
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
