"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Printer,
  Package,
  CheckCircle2,
} from "lucide-react";
import { TablePagination } from "@/components/ui/TablePagination";

type FlowType = "VMI" | "Trading" | "Supplies";
type PickListStatus = "committed" | "dispatched" | "cancelled";
type ARStatus = "pending_signature" | "signed" | "disputed";

export type MockPickListDoc = {
  id: string;
  number: string;
  party: string;
  itemsCount: number;
  flow: FlowType;
  status: PickListStatus;
  createdAt: string;
};

export type MockARDoc = {
  id: string;
  number: string;
  party: string;
  pickListNumber: string;
  itemsCount: number;
  status: ARStatus;
  date: string;
};

const PICK_STATUS_CLASSES: Record<PickListStatus, string> = {
  committed: "bg-status-pending/10 text-status-pending",
  dispatched: "bg-status-available/10 text-status-available",
  cancelled: "bg-status-held/10 text-status-held",
};

const PICK_STATUS_LABELS: Record<PickListStatus, string> = {
  committed: "COMMITTED",
  dispatched: "DISPATCHED",
  cancelled: "CANCELLED",
};

const AR_STATUS_CLASSES: Record<ARStatus, string> = {
  pending_signature: "bg-status-pending/10 text-status-pending",
  signed: "bg-status-available/10 text-status-available",
  disputed: "bg-status-held/10 text-status-held",
};

const AR_STATUS_LABELS: Record<ARStatus, string> = {
  pending_signature: "PENDING SIGNATURE",
  signed: "SIGNED",
  disputed: "DISPUTED",
};

const FLOW_CLASSES: Record<FlowType, string> = {
  VMI: "bg-brand-royal-blue/10 text-brand-royal-blue",
  Trading: "bg-brand-navy/10 text-brand-navy",
  Supplies: "bg-status-neutral/10 text-status-neutral",
};

type SortDirection = "asc" | "desc";

// ─── Filterable Pick Lists Table ──────────────────────────────────────────────

