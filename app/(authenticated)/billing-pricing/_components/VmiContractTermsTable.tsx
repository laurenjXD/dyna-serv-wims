"use client";

import React, { useState, useMemo } from "react";
import {
  Plus,
  FileText,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import type { VmiContractTermsRow } from "@/lib/db/queries/vmi-contracts";
import { VmiContractTermsModal } from "../vmi/contracts/_components/VmiContractTermsModal";

type Option = { id: string; name: string; code: string };

interface Props {
  rows: VmiContractTermsRow[];
  parties: Option[];
}

type SortField =
  | "partyName"
  | "storageRatePerCbmDay"
  | "handlingInRatePerCbm"
  | "handlingOutRatePerCbm"
  | "documentationDefaultRateUsd"
  | "billingTiming"
  | "isActive"
  | "effectiveFrom";

type SortDirection = "asc" | "desc";

export function VmiContractTermsTable({ rows, parties }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("partyName");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

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
        // Status filter
        if (statusFilter === "active" && !row.isActive) return false;
        if (statusFilter === "superseded" && row.isActive) return false;

        // Omni search
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const searchCorpus = `${row.partyCode} ${row.partyName} ${row.billingTiming} ${row.billingCurrency}`.toLowerCase();
        return searchCorpus.includes(q);
      })
      .sort((a, b) => {
        if (
          sortField === "storageRatePerCbmDay" ||
          sortField === "handlingInRatePerCbm" ||
          sortField === "handlingOutRatePerCbm" ||
          sortField === "documentationDefaultRateUsd"
        ) {
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
  }, [rows, searchQuery, statusFilter, sortField, sortDir]);

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
            <FileText size={20} className="text-brand-navy" />
            VMI Contract Terms (vmi_contract_terms)
          </h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Configured storage rates ($/CBM/day), handling IN/OUT rates, doc fees, and billing currency per VMI Organization.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded bg-primary px-4 font-label text-label font-bold text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          <Plus size={18} />
          Configure VMI Contract
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
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by organization code, name, timing…"
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
          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
            <span className="font-label text-label-xs uppercase text-text-grey">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="superseded">Superseded Only</option>
            </select>
          </div>

          {(searchQuery || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
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
        <span>Showing <strong className="text-on-surface">{filteredAndSortedRows.length}</strong> contract terms</span>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {filteredAndSortedRows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              No VMI Contract Terms match your search/filter.
            </p>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Click <strong>&quot;Configure VMI Contract&quot;</strong> above to define storage and handling rates for a VMI Organization.
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
                      <span>Organization</span>
                      {renderSortIcon("partyName")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("storageRatePerCbmDay")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Storage Rate ($/m³/day)</span>
                      {renderSortIcon("storageRatePerCbmDay")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("handlingInRatePerCbm")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Handling IN ($/m³)</span>
                      {renderSortIcon("handlingInRatePerCbm")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("handlingOutRatePerCbm")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Handling OUT ($/m³)</span>
                      {renderSortIcon("handlingOutRatePerCbm")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("documentationDefaultRateUsd")}
                      className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Doc Fee ($/AR)</span>
                      {renderSortIcon("documentationDefaultRateUsd")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("billingTiming")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Timing</span>
                      {renderSortIcon("billingTiming")}
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
                {filteredAndSortedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/40">
                    <td className="px-4 py-3 font-body text-body-md text-on-surface font-semibold">
                      {row.partyCode} — {row.partyName}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface text-right">
                      ${parseFloat(row.storageRatePerCbmDay).toFixed(4)}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right">
                      ${parseFloat(row.handlingInRatePerCbm).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right">
                      ${parseFloat(row.handlingOutRatePerCbm).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right">
                      ${parseFloat(row.documentationDefaultRateUsd).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-text-grey capitalize">
                      {row.billingTiming.replace(/_/g, " ")}
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
          </div>
        )}
      </div>

      <VmiContractTermsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        parties={parties}
      />
    </div>
  );
}
