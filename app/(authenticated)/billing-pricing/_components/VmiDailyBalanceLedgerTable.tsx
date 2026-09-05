"use client";

import React, { useState, useMemo } from "react";
import {
  Calculator,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import type { VmiDailyBalanceRow, VmiCbmLedgerRow } from "@/lib/billing/queries/vmi-ledger";
import { PeriodCloseModal } from "../vmi/periods/_components/PeriodCloseModal";
import { TablePagination } from "@/components/ui/TablePagination";

type Option = { id: string; name: string; code: string };

interface Props {
  summary: VmiCbmLedgerRow | null;
  dailyRows: VmiDailyBalanceRow[];
  parties?: Option[];
  selectedPartyId?: string;
  selectedMonth?: number;
  selectedYear?: number;
}

type SortField =
  | "ledgerDate"
  | "beginningCbm"
  | "inFgCbm"
  | "inRawCbm"
  | "outFgCbm"
  | "outRawCbm"
  | "endingCbm"
  | "appliedStorageRateUsd"
  | "storageAmountUsd";

type SortDirection = "asc" | "desc";

export function VmiDailyBalanceLedgerTable({
  summary,
  dailyRows,
  parties = [],
  selectedPartyId = "",
  selectedMonth = new Date().getMonth(),
  selectedYear = new Date().getFullYear(),
}: Props) {
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("ledgerDate");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const handleSort = (field: SortField) => {
    setPageIndex(0);
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filteredAndSortedRows = useMemo(() => {
    return dailyRows
      .filter((row) => {
        // Activity filter
        if (activityFilter === "in_only" && (row.inFgCbm + row.inRawCbm <= 0)) {
          return false;
        }
        if (activityFilter === "out_only" && (row.outFgCbm + row.outRawCbm <= 0)) {
          return false;
        }
        if (activityFilter === "has_activity" && (row.inFgCbm + row.inRawCbm + row.outFgCbm + row.outRawCbm <= 0)) {
          return false;
        }

        // Omni search
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const searchCorpus = `${row.ledgerDate} ${row.beginningCbm} ${row.endingCbm} ${row.storageAmountUsd} ${row.appliedStorageRateUsd}`.toLowerCase();
        return searchCorpus.includes(q);
      })
      .sort((a, b) => {
        if (sortField === "ledgerDate") {
          return sortDir === "asc"
            ? a.ledgerDate.localeCompare(b.ledgerDate)
            : b.ledgerDate.localeCompare(a.ledgerDate);
        }

        const valA = Number(a[sortField] || 0);
        const valB = Number(b[sortField] || 0);
        return sortDir === "asc" ? valA - valB : valB - valA;
      });
  }, [dailyRows, searchQuery, activityFilter, sortField, sortDir]);

  const totalFilteredStorageAmount = useMemo(() => {
    return filteredAndSortedRows.reduce((sum, r) => sum + r.storageAmountUsd, 0);
  }, [filteredAndSortedRows]);

  const totalCount = filteredAndSortedRows.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = useMemo(() => {
    return filteredAndSortedRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [filteredAndSortedRows, pageIndex, pageSize]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="opacity-40" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp size={14} className="text-brand-navy font-bold" />
    ) : (
      <ArrowDown size={14} className="text-brand-navy font-bold" />
    );
  };

  if (!summary && dailyRows.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-12 text-center shadow-elevation-1">
        <p className="font-body text-body-md text-text-grey">
          No VMI daily balance ledger records found for the selected Organization and month.
        </p>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          The nightly balance replay engine calculates daily balances automatically at 23:59 Asia/Manila.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header action bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
        <div>
          <h3 className="font-heading text-title-md font-bold text-on-surface">
            VMI Daily Balance Storage Ledger
          </h3>
          <p className="font-body text-body-sm text-text-grey">
            Nightly-computed CBM balances and storage amounts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCloseModalOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded bg-primary px-4 font-label text-label font-bold text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          <Calculator size={18} />
          Generate Period Billing &amp; SOA
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
            Starting Period CBM
          </p>
          <p className="mt-2 font-mono text-title-lg font-bold text-on-surface">
            {dailyRows.length > 0 ? dailyRows[0].beginningCbm.toFixed(2) : "0.00"} m³
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
            Peak Consumed CBM
          </p>
          <p className="mt-2 font-mono text-title-lg font-bold text-on-surface">
            {dailyRows.reduce((max, r) => Math.max(max, r.endingCbm), 0).toFixed(2)} m³
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
            Closing Period CBM
          </p>
          <p className="mt-2 font-mono text-title-lg font-bold text-on-surface">
            {dailyRows.length > 0 ? dailyRows[dailyRows.length - 1].endingCbm.toFixed(2) : "0.00"} m³
          </p>
        </div>

        <div className="rounded-xl border border-brand-navy/20 bg-brand-navy/5 p-4 shadow-elevation-1">
          <p className="font-label text-label font-bold uppercase tracking-wider text-brand-navy">
            Period Storage Subtotal
          </p>
          <p className="mt-2 font-mono text-title-lg font-bold text-brand-navy">
            ${totalFilteredStorageAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </p>
        </div>
      </div>

      {/* ── Search & Filter Toolbar ────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 lg:flex-row lg:items-center lg:justify-between">
        {/* Omni Search Box */}
        <div className="relative flex-1 min-w-[280px]">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPageIndex(0);
            }}
            placeholder="Search by date (YYYY-MM-DD), CBM balance, amount…"
            className="h-11 w-full rounded-xl border border-outline-variant/40 bg-surface-light-grey/40 pl-10 pr-10 font-body text-body-sm text-on-surface placeholder:text-text-grey focus:border-brand-navy focus:bg-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setPageIndex(0);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-grey hover:text-on-surface"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
            <span className="font-label text-label-xs uppercase text-text-grey">Activity:</span>
            <select
              value={activityFilter}
              onChange={(e) => {
                setActivityFilter(e.target.value);
                setPageIndex(0);
              }}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Days</option>
              <option value="has_activity">Active Days (IN/OUT)</option>
              <option value="in_only">Days with IN</option>
              <option value="out_only">Days with OUT</option>
            </select>
          </div>

          {(searchQuery || activityFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActivityFilter("all");
                setPageIndex(0);
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 font-label text-label-xs font-bold text-status-held hover:bg-status-held/10"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Count Strip ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-body-sm text-text-grey px-1">
        <span>Showing <strong className="text-on-surface">{filteredAndSortedRows.length}</strong> ledger records in period</span>
      </div>

      {/* Daily Balance Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {filteredAndSortedRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md font-semibold text-on-surface">No ledger rows match your filter.</p>
            <p className="mt-1 font-body text-body-sm text-text-grey">Try clearing search terms or selecting &quot;All Days&quot;.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("ledgerDate")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Date</span>
                      {renderSortIcon("ledgerDate")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("beginningCbm")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Beginning (m³)</span>
                      {renderSortIcon("beginningCbm")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("inFgCbm")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>IN FG (m³)</span>
                      {renderSortIcon("inFgCbm")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("inRawCbm")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>IN Raw (m³)</span>
                      {renderSortIcon("inRawCbm")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("outFgCbm")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>OUT FG (m³)</span>
                      {renderSortIcon("outFgCbm")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("outRawCbm")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>OUT Raw (m³)</span>
                      {renderSortIcon("outRawCbm")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("endingCbm")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Ending (m³)</span>
                      {renderSortIcon("endingCbm")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("appliedStorageRateUsd")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Rate ($/m³)</span>
                      {renderSortIcon("appliedStorageRateUsd")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("storageAmountUsd")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Amount ($)</span>
                      {renderSortIcon("storageAmountUsd")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {pagedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/40">
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">
                      {row.ledgerDate}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right">
                      {row.beginningCbm.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-status-available text-right font-medium">
                      {row.inFgCbm > 0 ? `+${row.inFgCbm.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-status-available text-right font-medium">
                      {row.inRawCbm > 0 ? `+${row.inRawCbm.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-status-held text-right font-medium">
                      {row.outFgCbm > 0 ? `-${row.outFgCbm.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-status-held text-right font-medium">
                      {row.outRawCbm > 0 ? `-${row.outRawCbm.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface text-right">
                      {row.endingCbm.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-text-grey text-right">
                      ${row.appliedStorageRateUsd.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface text-right">
                      ${row.storageAmountUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-brand-navy bg-surface-light-grey/80 font-bold">
                <tr>
                  <td className="px-4 py-3 font-label text-label uppercase text-on-surface">
                    Period Totals:
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-mono-md text-text-grey">
                    {filteredAndSortedRows[0]?.beginningCbm.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-mono-md text-status-available">
                    +{filteredAndSortedRows.reduce((sum, r) => sum + r.inFgCbm, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-mono-md text-status-available">
                    +{filteredAndSortedRows.reduce((sum, r) => sum + r.inRawCbm, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-mono-md text-status-held">
                    -{filteredAndSortedRows.reduce((sum, r) => sum + r.outFgCbm, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-mono-md text-status-held">
                    -{filteredAndSortedRows.reduce((sum, r) => sum + r.outRawCbm, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-mono-md font-bold text-on-surface">
                    {filteredAndSortedRows[filteredAndSortedRows.length - 1]?.endingCbm.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-label text-label-xs uppercase text-text-grey">
                    avg
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-mono-md font-bold text-brand-navy">
                    ${totalFilteredStorageAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Table Pagination */}
            <div className="border-t border-outline-variant/30 p-3">
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
        )}
      </div>

      <PeriodCloseModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        parties={parties}
        selectedPartyId={selectedPartyId}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
      />
    </div>
  );
}
