"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  FileSpreadsheet,
  Plus,
} from "lucide-react";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  staged_pending_arrival: "Staged / Pending Arrival",
  receiving_in_progress: "Receiving in Progress",
  confirmed: "Confirmed",
};

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-status-neutral/15 text-status-neutral",
  staged_pending_arrival: "bg-status-pending/15 text-status-pending",
  receiving_in_progress: "bg-brand-royal-blue/15 text-brand-royal-blue",
  confirmed: "bg-status-available/15 text-status-available",
};

type SortField = "wrrNumber" | "flowType" | "status" | "vendorPartyName" | "createdAt";
type SortDirection = "asc" | "desc";

interface WrrFilterableTableProps {
  rows: WrrDocumentRow[];
  canCreate: boolean;
}

export function WrrFilterableTable({ rows, canCreate }: WrrFilterableTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFlow, setSelectedFlow] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
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

        // Status filter
        if (selectedStatus !== "all" && row.status !== selectedStatus) {
          return false;
        }

        // Omni search
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const searchCorpus = `${row.wrrNumber} ${row.vendorPartyName ?? ""} ${row.flowType} ${row.status}`.toLowerCase();
        return searchCorpus.includes(q);
      })
      .sort((a, b) => {
        if (sortField === "createdAt") {
          const timeA = new Date(a.createdAt).getTime();
          const timeB = new Date(b.createdAt).getTime();
          return sortDir === "asc" ? timeA - timeB : timeB - timeA;
        }

        const valA = (a[sortField] || "").toLowerCase();
        const valB = (b[sortField] || "").toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [rows, searchQuery, selectedFlow, selectedStatus, sortField, sortDir]);

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
      {/* ── Toolbar ────────────────────────────────────────────────────── */}
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
            placeholder="Search by WRR #, Vendor, Invoice #, IP #, Flow…"
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
            <span className="font-label text-label-xs uppercase text-text-grey">Flow:</span>
            <select
              value={selectedFlow}
              onChange={(e) => setSelectedFlow(e.target.value)}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Flows</option>
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
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="receiving_in_progress">In Progress</option>
              <option value="staged_pending_arrival">Staged / Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          {(searchQuery || selectedFlow !== "all" || selectedStatus !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedFlow("all");
                setSelectedStatus("all");
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 font-label text-label-xs font-bold text-status-held hover:bg-status-held/10"
            >
              Reset
            </button>
          )}

          {canCreate && (
            <div className="flex items-center gap-2">
              <Link
                href="/receiving/new?import=excel"
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3.5 font-label text-label font-semibold text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <FileSpreadsheet size={16} aria-hidden="true" className="text-brand-navy" />
                Import CIPL
              </Link>
              <Link
                href="/receiving/new"
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 font-label text-label font-bold text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <Plus size={16} aria-hidden="true" />
                New WRR
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Summary Count Strip ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-body-sm text-text-grey px-1">
        <span>Showing <strong className="text-on-surface">{filteredAndSortedRows.length}</strong> warehouse receipt requests</span>
      </div>

      {/* ── Main WRR Table ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-2">
        {filteredAndSortedRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md font-semibold text-on-surface">No WRRs match your filter.</p>
            <p className="mt-1 font-body text-body-sm text-text-grey">Try adjusting your search terms or status filter.</p>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-[#EDF2FF]">
                    <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("wrrNumber")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>WRR Number</span>
                        {renderSortIcon("wrrNumber")}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("flowType")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Flow Type</span>
                        {renderSortIcon("flowType")}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("status")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Status</span>
                        {renderSortIcon("status")}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("vendorPartyName")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Vendor / Organization</span>
                        {renderSortIcon("vendorPartyName")}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      <button
                        type="button"
                        onClick={() => handleSort("createdAt")}
                        className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                      >
                        <span>Created At</span>
                        {renderSortIcon("createdAt")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-label text-label uppercase text-text-grey">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {filteredAndSortedRows.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-light-grey/50">
                      <td className="px-4 py-3 font-mono text-mono-md font-bold text-brand-navy">
                        <Link href={`/receiving/${row.id}`} className="hover:underline">
                          {row.wrrNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        <span className="rounded bg-brand-navy/10 px-2 py-0.5 font-label text-label-xs font-bold text-brand-navy">
                          {FLOW_LABELS[row.flowType] ?? row.flowType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 font-label text-mono-sm font-bold ${
                            STATUS_CLASSES[row.status] ?? "bg-status-neutral/10 text-status-neutral"
                          }`}
                        >
                          {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        {row.vendorPartyName ?? row.vendorPartyId}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-body text-body-md text-text-grey">
                        {row.createdAt.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/receiving/${row.id}`}
                          className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-lg border border-brand-navy/30 bg-surface-white px-3 font-label text-label-xs font-bold text-brand-navy hover:bg-brand-navy/5"
                        >
                          View WRR &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (< 768px) */}
            <div className="divide-y divide-outline-variant/30 md:hidden">
              {filteredAndSortedRows.map((row) => (
                <div key={row.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/receiving/${row.id}`}
                        className="font-mono text-title-md font-bold text-brand-navy hover:underline"
                      >
                        {row.wrrNumber}
                      </Link>
                      <p className="mt-0.5 font-body text-body-sm font-semibold text-on-surface">
                        {row.vendorPartyName ?? "Vendor not specified"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 font-label text-label-xs font-bold ${
                        STATUS_CLASSES[row.status] ?? "bg-status-neutral/10 text-status-neutral"
                      }`}
                    >
                      {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-body-xs text-text-grey">
                    <span className="rounded bg-brand-navy/10 px-2 py-0.5 font-label font-bold text-brand-navy">
                      {FLOW_LABELS[row.flowType] ?? row.flowType}
                    </span>
                    <span>Created: {row.createdAt.toLocaleDateString()}</span>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/20">
                    <Link
                      href={`/receiving/${row.id}`}
                      className="flex-1 inline-flex h-10 items-center justify-center rounded-lg bg-brand-navy px-3 font-label text-label-xs font-bold text-surface-white hover:bg-brand-navy/90"
                    >
                      Open WRR
                    </Link>
                    <Link
                      href={`/receiving/${row.id}/pre-alert`}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-outline-variant/60 bg-surface-white px-3 font-label text-label-xs font-bold text-on-surface hover:bg-surface-light-grey"
                    >
                      Pre-Alert
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
