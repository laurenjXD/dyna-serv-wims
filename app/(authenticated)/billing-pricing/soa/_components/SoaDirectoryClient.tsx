"use client";

import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";

interface PartySummary {
  id: string;
  name: string;
  code: string | null;
}

interface VmiSummary {
  id: string;
  avgDailyCbm: number;
  subtotal: number;
}

interface HistoricalPeriod {
  month: string;
  monthIdx: number;
  year: number;
  status: string;
  tier: string;
}

interface SoaDirectoryClientProps {
  displayedParties: PartySummary[];
  vmiSummaries: VmiSummary[];
  selectedMonth: number;
  selectedYear: number;
  monthName: string;
  selectedParty?: PartySummary;
  initialHistoricalPeriods?: HistoricalPeriod[];
  activePeriodStatuses?: Record<string, string>;
}

function formatPeriodStatus(status?: string): string {
  if (!status) return "Not generated";
  if (status === "voided") return "Voided";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClasses(status?: string): string {
  if (status === "issued") return "bg-blue-50 text-blue-800 border-blue-300";
  if (status === "voided") return "bg-slate-100 text-slate-700 border-slate-300";
  if (status === "draft") return "bg-amber-50 text-amber-800 border-amber-300";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export function SoaDirectoryClient({
  displayedParties,
  vmiSummaries,
  selectedMonth,
  selectedYear,
  monthName,
  selectedParty,
  initialHistoricalPeriods = [],
  activePeriodStatuses = {},
}: SoaDirectoryClientProps) {
  return (
    <div className="space-y-6">
      {/* Customer Statements Grid / Table */}
      <div className="overflow-hidden rounded-card bg-surface-white border border-border-light shadow-card">
        <div className="border-b border-border-light bg-surface-background p-4 flex justify-between items-center">
          <h2 className="font-heading text-heading-sm font-bold text-text-dark">
            Customer Billing Statements &mdash; {monthName} {selectedYear}
          </h2>
          <span className="text-body-xs font-mono text-text-grey">
            {displayedParties.length} {displayedParties.length === 1 ? "Account" : "Accounts"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-light bg-surface-background/60 text-text-grey font-body text-body-xs uppercase tracking-wider">
                <th className="py-3 px-4">Customer Organization</th>
                <th className="py-3 px-4">Account Code</th>
                <th className="py-3 px-4">Billing Currency</th>
                <th className="py-3 px-4 text-right">Avg Daily CBM</th>
                <th className="py-3 px-4 text-right">Est. Storage USD</th>
                <th className="py-3 px-4">Period Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light font-body text-body-sm text-text-dark">
              {displayedParties.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-text-grey">
                    No customer accounts found.
                  </td>
                </tr>
              ) : (
                displayedParties.map((p) => {
                  const vmiSummary = vmiSummaries.find((s) => s.id === p.id);
                  const soaUrl = `/billing-pricing/soa/${p.id}?partyId=${p.id}&month=${selectedMonth}&year=${selectedYear}`;
                  const currentStatus = activePeriodStatuses[p.id];

                  return (
                    <tr key={p.id} className="hover:bg-surface-background/40 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-brand-navy">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-text-grey flex-shrink-0" />
                          <span>{p.name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-mono-sm text-text-grey">
                        {p.code || "—"}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-mono-sm">
                        USD / PHP
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-mono-sm">
                        {vmiSummary ? `${vmiSummary.avgDailyCbm.toFixed(2)} CBM` : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-mono-sm font-bold text-brand-navy">
                        {vmiSummary ? `$${vmiSummary.subtotal.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(currentStatus)}`}>
                          {formatPeriodStatus(currentStatus)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={soaUrl}
                          className="inline-flex items-center gap-1 font-body text-body-xs font-bold text-brand-blue hover:text-brand-blue-hover hover:underline"
                        >
                          View Full SOA Package <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Period Historical Archive for Selected Organization */}
      {selectedParty && (
        <div className="overflow-hidden rounded-card bg-surface-white border border-border-light shadow-card">
          <div className="border-b border-border-light bg-surface-background p-4 flex justify-between items-center">
            <div>
              <h2 className="font-heading text-heading-sm font-bold text-text-dark">
                Historical Statements Archive &mdash; {selectedParty.name}
              </h2>
              <p className="mt-0.5 font-body text-body-xs text-text-grey">
                Permanent Tiered Retention (3 Years Hot in Supabase Database Archive)
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-brand-navy/10 px-2.5 py-0.5 font-mono text-body-xs font-semibold text-brand-navy">
              {initialHistoricalPeriods.length} Periods Available
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-light bg-surface-background/60 text-text-grey font-body text-body-xs uppercase tracking-wider">
                  <th className="py-3 px-4">Billing Period</th>
                  <th className="py-3 px-4">SOA Reference #</th>
                  <th className="py-3 px-4">Retention Tier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light font-body text-body-sm text-text-dark">
                {initialHistoricalPeriods.map((row) => {
                  const key = `${row.year}-${row.monthIdx}`;
                  return (
                    <tr key={key} className="hover:bg-surface-background/40 transition-colors">
                      <td className="py-3 px-4 font-semibold text-text-dark">
                        {row.month}
                      </td>
                      <td className="py-3 px-4 font-mono text-mono-sm text-text-grey">
                        SOA-{row.year}-{String(row.monthIdx + 1).padStart(2, "0")}-{selectedParty.code || "VMI"}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center rounded bg-brand-navy/10 px-2 py-0.5 font-mono text-body-xs text-brand-navy">
                          {row.tier}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(row.status)}`}>
                          {formatPeriodStatus(row.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-3">
                          <Link
                            href={`/billing-pricing?partyId=${selectedParty.id}&month=${row.monthIdx}&year=${row.year}`}
                            className="text-body-xs font-semibold text-text-grey hover:text-text-dark hover:underline"
                          >
                            Ledger
                          </Link>
                          <Link
                            href={`/billing-pricing/soa/${selectedParty.id}?partyId=${selectedParty.id}&month=${row.monthIdx}&year=${row.year}`}
                            className="inline-flex items-center gap-1 text-body-xs font-bold text-brand-blue hover:text-brand-blue-hover hover:underline"
                          >
                            View SOA <ChevronRight size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
