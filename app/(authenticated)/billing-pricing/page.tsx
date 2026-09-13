// `/billing-pricing` — Billing & Pricing hub.
//
// Traceability:
//   specs/12-vmi-billing/design.md (VMI CBM ledger, period billing, statements)
//   specs/13-trading-orders-and-pricing/design.md (Trading margin ledger, rate cards)
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation),
//     §2 (typography — font-mono for numeric columns per §9)

import Link from "next/link";
import { BookOpen, FileText, LayoutDashboard, Receipt, Settings } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import {
  getVmiCbmLedgerSummary,
  getVmiDailyBalanceRows,
  listVmiBillingPeriods,
  type VmiBillingPeriodRow,
  type VmiCbmLedgerRow,
} from "@/lib/billing/queries/vmi-ledger";
import {
  getTradingMarginLedger,
  type TradingMarginRow,
} from "@/lib/billing/queries/trading-margin";
import { listParties } from "@/lib/db/queries/parties";
import { listContracts } from "@/lib/actions/contracts";
import { hasTradingPriceInternalVisibility } from "@/lib/rbac/trading-visibility";
import { BillingOverviewTab } from "./_components/BillingOverviewTab";
import { StatementOfAccountTab } from "./_components/StatementOfAccountTab";
import { ConfigurationTab } from "./_components/ConfigurationTab";
import { VmiDailyBalanceLedgerTable } from "./_components/VmiDailyBalanceLedgerTable";
import { TradingMarginLedgerTable } from "./_components/TradingMarginLedgerTable";
import {
  resolveBillingSection,
} from "./_lib/navigation";

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
    section?: string;
    tab?: string;
    subtab?: string;
    month?: string;
    year?: string;
    partyId?: string;
  }>;
}

