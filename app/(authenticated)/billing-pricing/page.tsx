// `/billing-pricing` — Billing & Pricing hub.
//
// Traceability:
//   specs/12-vmi-billing/design.md (VMI CBM ledger, period billing, statements)
//   specs/13-trading-orders-and-pricing/design.md (Trading margin ledger, rate cards)
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation),
//     §2 (typography — font-mono for numeric columns per §9)

import Link from "next/link";
import { Receipt } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import {
  getVmiCbmLedgerSummary,
  getVmiDailyBalanceRows,
  type VmiCbmLedgerRow,
} from "@/lib/billing/queries/vmi-ledger";
import {
  getTradingMarginLedger,
  type TradingMarginRow,
} from "@/lib/billing/queries/trading-margin";
import {
  listTradingPolicies,
  type TradingPolicyRow,
} from "@/lib/db/queries/trading-policies";
import {
  listVmiContractTerms,
  type VmiContractTermsRow,
} from "@/lib/db/queries/vmi-contracts";
import { listParties } from "@/lib/db/queries/parties";
import { listItems } from "@/lib/db/queries/items";
import { hasTradingPriceInternalVisibility } from "@/lib/rbac/trading-visibility";
import { VmiDailyBalanceLedgerTable } from "./_components/VmiDailyBalanceLedgerTable";
import { VmiContractTermsTable } from "./_components/VmiContractTermsTable";
import { TradingMarginLedgerTable } from "./_components/TradingMarginLedgerTable";
import { TradingRateCardsTable } from "./_components/TradingRateCardsTable";

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
    month?: string;
    year?: string;
    partyId?: string;
  }>;
}

