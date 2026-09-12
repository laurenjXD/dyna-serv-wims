// `/billing-pricing` — Billing & Pricing hub.
//
// Restructured to provide a cohesive 4-section workspace:
//   1. Overview (Storage snapshot & active client metrics)
//   2. Storage & Movement Ledger (Daily CBM replay + Monthly Service Charges entry)
//   3. Statement of Account (SOA Archive & Period Close)
//   4. Configuration (Commercial storage/handling contracts & Logistics Rate Matrix)

import Link from "next/link";
import { Receipt, LayoutDashboard, Layers, FileText, Settings, Building2, Calendar } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import {
  getVmiCbmLedgerSummary,
  getVmiDailyBalanceRows,
  listVmiBillingPeriods,
  getVmiChargeLinesForPeriod,
  getVmiManpowerForPeriod,
  monthDateBounds,
} from "@/lib/billing/queries/vmi-ledger";
import { listVmiContractTerms } from "@/lib/db/queries/vmi-contracts";
import { listParties } from "@/lib/db/queries/parties";
import { VmiDailyBalanceLedgerTable } from "./_components/VmiDailyBalanceLedgerTable";
import { BillingOverviewTab } from "./_components/BillingOverviewTab";
import { MonthlyChargesEditor } from "./_components/MonthlyChargesEditor";
import { StatementOfAccountTab } from "./_components/StatementOfAccountTab";
import { ConfigurationTab } from "./_components/ConfigurationTab";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    subtab?: string;
    month?: string;
    year?: string;
    partyId?: string;
  }>;
}

