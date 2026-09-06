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
import { WrrLedgerFilterableTable } from "./_components/WrrLedgerFilterableTable";

// ─── Constants ────────────────────────────────────────────────────────────────

const QUEUE_PAGE_SIZE = 20;

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
        <LedgerTab />
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
  const inProgressCount = rows.filter((r) => r.status === "receiving_in_progress").length;
  const stagedCount = rows.filter((r) => r.status === "staged_pending_arrival").length;

  return (
    <div className="mt-6 space-y-6">
      {/* Top Telemetry Summary Pills */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-bold uppercase tracking-wider text-text-grey">
              Active Inbound Shipments
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-brand-navy">
              <Truck size={16} />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-brand-navy">{total}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-bold uppercase tracking-wider text-text-grey">
              Intake In Progress
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Warehouse size={16} />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-amber-700">{inProgressCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-bold uppercase tracking-wider text-text-grey">
              Staged Pending Arrival
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ClipboardList size={16} />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-700">{stagedCount}</p>
        </div>
      </div>

      <section className="min-w-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-heading text-title-md font-bold text-on-surface">
              Active Warehouse Receipt Requests
            </h2>
            <p className="text-xs font-body text-text-grey">
              Operational intake work queue for scanning, pallet verification, and physical receiving.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 border border-blue-200/80 px-3 py-1 font-mono text-xs font-bold text-brand-navy">
            {total} active
          </span>
        </div>

        {/* WRR cards — consistent modern card list */}
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-surface-white px-6 py-12 text-center shadow-xs">
              <ClipboardList className="mx-auto text-slate-400" size={32} aria-hidden="true" />
              <p className="mt-3 font-heading text-sm font-bold text-text-primary">
                No WRRs currently in progress
              </p>
              <p className="mt-1 font-body text-xs text-text-grey">
                New WRRs staged for your shift will appear here automatically.
              </p>
            </div>
          ) : (
            rows.map((row: WrrDocumentRow) => (
              <article
                key={row.id}
                className="rounded-2xl border border-slate-200/80 bg-surface-white p-4 shadow-xs transition-all duration-150 hover:border-slate-300 hover:shadow-sm"
              >
                <div className="grid items-center gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand-navy border border-blue-200/60">
                    <Truck size={20} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-bold text-brand-navy">{row.wrrNumber}</p>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                          row.status === "confirmed"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : row.status === "receiving_in_progress"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-body text-xs font-semibold text-text-primary">
                      {row.vendorPartyName ?? row.vendorPartyId} · <span className="font-mono font-normal text-text-secondary">{FLOW_LABELS[row.flowType] ?? row.flowType}</span>
                    </p>
                  </div>
                  <div className="md:text-right">
                    <p className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">Created</p>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-text-primary">
                      {row.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <Link
                    href={`/receiving/${row.id}/receive`}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-navy px-4 font-label text-xs font-bold text-white shadow-2xs hover:bg-brand-navy/90 active:scale-98 transition-all"
                  >
                    Begin Receiving →
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between font-body text-xs text-text-grey">
            <span>
              Page {currentPage} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-2">
              {currentPage > 1 && (
                <Link
                  href={`/receiving?page=${currentPage - 1}`}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-surface-white px-3 font-label text-xs font-semibold text-on-surface hover:bg-slate-50 transition-colors"
                >
                  Previous
                </Link>
              )}
              {currentPage < totalPages && (
                <Link
                  href={`/receiving?page=${currentPage + 1}`}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-surface-white px-3 font-label text-xs font-semibold text-on-surface hover:bg-slate-50 transition-colors"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
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

async function LedgerTab() {
  // Always confirmed — ledger shows only committed receipts.
  // Powered by TanStack DataTable with client-side sorting, pagination, search, and Google Sheets filters.
  const { rows } = await listWrrDocuments(db, {
    limit: 500,
    offset: 0,
    status: "confirmed",
  });

  return (
    <div className="mt-6">
      <WrrLedgerFilterableTable rows={rows} />
    </div>
  );
}
