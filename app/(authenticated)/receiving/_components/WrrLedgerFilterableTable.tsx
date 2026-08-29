"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

type SortField = "wrrNumber" | "flowType" | "vendorPartyName" | "createdAt";
type SortDirection = "asc" | "desc";

interface WrrLedgerFilterableTableProps {
  rows: WrrDocumentRow[];
}

export function WrrLedgerFilterableTable({ rows }: WrrLedgerFilterableTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFlow, setSelectedFlow] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const handleSort = (field: SortField) => {
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
        // Flow filter
        if (selectedFlow !== "all" && row.flowType !== selectedFlow) {
          return false;
        }

        // Omni search
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const searchCorpus = `${row.wrrNumber} ${row.vendorPartyName ?? ""} ${row.vendorPartyId} ${row.flowType}`.toLowerCase();
        return searchCorpus.includes(q);
      })
      .sort((a, b) => {
        if (sortField === "createdAt") {
          const timeA = new Date(a.createdAt).getTime();
          const timeB = new Date(b.createdAt).getTime();
          return sortDir === "asc" ? timeA - timeB : timeB - timeA;
        }

        const valA = ((a[sortField] as string) || "").toLowerCase();
        const valB = ((b[sortField] as string) || "").toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [rows, searchQuery, selectedFlow, sortField, sortDir]);

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
      {/* ── Search & Filter Toolbar ────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 lg:flex-row lg:items-center lg:justify-between">
        {/* Omni Search */}
        <div className="relative flex-1 min-w-[280px]">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search confirmed WRR #, vendor, flow…"
            className="h-11 w-full rounded-xl border border-outline-variant/40 bg-surface-light-grey/40 pl-10 pr-10 font-body text-body-sm text-on-surface placeholder:text-text-grey focus:border-brand-navy focus:bg-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-grey hover:text-on-surface"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Flow Filter */}
          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
            <span className="font-label text-label-xs uppercase text-text-grey">Model:</span>
            <select
              value={selectedFlow}
              onChange={(e) => setSelectedFlow(e.target.value)}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Models</option>
              <option value="vmi">VMI</option>
              <option value="trading">Trading</option>
              <option value="supplies">Supplies</option>
            </select>
          </div>

          {(searchQuery || selectedFlow !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedFlow("all");
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
        <span>Showing <strong className="text-on-surface">{filteredAndSortedRows.length}</strong> confirmed receipts</span>
      </div>

      {/* ── Table Container ────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-2">
        {filteredAndSortedRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              No confirmed receipts match your search/filter.
            </p>
            <p className="mt-2 font-body text-body-sm text-text-grey">
              Confirmed WRRs appear here after the receipt commit succeeds.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-outline-variant/30 md:hidden">
              {filteredAndSortedRows.map((row) => (
                <div key={row.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-mono-md font-bold text-on-surface">
                      {row.wrrNumber}
                    </span>
                    <span className="rounded-full bg-status-available/10 px-2 py-0.5 font-label text-label-xs font-bold text-status-available">
                      Confirmed
                    </span>
                  </div>
                  <div className="flex justify-between text-body-sm text-text-grey">
                    <span>{FLOW_LABELS[row.flowType] ?? row.flowType}</span>
                    <span>{row.vendorPartyName ?? row.vendorPartyId}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="font-mono text-mono-xs text-text-grey">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </span>
                    <Link
                      href={`/receiving/${row.id}`}
                      className="inline-flex h-9 items-center font-label text-label font-bold text-brand-navy underline"
                    >
                      View WRR &rarr;
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("wrrNumber")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>WRR Number</span>
                        {renderSortIcon("wrrNumber")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("flowType")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Inventory Model</span>
                        {renderSortIcon("flowType")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("vendorPartyName")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Vendor</span>
                        {renderSortIcon("vendorPartyName")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("createdAt")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Confirmed At</span>
                        {renderSortIcon("createdAt")}
                      </button>
                    </th>
                    <th className="sr-only px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {filteredAndSortedRows.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-light-grey/50">
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface font-bold">
                        {row.wrrNumber}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        {FLOW_LABELS[row.flowType] ?? row.flowType}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        {row.vendorPartyName ?? row.vendorPartyId}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-text-grey">
                        {new Date(row.createdAt).toLocaleString()}
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
    </div>
  );
}
