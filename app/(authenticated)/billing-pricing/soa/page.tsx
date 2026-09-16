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
import { SoaDirectoryClient } from "./_components/SoaDirectoryClient";

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

      {/* Statements Directory & Historical Tables with Editable Status */}
      <SoaDirectoryClient
        displayedParties={displayedParties.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
        }))}
        vmiSummaries={vmiSummaries.map((s) => ({
          id: s.id,
          avgDailyCbm: s.avgDailyCbm,
          subtotal: s.subtotal,
        }))}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        monthName={MONTHS[selectedMonth]}
        selectedParty={
          selectedParty
            ? {
                id: selectedParty.id,
                name: selectedParty.name,
                code: selectedParty.code,
              }
            : undefined
        }
      />
    </div>
  );
}

