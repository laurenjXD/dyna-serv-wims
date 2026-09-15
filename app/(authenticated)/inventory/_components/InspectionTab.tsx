"use client";

// Presentational Inspection tab body — the merged transfer + inspection
// work queue and Quality/Quarantine Control Center for the Master Inventory hub.
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md
//     Terminology Alignment §12 — "Inspection" replaces "Daily Inspection"
//       in UI labels.
//     R2.2 — Daily Inspection is initiated directly from the Stock View
//       (/inventory) dashboard.
//     R2.3 — the merged queue displays candidate transfer/inspection rows
//       with status; each row's type is distinguished by text (not color
//       alone).
//   lib/db/queries/transfers.ts `listInspectionAndTransferQueue`
//
// Surface: Office — desktop-first, responsive.

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  FlaskConical,
  Clock,
  ShieldAlert,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Trash2,
  PackageCheck,
  Building2,
  MapPin,
} from "lucide-react";
import type { InspectionAndTransferQueueRow } from "@/lib/db/queries/transfers";
import { TablePagination } from "@/components/ui/TablePagination";

const TYPE_BADGE: Record<
  InspectionAndTransferQueueRow["type"],
  { label: string; icon: typeof ArrowLeftRight; classes: string }
> = {
  transfer: {
    label: "Transfer",
    icon: ArrowLeftRight,
    classes: "bg-brand-navy/10 text-brand-navy border border-brand-navy/20",
  },
  inspection: {
    label: "Inspection",
    icon: FlaskConical,
    classes: "bg-amber-500/10 text-amber-800 border border-amber-500/20",
  },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeClasses: string; dotColor: string }
> = {
  open: {
    label: "OPEN",
    badgeClasses: "bg-amber-50 text-amber-800 border border-amber-200",
    dotColor: "bg-amber-500",
  },
  pending: {
    label: "PENDING",
    badgeClasses: "bg-amber-50 text-amber-800 border border-amber-200",
    dotColor: "bg-amber-500",
  },
  under_retest: {
    label: "UNDER RETEST",
    badgeClasses: "bg-blue-50 text-blue-800 border border-blue-200",
    dotColor: "bg-blue-500",
  },
  quarantine: {
    label: "STAGED FOR RTV",
    badgeClasses: "bg-rose-50 text-rose-800 border border-rose-200",
    dotColor: "bg-rose-500",
  },
  resolved: {
    label: "RESOLVED",
    badgeClasses: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    dotColor: "bg-emerald-500",
  },
  completed: {
    label: "COMPLETED",
    badgeClasses: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    dotColor: "bg-emerald-500",
  },
};

