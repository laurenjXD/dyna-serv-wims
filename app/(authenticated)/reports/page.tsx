// `/reports` — Reports & Analytics dashboard.
//
// Traceability:
//   specs/16-reporting-and-analytics/design.md (KPI cards, inventory activity
//     heatmap, movement history, financial summary)
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation),
//     §2 (typography), §1.3 (status colors)
//
// Surface: Office. Capability gate: reporting.read.
// Financial section gate: reporting.financial_read (supervisor/administrator only).
// Offline: all analytics are Tier 2 — online only, never cached.
// TODO: wire to inventory_transactions query
// TODO: wire financial section to vmi_cbm_ledger + pick_list_items pricing query

import { BarChart2, Download, TrendingUp, Package } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { MovementChart, type MovementChartDatum } from "@/components/reporting/MovementChart";

// ─── Mock data ────────────────────────────────────────────────────────────────
// TODO: wire to inventory_transactions query

const MOCK_MOVEMENTS = [
  {
    id: "txn-001",
    date: "2026-08-09",
    type: "Receiving",
    item: "Industrial Grade Bearing 6205",
    lot: "LOT-2026-001",
    qty: 200,
    party: "Acme Logistics Co.",
    flow: "VMI",
    reference: "WRR-2026-001",
  },
  {
    id: "txn-002",
    date: "2026-08-08",
    type: "Picking",
    item: "Hydraulic Seal Kit 75mm",
    lot: "LOT-2026-003",
    qty: 12,
    party: "Nexus Distribution Ltd.",
    flow: "Trading",
    reference: "PL-2026-002",
  },
  {
    id: "txn-003",
    date: "2026-08-07",
    type: "Transfer",
    item: "O-Ring Assortment Pack",
    lot: "LOT-2026-005",
    qty: 50,
    party: "—",
    flow: "Supplies",
    reference: "TRF-2026-001",
  },
  {
    id: "txn-004",
    date: "2026-08-06",
    type: "Receiving",
    item: "Pneumatic Cylinder 50mm Bore",
    lot: "LOT-2026-002",
    qty: 30,
    party: "Global Parts Inc.",
    flow: "VMI",
    reference: "WRR-2026-002",
  },
  {
    id: "txn-005",
    date: "2026-08-05",
    type: "Picking",
    item: "Industrial Grade Bearing 6205",
    lot: "LOT-2026-001",
    qty: 24,
    party: "Acme Logistics Co.",
    flow: "VMI",
    reference: "PL-2026-001",
  },
];

// ─── KPI card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  subtext?: string;
}

