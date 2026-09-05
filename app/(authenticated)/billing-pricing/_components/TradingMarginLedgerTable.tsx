"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import type { TradingMarginRow } from "@/lib/billing/queries/trading-margin";
import { TablePagination } from "@/components/ui/TablePagination";

interface Props {
  rows: TradingMarginRow[];
  hasMarginView: boolean;
}

type SortField =
  | "orderNumber"
  | "party"
  | "item"
  | "lot"
  | "qty"
  | "sellPrice"
  | "revenue"
  | "cogs"
  | "margin";

type SortDirection = "asc" | "desc";

export function TradingMarginLedgerTable({ rows, hasMarginView }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [marginFilter, setMarginFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("orderNumber");
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
    return rows
      .filter((r) => {
        const revenue = r.qty * r.sellPrice;
        const cogs = r.qty * (r.cogs ?? 0);
        const margin = revenue - cogs;
        const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

        // Margin filter
        if (marginFilter === "high_margin" && marginPct < 30) {
          return false;
        }
        if (marginFilter === "medium_margin" && (marginPct < 10 || marginPct >= 30)) {
          return false;
        }
        if (marginFilter === "low_margin" && marginPct >= 10) {
          return false;
        }

        // Omni search
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const searchCorpus = `${r.orderNumber} ${r.party ?? ""} ${r.item ?? ""} ${r.lot ?? ""}`.toLowerCase();
        return searchCorpus.includes(q);
      })
      .sort((a, b) => {
        const revA = a.qty * a.sellPrice;
        const revB = b.qty * b.sellPrice;
        const cogsA = a.qty * (a.cogs ?? 0);
        const cogsB = b.qty * (b.cogs ?? 0);
        const marginA = revA - cogsA;
        const marginB = revB - cogsB;

        if (sortField === "revenue") {
          return sortDir === "asc" ? revA - revB : revB - revA;
        }
        if (sortField === "cogs") {
          return sortDir === "asc" ? cogsA - cogsB : cogsB - cogsA;
        }
        if (sortField === "margin") {
          return sortDir === "asc" ? marginA - marginB : marginB - marginA;
        }
        if (sortField === "qty" || sortField === "sellPrice") {
          return sortDir === "asc" ? (a[sortField] ?? 0) - (b[sortField] ?? 0) : (b[sortField] ?? 0) - (a[sortField] ?? 0);
        }

        const valA = ((a[sortField as keyof TradingMarginRow] as string) || "").toLowerCase();
        const valB = ((b[sortField as keyof TradingMarginRow] as string) || "").toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [rows, searchQuery, marginFilter, sortField, sortDir]);

  const totalCount = filteredAndSortedRows.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = filteredAndSortedRows.slice(
    pageIndex * pageSize,
    (pageIndex + 1) * pageSize
  );

  const totalFilteredSalesAmount = useMemo(() => {
    return filteredAndSortedRows.reduce((sum, r) => sum + r.qty * r.sellPrice, 0);
  }, [filteredAndSortedRows]);

  const totalFilteredCogsAmount = useMemo(() => {
    return hasMarginView
      ? filteredAndSortedRows.reduce((sum, r) => sum + r.qty * (r.cogs ?? 0), 0)
      : 0;
  }, [filteredAndSortedRows, hasMarginView]);

  const totalFilteredMarginAmount = totalFilteredSalesAmount - totalFilteredCogsAmount;

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

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-12 text-center shadow-elevation-1">
        <p className="font-body text-body-md text-text-grey">
          No Trading sales recorded for the selected period.
        </p>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          Trading sales are frozen into the ledger automatically when pick lists are generated.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
            Total Sales Revenue
          </p>
          <p className="mt-2 font-mono text-title-lg font-bold text-brand-navy">
            ₱{totalFilteredSalesAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {hasMarginView && (
          <>
            <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
              <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
                Total COGS (Buy Cost)
              </p>
              <p className="mt-2 font-mono text-title-lg font-bold text-text-grey">
                ₱{totalFilteredCogsAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className="rounded-xl border border-status-available/30 bg-status-available/10 p-4 shadow-elevation-1">
              <p className="font-label text-label font-bold uppercase tracking-wider text-status-available">
                Total Gross Margin
              </p>
              <p className="mt-2 font-mono text-title-lg font-bold text-status-available">
                ₱{totalFilteredMarginAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="ml-2 font-body text-body-sm">
                  ({totalFilteredSalesAmount > 0 ? ((totalFilteredMarginAmount / totalFilteredSalesAmount) * 100).toFixed(1) : 0}%)
                </span>
              </p>
            </div>
          </>
        )}
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
            placeholder="Search by order #, customer, item code, lot #…"
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
          {hasMarginView && (
            <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
              <span className="font-label text-label-xs uppercase text-text-grey">Margin:</span>
              <select
                value={marginFilter}
                onChange={(e) => {
                  setMarginFilter(e.target.value);
                  setPageIndex(0);
                }}
                className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
              >
                <option value="all">All Tiers</option>
                <option value="high_margin">High (&ge;30%)</option>
                <option value="medium_margin">Medium (10–30%)</option>
                <option value="low_margin">Low (&lt;10%)</option>
              </select>
            </div>
          )}

          {(searchQuery || marginFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setMarginFilter("all");
                setPageIndex(0);
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 font-label text-label-xs font-bold text-status-held hover:bg-status-held/10"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Count Strip ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-body-sm text-text-grey px-1">
        <span>Showing <strong className="text-on-surface">{filteredAndSortedRows.length}</strong> trading sales records</span>
      </div>

      {/* Main Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {filteredAndSortedRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md font-semibold text-on-surface">No transactions match your filter.</p>
            <p className="mt-1 font-body text-body-sm text-text-grey">Try adjusting search terms or resetting filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("orderNumber")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Order / Ref #</span>
                      {renderSortIcon("orderNumber")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("party")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Customer</span>
                      {renderSortIcon("party")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("item")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Item Code</span>
                      {renderSortIcon("item")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("lot")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Lot #</span>
                      {renderSortIcon("lot")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("qty")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Qty</span>
                      {renderSortIcon("qty")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("sellPrice")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Sell Price</span>
                      {renderSortIcon("sellPrice")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("revenue")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Total Revenue</span>
                      {renderSortIcon("revenue")}
                    </button>
                  </th>

                  {hasMarginView && (
                    <>
                      <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                        <button
                          type="button"
                          onClick={() => handleSort("cogs")}
                          className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                        >
                          <span>Buy Cost</span>
                          {renderSortIcon("cogs")}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                        <button
                          type="button"
                          onClick={() => handleSort("margin")}
                          className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                        >
                          <span>Gross Margin</span>
                          {renderSortIcon("margin")}
                        </button>
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {pagedRows.map((row) => {
                  const revenue = row.qty * row.sellPrice;
                  const cogs = row.qty * (row.cogs ?? 0);
                  const margin = revenue - cogs;
                  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

                  return (
                    <tr key={row.id} className="hover:bg-surface-light-grey/40">
                      <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">
                        {row.orderNumber || "—"}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        {row.party}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                        {row.item}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-text-grey">
                        {row.lot || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right font-bold">
                        {row.qty}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right">
                        ₱{row.sellPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface text-right">
                        ₱{revenue.toFixed(2)}
                      </td>

                      {hasMarginView && (
                        <>
                          <td className="px-4 py-3 font-mono text-mono-md text-text-grey text-right">
                            ₱{(row.cogs ?? 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 font-mono text-mono-md font-bold text-status-available text-right">
                            ₱{margin.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 font-mono text-mono-md font-bold text-status-available text-right">
                            {marginPct.toFixed(1)}%
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-brand-navy bg-surface-light-grey/80 font-bold">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right font-label uppercase text-on-surface">
                    Total Trading Sales:
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-mono-md font-bold text-on-surface">
                    {filteredAndSortedRows.reduce((sum, r) => sum + r.qty, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-label text-label-xs uppercase text-text-grey">
                    —
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-mono-md font-bold text-brand-navy">
                    ₱{totalFilteredSalesAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  {hasMarginView && (
                    <>
                      <td className="px-4 py-3 text-right font-mono text-mono-md text-text-grey">
                        ₱{totalFilteredCogsAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-mono-md font-bold text-status-available">
                        ₱{totalFilteredMarginAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </>
                  )}
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
    </div>
  );
}