export default async function BillingPricingPage({ searchParams }: PageProps) {
  const {
    tab: tabParam,
    subtab: subtabParam,
    month: monthParam,
    year: yearParam,
    partyId: partyIdParam,
  } = await searchParams;

  const resolver = await createPageResolver();
  const permResult = await requirePermission(
    resolver,
    "reporting.financial_read",
  );

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <Receipt
          size={40}
          className="mx-auto mb-3 text-text-grey"
          aria-hidden="true"
        />
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view billing and pricing.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">
            reporting.financial_read
          </span>{" "}
          capability.
        </p>
      </div>
    );
  }

  // Active Tab resolution
  const activeTab =
    tabParam === "ledger" || tabParam === "vmi"
      ? "ledger"
      : tabParam === "soa"
      ? "soa"
      : tabParam === "config" || tabParam === "vmi-contracts" || tabParam === "logistics-rates"
      ? "config"
      : "overview";

  const ledgerSubTab = subtabParam === "charges" ? "charges" : "daily";

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const selectedMonth = monthParam !== undefined ? parseInt(monthParam, 10) : currentMonth;
  const selectedYear = yearParam !== undefined ? parseInt(yearParam, 10) : currentYear;

  // Fetch VMI parties list for dropdown selection
  const partiesResult = await listParties(db, { limit: 100 });
  const partyOptions = partiesResult.rows.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
  }));
  const selectedPartyId = partyIdParam ?? partyOptions[0]?.id ?? "";
  const selectedParty = partyOptions.find((p) => p.id === selectedPartyId) ?? partyOptions[0];

  const { start: periodStartDate, end: periodEndDate } = monthDateBounds(selectedMonth, selectedYear);

  // Fetch data
  const summaryRows = await getVmiCbmLedgerSummary(selectedMonth, selectedYear);
  const selectedSummary = summaryRows.find((s) => s.id === selectedPartyId) ?? summaryRows[0] ?? null;

  let vmiDailyRows: Awaited<ReturnType<typeof getVmiDailyBalanceRows>> = [];
  let chargeLines: Awaited<ReturnType<typeof getVmiChargeLinesForPeriod>> = [];
  let manpowerSummary: Awaited<ReturnType<typeof getVmiManpowerForPeriod>> = {
    hours: 0,
    ratePerHour: 10,
    totalAmountUsd: 0,
    notes: null,
  };
  let billingPeriods: Awaited<ReturnType<typeof listVmiBillingPeriods>> = [];
  let contractRows: Awaited<ReturnType<typeof listVmiContractTerms>> = [];

  if (activeTab === "ledger") {
    if (selectedPartyId) {
      vmiDailyRows = await getVmiDailyBalanceRows(
        selectedPartyId,
        selectedMonth,
        selectedYear,
      );
      chargeLines = await getVmiChargeLinesForPeriod(
        selectedPartyId,
        periodStartDate,
        periodEndDate,
      );
      manpowerSummary = await getVmiManpowerForPeriod(
        selectedPartyId,
        periodStartDate,
        periodEndDate,
      );
    }
  } else if (activeTab === "soa") {
    billingPeriods = await listVmiBillingPeriods();
  } else if (activeTab === "config") {
    contractRows = await listVmiContractTerms(db);
  }

  return (
    <div className="mx-auto max-w-container pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
            Billing &amp; Pricing Hub
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Storage occupancy replay, handling throughput, monthly service charges, and Statement of Account (SOA) packages.
          </p>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Billing sections"
        className="mt-6 flex flex-wrap gap-1 border-b border-outline-variant/30"
      >
        <Link
          href={`/billing-pricing?tab=overview&month=${selectedMonth}&year=${selectedYear}${selectedPartyId ? `&partyId=${selectedPartyId}` : ""}`}
          role="tab"
          aria-selected={activeTab === "overview"}
          className={`flex h-11 items-center gap-2 px-4 font-label text-label transition-colors duration-150 focus:outline-none ${
            activeTab === "overview"
              ? "border-b-2 border-brand-navy text-brand-navy font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          <LayoutDashboard size={16} /> Overview
        </Link>
        <Link
          href={`/billing-pricing?tab=ledger&month=${selectedMonth}&year=${selectedYear}${selectedPartyId ? `&partyId=${selectedPartyId}` : ""}`}
          role="tab"
          aria-selected={activeTab === "ledger"}
          className={`flex h-11 items-center gap-2 px-4 font-label text-label transition-colors duration-150 focus:outline-none ${
            activeTab === "ledger"
              ? "border-b-2 border-brand-navy text-brand-navy font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          <Layers size={16} /> Storage &amp; Movement Ledger
        </Link>
        <Link
          href={`/billing-pricing?tab=soa&month=${selectedMonth}&year=${selectedYear}${selectedPartyId ? `&partyId=${selectedPartyId}` : ""}`}
          role="tab"
          aria-selected={activeTab === "soa"}
          className={`flex h-11 items-center gap-2 px-4 font-label text-label transition-colors duration-150 focus:outline-none ${
            activeTab === "soa"
              ? "border-b-2 border-brand-navy text-brand-navy font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          <FileText size={16} /> Statement of Account (SOA)
        </Link>
        <Link
          href={`/billing-pricing?tab=config&month=${selectedMonth}&year=${selectedYear}${selectedPartyId ? `&partyId=${selectedPartyId}` : ""}`}
          role="tab"
          aria-selected={activeTab === "config"}
          className={`flex h-11 items-center gap-2 px-4 font-label text-label transition-colors duration-150 focus:outline-none ${
            activeTab === "config"
              ? "border-b-2 border-brand-navy text-brand-navy font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          <Settings size={16} /> Configuration
        </Link>
      </div>

      {/* Main Content Area */}
      <div className="mt-6 space-y-6">
        {/* Controls / Period filters for Overview and Ledger */}
        {(activeTab === "overview" || activeTab === "ledger") && (
          <form method="GET" className="flex flex-wrap items-end gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
            <input type="hidden" name="tab" value={activeTab} />
            {activeTab === "ledger" && <input type="hidden" name="subtab" value={ledgerSubTab} />}
            
            {activeTab === "ledger" && (
              <div className="flex flex-col gap-1 min-w-[220px]">
                <label htmlFor="partyId" className="font-label text-label font-bold text-text-grey">
                  Client Organization
                </label>
                <select
                  id="partyId"
                  name="partyId"
                  defaultValue={selectedPartyId}
                  className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  {partyOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="month" className="font-label text-label font-bold text-text-grey">
                Billing Month
              </label>
              <select
                id="month"
                name="month"
                defaultValue={selectedMonth}
                className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="year" className="font-label text-label font-bold text-text-grey">
                Year
              </label>
              <input
                id="year"
                type="number"
                name="year"
                defaultValue={selectedYear}
                min={2020}
                max={2040}
                className="h-11 w-28 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            <button
              type="submit"
              className="h-11 rounded-lg bg-surface-light-grey px-5 font-label text-label font-bold text-on-surface hover:bg-outline-variant/20 transition-colors"
            >
              Filter
            </button>
          </form>
        )}

        {/* Tab 1: Overview */}
        {activeTab === "overview" && (
          <BillingOverviewTab
            summaryRows={summaryRows}
            selectedMonthName={MONTHS[selectedMonth]}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
          />
        )}

        {/* Tab 2: Storage & Movement Ledger */}
        {activeTab === "ledger" && (
          <div className="space-y-6">
            {/* Sub-view switcher: Daily Balance Table vs Monthly Service Charges */}
            <div className="flex gap-2 border-b border-outline-variant/30 pb-3">
              <Link
                href={`/billing-pricing?tab=ledger&subtab=daily&partyId=${selectedPartyId}&month=${selectedMonth}&year=${selectedYear}`}
                className={`rounded-lg px-4 py-2 font-label text-label font-bold transition-colors ${
                  ledgerSubTab === "daily"
                    ? "bg-brand-navy text-white shadow-sm"
                    : "bg-surface-white text-text-grey hover:bg-surface-light-grey border border-outline-variant/30"
                }`}
              >
                Daily CBM Occupancy Ledger
              </Link>
              <Link
                href={`/billing-pricing?tab=ledger&subtab=charges&partyId=${selectedPartyId}&month=${selectedMonth}&year=${selectedYear}`}
                className={`rounded-lg px-4 py-2 font-label text-label font-bold transition-colors ${
                  ledgerSubTab === "charges"
                    ? "bg-brand-navy text-white shadow-sm"
                    : "bg-surface-white text-text-grey hover:bg-surface-light-grey border border-outline-variant/30"
                }`}
              >
                Monthly Service Charges &amp; Manpower Log
              </Link>
            </div>

            {ledgerSubTab === "daily" ? (
              <VmiDailyBalanceLedgerTable
                summary={selectedSummary}
                dailyRows={vmiDailyRows}
                parties={partyOptions}
                selectedPartyId={selectedPartyId}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
              />
            ) : (
              <MonthlyChargesEditor
                partyId={selectedPartyId}
                partyName={selectedParty?.name ?? "Selected Client"}
                periodStartDate={periodStartDate}
                periodEndDate={periodEndDate}
                chargeLines={chargeLines}
                manpowerSummary={manpowerSummary}
              />
            )}
          </div>
        )}

        {/* Tab 3: Statement of Account (SOA) */}
        {activeTab === "soa" && (
          <StatementOfAccountTab
            periods={billingPeriods}
            parties={partyOptions}
            selectedPartyId={selectedPartyId}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        )}

        {/* Tab 4: Configuration */}
        {activeTab === "config" && (
          <ConfigurationTab contractRows={contractRows} parties={partyOptions} />
        )}
      </div>
    </div>
  );
}