export default async function BillingPricingPage({ searchParams }: PageProps) {
  const {
    tab: tabParam,
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

  const activeTab =
    tabParam === "trading"
      ? "trading"
      : tabParam === "policies"
      ? "policies"
      : tabParam === "vmi-contracts"
      ? "vmi-contracts"
      : "vmi";

  const currentYear = new Date().getFullYear();
  const selectedMonth = monthParam ? parseInt(monthParam, 10) : new Date().getMonth();
  const selectedYear = yearParam ? parseInt(yearParam, 10) : currentYear;

  // Fetch VMI parties list for dropdown selection
  const partiesResult = await listParties(db, { limit: 100 });
  const partyOptions = partiesResult.rows.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
  }));
  const selectedPartyId = partyIdParam ?? partyOptions[0]?.id ?? "";

  // Fetch data for active tab
  let vmiSummaryRows: VmiCbmLedgerRow[] = [];
  let vmiSummary: VmiCbmLedgerRow | null = null;
  let vmiDailyRows: Awaited<ReturnType<typeof getVmiDailyBalanceRows>> = [];
  let vmiContractRows: VmiContractTermsRow[] = [];
  let tradingRows: TradingMarginRow[] = [];
  let policyRows: TradingPolicyRow[] = [];
  let itemOptions: { id: string; name: string; code: string }[] = [];

  if (activeTab === "vmi") {
    vmiSummaryRows = await getVmiCbmLedgerSummary(selectedMonth, selectedYear);
    vmiSummary = vmiSummaryRows.find((s) => s.id === selectedPartyId) ?? vmiSummaryRows[0] ?? null;
    if (selectedPartyId) {
      vmiDailyRows = await getVmiDailyBalanceRows(
        selectedPartyId,
        selectedMonth,
        selectedYear,
      );
    }
  } else if (activeTab === "vmi-contracts") {
    vmiContractRows = await listVmiContractTerms(db);
  } else if (activeTab === "trading") {
    tradingRows = await getTradingMarginLedger(
      selectedMonth,
      selectedYear,
      permResult.context,
    );
  } else if (activeTab === "policies") {
    const result = await listTradingPolicies(db, { activeOnly: false });
    policyRows = result.rows;
    const itemsResult = await listItems(db, { limit: 100 });
    itemOptions = itemsResult.rows.map((i) => ({
      id: i.id,
      name: i.name,
      code: i.code,
    }));
  }

  const canSeeMargin = hasTradingPriceInternalVisibility(permResult.context);
  const vmiTotal = vmiSummaryRows.reduce((sum, r) => sum + r.subtotal, 0);

  return (
    <div className="mx-auto max-w-container">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
            Billing &amp; Pricing Hub
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Contract-driven pricing rule engine, double-entry billing ledger, VMI daily storage, Trading rate cards, and SOA statements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/billing-pricing/soa/sample"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2.5 font-body text-body-sm font-bold text-text-primary hover:bg-background shadow-sm transition-colors"
          >
            Statement of Account (SOA)
          </Link>
          <Link
            href="/billing-pricing/contracts"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 font-body text-body-sm font-bold text-white shadow-md hover:bg-primary-hover transition-colors"
          >
            Commercial Contracts (14-Tab Rate Cards)
          </Link>
        </div>
      </div>


      {/* Primary Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Billing sections"
        className="mt-6 flex flex-wrap gap-1 border-b border-outline-variant/30"
      >
        <Link
          href="/billing-pricing?tab=vmi"
          role="tab"
          aria-selected={activeTab === "vmi"}
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
            activeTab === "vmi"
              ? "border-b-2 border-on-surface text-on-surface font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          VMI Storage Ledger
        </Link>
        <Link
          href="/billing-pricing?tab=trading"
          role="tab"
          aria-selected={activeTab === "trading"}
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
            activeTab === "trading"
              ? "border-b-2 border-on-surface text-on-surface font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          Trading Margin Ledger
        </Link>
        <Link
          href="/billing-pricing/contracts"
          role="tab"
          aria-selected={false}
          className="flex h-11 items-center px-4 font-label text-label text-brand-blue font-bold hover:text-brand-blue-dark transition-colors duration-150"
        >
          Commercial Contracts (14-Tab Rate Cards) &rarr;
        </Link>
        <Link
          href="/billing-pricing/soa/sample"
          role="tab"
          aria-selected={false}
          className="flex h-11 items-center px-4 font-label text-label text-text-grey hover:text-on-surface transition-colors duration-150"
        >
          Statement of Account (SOA)
        </Link>
      </div>


      {/* Main Content Area */}
      <div className="mt-5 space-y-5">
        {/* Controls / Period filters for VMI and Trading */}
        {(activeTab === "vmi" || activeTab === "trading") && (
          <form method="GET" className="flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
            <input type="hidden" name="tab" value={activeTab} />
            
            {activeTab === "vmi" && (
              <div className="flex flex-col gap-1 min-w-[200px]">
                <label htmlFor="partyId" className="font-label text-label font-bold text-text-grey">
                  Organization (Customer)
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
                Month
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
              <select
                id="year"
                name="year"
                defaultValue={selectedYear}
                className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                {[selectedYear - 1, selectedYear, selectedYear + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="flex h-11 items-center justify-center rounded bg-brand-navy px-5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90"
            >
              Filter
            </button>
          </form>
        )}

        {/* VMI Tab: Read-Only Reference Summary Card & CBM Ledger Table */}
        {activeTab === "vmi" && (
          <>
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
              <h2 className="font-heading font-semibold text-headline-md text-on-surface">
                {MONTHS[selectedMonth]} {selectedYear} — Summary
              </h2>
              <p className="mt-1 font-body text-body-sm text-text-grey">
                VMI amounts are period averages — reference only, not your final bill.
                The real VMI invoice is the period average from{" "}
                <span className="font-mono text-mono-md">vmi_cbm_ledger</span>.
              </p>

              <div className="mt-4 flex flex-wrap gap-6">
                <div>
                  <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    CBM Usage (avg/day)
                  </p>
                  <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
                    {vmiSummaryRows.reduce((s, r) => s + r.avgDailyCbm, 0).toFixed(1)} m³
                  </p>
                </div>
                <div>
                  <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Parties Billed
                  </p>
                  <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
                    {vmiSummaryRows.length}
                  </p>
                </div>
                <div>
                  <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Projected Billing Total
                  </p>
                  <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
                    ${vmiTotal.toFixed(2)}
                  </p>
                  <p className="mt-0.5 font-body text-body-sm text-text-grey">
                    Reference amount, not your final bill
                  </p>
                </div>
              </div>
            </div>

            <VmiDailyBalanceLedgerTable
              summary={vmiSummary}
              dailyRows={vmiDailyRows}
              parties={partyOptions}
              selectedPartyId={selectedPartyId}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </>
        )}

        {/* VMI Contract Terms Tab */}
        {activeTab === "vmi-contracts" && (
          <VmiContractTermsTable
            rows={vmiContractRows}
            parties={partyOptions}
          />
        )}

        {/* Trading Margin Ledger Tab */}
        {activeTab === "trading" && (
          <TradingMarginLedgerTable
            rows={tradingRows}
            hasMarginView={canSeeMargin}
          />
        )}

        {/* Trading Rate Cards Tab */}
        {activeTab === "policies" && (
          <TradingRateCardsTable
            rows={policyRows}
            parties={partyOptions}
            items={itemOptions}
          />
        )}
      </div>
    </div>
  );
}
