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
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import { TablePagination } from "@/components/ui/TablePagination";

const STATUS_CLASSES: Record<string, string> = {
  allocated: "bg-status-pending/15 text-status-pending",
  picked: "bg-brand-navy/15 text-brand-navy",
  dispatched: "bg-status-available/15 text-status-available",
};

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

function statusLabel(status: string) {
  return status.replace(/_/g, " ").toUpperCase();
}

function PickListAction({
  row,
  canExecute: _canExecute,
  deleted,
}: {
  row: PickListRow;
  canExecute: boolean;
  deleted?: boolean;
}) {
  if (deleted) return <span className="font-body text-body-sm text-text-grey">Deleted</span>;

  return (
    <div className="flex justify-end">
      <Link
        href={`/pick-lists/${row.id}/dispatch`}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/50 bg-surface-white px-4 font-label text-body-sm font-semibold text-on-surface shadow-sm hover:bg-surface-light-grey hover:border-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
      >
        Actions &rarr;
      </Link>
    </div>
  );
}

type SortField =
  | "pickListNumber"
  | "status"
  | "flowType"
  | "customerPartyId"
  | "createdAt";

type SortDirection = "asc" | "desc";

interface Props {
  rows: PickListRow[];
  total: number;
  canExecute: boolean;
  isDeleted: boolean;
}

export function PickListsFilterableTable({
  rows,
  total,
  canExecute,
  isDeleted,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFlow, setSelectedFlow] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

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

        // Status filter
        if (selectedStatus !== "all" && row.status !== selectedStatus) {
          return false;
        }

        // Omni search
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const searchCorpus = `${row.pickListNumber} ${row.customerPartyId ?? ""} ${row.flowType} ${row.status}`.toLowerCase();
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
  }, [rows, searchQuery, selectedFlow, selectedStatus, sortField, sortDir]);

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

  return (
    <div className="space-y-4">
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
            placeholder="Search by pick list #, organization, flow, status…"
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
          {/* Flow Filter */}
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
              <option value="vmi">VMI</option>
              <option value="trading">Trading</option>
              <option value="supplies">Supplies</option>
            </select>
          </div>

          {/* Status Filter */}
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
              <option value="allocated">Allocated</option>
              <option value="picked">Picked</option>
              <option value="dispatched">Dispatched</option>
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

      {/* ── Summary Count Strip ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-body-sm text-text-grey px-1">
        <span>Showing <strong className="text-on-surface">{filteredAndSortedRows.length}</strong> of {total} pick lists</span>
      </div>

      {/* ── Table & Cards Section ──────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {filteredAndSortedRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              {isDeleted ? "No deleted pick lists match your filter." : "No pick lists match your filter."}
            </p>
            <p className="mt-2 font-body text-body-sm text-text-grey">
              Try adjusting your search terms or filters.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="divide-y divide-outline-variant/30 md:hidden">
              {pagedRows.map((row) => (
                <article key={row.id} className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-mono-md font-bold text-on-surface">
                        {row.pickListNumber}
                      </p>
                      <p className="mt-1 font-body text-body-md text-text-grey">
                        {FLOW_LABELS[row.flowType] ?? row.flowType}
                      </p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 font-label text-label ${STATUS_CLASSES[row.status] ?? "bg-status-neutral/15 text-status-neutral"}`}>
                      {statusLabel(row.status)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 border-y border-outline-variant/30 py-3 font-body text-body-md">
                    <div>
                      <dt className="font-label text-label uppercase tracking-wide text-text-grey">Organization</dt>
                      <dd className="mt-1 truncate font-mono text-mono-md text-on-surface">{row.customerPartyId}</dd>
                    </div>
                    <div>
                      <dt className="font-label text-label uppercase tracking-wide text-text-grey">Created</dt>
                      <dd className="mt-1 text-on-surface">{row.createdAt.toLocaleDateString()}</dd>
                    </div>
                  </dl>
                  <PickListAction row={row} canExecute={canExecute} deleted={isDeleted} />
                </article>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                    <th className="px-5 py-3 text-left font-label text-label uppercase tracking-wide text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("pickListNumber")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Pick List</span>
                        {renderSortIcon("pickListNumber")}
                      </button>
                    </th>
                    <th className="px-5 py-3 text-left font-label text-label uppercase tracking-wide text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("status")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Status</span>
                        {renderSortIcon("status")}
                      </button>
                    </th>
                    <th className="px-5 py-3 text-left font-label text-label uppercase tracking-wide text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("flowType")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Inventory Model</span>
                        {renderSortIcon("flowType")}
                      </button>
                    </th>
                    <th className="px-5 py-3 text-left font-label text-label uppercase tracking-wide text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("customerPartyId")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Organization</span>
                        {renderSortIcon("customerPartyId")}
                      </button>
                    </th>
                    <th className="px-5 py-3 text-left font-label text-label uppercase tracking-wide text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("createdAt")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Created</span>
                        {renderSortIcon("createdAt")}
                      </button>
                    </th>
                    <th className="sr-only">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {pagedRows.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-light-grey/50">
                      <td className="px-5 py-4 font-mono text-mono-md font-bold text-on-surface">{row.pickListNumber}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 font-label text-label ${STATUS_CLASSES[row.status] ?? "bg-status-neutral/15 text-status-neutral"}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-body text-body-md text-on-surface">{FLOW_LABELS[row.flowType] ?? row.flowType}</td>
                      <td className="px-5 py-4 font-mono text-mono-md text-on-surface">{row.customerPartyId}</td>
                      <td className="px-5 py-4 font-body text-body-md text-text-grey">{row.createdAt.toLocaleString()}</td>
                      <td className="px-5 py-4 text-right"><PickListAction row={row} canExecute={canExecute} deleted={isDeleted} /></td>
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
