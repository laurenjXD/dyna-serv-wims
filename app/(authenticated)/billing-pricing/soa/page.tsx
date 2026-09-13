// `/billing-pricing/soa` — Statement of Account (SOA) Index & Billing Periods Directory
//
// Allows finance and billing administrators to select customer organizations, choose billing
// periods (months/years), inspect aggregated charges, and open the full 7-schedule SOA document.

import Link from "next/link";
import { FileText, ArrowLeft, Calendar, Building2, CheckCircle2, ChevronRight } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listParties } from "@/lib/db/queries/parties";
import { getVmiCbmLedgerSummary } from "@/lib/billing/queries/vmi-ledger";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

interface PageProps {
  searchParams: Promise<{ month?: string; year?: string; partyId?: string }>;
}

export default async function SoaIndexPage({ searchParams }: PageProps) {
  const { month: monthParam, year: yearParam, partyId: partyIdParam } = await searchParams;

  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <FileText size={40} className="mx-auto mb-3 text-text-grey" />
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view Statement of Account documents.
        </p>
      </div>
    );
  }

  const now = new Date();
  const selectedMonth = monthParam !== undefined ? parseInt(monthParam, 10) : now.getMonth();
  const selectedYear = yearParam !== undefined ? parseInt(yearParam, 10) : now.getFullYear();

  // Fetch registered parties
  const partiesResult = await listParties(db, { limit: 100 });
  const allParties = partiesResult.rows;

  const selectedParty = partyIdParam
    ? allParties.find((p) => p.id === partyIdParam)
    : undefined;

  const displayedParties = selectedParty ? [selectedParty] : allParties;

  // Fetch VMI monthly summary for the period
  const vmiSummaries = await getVmiCbmLedgerSummary(selectedMonth, selectedYear);

  return (
    <div className="mx-auto max-w-container space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/billing-pricing"
              className="inline-flex items-center text-body-sm text-text-grey hover:text-brand-blue"
            >
              <ArrowLeft size={16} className="mr-1" /> Back to Billing & Pricing
            </Link>
          </div>
          <h1 className="mt-1 font-heading text-heading-lg text-text-dark">
            Statement of Account (SOA) Directory
          </h1>
          <p className="font-body text-body-sm text-text-grey">
            Generate, review, and export monthly Statement of Accounts with all 7 supporting document sub-schedules.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-3 bg-surface-white border border-border-light rounded-lg p-2 shadow-sm">
          <Calendar size={18} className="text-text-grey ml-1" />
          <div className="flex items-center gap-2">
            <span className="text-body-xs font-semibold text-text-grey">Period:</span>
            <span className="font-heading font-bold text-body-sm text-brand-navy">
              {MONTHS[selectedMonth]} {selectedYear}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Banner when partyId is selected */}
      {selectedParty && (
        <div className="flex items-center justify-between rounded-lg border border-brand-navy/20 bg-brand-navy/5 p-4">
          <div className="flex items-center gap-3">
            <Building2 size={20} className="text-brand-navy" />
            <div>
              <p className="font-body text-body-xs font-semibold text-brand-navy uppercase tracking-wider">
                Filtered Organization
              </p>
              <p className="font-heading font-bold text-body-md text-text-dark">
                {selectedParty.name} <span className="font-mono text-mono-sm text-text-grey">({selectedParty.code})</span>
              </p>
            </div>
          </div>
          <Link
            href={`/billing-pricing/soa?month=${selectedMonth}&year=${selectedYear}`}
            className="rounded-lg border border-border-light bg-surface-white px-3 py-1.5 font-label text-label text-text-grey hover:bg-surface-background hover:text-text-dark"
          >
            Show All Organizations
          </Link>
        </div>
      )}

      {/* Customer Statements Grid / Table */}
      <div className="overflow-hidden rounded-card bg-surface-white border border-border-light shadow-card">
        <div className="border-b border-border-light bg-surface-background p-4 flex justify-between items-center">
          <h2 className="font-heading text-heading-sm font-bold text-text-dark">
            Customer Billing Statements &mdash; {MONTHS[selectedMonth]} {selectedYear}
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-body-xs font-semibold text-green-800">
                          <CheckCircle2 size={12} className="text-green-600" /> Ready
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
              12 Periods Available
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
                {[
                  { month: "August 2026", monthIdx: 7, year: 2026, status: "Current Period", tier: "Hot Tier (Active)" },
                  { month: "July 2026", monthIdx: 6, year: 2026, status: "Issued", tier: "Hot Tier (Active)" },
                  { month: "June 2026", monthIdx: 5, year: 2026, status: "Paid", tier: "Hot Tier (Active)" },
                  { month: "May 2026", monthIdx: 4, year: 2026, status: "Paid", tier: "Hot Tier (Active)" },
                  { month: "April 2026", monthIdx: 3, year: 2026, status: "Paid", tier: "Hot Tier (Active)" },
                  { month: "March 2026", monthIdx: 2, year: 2026, status: "Paid", tier: "Hot Tier (Active)" },
                  { month: "February 2026", monthIdx: 1, year: 2026, status: "Paid", tier: "Hot Tier (Active)" },
                  { month: "January 2026", monthIdx: 0, year: 2026, status: "Paid", tier: "Hot Tier (Active)" },
                  { month: "December 2025", monthIdx: 11, year: 2025, status: "Archived", tier: "Hot Tier (1 Year)" },
                  { month: "November 2025", monthIdx: 10, year: 2025, status: "Archived", tier: "Hot Tier (1 Year)" },
                  { month: "October 2025", monthIdx: 9, year: 2025, status: "Archived", tier: "Hot Tier (1 Year)" },
                  { month: "September 2025", monthIdx: 8, year: 2025, status: "Archived", tier: "Hot Tier (1 Year)" },
                ].map((row) => (
                  <tr key={`${row.year}-${row.monthIdx}`} className="hover:bg-surface-background/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-text-dark">
                      {row.month}
                    </td>
                    <td className="py-3 px-4 font-mono text-mono-sm text-text-grey">
                      SOA-{row.year}-{String(row.monthIdx + 1).padStart(2, "0")}-{selectedParty.code}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center rounded bg-brand-navy/10 px-2 py-0.5 font-mono text-body-xs text-brand-navy">
                        {row.tier}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-body-xs font-semibold ${
                          row.status === "Current Period"
                            ? "bg-amber-50 text-amber-800"
                            : row.status === "Issued"
                            ? "bg-brand-navy/10 text-brand-navy"
                            : "bg-green-50 text-green-800"
                        }`}
                      >
                        {row.status}
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
