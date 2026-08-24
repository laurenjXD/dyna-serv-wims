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
import { listParties } from "@/lib/db/queries/parties";
import { listItems } from "@/lib/db/queries/items";
import { hasTradingPriceInternalVisibility } from "@/lib/rbac/trading-visibility";
import { VmiDailyBalanceLedgerTable } from "./_components/VmiDailyBalanceLedgerTable";
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
  let vmiSummary: VmiCbmLedgerRow | null = null;
  let vmiDailyRows: Awaited<ReturnType<typeof getVmiDailyBalanceRows>> = [];
  let tradingRows: TradingMarginRow[] = [];
  let policyRows: TradingPolicyRow[] = [];
  let itemOptions: { id: string; name: string; code: string }[] = [];

  if (activeTab === "vmi") {
    const summaries = await getVmiCbmLedgerSummary(selectedMonth, selectedYear);
    vmiSummary = summaries.find((s) => s.id === selectedPartyId) ?? summaries[0] ?? null;
    if (selectedPartyId) {
      vmiDailyRows = await getVmiDailyBalanceRows(
        selectedPartyId,
        selectedMonth,
        selectedYear,
      );
    }
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

  return (
    <div className="mx-auto max-w-container">
      {/* Page Header */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          Billing &amp; Pricing
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          VMI daily balance storage ledger, Trading margin ledger, and Rate Card management.
        </p>
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
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
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
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "trading"
              ? "border-b-2 border-on-surface text-on-surface font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          Trading Margin Ledger
        </Link>
        <Link
          href="/billing-pricing?tab=policies"
          role="tab"
          aria-selected={activeTab === "policies"}
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "policies"
              ? "border-b-2 border-on-surface text-on-surface font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          Rate Cards (Trading)
        </Link>
      </div>

      {/* Main Content Area */}
      <div className="mt-5 space-y-5">
        {/* Controls / Period filters for VMI and Trading */}
        {activeTab !== "policies" && (
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

        {/* Tab Renderers */}
        {activeTab === "vmi" && (
          <VmiDailyBalanceLedgerTable
            summary={vmiSummary}
            dailyRows={vmiDailyRows}
          />
        )}

        {activeTab === "trading" && (
          <TradingMarginLedgerTable
            rows={tradingRows}
            hasMarginView={canSeeMargin}
          />
        )}

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
