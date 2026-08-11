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

import Link from "next/link";
import { BarChart2, Check, Download, LockKeyhole, TriangleAlert } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { MovementChart, type MovementChartDatum } from "@/components/reporting/MovementChart";
import { MonthlyFlowChart, type MonthlyFlowDatum } from "@/components/reporting/MonthlyFlowChart";
import { LocationOccupancyChart } from "@/components/reporting/LocationOccupancyChart";

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

const MONTHLY_FLOW: MonthlyFlowDatum[] = [
  { month: "Jan", vmi: 250, trading: 72, supplies: 30 },
  { month: "Feb", vmi: 190, trading: 118, supplies: 42 },
  { month: "Mar", vmi: 250, trading: 138, supplies: 64 },
  { month: "Apr", vmi: 215, trading: 78, supplies: 38 },
  { month: "May", vmi: 290, trading: 145, supplies: 70 },
  { month: "Jun", vmi: 235, trading: 155, supplies: 55 },
  { month: "Jul", vmi: 320, trading: 170, supplies: 88 },
  { month: "Aug", vmi: 270, trading: 135, supplies: 52 },
];

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
          className="mx-auto mb-3 text-on-surface-variant"
          aria-hidden="true"
        />
        <p className="font-body text-body-md text-on-surface-variant">
          You do not have permission to view reports.
        </p>
        <p className="mt-2 font-body text-body-sm text-on-surface-variant">
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
      <div className="mb-6 lg:hidden">
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">Reports &amp; Analytics</h1>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">Inventory activity, movement history, and KPI overview.</p>
      </div>

      {/* Analytics is the financial-accessible surface; the landing page
          remains limited to operational queues per spec 05 R11.5. */}
      <section className="grid gap-6 xl:grid-cols-[1.02fr_1.04fr_1fr]">
        <article className="overflow-hidden rounded-3xl border border-primary/30 bg-primary p-6 shadow-elevation-1">
          <p className="font-label text-label uppercase tracking-[0.06em] text-white/60">Total inventory valuation</p>
          <div className="mt-5 flex items-end justify-between gap-3">
            <p className="font-heading text-headline-xl font-extrabold text-white">
              {hasFinancialAccess ? "$0.00" : "Restricted"}
            </p>
            <span className="rounded-full bg-status-success/20 px-3 py-2 font-label text-label text-status-success">↑ Current</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-4"><p className="font-body text-body-sm text-white/60">VMI</p><p className="mt-2 font-heading text-data-display font-bold text-white">{hasFinancialAccess ? "$0.00" : "—"}</p></div>
            <div className="rounded-2xl bg-white/10 p-4"><p className="font-body text-body-sm text-white/60">Trading</p><p className="mt-2 font-heading text-data-display font-bold text-white">{hasFinancialAccess ? "$0.00" : "—"}</p></div>
          </div>
          {!hasFinancialAccess && <p className="mt-4 flex items-center gap-2 font-body text-body-sm text-white/65"><LockKeyhole size={15} aria-hidden="true" />Financial reporting access required.</p>}
          <div className="mt-6 h-16 rounded-t-full border-t-4 border-action-blue bg-gradient-to-b from-action-blue/20 to-transparent" aria-hidden="true" />
        </article>

        <article className="rounded-3xl border border-outline-variant/30 border-l-[7px] border-l-action-blue bg-white p-6 shadow-elevation-1">
          <p className="font-label text-label uppercase tracking-[0.06em] text-on-surface-variant">Open floor queues</p>
          <div className="mt-6 space-y-4">
            {[['Pending Receiving WRRs', '0'], ['Active Pick Lists to Execute', '0'], ['Items Pending QC Inspection', '0']].map(([label, count]) => (
              <div key={label} className="flex items-center justify-between rounded-2xl bg-surface-dim px-5 py-5">
                <span className="font-heading text-body-md font-semibold text-on-surface">{label}</span>
                <span className="font-heading text-headline-md font-extrabold text-on-surface">{count}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-outline-variant/30 bg-white p-6 shadow-elevation-1">
          <p className="font-label text-label uppercase tracking-[0.06em] text-on-surface-variant">Stock health &amp; quality</p>
          <div className="mt-6 space-y-4">
            <HealthRow icon={<TriangleAlert size={23} />} title="Low stock reorder alerts" detail="No items below reorder level" tone="pending" />
            <HealthRow icon={<LockKeyhole size={23} />} title="Held / quarantined lots" detail="No lots pending release" tone="held" />
            <HealthRow icon={<Check size={23} />} title="QC pass rate (30d)" detail="No inspections recorded yet" tone="available" />
          </div>
        </article>
      </section>

      {/* Quick Access panel */}
      <section className="mt-6 rounded-3xl border border-outline-variant/30 bg-white p-6 shadow-elevation-1">
        <h2 className="font-heading font-semibold text-headline-md text-on-surface">
          Quick Access
        </h2>
        <p className="mt-1 font-body text-body-sm text-on-surface-variant">
          Common workflows and operational queues.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Link
            href="/receiving/new"
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-dim p-4 motion-safe:transition-colors hover:border-primary hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Download size={20} aria-hidden="true" />
            </div>
            <span className="font-label text-label text-on-surface">Receive WRR</span>
          </Link>
          <Link
            href="/transfers/new"
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-dim p-4 motion-safe:transition-colors hover:border-primary hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BarChart2 size={20} aria-hidden="true" />
            </div>
            <span className="font-label text-label text-on-surface">New Transfer</span>
          </Link>
          <Link
            href="/outgoing"
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-dim p-4 motion-safe:transition-colors hover:border-primary hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check size={20} aria-hidden="true" />
            </div>
            <span className="font-label text-label text-on-surface">Pick List Queue</span>
          </Link>
          <Link
            href="/inventory"
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-dim p-4 motion-safe:transition-colors hover:border-primary hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BarChart2 size={20} aria-hidden="true" />
            </div>
            <span className="font-label text-label text-on-surface">Stock View</span>
          </Link>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="rounded-3xl border border-outline-variant/30 bg-white p-6 shadow-elevation-1">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-heading text-headline-md font-bold text-on-surface">Monthly Flow Movement</h2><p className="mt-1 font-body text-body-sm text-on-surface-variant">Inbound receiving vs. outbound dispatch by flow type</p></div><div className="flex gap-4 font-body text-body-sm text-on-surface-variant"><Legend color="bg-primary" label="VMI" /><Legend color="bg-secondary" label="Trading" /><Legend color="bg-status-neutral" label="Supplies" /></div></div>
          <MonthlyFlowChart data={MONTHLY_FLOW} />
        </article>
        <article className="rounded-3xl border border-outline-variant/30 bg-white p-6 shadow-elevation-1"><h2 className="font-heading text-headline-md font-bold text-on-surface">Location Occupancy</h2><LocationOccupancyChart /><div className="space-y-3 font-body text-body-sm text-on-surface-variant"><Legend color="bg-primary" label="Zone A Storage" /><Legend color="bg-secondary" label="Zone B Racks" /><Legend color="bg-status-neutral" label="Cold Storage" /><Legend color="bg-action-blue" label="Overflow" /></div></article>
      </section>

      {/* Movement Trend — real recharts bar chart, most recent day highlighted
          in action-blue per §9's "one accent, used sparingly" dashboard rule. */}
      <div className="mt-6 rounded-3xl border border-outline-variant/30 bg-white p-6 shadow-elevation-1">
        <h2 className="font-heading font-semibold text-headline-md text-on-surface">
          Movement Trend
        </h2>
        <p className="mt-1 font-body text-body-sm text-on-surface-variant">
          Transactions per day across all flows
        </p>
        <MovementChart data={movementChartData} />
      </div>

      {/* Activity Heatmap */}
      <div className="mt-6 rounded-3xl border border-outline-variant/30 bg-white p-6 shadow-elevation-1">
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
                className={`flex h-11 items-center rounded-full px-4 font-label text-label motion-safe:transition-colors motion-safe:duration-150 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-primary ${
                  activeFilter === f
                    ? "bg-primary text-white"
                    : "border border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {f === "all" ? "All" : f}
              </a>
            ))}
          </div>
        </div>

        {/* Heatmap placeholder — wired from inventory_transactions data */}
        <div className="mt-4 h-32 rounded-2xl bg-surface-dim" role="img" aria-label="Inventory activity heatmap — not yet wired to data">
          <div className="flex h-full items-center justify-center">
            <p className="font-body text-body-sm text-on-surface-variant">
              Heatmap — wired from <span className="font-mono text-mono-md">inventory_transactions</span> data
            </p>
          </div>
        </div>
      </div>

      {/* Movement History table */}
      <div className="mt-6 overflow-hidden rounded-3xl border border-outline-variant/30 bg-white shadow-elevation-1">
        {/* Table header row with export button */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
          <h2 className="font-heading font-semibold text-headline-md text-on-surface">
            Movement History
          </h2>
          <button
            type="button"
            className="flex h-11 items-center gap-2 rounded-2xl border border-outline-variant/30 px-4 font-body text-body-md text-on-surface motion-safe:transition-colors motion-safe:duration-150 hover:border-primary hover:text-primary motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Export movement history"
          >
            <Download size={16} aria-hidden="true" />
            Export
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-dim">
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                  Type
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                  Item
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                  Lot
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                  Qty
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                  Party
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                  Flow
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                  Reference
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {/* TODO: wire to inventory_transactions query */}
              {MOCK_MOVEMENTS.map((txn) => (
                <tr key={txn.id} className="hover:bg-surface-dim/50">
                  <td className="px-4 py-3 font-body text-body-md text-on-surface-variant">
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
                  <td className="px-4 py-3 font-body text-body-md text-on-surface-variant">
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
        <div className="mt-6 rounded-3xl border border-outline-variant/30 bg-white p-6 shadow-elevation-1">
          <h2 className="font-heading font-semibold text-headline-md text-on-surface">
            Financial Summary
          </h2>
          <p className="mt-1 font-body text-body-sm text-on-surface-variant">
            VMI amounts shown are period averages — reference only, not per-document
            totals. Trading amounts are final invoice figures.
          </p>

          <div className="mt-4 flex flex-wrap gap-6">
            {/* VMI billing total */}
            <div className="flex-1">
              <p className="font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                VMI Billing Total (Period)
              </p>
              <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
                $0.00
              </p>
              <p className="mt-0.5 font-body text-body-sm text-on-surface-variant">
                Reference amount, not your final bill
              </p>
              {/* TODO: wire to vmi_cbm_ledger + pick_list_items pricing query */}
            </div>

            {/* Trading margin total */}
            <div className="flex-1">
              <p className="font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Trading Gross Margin (Period)
              </p>
              <p className="mt-1 font-heading text-data-display font-semibold text-on-surface">
                $0.00
              </p>
              <p className="mt-0.5 font-body text-body-sm text-on-surface-variant">
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

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-2"><span className={`h-3 w-3 rounded-sm ${color}`} aria-hidden="true" />{label}</span>;
}

function HealthRow({ icon, title, detail, tone }: { icon: React.ReactNode; title: string; detail: string; tone: "pending" | "held" | "available" }) {
  const toneClass = { pending: "border-status-warning/45 bg-status-warning/10 text-status-warning", held: "border-status-error/35 bg-status-error/10 text-status-error", available: "border-status-success/35 bg-status-success/10 text-status-success" }[tone];
  return <div className={`flex items-center gap-4 rounded-2xl border p-4 ${toneClass}`}><span aria-hidden="true">{icon}</span><div><p className="font-heading text-body-md font-bold text-on-surface">{title}</p><p className="mt-1 font-body text-body-sm text-on-surface-variant">{detail}</p></div></div>;
}
