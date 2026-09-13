"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus, Eye, Search, Filter, Building2, Calendar, DollarSign } from "lucide-react";
import type { VmiBillingPeriodRow } from "@/lib/billing/queries/vmi-ledger";
import { PeriodCloseModal } from "../vmi/periods/_components/PeriodCloseModal";

interface StatementOfAccountTabProps {
  periods: VmiBillingPeriodRow[];
  parties: { id: string; name: string; code: string }[];
  selectedPartyId: string;
  selectedMonth: number;
  selectedYear: number;
}

export function StatementOfAccountTab({
  periods,
  parties,
  selectedPartyId,
  selectedMonth,
  selectedYear,
}: StatementOfAccountTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const handlePartyChange = (partyId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "soa");
    if (partyId) {
      params.set("partyId", partyId);
    } else {
      params.delete("partyId");
    }
    router.push(`/billing-pricing?${params.toString()}`);
  };

  const filteredPeriods = useMemo(() => {
    return periods.filter((p) => {
      const matchesStatus = statusFilter === "all" || p.status.toLowerCase() === statusFilter.toLowerCase();
      const matchesSearch =
        !searchQuery.trim() ||
        p.periodNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.partyCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.periodStartDate.includes(searchQuery) ||
        p.periodEndDate.includes(searchQuery);

      return matchesStatus && matchesSearch;
    });
  }, [periods, statusFilter, searchQuery]);

  const totalInvoicedUsd = useMemo(() => {
    return filteredPeriods.reduce((sum, p) => sum + p.billingStatementTotalUsd, 0);
  }, [filteredPeriods]);

  return (
    <div className="space-y-6">
      {/* Header bar with Close Period Trigger */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div>
          <h2 className="font-heading text-heading-md font-bold text-on-surface">
            Statements of Account (SOA Archive &amp; History)
          </h2>
          <p className="font-body text-body-sm text-text-grey">
            Historical billing statements, locked exchange rates, and period settlement records.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCloseModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-label text-label font-bold text-white shadow-md hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} /> Close Period &amp; Generate SOA
        </button>
      </div>

      {/* Period Close Modal */}
      <PeriodCloseModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        parties={parties}
        selectedPartyId={selectedPartyId}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
      />

      {/* Metric Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <span className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
            Statements Found
          </span>
          <p className="mt-1 font-heading text-headline-md font-extrabold text-on-surface">
            {filteredPeriods.length}
          </p>
        </div>

        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <span className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
            Total Billed Volume
          </span>
          <p className="mt-1 font-heading text-headline-md font-extrabold text-brand-navy">
            ${totalInvoicedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <span className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
            Active Filter Scope
          </span>
          <p className="mt-1 font-body text-body-md font-semibold text-on-surface truncate">
            {selectedPartyId ? parties.find((p) => p.id === selectedPartyId)?.name ?? "Selected Client" : "All Client Organizations"}
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
        {/* Organization Filter */}
        <div className="flex flex-col gap-1 min-w-[220px]">
          <label htmlFor="soa-party-select" className="font-label text-label font-bold text-text-grey">
            Organization
          </label>
          <select
            id="soa-party-select"
            value={selectedPartyId}
            onChange={(e) => handlePartyChange(e.target.value)}
            className="h-10 rounded-lg border border-outline-variant/30 bg-surface-white px-3 font-body text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <option value="">All Organizations (Global Archive)</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} - {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label htmlFor="soa-status-select" className="font-label text-label font-bold text-text-grey">
            Status
          </label>
          <select
            id="soa-status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-lg border border-outline-variant/30 bg-surface-white px-3 font-body text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <option value="all">All Statuses</option>
            <option value="issued">Issued</option>
            <option value="draft">Draft</option>
            <option value="closed">Closed</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        {/* Text Search */}
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label htmlFor="soa-search-input" className="font-label text-label font-bold text-text-grey">
            Search Period / Date
          </label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-grey" />
            <input
              id="soa-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by period #, date (e.g. 2026-09), or name..."
              className="h-10 w-full rounded-lg border border-outline-variant/30 bg-surface-white pl-9 pr-3 font-body text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>
        </div>
      </div>

      {/* Statements Directory Table */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {filteredPeriods.length === 0 ? (
          <div className="py-12 text-center text-text-grey">
            <FileText size={40} className="mx-auto mb-2 opacity-40" />
            <p className="font-body text-body-md">No Statement of Account records found matching filters.</p>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Try adjusting your organization or search filters, or click &quot;Close Period &amp; Generate SOA&quot;.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 text-left font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Period #
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Organization
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Billing Date Range
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Statement Total (USD)
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Locked FX (PHP)
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 font-body text-body-md text-on-surface">
                {filteredPeriods.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-light-grey/40 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-mono-md font-bold text-brand-navy">
                      {p.periodNumber}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-heading font-bold text-on-surface">{p.partyName}</div>
                      <div className="font-mono text-mono-sm text-text-grey">{p.partyCode}</div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-sm text-text-grey">
                      {p.periodStartDate} to {p.periodEndDate}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 font-label text-label uppercase ${p.status === "issued" ? "bg-status-available/10 text-status-available" : "bg-status-pending/10 text-status-pending"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-mono-md font-bold text-on-surface">
                      ${p.billingStatementTotalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-mono-md text-text-grey">
                      {p.lockedExchangeRatePhp ? `₱${p.lockedExchangeRatePhp.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/billing-pricing/soa/${p.partyId.slice(0, 8)}?partyId=${p.partyId}&month=${selectedMonth}&year=${selectedYear}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-label text-label font-bold text-brand-navy hover:bg-background transition-colors"
                        >
                          <Eye size={14} /> View SOA Schedule
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

