"use client";

import React from "react";
import Link from "next/link";
import { Building2, Package, Layers, Calendar, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import type { VmiCbmLedgerRow } from "@/lib/billing/queries/vmi-ledger";

interface BillingOverviewTabProps {
  summaryRows: VmiCbmLedgerRow[];
  selectedMonthName: string;
  selectedYear: number;
  selectedMonth: number;
}

export function BillingOverviewTab({
  summaryRows,
  selectedMonthName,
  selectedYear,
  selectedMonth,
}: BillingOverviewTabProps) {
  const totalOrgs = summaryRows.length;
  const totalLots = summaryRows.reduce((sum, r) => sum + r.lotsInStorage, 0);
  const totalAvgCbm = summaryRows.reduce((sum, r) => sum + r.avgDailyCbm, 0);
  const totalAccruedStorage = summaryRows.reduce((sum, r) => sum + r.subtotal, 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-label font-bold text-text-grey uppercase tracking-wider">
              Active Clients in Storage
            </span>
            <Building2 className="text-brand-navy" size={20} />
          </div>
          <div className="mt-2 font-heading text-headline-md font-extrabold text-on-surface">
            {totalOrgs}
          </div>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Organizations with stored inventory
          </p>
        </div>

        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-label font-bold text-text-grey uppercase tracking-wider">
              Total Storage Footprint
            </span>
            <Layers className="text-brand-blue" size={20} />
          </div>
          <div className="mt-2 font-heading text-headline-md font-extrabold text-on-surface">
            {totalAvgCbm.toFixed(2)} <span className="text-body-md font-normal text-text-grey">CBM</span>
          </div>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Average daily occupied volume ({selectedMonthName})
          </p>
        </div>

        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-label font-bold text-text-grey uppercase tracking-wider">
              Active Lots In Warehouse
            </span>
            <Package className="text-status-available" size={20} />
          </div>
          <div className="mt-2 font-heading text-headline-md font-extrabold text-on-surface">
            {totalLots.toLocaleString()}
          </div>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Physical lots on warehouse shelves
          </p>
        </div>

        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-label font-bold text-text-grey uppercase tracking-wider">
              Accrued Storage Fees
            </span>
            <Calendar className="text-brand-navy" size={20} />
          </div>
          <div className="mt-2 font-heading text-headline-md font-extrabold text-on-surface">
            ${totalAccruedStorage.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Estimated MTD storage revenue ({selectedMonthName} {selectedYear})
          </p>
        </div>
      </div>

      {/* Organization Status & Storage Snapshot */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="font-heading text-heading-md font-bold text-on-surface">
              Client Storage &amp; Billing Overview
            </h2>
            <p className="font-body text-body-sm text-text-grey">
              Warehouse space occupancy and billing status for {selectedMonthName} {selectedYear}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-surface-light-grey px-3 py-1.5 font-label text-label text-text-grey">
            <CheckCircle2 size={16} className="text-status-available" />
            <span>Daily CBM Replay Active</span>
          </div>
        </div>

        {summaryRows.length === 0 ? (
          <div className="py-12 text-center text-text-grey">
            <Package size={40} className="mx-auto mb-2 opacity-40" />
            <p className="font-body text-body-md">No storage balance data recorded for {selectedMonthName} {selectedYear}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 text-left font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Client Organization
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Active Lots
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Avg Daily CBM
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Storage Rate ($/CBM)
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Accrued Storage (USD)
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label font-bold uppercase tracking-wider text-text-grey">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 font-body text-body-md text-on-surface">
                {summaryRows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-heading font-bold text-on-surface">{row.party}</div>
                      <div className="font-mono text-mono-sm text-text-grey">ID: {row.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-mono-md">
                      {row.lotsInStorage.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-mono-md font-medium">
                      {row.avgDailyCbm.toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-mono-md text-text-grey">
                      ${row.ratePerCbm.toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-mono-md font-bold text-brand-navy">
                      ${row.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/billing-pricing?tab=ledger&partyId=${row.id}&month=${selectedMonth}&year=${selectedYear}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-label text-label font-bold text-brand-navy hover:bg-background transition-colors"
                        >
                          View Ledger <ArrowRight size={14} />
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
