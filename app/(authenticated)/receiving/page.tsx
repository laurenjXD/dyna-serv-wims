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

// Status badges
const STATUS_LABELS: Record<string, string> = {
  staged_pending_arrival: "STAGED",
  receiving_in_progress: "IN PROGRESS",
  confirmed: "CONFIRMED",
  cancelled: "CANCELLED",
};

const STATUS_CLASSES: Record<string, string> = {
  staged_pending_arrival: "bg-secondary-container text-on-secondary-container",
  receiving_in_progress: "bg-tertiary-container text-on-tertiary-container",
  confirmed: "bg-primary-container text-on-primary-container",
  cancelled: "bg-error-container text-on-error-container",
};

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All Statuses" },
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

// ─── Shared Components ───────────────────────────────────────────────────────

function SidePanel() {
  return (
    <div className="space-y-lg hidden lg:block">
      {/* Today's Inbound Widget */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md space-y-md">
        <h3 className="font-heading text-title-md text-on-surface">Today&apos;s Inbound</h3>
        <div className="flex justify-between items-end">
          <div>
            <p className="font-body text-body-sm text-on-surface-variant">Expected vs Received</p>
            <p className="font-heading text-display-sm text-on-surface">12 / 8</p>
          </div>
          <div className="text-right">
            <p className="font-body text-body-sm text-on-surface-variant">Pending WRRs</p>
            <p className="font-heading text-headline-md text-primary">4</p>
          </div>
        </div>
        {/* Progress Bar */}
        <div className="w-full bg-surface-container-high rounded-full h-2 mt-2">
          <div className="bg-primary h-2 rounded-full" style={{ width: "66%" }}></div>
        </div>
      </div>

      {/* Quick Scan Widget */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md space-y-sm text-center">
        <div className="w-12 h-12 bg-primary-container text-on-primary-container rounded-full flex items-center justify-center mx-auto mb-2">
          <span className="material-symbols-outlined text-[24px]">barcode_scanner</span>
        </div>
        <h3 className="font-heading text-title-md text-on-surface">Quick Scan</h3>
        <p className="font-body text-body-sm text-on-surface-variant">Scan a WRR barcode to jump directly to receiving.</p>
        <button className="mt-sm w-full bg-primary text-on-primary hover:bg-primary/90 h-10 rounded-full font-label text-label-md transition-colors">
          Open Scanner
        </button>
      </div>
    </div>
  );
}

function ActionDropdown({ wrrId }: { wrrId: string }) {
  // Using a details/summary element for a pure CSS dropdown
  return (
    <details className="relative group/dropdown">
      <summary className="list-none cursor-pointer p-2 rounded-full hover:bg-surface-container-high transition-colors focus:outline-none focus:ring-2 focus:ring-primary inline-flex items-center justify-center">
        <span className="material-symbols-outlined text-on-surface-variant text-[20px]">more_vert</span>
      </summary>
      <div className="absolute right-0 top-full mt-1 w-40 bg-surface-container-lowest border border-outline-variant rounded-md shadow-md z-10 hidden group-open/dropdown:block">
        <div className="py-1">
          <Link href={`/receiving/${wrrId}`} className="block px-4 py-2 font-body text-body-md text-on-surface hover:bg-surface-container-high">
            View Details
          </Link>
          <Link href={`/receiving/${wrrId}/print`} className="block px-4 py-2 font-body text-body-md text-on-surface hover:bg-surface-container-high">
            Print Document
          </Link>
          <Link href={`/receiving/${wrrId}/receive`} className="block px-4 py-2 font-body text-body-md text-primary hover:bg-primary-container/50">
            Start Receiving
          </Link>
        </div>
      </div>
    </details>
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
      <div className="mx-auto max-w-7xl px-4 py-12 text-center">
        <p className="font-body text-body-md text-on-surface-variant">
          You do not have permission to view the receiving queue.
        </p>
      </div>
    );
  }

  const canCreate = (await requirePermission(resolver, "receiving.create")).kind === "authorized";

  return (
    <div className="max-w-7xl mx-auto space-y-lg animate-in fade-in duration-300">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-md">
        <div>
          <h1 className="font-heading text-display-sm text-on-surface tracking-tight">Receiving Hub</h1>
          <p className="font-body text-body-lg text-on-surface-variant mt-1">
            Manage incoming shipments, WRRs, and inbound ledger.
          </p>
        </div>
        {canCreate && activeTab === "wrrs" && (
          <Link
            href="/receiving/new"
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 font-label text-label-lg text-on-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined mr-2 text-[20px]">add</span>
            New WRR
          </Link>
        )}
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-md">
          {/* Tabs */}
          <div className="border-b border-outline-variant flex gap-md overflow-x-auto hide-scrollbar">
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
                  className={`pb-sm font-label text-label-md px-1 whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isActive
                      ? "border-b-2 border-primary text-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="pt-sm">
            {activeTab === "receive" ? (
              <ReceiveTab statusFilter={statusFilter} pageParam={pageParam} />
            ) : activeTab === "wrrs" ? (
              <WrrsTab statusFilter={statusFilter} pageParam={pageParam} />
            ) : (
              <LedgerTab pageParam={pageParam} />
            )}
          </div>
        </div>

        {/* Right Side Panel */}
        <div className="lg:col-span-1">
          <SidePanel />
        </div>
      </div>
    </div>
  );
}

// ─── Receive tab ─────────────────────────────────────────────────────────────

async function ReceiveTab({
  statusFilter,
  pageParam,
}: {
  statusFilter?: string;
  pageParam?: string;
}) {
  const currentPage = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (currentPage - 1) * QUEUE_PAGE_SIZE;
  const status = statusFilter && statusFilter !== "" ? statusFilter : undefined;

  const { rows, total } = await listWrrDocuments(db, { limit: QUEUE_PAGE_SIZE, offset, status });
  const totalPages = Math.ceil(total / QUEUE_PAGE_SIZE);

  return (
    <div className="space-y-md">
      {/* Filter */}
      <form method="GET" className="flex flex-wrap items-center gap-sm">
        <input type="hidden" name="tab" value="receive" />
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="h-10 rounded-full border border-outline-variant bg-surface px-4 font-body text-body-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 rounded-full border border-outline-variant bg-surface px-4 font-label text-label-md text-on-surface hover:bg-surface-container-low transition-colors"
        >
          Filter
        </button>
      </form>

      {/* Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low/50">
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">WRR #</th>
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">Supplier</th>
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">Flow</th>
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">Status</th>
                <th className="px-md py-sm text-right font-label text-label-sm text-on-surface-variant font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-md py-xl text-center text-on-surface-variant font-body text-body-md">
                    No records found.
                  </td>
                </tr>
              ) : (
                rows.map((row: WrrDocumentRow) => (
                  <tr key={row.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-md py-3 font-mono text-body-md text-on-surface">{row.wrrNumber}</td>
                    <td className="px-md py-3 font-body text-body-md text-on-surface">{row.vendorPartyId}</td>
                    <td className="px-md py-3 font-body text-body-md text-on-surface-variant">{FLOW_LABELS[row.flowType] ?? row.flowType}</td>
                    <td className="px-md py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label-sm ${STATUS_CLASSES[row.status] || "bg-surface-variant text-on-surface-variant"}`}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="px-md py-3 text-right">
                      <ActionDropdown wrrId={row.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="font-body text-body-sm text-on-surface-variant">Page {currentPage} of {totalPages}</span>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/receiving?${new URLSearchParams({ ...(status ? { status } : {}), page: String(currentPage - 1) })}`}
                className="h-8 px-3 inline-flex items-center justify-center rounded-full border border-outline-variant font-label text-label-sm text-on-surface hover:bg-surface-container-low transition-colors"
              >
                Prev
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/receiving?${new URLSearchParams({ ...(status ? { status } : {}), page: String(currentPage + 1) })}`}
                className="h-8 px-3 inline-flex items-center justify-center rounded-full border border-outline-variant font-label text-label-sm text-on-surface hover:bg-surface-container-low transition-colors"
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

// ─── WRRs tab ────────────────────────────────────────────────────────────────

async function WrrsTab({
  statusFilter,
  pageParam,
}: {
  statusFilter?: string;
  pageParam?: string;
}) {
  const currentPage = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (currentPage - 1) * QUEUE_PAGE_SIZE;
  const status = statusFilter && statusFilter !== "" ? statusFilter : undefined;

  const { rows, total } = await listWrrDocuments(db, { limit: QUEUE_PAGE_SIZE, offset, status });
  const totalPages = Math.ceil(total / QUEUE_PAGE_SIZE);

  return (
    <div className="space-y-md">
      {/* Filter */}
      <form method="GET" className="flex flex-wrap items-center gap-sm">
        <input type="hidden" name="tab" value="wrrs" />
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="h-10 rounded-full border border-outline-variant bg-surface px-4 font-body text-body-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 rounded-full border border-outline-variant bg-surface px-4 font-label text-label-md text-on-surface hover:bg-surface-container-low transition-colors"
        >
          Filter
        </button>
      </form>

      {/* Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low/50">
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">WRR #</th>
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">Supplier</th>
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">Flow</th>
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">Status</th>
                <th className="px-md py-sm text-right font-label text-label-sm text-on-surface-variant font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-md py-xl text-center text-on-surface-variant font-body text-body-md">
                    No records found.
                  </td>
                </tr>
              ) : (
                rows.map((row: WrrDocumentRow) => (
                  <tr key={row.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-md py-3 font-mono text-body-md text-on-surface">{row.wrrNumber}</td>
                    <td className="px-md py-3 font-body text-body-md text-on-surface">{row.vendorPartyId}</td>
                    <td className="px-md py-3 font-body text-body-md text-on-surface-variant">{FLOW_LABELS[row.flowType] ?? row.flowType}</td>
                    <td className="px-md py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label-sm ${STATUS_CLASSES[row.status] || "bg-surface-variant text-on-surface-variant"}`}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="px-md py-3 text-right">
                      <ActionDropdown wrrId={row.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="font-body text-body-sm text-on-surface-variant">Page {currentPage} of {totalPages}</span>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/receiving?tab=wrrs&${new URLSearchParams({ ...(status ? { status } : {}), page: String(currentPage - 1) })}`}
                className="h-8 px-3 inline-flex items-center justify-center rounded-full border border-outline-variant font-label text-label-sm text-on-surface hover:bg-surface-container-low transition-colors"
              >
                Prev
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/receiving?tab=wrrs&${new URLSearchParams({ ...(status ? { status } : {}), page: String(currentPage + 1) })}`}
                className="h-8 px-3 inline-flex items-center justify-center rounded-full border border-outline-variant font-label text-label-sm text-on-surface hover:bg-surface-container-low transition-colors"
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

async function LedgerTab({ pageParam }: { pageParam?: string }) {
  const currentPage = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (currentPage - 1) * LEDGER_PAGE_SIZE;

  const { rows, total } = await listWrrDocuments(db, { limit: LEDGER_PAGE_SIZE, offset, status: "confirmed" });
  const totalPages = Math.ceil(total / LEDGER_PAGE_SIZE);

  return (
    <div className="space-y-md">
      <p className="font-body text-body-sm text-on-surface-variant">
        Read-only view of confirmed warehouse receipts. Corrections create new transactions; history is immutable.
      </p>

      {/* Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low/50">
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">WRR #</th>
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">Flow Type</th>
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">Vendor Party</th>
                <th className="px-md py-sm font-label text-label-sm text-on-surface-variant font-medium">Confirmed At</th>
                <th className="px-md py-sm text-right font-label text-label-sm text-on-surface-variant font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-md py-xl text-center text-on-surface-variant font-body text-body-md">
                    No confirmed receipts yet.
                  </td>
                </tr>
              ) : (
                rows.map((row: WrrDocumentRow) => (
                  <tr key={row.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-md py-3 font-mono text-body-md text-on-surface">{row.wrrNumber}</td>
                    <td className="px-md py-3 font-body text-body-md text-on-surface-variant">{FLOW_LABELS[row.flowType] ?? row.flowType}</td>
                    <td className="px-md py-3 font-mono text-body-md text-on-surface">{row.vendorPartyId}</td>
                    <td className="px-md py-3 font-body text-body-md text-on-surface-variant">{row.createdAt.toLocaleString()}</td>
                    <td className="px-md py-3 text-right">
                      <ActionDropdown wrrId={row.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="font-body text-body-sm text-on-surface-variant">Page {currentPage} of {totalPages}</span>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/receiving?tab=ledger&page=${currentPage - 1}`}
                className="h-8 px-3 inline-flex items-center justify-center rounded-full border border-outline-variant font-label text-label-sm text-on-surface hover:bg-surface-container-low transition-colors"
              >
                Prev
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/receiving?tab=ledger&page=${currentPage + 1}`}
                className="h-8 px-3 inline-flex items-center justify-center rounded-full border border-outline-variant font-label text-label-sm text-on-surface hover:bg-surface-container-low transition-colors"
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

