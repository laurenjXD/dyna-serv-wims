"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FileText, Download, CheckCircle2, AlertCircle, Plus, Calendar, Eye } from "lucide-react";
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
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header bar with Close Period Trigger */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div>
          <h2 className="font-heading text-heading-md font-bold text-on-surface">
            Statements of Account (SOA Archive)
          </h2>
          <p className="font-body text-body-sm text-text-grey">
            Official monthly statements, daily CBM computation sheets, handling summaries, and LOA packages.
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

      {/* Statements Directory Table */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {periods.length === 0 ? (
          <div className="py-12 text-center text-text-grey">
            <FileText size={40} className="mx-auto mb-2 opacity-40" />
            <p className="font-body text-body-md">No Statement of Account records found.</p>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Select an organization and click &quot;Close Period &amp; Generate SOA&quot; to issue a statement.
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
                {periods.map((p) => (
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