export function InspectionTab({ rows }: { rows: InspectionAndTransferQueueRow[] }) {
  const [selectedFilter, setSelectedFilter] = useState<
    "all" | "inbound" | "retest" | "quarantine" | "transfer"
  >("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [openRtvMenuId, setOpenRtvMenuId] = useState<string | null>(null);

  // Compute KPI metrics
  const pendingQaCount = rows.filter(
    (r) => r.type === "inspection" && (r.status === "open" || r.status === "pending"),
  ).length;

  const underRetestCount = rows.filter(
    (r) => r.type === "inspection" && r.status === "under_retest",
  ).length;

  const quarantineCount = rows.filter(
    (r) => r.type === "inspection" && (r.status === "quarantine" || r.status === "flagged"),
  ).length;

  const transferCount = rows.filter((r) => r.type === "transfer").length;

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (selectedFilter === "all") return rows;
    if (selectedFilter === "inbound") {
      return rows.filter(
        (r) => r.type === "inspection" && (r.status === "open" || r.status === "pending"),
      );
    }
    if (selectedFilter === "retest") {
      return rows.filter((r) => r.type === "inspection" && r.status === "under_retest");
    }
    if (selectedFilter === "quarantine") {
      return rows.filter(
        (r) => r.type === "inspection" && (r.status === "quarantine" || r.status === "flagged"),
      );
    }
    if (selectedFilter === "transfer") {
      return rows.filter((r) => r.type === "transfer");
    }
    return rows;
  }, [rows, selectedFilter]);

  const totalCount = filteredRows.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = useMemo(() => {
    return filteredRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [filteredRows, pageIndex, pageSize]);

  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-14 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-navy/5 text-brand-navy">
          <FlaskConical className="h-7 w-7" />
        </div>
        <h3 className="mt-4 font-heading text-title-md font-bold text-on-surface">
          No Open Transfer or Inspection Items
        </h3>
        <p className="mx-auto mt-1.5 max-w-md font-body text-body-sm text-text-grey">
          Items appear here automatically when a transfer is requested, an inbound lot is routed to an Inspection Bay, or stock is placed on QA Hold.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/60 to-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-label text-label-xs font-bold uppercase tracking-wider text-amber-800">
              Pending Inbound QA
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-800">
              <FlaskConical className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-headline-sm font-black text-on-surface">
              {pendingQaCount}
            </span>
            <span className="font-body text-body-xs text-text-grey">lots to verify</span>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50/60 to-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-label text-label-xs font-bold uppercase tracking-wider text-blue-800">
              Under QA Retest
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-800">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-headline-sm font-black text-on-surface">
              {underRetestCount}
            </span>
            <span className="font-body text-body-xs text-text-grey">secondary review</span>
          </div>
        </div>

        <div className="rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50/60 to-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-label text-label-xs font-bold uppercase tracking-wider text-rose-800">
              Quarantine / Staged RTV
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-800">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-headline-sm font-black text-on-surface">
              {quarantineCount}
            </span>
            <span className="font-body text-body-xs text-text-grey">awaiting RMA / scrap</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
              Active Movements
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-navy/10 text-brand-navy">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-headline-sm font-black text-on-surface">
              {transferCount}
            </span>
            <span className="font-body text-body-xs text-text-grey">transfers in flight</span>
          </div>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSelectedFilter("all");
              setPageIndex(0);
            }}
            className={`rounded-lg px-3 py-1.5 font-label text-label-xs font-bold transition-colors ${
              selectedFilter === "all"
                ? "bg-brand-navy text-white shadow-sm"
                : "text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
            }`}
          >
            All Tasks ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedFilter("inbound");
              setPageIndex(0);
            }}
            className={`rounded-lg px-3 py-1.5 font-label text-label-xs font-bold transition-colors ${
              selectedFilter === "inbound"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
            }`}
          >
            Inbound QA ({pendingQaCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedFilter("retest");
              setPageIndex(0);
            }}
            className={`rounded-lg px-3 py-1.5 font-label text-label-xs font-bold transition-colors ${
              selectedFilter === "retest"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
            }`}
          >
            Under Retest ({underRetestCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedFilter("quarantine");
              setPageIndex(0);
            }}
            className={`rounded-lg px-3 py-1.5 font-label text-label-xs font-bold transition-colors ${
              selectedFilter === "quarantine"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
            }`}
          >
            Quarantine / RTV ({quarantineCount})
          </button>
          {transferCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedFilter("transfer");
                setPageIndex(0);
              }}
              className={`rounded-lg px-3 py-1.5 font-label text-label-xs font-bold transition-colors ${
                selectedFilter === "transfer"
                  ? "bg-brand-navy text-white shadow-sm"
                  : "text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
              }`}
            >
              Transfers ({transferCount})
            </button>
          )}
        </div>
      </div>

      {/* Main Queue Table */}
      <div
        data-testid="inspection-transfer-queue"
        className="overflow-hidden rounded-xl border border-border bg-surface shadow-card"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-light-grey/60">
                <th className="px-4 py-3 text-left font-label text-label-xs uppercase tracking-[0.05em] text-text-grey">
                  Type
                </th>
                <th className="px-4 py-3 text-left font-label text-label-xs uppercase tracking-[0.05em] text-text-grey">
                  Item & Lot Details
                </th>
                <th className="px-4 py-3 text-left font-label text-label-xs uppercase tracking-[0.05em] text-text-grey">
                  Location / Partner
                </th>
                <th className="px-4 py-3 text-left font-label text-label-xs uppercase tracking-[0.05em] text-text-grey">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-label text-label-xs uppercase tracking-[0.05em] text-text-grey">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedRows.map((row) => {
                const badge = TYPE_BADGE[row.type];
                const Icon = badge.icon;
                const statusCfg = STATUS_CONFIG[row.status] ?? {
                  label: row.status.toUpperCase(),
                  badgeClasses: "bg-surface-light-grey text-text-grey border border-border",
                  dotColor: "bg-text-grey",
                };
                const titleAlreadySaysType = row.title.toLowerCase().includes(row.type);
                const isQuarantine = row.status === "quarantine" || row.status === "flagged";

                return (
                  <tr key={row.id} className="transition-colors hover:bg-surface-light-grey/40">
                    <td className="px-4 py-3.5 align-middle">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label text-label-xs font-bold uppercase ${badge.classes}`}
                        {...(titleAlreadySaysType ? { "aria-label": badge.label } : {})}
                      >
                        <Icon size={13} aria-hidden="true" />
                        {!titleAlreadySaysType && badge.label}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex flex-col">
                        <Link
                          href={row.href}
                          className="font-heading text-body-md font-bold text-brand-navy hover:text-brand-royal-blue hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        >
                          {row.title}
                        </Link>
                        {row.itemCode && (
                          <div className="mt-0.5 flex items-center gap-2 font-mono text-body-xs text-text-grey">
                            <span>Code: {row.itemCode}</span>
                            {row.lotNumber && (
                              <>
                                <span>•</span>
                                <span>Lot: {row.lotNumber}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex flex-col gap-0.5 font-body text-body-xs text-on-surface">
                        {row.locationLabel ? (
                          <div className="flex items-center gap-1.5 font-medium text-text-grey">
                            <MapPin size={12} className="text-brand-navy" />
                            <span>{row.locationLabel}</span>
                          </div>
                        ) : (
                          <span className="text-text-grey italic">Staging bay</span>
                        )}
                        {row.partyName && (
                          <div className="flex items-center gap-1.5 text-text-grey">
                            <Building2 size={12} />
                            <span>{row.partyName}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 align-middle">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-label text-label-xs font-bold uppercase ${statusCfg.badgeClasses}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotColor}`} />
                        {statusCfg.label}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right align-middle">
                      {row.type === "inspection" ? (
                        isQuarantine ? (
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenRtvMenuId(openRtvMenuId === row.id ? null : row.id)
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 font-label text-label-xs font-bold text-rose-800 hover:bg-rose-100"
                            >
                              <span>Resolve / RTV</span>
                              <ChevronRight size={12} className="rotate-90" />
                            </button>

                            {openRtvMenuId === row.id && (
                              <div className="absolute right-0 z-20 mt-1 w-56 origin-top-right rounded-xl border border-border bg-surface p-1.5 shadow-elevation-2">
                                <Link
                                  href={row.href}
                                  className="flex items-center gap-2 rounded-lg px-3 py-2 font-label text-label-xs font-medium text-on-surface hover:bg-surface-light-grey"
                                >
                                  <ExternalLink size={13} className="text-brand-navy" />
                                  <span>Review Inspection Case</span>
                                </Link>
                                <Link
                                  href={`/withdrawals/new?reason=rtv&lot=${row.lotNumber ?? ""}`}
                                  className="flex items-center gap-2 rounded-lg px-3 py-2 font-label text-label-xs font-medium text-amber-800 hover:bg-amber-50"
                                >
                                  <PackageCheck size={13} />
                                  <span>Create RTV Outbound</span>
                                </Link>
                                <Link
                                  href={`/transfers/new?fromLocation=${row.locationLabel ?? ""}&reason=qa_retest`}
                                  className="flex items-center gap-2 rounded-lg px-3 py-2 font-label text-label-xs font-medium text-blue-800 hover:bg-blue-50"
                                >
                                  <RotateCcw size={13} />
                                  <span>Transfer for Re-test</span>
                                </Link>
                              </div>
                            )}
                          </div>
                        ) : (
                          <Link
                            href={row.href}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-label text-label-xs font-bold text-brand-navy shadow-sm hover:bg-brand-navy hover:text-white transition-colors"
                          >
                            <span>Inspect Now</span>
                            <ChevronRight size={13} />
                          </Link>
                        )
                      ) : (
                        <Link
                          href={row.href}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-label text-label-xs font-bold text-brand-navy shadow-sm hover:bg-brand-navy hover:text-white transition-colors"
                        >
                          <span>Execute</span>
                          <ChevronRight size={13} />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <TablePagination
          pageIndex={pageIndex}
          pageSize={pageSize}
          totalCount={totalCount}
          pageCount={pageCount}
          canPreviousPage={pageIndex > 0}
          canNextPage={pageIndex < pageCount - 1}
          onPageChange={(newPageIndex) => setPageIndex(newPageIndex)}
          onPageSizeChange={(newPageSize) => {
            setPageSize(newPageSize);
            setPageIndex(0);
          }}
          pageSizeOptions={[5, 10, 20, 50]}
        />
      </div>
    </div>
  );
}
