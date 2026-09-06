"use client";

import React, { useState, useMemo } from "react";
import {
  Plus,
  Tag,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import type { TradingPolicyRow } from "@/lib/db/queries/trading-policies";
import { PolicyFormModal } from "../trading/policies/_components/PolicyFormModal";
import { TablePagination } from "@/components/ui/TablePagination";

type Option = { id: string; name: string; code: string };

interface Props {
  rows: TradingPolicyRow[];
  parties: Option[];
  items: Option[];
}

type SortField =
  | "partyName"
  | "itemCode"
  | "buyCost"
  | "marginType"
  | "sellPrice"
  | "isActive"
  | "effectiveFrom";

type SortDirection = "asc" | "desc";

export function TradingRateCardsTable({ rows, parties, items }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [marginTypeFilter, setMarginTypeFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("partyName");
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
      .filter((row) => {
        // Margin type filter
        if (marginTypeFilter !== "all" && row.marginType !== marginTypeFilter) {
          return false;
        }

        // Omni search
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const searchCorpus = `${row.partyCode} ${row.partyName} ${row.itemCode} ${row.itemName}`.toLowerCase();
        return searchCorpus.includes(q);
      })
      .sort((a, b) => {
        if (sortField === "buyCost" || sortField === "sellPrice") {
          const numA = parseFloat(a[sortField]);
          const numB = parseFloat(b[sortField]);
          return sortDir === "asc" ? numA - numB : numB - numA;
        }

        if (sortField === "isActive") {
          return sortDir === "asc"
            ? (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1)
            : (a.isActive === b.isActive ? 0 : a.isActive ? 1 : -1);
        }

        const valA = ((a[sortField] as string) || "").toLowerCase();
        const valB = ((b[sortField] as string) || "").toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [rows, searchQuery, marginTypeFilter, sortField, sortDir]);

  const totalCount = filteredAndSortedRows.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = filteredAndSortedRows.slice(
    pageIndex * pageSize,
    (pageIndex + 1) * pageSize
  );

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

  return (
    <div className="space-y-4">
      {/* Header action bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
        <div>
          <h2 className="font-heading text-title-md font-bold text-on-surface flex items-center gap-2">
            <Tag size={20} className="text-brand-navy" />
            Trading Rate Cards (trading_policies)
          </h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Configured default buy cost, margin formula, and sell price per Customer &amp; Item.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded bg-primary px-4 font-label text-label font-bold text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          <Plus size={18} />
          Configure Rate Card
        </button>
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
            placeholder="Search by customer, item code, item name…"
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
            <span className="font-label text-label-xs uppercase text-text-grey">Margin Type:</span>
            <select
              value={marginTypeFilter}
              onChange={(e) => {
                setMarginTypeFilter(e.target.value);
                setPageIndex(0);
              }}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed</option>
            </select>
          </div>

          {(searchQuery || marginTypeFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setMarginTypeFilter("all");
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
        <span>Showing <strong className="text-on-surface">{filteredAndSortedRows.length}</strong> trading rate cards</span>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {filteredAndSortedRows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              No Trading rate cards match your search/filter.
            </p>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Click <strong>&quot;Configure Rate Card&quot;</strong> above to define buy cost and sell price for a Customer and Item pair.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("partyName")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Customer</span>
                      {renderSortIcon("partyName")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("itemCode")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Item / SKU</span>
                      {renderSortIcon("itemCode")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("buyCost")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Buy Cost (USD)</span>
                      {renderSortIcon("buyCost")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("marginType")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Margin Policy</span>
                      {renderSortIcon("marginType")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("sellPrice")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Target Sell (PHP)</span>
                      {renderSortIcon("sellPrice")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("isActive")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Status</span>
                      {renderSortIcon("isActive")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("effectiveFrom")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Effective Range</span>
                      {renderSortIcon("effectiveFrom")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {pagedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/40">
                    <td className="px-4 py-3 font-body text-body-md text-on-surface font-semibold">
                      {row.partyCode} — {row.partyName}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      <span className="font-mono text-mono-md font-bold">{row.itemCode}</span>
                      <br />
                      <span className="text-body-sm text-text-grey">{row.itemName}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right font-medium">
                      {row.buyCurrency} ${parseFloat(row.buyCost).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {row.marginType === "percentage" ? (
                        <span className="inline-flex items-center rounded-full bg-brand-navy/10 px-2 py-0.5 font-mono text-mono-md font-bold text-brand-navy">
                          +{parseFloat(row.marginValue).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-brand-navy/10 px-2 py-0.5 font-mono text-mono-md font-bold text-brand-navy">
                          +${parseFloat(row.marginValue).toFixed(2)} / unit
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-status-available text-right">
                      {row.sellCurrency} ₱{parseFloat(row.sellPrice).toFixed(2)}
                      {row.sellPriceIsOverride && (
                        <span className="ml-1 rounded bg-status-pending/20 px-1 py-0.5 text-[10px] text-status-pending uppercase font-bold">
                          Override
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md">
                      {row.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-status-available/10 px-2 py-0.5 font-label text-label font-bold text-status-available">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-status-neutral/10 px-2 py-0.5 font-label text-label font-bold text-text-grey">
                          Superseded
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-text-grey">
                      {new Date(row.effectiveFrom).toLocaleDateString()}
                      {row.effectiveTo ? ` — ${new Date(row.effectiveTo).toLocaleDateString()}` : " — Present"}
                    </td>
                  </tr>
                ))}
              </tbody>
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

      <PolicyFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        parties={parties}
        items={items}
      />
    </div>
  );
}
