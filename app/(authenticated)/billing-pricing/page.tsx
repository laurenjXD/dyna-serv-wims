// `/billing-pricing` — Billing & Pricing hub.
//
// Traceability:
//   specs/12-vmi-billing/design.md (VMI CBM ledger, period billing, statements)
//   specs/13-trading-orders-and-pricing/design.md (Trading margin ledger)
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation),
//     §2 (typography — font-mono for numeric columns per §9)
//
// Surface: Office. Capability gate: reporting.financial_read.
// VMI prices shown are per-release references only — not the final VMI bill.
// The real VMI bill is always the period average (vmi_cbm_ledger).
// Trading prices shown are final.
// Offline: billing data is Tier 2 — online only, never cached.
// TODO: wire VMI tab to vmi_cbm_ledger table query
// TODO: wire Trading tab to pick_list_items pricing query

import Link from "next/link";
import { Download, Printer, Receipt } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";

// ─── Mock data ────────────────────────────────────────────────────────────────

// VMI CBM ledger mock rows
// TODO: wire to vmi_cbm_ledger table query
const MOCK_VMI_ROWS = [
  {
    id: "vmi-001",
    party: "Acme Logistics Co.",
    lotsInStorage: 3,
    avgDailyCbm: 12.4,
    ratePerCbm: 4.5,
    subtotal: 55.8,
  },
  {
    id: "vmi-002",
    party: "Global Parts Inc.",
    lotsInStorage: 5,
    avgDailyCbm: 28.7,
    ratePerCbm: 4.5,
    subtotal: 129.15,
  },
  {
    id: "vmi-003",
    party: "Pacific Supply Group",
    lotsInStorage: 1,
    avgDailyCbm: 3.2,
    ratePerCbm: 4.5,
    subtotal: 14.4,
  },
];

// Trading margin ledger mock rows
// TODO: wire to pick_list_items pricing query
const MOCK_TRADING_ROWS = [
  {
    id: "trd-001",
    orderNumber: "PL-2026-002",
    party: "Nexus Distribution Ltd.",
    item: "Hydraulic Seal Kit 75mm",
    lot: "LOT-2026-003",
    qty: 12,
    sellPrice: 48.0,
    cogs: 32.0,
    marginPct: 33.3,
  },
  {
    id: "trd-002",
    orderNumber: "PL-2026-004",
    party: "Nexus Distribution Ltd.",
    item: "Pneumatic Cylinder 50mm",
    lot: "LOT-2026-002",
    qty: 5,
    sellPrice: 210.0,
    cogs: 145.0,
    marginPct: 30.95,
  },
  {
    id: "trd-003",
    orderNumber: "PL-2026-005",
    party: "Arcadia Industrial",
    item: "Industrial Grade Bearing 6205",
    lot: "LOT-2026-001",
    qty: 50,
    sellPrice: 12.5,
    cogs: 8.2,
    marginPct: 34.4,
  },
];

// Months for period selector
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

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    month?: string;
    year?: string;
  }>;
}

export default async function BillingPricingPage({ searchParams }: PageProps) {
  const {
    tab: tabParam,
    month: monthParam,
    year: yearParam,
  } = await searchParams;

  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

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
          <span className="font-mono text-mono-md">reporting.financial_read</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  const activeTab = tabParam === "trading" ? "trading" : "vmi";
  const currentYear = new Date().getFullYear();
  const selectedMonth = monthParam ? parseInt(monthParam, 10) : new Date().getMonth();
  const selectedYear = yearParam ? parseInt(yearParam, 10) : currentYear;

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          Billing &amp; Pricing
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          VMI period billing and Trading margin ledger.
        </p>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Billing sections" className="mt-6 flex gap-1 border-b border-outline-variant/30">
        <Link
          href="/billing-pricing?tab=vmi"
          role="tab"
          aria-selected={activeTab === "vmi"}
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "vmi"
              ? "border-b-2 border-on-surface text-on-surface"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          VMI Billing
        </Link>
        <Link
          href="/billing-pricing?tab=trading"
          role="tab"
          aria-selected={activeTab === "trading"}
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "trading"
              ? "border-b-2 border-on-surface text-on-surface"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          Trading Margin
        </Link>
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {activeTab === "vmi" ? (
          <VmiBillingTab selectedMonth={selectedMonth} selectedYear={selectedYear} />
        ) : (
          <TradingMarginTab selectedMonth={selectedMonth} selectedYear={selectedYear} />
        )}
      </div>
    </div>
  );
}

// ─── VMI Billing tab ──────────────────────────────────────────────────────────

interface TabProps {
  selectedMonth: number;
  selectedYear: number;
}