export function FilterablePickListsTable({ rows, initialSearch = "" }: { rows: MockPickListDoc[]; initialSearch?: string }) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedFlow, setSelectedFlow] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortField, setSortField] = useState<keyof MockPickListDoc>("createdAt");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const handleSort = (field: keyof MockPickListDoc) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    return rows
      .filter((row) => {
        if (selectedFlow !== "all" && row.flow !== selectedFlow) return false;
        if (selectedStatus !== "all" && row.status !== selectedStatus) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const corpus = `${row.number} ${row.party} ${row.flow} ${row.status}`.toLowerCase();
        return corpus.includes(q);
      })
      .sort((a, b) => {
        if (sortField === "itemsCount") {
          return sortDir === "asc" ? a.itemsCount - b.itemsCount : b.itemsCount - a.itemsCount;
        }
        const valA = String(a[sortField] || "").toLowerCase();
        const valB = String(b[sortField] || "").toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [rows, searchQuery, selectedFlow, selectedStatus, sortField, sortDir]);

  const totalCount = filteredAndSorted.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = useMemo(() => {
    return filteredAndSorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [filteredAndSorted, pageIndex, pageSize]);

  const renderSortIcon = (field: keyof MockPickListDoc) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp size={14} className="text-brand-navy font-bold" />
    ) : (
      <ArrowDown size={14} className="text-brand-navy font-bold" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-grey" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPageIndex(0);
            }}
            placeholder="Search by pick list #, organization, flow…"
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

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
            <span className="font-label text-label-xs uppercase text-text-grey">Model:</span>
            <select
              value={selectedFlow}
              onChange={(e) => {
                setSelectedFlow(e.target.value);
                setPageIndex(0);
              }}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Models</option>
              <option value="VMI">VMI</option>
              <option value="Trading">Trading</option>
              <option value="Supplies">Supplies</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
            <span className="font-label text-label-xs uppercase text-text-grey">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPageIndex(0);
              }}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="committed">Committed</option>
              <option value="dispatched">Dispatched</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {(searchQuery || selectedFlow !== "all" || selectedStatus !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedFlow("all");
                setSelectedStatus("all");
                setPageIndex(0);
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 font-label text-label-xs font-bold text-status-held hover:bg-status-held/10"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-body-sm text-text-grey px-1">
        <span>Showing <strong className="text-on-surface">{filteredAndSorted.length}</strong> pick list documents</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Package size={40} className="text-text-grey" aria-hidden="true" />
            <p className="font-body text-body-md text-text-grey">No pick lists match your filter.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("number")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Pick List #</span>
                        {renderSortIcon("number")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("party")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Organization</span>
                        {renderSortIcon("party")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("itemsCount")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Items</span>
                        {renderSortIcon("itemsCount")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("flow")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Flow</span>
                        {renderSortIcon("flow")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("status")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Status</span>
                        {renderSortIcon("status")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("createdAt")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Created</span>
                        {renderSortIcon("createdAt")}
                      </button>
                    </th>
                    <th className="sr-only px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {pagedRows.map((pl) => (
                    <tr key={pl.id} className="hover:bg-surface-light-grey/50">
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface font-bold">
                        {pl.number}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        {pl.party}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                        {pl.itemsCount}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${FLOW_CLASSES[pl.flow]}`}
                        >
                          {pl.flow}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${PICK_STATUS_CLASSES[pl.status]}`}
                        >
                          {PICK_STATUS_LABELS[pl.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-text-grey">
                        {pl.createdAt}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            aria-label={`Print pick list ${pl.number}`}
                            className="flex h-11 w-11 items-center justify-center rounded border border-outline-variant/30 text-text-grey hover:border-brand-navy hover:text-brand-navy"
                          >
                            <Printer size={16} aria-hidden="true" />
                          </button>
                          <Link
                            href={`/documents/pick-lists/${pl.id}`}
                            className="inline-flex h-11 items-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
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
          </>
        )}
      </div>
    </div>
  );
}

// ─── Filterable Acknowledgement Receipts Table ────────────────────────────────

export function FilterableARTable({ rows, initialSearch = "" }: { rows: MockARDoc[]; initialSearch?: string }) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortField, setSortField] = useState<keyof MockARDoc>("date");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const handleSort = (field: keyof MockARDoc) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    return rows
      .filter((row) => {
        if (selectedStatus !== "all" && row.status !== selectedStatus) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const corpus = `${row.number} ${row.party} ${row.pickListNumber} ${row.status}`.toLowerCase();
        return corpus.includes(q);
      })
      .sort((a, b) => {
        if (sortField === "itemsCount") {
          return sortDir === "asc" ? a.itemsCount - b.itemsCount : b.itemsCount - a.itemsCount;
        }
        const valA = String(a[sortField] || "").toLowerCase();
        const valB = String(b[sortField] || "").toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [rows, searchQuery, selectedStatus, sortField, sortDir]);

  const totalCount = filteredAndSorted.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = useMemo(() => {
    return filteredAndSorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [filteredAndSorted, pageIndex, pageSize]);

  const renderSortIcon = (field: keyof MockARDoc) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp size={14} className="text-brand-navy font-bold" />
    ) : (
      <ArrowDown size={14} className="text-brand-navy font-bold" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-grey" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPageIndex(0);
            }}
            placeholder="Search by AR #, organization, pick list #…"
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

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
            <span className="font-label text-label-xs uppercase text-text-grey">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPageIndex(0);
              }}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="signed">Signed</option>
              <option value="pending_signature">Pending Signature</option>
              <option value="disputed">Disputed</option>
            </select>
          </div>

          {(searchQuery || selectedStatus !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedStatus("all");
                setPageIndex(0);
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 font-label text-label-xs font-bold text-status-held hover:bg-status-held/10"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-body-sm text-text-grey px-1">
        <span>Showing <strong className="text-on-surface">{filteredAndSorted.length}</strong> acknowledgement receipts</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <CheckCircle2 size={40} className="text-text-grey" aria-hidden="true" />
            <p className="font-body text-body-md text-text-grey">No acknowledgement receipts match your filter.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("number")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>AR #</span>
                        {renderSortIcon("number")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("party")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Organization</span>
                        {renderSortIcon("party")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("pickListNumber")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Pick List #</span>
                        {renderSortIcon("pickListNumber")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("itemsCount")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Items</span>
                        {renderSortIcon("itemsCount")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("status")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Status</span>
                        {renderSortIcon("status")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("date")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Date</span>
                        {renderSortIcon("date")}
                      </button>
                    </th>
                    <th className="sr-only px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {pagedRows.map((ar) => (
                    <tr key={ar.id} className="hover:bg-surface-light-grey/50">
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface font-bold">
                        {ar.number}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        {ar.party}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                        {ar.pickListNumber}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                        {ar.itemsCount}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${AR_STATUS_CLASSES[ar.status]}`}
                        >
                          {AR_STATUS_LABELS[ar.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-text-grey">
                        {ar.date}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/documents/acknowledgement-receipts/${ar.id}`}
                          className="inline-flex h-11 items-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
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
          </>
        )}
      </div>
    </div>
  );
}