function KpiCard({ label, value, icon, subtext }: KpiCardProps) {
  return (
    <div className="min-w-[200px] flex-1 rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-shadow hover:shadow-elevation-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
            {label}
          </p>
          <p className="mt-3 font-heading text-headline-lg font-extrabold text-on-surface">
            {value}
          </p>
          {subtext && (
            <p className="mt-1 font-body text-body-sm text-text-grey">{subtext}</p>
          )}
        </div>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-navy/5 text-brand-navy"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const { filter: filterParam } = await searchParams;

  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <BarChart2
          size={40}
          className="mx-auto mb-3 text-text-grey"
          aria-hidden="true"
        />
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view reports.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">reporting.read</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  // Check for financial access — reporting.financial_read (supervisor/administrator)
  const financialPermResult = await requirePermission(
    resolver,
    "reporting.financial_read",
  );
  const hasFinancialAccess = financialPermResult.kind === "authorized";

  const activeFilter = filterParam ?? "all";

  // Movements per day, most recent last — derived from the same mock feed
  // as the table below (TODO: wire to inventory_transactions once the real
  // aggregation query lands, same as the table).
  const movementChartData: MovementChartDatum[] = Object.values(
    MOCK_MOVEMENTS.reduce<Record<string, MovementChartDatum>>((acc, txn) => {
      const entry = acc[txn.date] ?? {
        date: txn.date,
        label: new Date(txn.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        count: 0,
      };
      entry.count += 1;
      acc[txn.date] = entry;
      return acc;
    }, {}),
  ).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="mx-auto max-w-container px-6 py-8 lg:px-8">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          Reports &amp; Analytics
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Inventory activity, movement history, and KPI overview.
        </p>
      </div>

      {/* KPI cards — flex-wrap row per spec */}
      <div className="mt-6 flex flex-wrap gap-4">
        <KpiCard
          label="Total Inventory Value (VMI)"
          value="$0.00"
          icon={<TrendingUp size={18} />}
          subtext="Period average — not per-document total"
        />
        <KpiCard
          label="Active Lots"
          value="0"
          icon={<Package size={18} />}
        />
        <KpiCard
          label="Transactions This Month"
          value="0"
          icon={<BarChart2 size={18} />}
        />
        <KpiCard
          label="Avg CBM Utilization"
          value="0%"
          icon={<TrendingUp size={18} />}
          subtext="Current period"
        />
      </div>

      {/* Movement Trend — real recharts bar chart, most recent day highlighted
          in brand-red per §9's "one accent, used sparingly" dashboard rule. */}
      <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
        <h2 className="font-heading font-semibold text-headline-md text-on-surface">
          Movement Trend
        </h2>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          Transactions per day across all flows
        </p>
        <MovementChart data={movementChartData} />
      </div>

      {/* Activity Heatmap */}
      <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading font-semibold text-headline-md text-on-surface">
            Inventory Activity (52 Weeks)
          </h2>

          {/* Filter chips */}
          <div className="flex gap-2">
            {(["all", "VMI", "Trading", "Supplies"] as const).map((f) => (
              <a
                key={f}
                href={`/reports?filter=${f}`}
                className={`flex h-11 items-center rounded-full px-4 font-label text-label motion-safe:transition-colors motion-safe:duration-150 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
                  activeFilter === f
                    ? "bg-brand-navy text-surface-white"
                    : "border border-outline-variant/30 text-text-grey hover:text-on-surface"
                }`}
              >
                {f === "all" ? "All" : f}
              </a>
            ))}
          </div>
        </div>

        {/* Heatmap placeholder — wired from inventory_transactions data */}
        <div className="mt-4 h-32 rounded-xl bg-surface-light-grey" role="img" aria-label="Inventory activity heatmap — not yet wired to data">
          <div className="flex h-full items-center justify-center">
            <p className="font-body text-body-sm text-text-grey">
              Heatmap — wired from <span className="font-mono text-mono-md">inventory_transactions</span> data
            </p>
          </div>
        </div>
      </div>

      {/* Movement History table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {/* Table header row with export button */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
          <h2 className="font-heading font-semibold text-headline-md text-on-surface">
            Movement History
          </h2>
          <button
            type="button"
            className="flex h-11 items-center gap-2 rounded-xl border border-outline-variant/30 px-4 font-body text-body-md text-on-surface motion-safe:transition-colors motion-safe:duration-150 hover:border-brand-navy hover:text-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            aria-label="Export movement history"
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
                  Date
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Type
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
                  Party
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Flow
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Reference
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {/* TODO: wire to inventory_transactions query */}
              {MOCK_MOVEMENTS.map((txn) => (
                <tr key={txn.id} className="hover:bg-surface-light-grey/50">
                  <td className="px-4 py-3 font-body text-body-md text-text-grey">
                    {txn.date}
                  </td>
                  <td className="px-4 py-3 font-body text-body-md text-on-surface">
                    {txn.type}
                  </td>
                  <td className="px-4 py-3 font-body text-body-md text-on-surface">
                    {txn.item}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {txn.lot}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {txn.qty}
                  </td>
                  <td className="px-4 py-3 font-body text-body-md text-on-surface">
                    {txn.party}
                  </td>
                  <td className="px-4 py-3 font-body text-body-md text-text-grey">
                    {txn.flow}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {txn.reference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial summary — shown only if reporting.financial_read */}
      {hasFinancialAccess && (
        <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
          <h2 className="font-heading font-semibold text-headline-md text-on-surface">
            Financial Summary
          </h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            VMI amounts shown are period averages — reference only, not per-document
            totals. Trading amounts are final invoice figures.
          </p>

          <div className="mt-4 flex flex-wrap gap-6">
            {/* VMI billing total */}
            <div className="flex-1">
              <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                VMI Billing Total (Period)
              </p>
              <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
                $0.00
              </p>
              <p className="mt-0.5 font-body text-body-sm text-text-grey">
                Reference amount, not your final bill
              </p>
              {/* TODO: wire to vmi_cbm_ledger + pick_list_items pricing query */}
            </div>

            {/* Trading margin total */}
            <div className="flex-1">
              <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Trading Gross Margin (Period)
              </p>
              <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
                $0.00
              </p>
              <p className="mt-0.5 font-body text-body-sm text-text-grey">
                Revenue minus COGS across all Trading orders
              </p>
              {/* TODO: wire to pick_list_items pricing query */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
