"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Boxes,
  CheckCircle2,
  FileText,
  ArrowRight,
  Search,
  Building2,
  Clock,
  Sparkles,
  Layers,
  Check,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import type { PickListRow } from "@/lib/db/queries/withdrawals";

const FLOW_LABELS: Record<string, { label: string; style: string }> = {
  vmi: {
    label: "VMI",
    style: "bg-purple-100 text-purple-900 border-purple-200",
  },
  trading: {
    label: "Trading",
    style: "bg-blue-100 text-blue-900 border-blue-200",
  },
  supplies: {
    label: "Supplies",
    style: "bg-slate-100 text-slate-900 border-slate-200",
  },
};

interface ToPickQueueProps {
  rows: PickListRow[];
  isDeleted?: boolean;
}

export function ToPickQueue({ rows, isDeleted = false }: ToPickQueueProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((row) => {
      const plMatch = (row.pickListNumber ?? "").toLowerCase().includes(q);
      const partyMatch = (row.customerPartyName ?? "").toLowerCase().includes(q) ||
        (row.customerPartyId ?? "").toLowerCase().includes(q);
      const flowMatch = (row.flowType ?? "").toLowerCase().includes(q);
      return plMatch || partyMatch || flowMatch;
    });
  }, [rows, searchQuery]);

  function handleScrollToDraft() {
    const el = document.getElementById("draft-generator") || document.querySelector("form");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  if (isDeleted) {
    return (
      <section
        aria-labelledby="deleted-pick-lists-heading"
        className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-white shadow-elevation-2"
      >
        <div className="border-b border-outline-variant/30 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="deleted-pick-lists-heading" className="font-heading text-title-lg font-bold text-on-surface">
                Deleted Pick Lists
              </h2>
              <p className="mt-1 font-body text-body-sm text-text-grey">
                Soft-deleted pick lists remain available for audit and compliance records.
              </p>
            </div>
            <span className="rounded-full bg-surface-light-grey px-3 py-1 font-label text-label-xs font-bold text-text-grey">
              {rows.length} archived
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">No deleted pick lists found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey/60">
                  <th className="px-5 py-3 text-left font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                    Pick List #
                  </th>
                  <th className="px-5 py-3 text-left font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                    Inventory Model
                  </th>
                  <th className="px-5 py-3 text-left font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                    Customer Organization
                  </th>
                  <th className="px-5 py-3 text-left font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                    Deleted At
                  </th>
                  <th className="px-5 py-3 text-right font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row: PickListRow) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/40 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-mono-md font-bold text-on-surface">
                      {row.pickListNumber}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-surface-light-grey px-2.5 py-0.5 font-label text-label-xs font-bold text-text-grey uppercase">
                        {row.flowType}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-body text-body-md font-semibold text-on-surface">
                      {row.customerPartyName || row.customerPartyId}
                    </td>
                    <td className="px-5 py-3.5 font-body text-body-sm text-text-grey">
                      {row.deletedAt ? new Date(row.deletedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/pick-lists/${row.id}/print`}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/60 bg-surface-white px-3 font-label text-label-xs font-bold text-on-surface hover:bg-surface-light-grey"
                      >
                        <FileText size={14} />
                        View PDF
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="to-pick-heading"
      className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-white shadow-elevation-2"
    >
      {/* Header Bar */}
      <div className="border-b border-outline-variant/30 bg-gradient-to-r from-surface-white via-surface-white to-[#F6F9FF] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
              <Boxes size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 id="to-pick-heading" className="font-heading text-headline-sm font-bold text-on-surface">
                  To Pick Queue
                </h2>
                {rows.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-50 px-3 py-0.5 font-label text-label-xs font-bold uppercase tracking-wider text-amber-900 shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    {rows.length} {rows.length === 1 ? "List" : "Lists"} Waiting
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-status-available/20 bg-status-available/10 px-3 py-0.5 font-label text-label-xs font-bold uppercase tracking-wider text-emerald-800">
                    <CheckCircle2 size={12} />
                    0 Pending
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-body text-body-sm text-text-grey">
                Physical picking queue for allocated stock — review PDF, pull cartons from storage racks, and proceed to dispatch.
              </p>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="w-full sm:w-auto min-w-[220px]">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-grey/60" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter pick lists..."
                  className="h-10 w-full rounded-xl border border-outline-variant/60 bg-surface-white pl-9 pr-3 font-body text-body-sm text-on-surface placeholder:text-text-grey/60 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      {rows.length === 0 ? (
        /* Empty State */
        <div className="px-6 py-12 sm:py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EEF3FF] text-brand-navy">
            <Boxes size={32} className="stroke-[1.8]" />
          </div>
          <h3 className="mt-4 font-heading text-title-md font-bold text-on-surface">
            No pick lists waiting for physical picking
          </h3>
          <p className="mx-auto mt-2 max-w-lg font-body text-body-sm text-text-grey">
            Allocated pick lists will appear here ready for warehouse staff to pull boxes from storage locations.
          </p>

          {/* 3-Step Workflow Guide */}
          <div className="mx-auto mt-8 grid max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
            <div className="rounded-xl border border-outline-variant/40 bg-surface-light-grey/40 p-3.5 transition-all hover:bg-surface-light-grey/70">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy font-mono text-[11px] font-bold text-surface-white">
                1
              </span>
              <h4 className="mt-2 font-label text-label-sm font-bold text-on-surface">
                Allocate Stock
              </h4>
              <p className="mt-1 font-body text-body-xs text-text-grey">
                Select items in the Multi-Item Draft builder above or import a DRA/WRF.
              </p>
            </div>

            <div className="rounded-xl border border-outline-variant/40 bg-surface-light-grey/40 p-3.5 transition-all hover:bg-surface-light-grey/70">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy font-mono text-[11px] font-bold text-surface-white">
                2
              </span>
              <h4 className="mt-2 font-label text-label-sm font-bold text-on-surface">
                Physical Pick
              </h4>
              <p className="mt-1 font-body text-body-xs text-text-grey">
                Pull cartons from warehouse racks using the generated Pick List PDF.
              </p>
            </div>

            <div className="rounded-xl border border-outline-variant/40 bg-surface-light-grey/40 p-3.5 transition-all hover:bg-surface-light-grey/70">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy font-mono text-[11px] font-bold text-surface-white">
                3
              </span>
              <h4 className="mt-2 font-label text-label-sm font-bold text-on-surface">
                Dispatch Scan
              </h4>
              <p className="mt-1 font-body text-body-xs text-text-grey">
                Mark as picked and scan cartons in Dispatch to issue the delivery receipt.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleScrollToDraft}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-label text-label font-bold text-surface-white shadow-sm hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy transition-all active:scale-[0.98]"
            >
              <Sparkles size={16} />
              <span>Create Pick List Draft</span>
            </button>
            <Link
              href="/outgoing"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-outline-variant/60 bg-surface-white px-5 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy transition-all"
            >
              <span>Go to Outgoing</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="font-body text-body-md text-text-grey">
            No pick lists match your filter &ldquo;{searchQuery}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="mt-3 font-label text-label-xs font-bold text-brand-navy underline"
          >
            Clear filter
          </button>
        </div>
      ) : (
        /* Data Table / Cards */
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey/60">
                  <th className="px-5 py-3.5 text-left font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                    Pick List #
                  </th>
                  <th className="px-5 py-3.5 text-left font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                    Inventory Model
                  </th>
                  <th className="px-5 py-3.5 text-left font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                    Customer Organization
                  </th>
                  <th className="px-5 py-3.5 text-left font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                    Allocated At
                  </th>
                  <th className="px-5 py-3.5 text-left font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                    Status
                  </th>
                  <th className="px-5 py-3.5 text-right font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filteredRows.map((row: PickListRow) => {
                  const flowConfig = FLOW_LABELS[row.flowType] ?? {
                    label: row.flowType.toUpperCase(),
                    style: "bg-surface-light-grey text-text-grey border-outline-variant/40",
                  };

                  return (
                    <tr
                      key={row.id}
                      className="group hover:bg-[#F8FAFF] transition-colors"
                    >
                      {/* Pick List Number */}
                      <td className="px-5 py-4">
                        <Link
                          href={`/pick-lists/${row.id}/dispatch`}
                          className="font-mono text-mono-md font-bold text-brand-navy group-hover:text-primary transition-colors inline-flex items-center gap-1.5"
                        >
                          <span>{row.pickListNumber}</span>
                          <ExternalLink size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      </td>

                      {/* Flow Type / Inventory Model */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-label text-label-xs font-bold uppercase tracking-wider ${flowConfig.style}`}
                        >
                          {flowConfig.label}
                        </span>
                      </td>

                      {/* Customer Organization */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 size={15} className="text-text-grey shrink-0" />
                          <span className="font-body text-body-md font-semibold text-on-surface">
                            {row.customerPartyName || row.customerPartyId}
                          </span>
                        </div>
                      </td>

                      {/* Created Date & Time */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 font-body text-body-sm text-text-grey">
                          <Clock size={13} className="shrink-0 text-text-grey/70" />
                          <span>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-50 px-2.5 py-0.5 font-label text-label-xs font-bold uppercase text-amber-900">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Ready to Pick
                        </span>
                      </td>

                      {/* Action Buttons */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/pick-lists/${row.id}/print`}
                            title="View / Print Pick List PDF"
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-outline-variant/60 bg-surface-white px-3 font-label text-label-xs font-bold text-on-surface shadow-sm hover:bg-surface-light-grey hover:border-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy transition-all"
                          >
                            <FileText size={14} />
                            <span>PDF</span>
                          </Link>

                          <Link
                            href={`/pick-lists/${row.id}/dispatch`}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-navy px-3.5 font-label text-label-xs font-bold text-surface-white shadow-sm hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy transition-all active:scale-[0.98]"
                          >
                            <span>Pick &amp; Dispatch</span>
                            <ArrowRight size={13} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer Guidance */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/30 bg-surface-light-grey/30 px-5 py-3.5 sm:px-6">
            <p className="font-body text-body-xs text-text-grey">
              These allocated lists are reserved and waiting for physical warehouse picking. After picking, proceed to{" "}
              <Link href="/outgoing" className="font-label font-bold text-brand-navy hover:underline">
                Dispatch Queue
              </Link>{" "}
              to scan cartons and finalize the delivery receipt.
            </p>
            <span className="font-mono text-mono-xs font-semibold text-text-grey">
              Showing {filteredRows.length} of {rows.length} lists
            </span>
          </div>
        </>
      )}
    </section>
  );
}
