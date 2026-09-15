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
  PackageCheck,
  Building2,
  MapPin,
  CheckCheck,
  X,
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
  failed: {
    label: "FAILED",
    badgeClasses: "bg-rose-50 text-rose-800 border border-rose-200",
    dotColor: "bg-rose-500",
  },
  passed: {
    label: "PASSED",
    badgeClasses: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    dotColor: "bg-emerald-500",
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
    "all" | "inbound" | "failed" | "passed" | "transfer"
  >("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [activeModalRow, setActiveModalRow] = useState<InspectionAndTransferQueueRow | null>(null);

  // Compute KPI metrics
  const pendingQaCount = rows.filter(
    (r) => r.type === "inspection" && (r.status === "open" || r.status === "pending"),
  ).length;

  const failedCount = rows.filter(
    (r) =>
      r.type === "inspection" &&
      (r.status === "failed" ||
        r.status === "quarantine" ||
        r.status === "flagged" ||
        r.status === "under_retest"),
  ).length;

  const passedCount = rows.filter(
    (r) =>
      r.type === "inspection" &&
      (r.status === "passed" || r.status === "resolved" || r.status === "completed"),
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
    if (selectedFilter === "failed") {
      return rows.filter(
        (r) =>
          r.type === "inspection" &&
          (r.status === "failed" ||
            r.status === "quarantine" ||
            r.status === "flagged" ||
            r.status === "under_retest"),
      );
    }
    if (selectedFilter === "passed") {
      return rows.filter(
        (r) =>
          r.type === "inspection" &&
          (r.status === "passed" || r.status === "resolved" || r.status === "completed"),
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
            <span className="font-body text-body-xs text-text-grey">lots awaiting test</span>
          </div>
        </div>

        <div className="rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50/60 to-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-label text-label-xs font-bold uppercase tracking-wider text-rose-800">
              Failed / Quarantine / RTV
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-800">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-headline-sm font-black text-on-surface">
              {failedCount}
            </span>
            <span className="font-body text-body-xs text-text-grey">held / awaiting RMA</span>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 to-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-label text-label-xs font-bold uppercase tracking-wider text-emerald-800">
              Passed / Released
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-800">
              <CheckCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-headline-sm font-black text-on-surface">
              {passedCount}
            </span>
            <span className="font-body text-body-xs text-text-grey">verified sound</span>
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
            Pending QA ({pendingQaCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedFilter("failed");
              setPageIndex(0);
            }}
            className={`rounded-lg px-3 py-1.5 font-label text-label-xs font-bold transition-colors ${
              selectedFilter === "failed"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
            }`}
          >
            Failed / Quarantine ({failedCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedFilter("passed");
              setPageIndex(0);
            }}
            className={`rounded-lg px-3 py-1.5 font-label text-label-xs font-bold transition-colors ${
              selectedFilter === "passed"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
            }`}
          >
            Passed ({passedCount})
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
                const isFailed =
                  row.status === "failed" ||
                  row.status === "quarantine" ||
                  row.status === "flagged";
                const isOpen = row.status === "open" || row.status === "pending";

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
                        isFailed ? (
                          <button
                            type="button"
                            onClick={() => setActiveModalRow(row)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 font-label text-label-xs font-bold text-rose-800 hover:bg-rose-100 active:scale-95 shadow-sm transition-all"
                          >
                            <ShieldAlert size={13} className="text-rose-600" />
                            <span>Resolve / RTV</span>
                            <ChevronRight size={13} />
                          </button>
                        ) : isOpen ? (
                          <Link
                            href={row.href}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 font-label text-label-xs font-bold text-brand-navy shadow-sm hover:bg-brand-navy hover:text-white transition-colors"
                          >
                            <span>Inspect Now</span>
                            <ChevronRight size={13} />
                          </Link>
                        ) : (
                          <Link
                            href={row.href}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 font-label text-label-xs font-bold text-text-grey shadow-sm hover:bg-surface-light-grey transition-colors"
                          >
                            <span>View Audit</span>
                            <ChevronRight size={13} />
                          </Link>
                        )
                      ) : (
                        <Link
                          href={row.href}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 font-label text-label-xs font-bold text-brand-navy shadow-sm hover:bg-brand-navy hover:text-white transition-colors"
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

      {/* ── Quarantine / RTV Resolution Action Modal ── */}
      {activeModalRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setActiveModalRow(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-elevation-3 space-y-5 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-heading text-title-md font-bold text-on-surface">
                    Quarantine &amp; RTV Resolution
                  </h3>
                  <p className="mt-0.5 font-body text-body-xs text-text-grey">
                    Choose the next operational step for this rejected / non-conforming lot
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveModalRow(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-grey hover:bg-surface-light-grey hover:text-on-surface transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Lot Context Info */}
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-light-grey/60 p-3.5 font-body text-body-xs">
              <div>
                <span className="text-text-grey block font-label text-[11px] uppercase">Item</span>
                <strong className="text-on-surface truncate block">{activeModalRow.itemName || activeModalRow.title}</strong>
              </div>
              <div>
                <span className="text-text-grey block font-label text-[11px] uppercase">Lot Number</span>
                <strong className="font-mono text-on-surface block">{activeModalRow.lotNumber || "—"}</strong>
              </div>
              <div>
                <span className="text-text-grey block font-label text-[11px] uppercase">Current Location</span>
                <span className="text-on-surface">{activeModalRow.locationLabel || "Staging Bay"}</span>
              </div>
              <div>
                <span className="text-text-grey block font-label text-[11px] uppercase">Partner Organization</span>
                <span className="text-on-surface">{activeModalRow.partyName || "—"}</span>
              </div>
            </div>

            {/* 3 Clear Action Cards */}
            <div className="space-y-3">
              {/* Option 1: Review Case */}
              <Link
                href={activeModalRow.href}
                className="group flex items-start gap-3.5 rounded-xl border border-border bg-surface p-3.5 hover:border-brand-navy hover:bg-brand-navy/[0.02] transition-all"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-navy/10 text-brand-navy mt-0.5">
                  <ExternalLink size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-heading text-body-md font-bold text-on-surface group-hover:text-brand-navy">
                      1. Review Inspection Audit &amp; Defect Notes
                    </h4>
                    <ChevronRight size={16} className="text-text-grey group-hover:text-brand-navy group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="mt-0.5 font-body text-body-xs text-text-grey">
                    View test breakdown, inspector notes, and photographic evidence recorded on the floor.
                  </p>
                </div>
              </Link>

              {/* Option 2: Internal Quarantine Rack Transfer */}
              <Link
                href={`/transfers/new?lotId=${encodeURIComponent(activeModalRow.lotId || "")}&itemId=${encodeURIComponent(activeModalRow.itemId || "")}&flowType=${encodeURIComponent(activeModalRow.flowType || "vmi")}&reason=${encodeURIComponent(`Quarantine relocation for Lot ${activeModalRow.lotNumber || ""}`)}`}
                className="group flex items-start gap-3.5 rounded-xl border border-border bg-surface p-3.5 hover:border-blue-600 hover:bg-blue-50/30 transition-all"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 mt-0.5">
                  <RotateCcw size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-heading text-body-md font-bold text-on-surface group-hover:text-blue-700">
                      2. Relocate to Quarantine / QA Hold Bay
                    </h4>
                    <ChevronRight size={16} className="text-text-grey group-hover:text-blue-700 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="mt-0.5 font-body text-body-xs text-text-grey">
                    Move rejected boxes out of active floor traffic into a designated secure quarantine bin.
                  </p>
                </div>
              </Link>

              {/* Option 3: Outbound Return to Vendor (RTV) */}
              <Link
                href={`/inventory?tab=pick-lists&reason=rtv&lotNumber=${encodeURIComponent(activeModalRow.lotNumber || "")}`}
                className="group flex items-start gap-3.5 rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 hover:border-rose-400 hover:bg-rose-50 transition-all"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-800 mt-0.5">
                  <PackageCheck size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-heading text-body-md font-bold text-rose-950 group-hover:text-rose-900">
                      3. Initiate Outbound Return-to-Vendor (RTV)
                    </h4>
                    <ChevronRight size={16} className="text-rose-600 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="mt-0.5 font-body text-body-xs text-rose-800/80">
                    Generate an Outbound Withdrawal order to ship rejected goods back once supplier RMA is authorized.
                  </p>
                </div>
              </Link>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setActiveModalRow(null)}
                className="rounded-xl border border-border bg-surface px-5 py-2 font-label text-label-xs font-bold text-text-grey hover:bg-surface-light-grey hover:text-on-surface transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