function VmiBillingTab({ selectedMonth, selectedYear }: TabProps) {
  const vmiTotal = MOCK_VMI_ROWS.reduce((sum, r) => sum + r.subtotal, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Period selector */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="vmi" />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="vmi-month"
            className="font-label text-label text-text-grey"
          >
            Month
          </label>
          <select
            id="vmi-month"
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
          <label
            htmlFor="vmi-year"
            className="font-label text-label text-text-grey"
          >
            Year
          </label>
          <select
            id="vmi-year"
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
          className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          Apply
        </button>
      </form>

      {/* Summary card */}
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
              {MOCK_VMI_ROWS.reduce((s, r) => s + r.avgDailyCbm, 0).toFixed(1)} m³
            </p>
          </div>
          <div>
            <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
              Daily Storage Rate
            </p>
            <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
              $4.50 / m³
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

      {/* CBM Ledger table */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
          <h2 className="font-heading font-semibold text-headline-md text-on-surface">
            CBM Ledger
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Export VMI statement"
              className="flex h-11 items-center gap-2 rounded-xl border border-outline-variant/30 px-4 font-body text-body-md text-on-surface motion-safe:transition-colors motion-safe:duration-150 hover:border-brand-navy hover:text-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <Download size={16} aria-hidden="true" />
              Export
            </button>
            <button
              type="button"
              aria-label="Print VMI statement"
              className="flex h-11 items-center gap-2 rounded-xl border border-outline-variant/30 px-4 font-body text-body-md text-on-surface motion-safe:transition-colors motion-safe:duration-150 hover:border-brand-navy hover:text-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <Printer size={16} aria-hidden="true" />
              Print
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Party
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Lots in Storage
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Avg Daily CBM (m³)
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Rate ($/m³)
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {/* TODO: wire to vmi_cbm_ledger table query */}
              {MOCK_VMI_ROWS.map((row) => (
                <tr key={row.id} className="hover:bg-surface-light-grey/50">
                  {/* Party name — body font */}
                  <td className="px-4 py-3 font-body text-body-md text-on-surface">
                    {row.party}
                  </td>
                  {/* Numeric columns — Roboto Mono per §9 */}
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {row.lotsInStorage}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {row.avgDailyCbm.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    ${row.ratePerCbm.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    ${row.subtotal.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-outline-variant/30 bg-surface-light-grey">
                <td
                  colSpan={4}
                  className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey"
                >
                  Period Total
                </td>
                <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">
                  ${vmiTotal.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Trading Margin tab ───────────────────────────────────────────────────────

function TradingMarginTab({ selectedMonth, selectedYear }: TabProps) {
  const totalRevenue = MOCK_TRADING_ROWS.reduce(
    (s, r) => s + r.sellPrice * r.qty,
    0,
  );
  const totalCogs = MOCK_TRADING_ROWS.reduce((s, r) => s + r.cogs * r.qty, 0);
  const grossMarginPct =
    totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Period selector */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="trading" />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="trd-month"
            className="font-label text-label text-text-grey"
          >
            Month
          </label>
          <select
            id="trd-month"
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
          <label
            htmlFor="trd-year"
            className="font-label text-label text-text-grey"
          >
            Year
          </label>
          <select
            id="trd-year"
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
          className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          Apply
        </button>
      </form>

      {/* Summary card */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
        <h2 className="font-heading font-semibold text-headline-md text-on-surface">
          {MONTHS[selectedMonth]} {selectedYear} — Summary
        </h2>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          Trading prices shown are final. Revenue, COGS, and margin are per-order totals.
        </p>

        <div className="mt-4 flex flex-wrap gap-6">
          <div>
            <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
              Total Orders
            </p>
            <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
              {MOCK_TRADING_ROWS.length}
            </p>
          </div>
          <div>
            <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
              Total Revenue
            </p>
            <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
              ${totalRevenue.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
              Total COGS
            </p>
            <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
              ${totalCogs.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
              Gross Margin
            </p>
            <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
              {grossMarginPct.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Margin ledger table */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
          <h2 className="font-heading font-semibold text-headline-md text-on-surface">
            Margin Ledger
          </h2>
          <button
            type="button"
            aria-label="Export trading margin ledger"
            className="flex h-11 items-center gap-2 rounded-xl border border-outline-variant/30 px-4 font-body text-body-md text-on-surface motion-safe:transition-colors motion-safe:duration-150 hover:border-brand-navy hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <Download size={16} aria-hidden="true" />
            Export
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Order #
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Party
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Item
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Lot
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Qty
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Sell Price
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  COGS
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Margin %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {/* TODO: wire to pick_list_items pricing query */}
              {MOCK_TRADING_ROWS.map((row) => (
                <tr key={row.id} className="hover:bg-surface-light-grey/50">
                  {/* Order # — Roboto Mono for codes */}
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {row.orderNumber}
                  </td>
                  {/* Party — body font */}
                  <td className="px-4 py-3 font-body text-body-md text-on-surface">
                    {row.party}
                  </td>
                  {/* Item — body font */}
                  <td className="px-4 py-3 font-body text-body-md text-on-surface">
                    {row.item}
                  </td>
                  {/* Lot — Roboto Mono */}
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {row.lot}
                  </td>
                  {/* Numeric columns — Roboto Mono per §9 */}
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {row.qty}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    ${row.sellPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    ${row.cogs.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {row.marginPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
