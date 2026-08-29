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
//     WRRs tab gated by receiving.confirm)
//
// Surface: Shared (floor staff see Receive tab; supervisors see WRRs tab with
// New WRR button). Permission gate: receiving.confirm for all tabs.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, FileSpreadsheet, Plus, Truck, Warehouse } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listWrrDocuments } from "@/lib/db/queries/receiving";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";
import { AutoSubmitSelect } from "./_components/AutoSubmitSelect";
import { WrrFilterableTable } from "./_components/WrrFilterableTable";

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
  { key: "wrrs", label: "WRRs (Work Queue)" },
  { key: "receive", label: "Receive" },
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
                  ? "min-h-16 bg-primary text-surface-white"
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

  // Gate: receiving.view — matches lib/shell/registry.ts's "receiving" route
  // entry (the read/review capability; receiving.confirm is a separate,
  // stricter capability reserved for the mutating create/commit actions).
  const permResult = await requirePermission(resolver, "receiving.view");
  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view the receiving queue.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">receiving.view</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  // Additional check: can this user create WRRs? Used in WRRs tab. Matches
  // /receiving/new's own gate and the createWrr action's real requirement —
  // "receiving.create" is not a capability that exists in the RBAC seed.
  const canCreate = (await requirePermission(resolver, "receiving.confirm")).kind === "authorized";

  return (
    <div className="mx-auto max-w-container pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-headline-lg tracking-tight text-on-surface">
            Inbound Management
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Manage incoming shipments, WRRs, and dock scheduling.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <Link href="/receiving/new" className="inline-flex h-12 items-center justify-center gap-2 rounded bg-on-surface px-5 font-label text-body-md font-bold text-surface-white shadow-elevation-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">
              <Plus size={19} aria-hidden="true" />
              Start New WRR
            </Link>
          )}
        </div>
      </div>

      {/* Tab switcher — office pattern per brand-design-system.md §3 */}
      <div
        role="tablist"
        aria-label="Receiving sections"
        className="mt-6 flex gap-6 overflow-x-auto border-b border-outline-variant/30"
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
              className={`flex h-11 shrink-0 items-center border-b-2 px-1 font-label text-label font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                isActive
                  ? "border-on-surface text-on-surface"
                  : "border-transparent text-text-grey hover:text-on-surface"
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

// ─── Receive tab (default) — in-progress WRRs ready for floor receive ─────────
//
// The Receive tab is a floor quick-jump: it defaults to showing only
// `receiving_in_progress` WRRs (the ones a warehouseman needs to continue
// receiving right now), not all WRRs (that's the WRRs tab's job).
// A floor worker never needs to see staged/confirmed/cancelled rows here —
// they just need to tap "Continue" on their active WRR.

async function ReceiveTab({
  statusFilter,
  pageParam,
}: {
  statusFilter?: string;
  pageParam?: string;
}) {
  const currentPage = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (currentPage - 1) * QUEUE_PAGE_SIZE;
  // Default to receiving_in_progress for the quick-jump use case.
  // The status filter from the URL overrides this when present.
  const status =
    statusFilter && statusFilter !== "" ? statusFilter : "receiving_in_progress";

  const { rows, total } = await listWrrDocuments(db, {
    limit: QUEUE_PAGE_SIZE,
    offset,
    status,
  });

  const totalPages = Math.ceil(total / QUEUE_PAGE_SIZE);

  return (
    <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-headline-md font-bold text-on-surface">
            Active Warehouse Receipt Requests
          </h2>
          <span className="shrink-0 rounded-full bg-[#DCE6FF] px-3 py-1 font-label text-label font-bold text-brand-navy">
            {total} active
          </span>
        </div>

      {/* WRR cards — floor-first layout. No dense table here; floor workers
          need one large CTA per row at 64px (min-h-16), not a multi-column table.
          brand-design-system.md §3: floor primary actions full-width bottom-of-screen;
          §9: floor tables are a fail case — card list is correct here. */}
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-outline-variant bg-surface-white px-6 py-12 text-center shadow-elevation-2">
            <ClipboardList className="mx-auto text-status-neutral" size={30} aria-hidden="true" />
            <p className="font-body text-body-md text-text-grey">
              No WRRs currently in progress.
            </p>
            <p className="mt-2 font-body text-body-md text-text-grey">
              New WRRs staged for your shift will appear here.
            </p>
          </div>
        ) : (
          rows.map((row: WrrDocumentRow) => (
            <article
              key={row.id}
              className="rounded-lg border border-outline-variant bg-surface-white p-4 shadow-elevation-2 transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-elevation-2"
            >
              <div className="grid items-center gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                <div className="flex h-12 w-12 items-center justify-center rounded bg-[#E4ECFF] text-brand-navy">
                  <Truck size={24} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-mono-md font-bold text-on-surface">{row.wrrNumber}</p>
                    <span
                      className={`inline-flex items-center rounded border border-outline-variant px-2 py-1 font-label text-label uppercase ${STATUS_CLASSES[row.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
                    >
                      {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-body text-body-md text-on-surface">
                    {row.vendorPartyName ?? row.vendorPartyId} · {FLOW_LABELS[row.flowType] ?? row.flowType}
                  </p>
                </div>
                <div className="md:text-right">
                  <p className="font-label text-label font-bold uppercase tracking-wide text-text-grey">Created</p>
                  <p className="mt-1 font-body text-body-md font-bold text-on-surface">
                    {row.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <Link
                  href={`/receiving/${row.id}/receive`}
                  className="flex h-12 items-center justify-center rounded border border-brand-navy bg-surface-white px-4 font-label text-body-md font-bold text-brand-navy active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Begin Receiving
                </Link>
              </div>
            </article>
          ))
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
                href={`/receiving?page=${currentPage - 1}`}
                className="inline-flex h-14 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-body-md text-on-surface active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy md:h-11 md:text-label md:hover:bg-surface-light-grey"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/receiving?page=${currentPage + 1}`}
                className="inline-flex h-14 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-body-md text-on-surface active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy md:h-11 md:text-label md:hover:bg-surface-light-grey"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
      </section>

      <aside className="space-y-6">
        <section className="rounded-lg border border-outline-variant bg-surface-white p-5 shadow-elevation-2">
          <div className="flex items-center gap-2">
            <Warehouse size={24} className="text-brand-navy" aria-hidden="true" />
            <h2 className="font-heading text-headline-md font-bold text-on-surface">Queue Overview</h2>
          </div>
          <div className="mt-5">
            <div className="rounded bg-brand-navy p-4 text-surface-white">
              <p className="font-label text-label font-bold uppercase tracking-wide text-[#AFC5FF]">Showing</p>
              <p className="mt-2 font-heading text-headline-lg font-bold">{rows.length}</p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

// ─── WRRs tab — all statuses, "New WRR" button gated by receiving.confirm ─────

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
    <div className="mt-6">
      <WrrFilterableTable rows={rows} canCreate={canCreate} />
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
      <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-2">
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
            secondaryLabel={() => "Vendor"}
            secondaryValue={(row) => row.vendorPartyName ?? row.vendorPartyId}
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
                    Vendor
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
                    {/* Vendor party name — resolved via join; fallback to ID if not found */}
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {row.vendorPartyName ?? row.vendorPartyId}
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