export default async function BillingPricingPage({ searchParams }: PageProps) {
  const {
    section: sectionParam,
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

  const activeSection = resolveBillingSection(sectionParam, tabParam);
  const ledgerSubtab = subtabParam === "trading" || tabParam === "trading" ? "trading" : "vmi";

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
  const selectedSoaPartyId = partyIdParam ?? "";

  // Fetch data conditionally based on active section
  let vmiSummaryRows: VmiCbmLedgerRow[] = [];
  let vmiSummary: VmiCbmLedgerRow | null = null;
  let vmiDailyRows: Awaited<ReturnType<typeof getVmiDailyBalanceRows>> = [];
  let tradingRows: TradingMarginRow[] = [];
  let billingPeriods: VmiBillingPeriodRow[] = [];
  let contracts: Awaited<ReturnType<typeof listContracts>> = [];

  if (activeSection === "overview") {
    vmiSummaryRows = await getVmiCbmLedgerSummary(selectedMonth, selectedYear);
  } else if (activeSection === "ledger") {
    if (ledgerSubtab === "vmi") {
      vmiSummaryRows = await getVmiCbmLedgerSummary(selectedMonth, selectedYear);
      vmiSummary = vmiSummaryRows.find((s) => s.id === selectedPartyId) ?? vmiSummaryRows[0] ?? null;
      if (selectedPartyId) {
        vmiDailyRows = await getVmiDailyBalanceRows(
          selectedPartyId,
          selectedMonth,
          selectedYear,
        );
      }
    } else {
      tradingRows = await getTradingMarginLedger(
        selectedMonth,
        selectedYear,
        permResult.context,
      );
    }
  } else if (activeSection === "soa") {
    billingPeriods = await listVmiBillingPeriods(selectedSoaPartyId || undefined);
  } else if (activeSection === "configuration") {
    // Configuration contains independent datasets. Keep one unavailable or
    // not-yet-migrated table from taking down the entire Billing workspace.
    const [contractsResult] =
      await Promise.allSettled([
        listContracts(resolver),
      ]);

    if (contractsResult.status === "fulfilled") {
      contracts = contractsResult.value;
    } else {
      console.warn("Billing configuration: contracts unavailable", contractsResult.reason);
    }
  }

  const canSeeMargin = hasTradingPriceInternalVisibility(permResult.context);
  const vmiTotal = vmiSummaryRows.reduce((sum, r) => sum + r.subtotal, 0);

  return (
    <div className="mx-auto max-w-container">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          Billing &amp; Pricing Hub
        </h1>
        <p className="font-body text-body-md text-text-grey">
          Contract-driven pricing rule engine, double-entry billing ledger, VMI daily storage, and Statement of Account archives.
        </p>
      </div>

      {/* Primary Navigation: 4 Core Tabs */}
      <div
        role="tablist"
        aria-label="Billing sections"
        className="mt-6 flex flex-wrap gap-1 border-b border-outline-variant/30"
      >
        {([
          ["overview", "Overview", `/billing-pricing?tab=overview${selectedPartyId ? `&partyId=${selectedPartyId}` : ""}`, LayoutDashboard],
          ["ledger", "Ledger", `/billing-pricing?tab=ledger${selectedPartyId ? `&partyId=${selectedPartyId}` : ""}`, BookOpen],
          ["soa", "Statement of Account (SOA)", `/billing-pricing?tab=soa${selectedPartyId ? `&partyId=${selectedPartyId}` : ""}`, FileText],
          ["configuration", "Configuration", `/billing-pricing?tab=configuration${selectedPartyId ? `&partyId=${selectedPartyId}` : ""}`, Settings],
        ] as const).map(([section, label, href, Icon]) => (
          <Link
            key={section}
            href={href}
            role="tab"
            aria-selected={activeSection === section}
            className={`flex h-11 items-center gap-2 px-4 font-label text-label transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
              activeSection === section
                ? "border-b-2 border-on-surface text-on-surface font-bold"
                : "text-text-grey hover:text-on-surface"
            }`}
          >
            <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeSection === "overview" && (
        <div className="mt-6">
          <BillingOverviewTab
            summaryRows={vmiSummaryRows}
            selectedMonthName={MONTHS[selectedMonth]}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
          />
        </div>
      )}

      {/* Tab 2: Ledger (Storage Ledger & Trading Margin Ledger) */}
      {activeSection === "ledger" && (
        <div className="mt-6 space-y-6">
          {/* Sub-navigation for Ledger */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/billing-pricing?tab=ledger&subtab=vmi${selectedPartyId ? `&partyId=${selectedPartyId}` : ""}&month=${selectedMonth}&year=${selectedYear}`}
              className={`rounded-full px-4 py-1.5 font-label text-body-sm font-semibold transition-colors ${
                ledgerSubtab === "vmi"
                  ? "bg-brand-navy text-surface-white"
                  : "bg-surface-light-grey text-text-grey hover:text-on-surface"
              }`}
            >
              VMI Storage Ledger
            </Link>
            <Link
              href={`/billing-pricing?tab=ledger&subtab=trading${selectedPartyId ? `&partyId=${selectedPartyId}` : ""}&month=${selectedMonth}&year=${selectedYear}`}
              className={`rounded-full px-4 py-1.5 font-label text-body-sm font-semibold transition-colors ${
                ledgerSubtab === "trading"
                  ? "bg-brand-navy text-surface-white"
                  : "bg-surface-light-grey text-text-grey hover:text-on-surface"
              }`}
            >
              Trading Margin Ledger
            </Link>
          </div>

          {/* Period & Customer Filters */}
          <form method="GET" className="flex flex-wrap items-end gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
            <input type="hidden" name="tab" value="ledger" />
            <input type="hidden" name="subtab" value={ledgerSubtab} />

            {ledgerSubtab === "vmi" && (
              <div className="flex flex-col gap-1 min-w-[220px]">
                <label htmlFor="partyId" className="font-label text-label font-bold text-text-grey">
                  Organization (Customer)
                </label>
                <select
                  id="partyId"
                  name="partyId"
                  defaultValue={selectedPartyId}
                  className="h-11 rounded-lg border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
                className="h-11 rounded-lg border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
                className="h-11 rounded-lg border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
              className="flex h-11 items-center justify-center rounded-lg bg-brand-navy px-5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 transition-colors"
            >
              Filter
            </button>
          </form>

          {ledgerSubtab === "vmi" ? (
            <>
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
                <h2 className="font-heading font-semibold text-headline-md text-on-surface">
                  {MONTHS[selectedMonth]} {selectedYear} — Storage Summary
                </h2>
                <p className="mt-1 font-body text-body-sm text-text-grey">
                  Storage accrual is summed from the immutable daily balance ledger.
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
                      Storage Accrual Reference
                    </p>
                    <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
                      ${vmiTotal.toFixed(2)}
                    </p>
                    <p className="mt-0.5 font-body text-body-sm text-text-grey">
                      Official total is fixed at period close
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
          ) : (
            <TradingMarginLedgerTable
              rows={tradingRows}
              hasMarginView={canSeeMargin}
            />
          )}
        </div>
      )}

      {/* Tab 3: SOA (Statement of Account Archives & Close Period) */}
      {activeSection === "soa" && (
        <div className="mt-6">
          <StatementOfAccountTab
            periods={billingPeriods}
            parties={partyOptions}
            selectedPartyId={selectedSoaPartyId}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        </div>
      )}


      {/* Tab 4: Configuration (Contract Terms, Trading Rate Cards & Logistics Rate Matrix) */}
      {activeSection === "configuration" && (
        <div className="mt-6">
          <ConfigurationTab
            contracts={contracts}
          />
        </div>
      )}

    </div>
  );
}
