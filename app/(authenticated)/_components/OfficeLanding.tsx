// `OfficeLanding` — office-tier presentation for `/`.
//
// 2026-08-17 restyle: bento-grid layout (dispatch-rate ring, weekly trend,
// monthly stat block, colorful KPI tiles, flow-type activity bar chart,
// activity heatmap) inspired by a reference dashboard the user supplied,
// reusing this app's EXISTING brand tokens (Etna/Glacial fonts, the locked
// navy/red/royal-blue/status-color palette, the existing rounded-md/lg +
// shadow-elevation card pattern) rather than introducing new colors or the
// unbuilt "Mega-Card"/radius-xl pattern (see revision-log.md's "Mega-Card"
// doc-drift entry — that decision still stands; this restyle intentionally
// works within it). Responsive: desktop bento grid collapses to a compact
// single column on mobile, same content throughout, no dark-mode variant.
// This is the FIRST page in a deliberately phased rollout — floor pages
// (Receiving scan loop, Pick/Dispatch) do NOT get this treatment, per
// design.md's floor-priority rules (single primary action, no decorative
// density); FloorLanding.tsx is untouched by this restyle.
//
// Extracted from app/(authenticated)/page.tsx per
// specs/05-ui-shell-and-navigation/tasks.md §7 so it can be tested directly
// (app/(authenticated)/__tests__/OfficeLanding.test.tsx) without going
// through the page's server-side data-fetching layer. Purely presentational
// — props in, JSX out, no DB calls here.
//
// Traceability:
//   specs/05-ui-shell-and-navigation/design.md §3.2 (`/` route: capability
//     "none", surface "shared").
//   specs/05-ui-shell-and-navigation/requirements.md
//     R11.3 — `/` SHALL aggregate read-only summary counts, Quick Actions,
//       Open Work Queue, Approval monitoring badge, Weekly transaction line
//       graph (outgoing qty + CBM — see R11.5 scope note below), and
//       Monthly outgoing KPI summary.
//     R11.5 — `/` SHALL NOT display financial/margin KPI cards. The "sales"
//       ($) series named in R11.3 is out of scope for `/` per this session's
//       confirmed decision: no pricing/billing backend exists yet, so the
//       weekly trend graph is quantity + CBM only, never a dollar figure.
// Low Stock Items gate: this card is an operational stock-count metric, not
// a financial/margin KPI, so it gates on `hasReportingAccess`
// (reporting.read) rather than `hasFinancialAccess` (reporting.financial_read).
// Nothing else on this page changes gate — the Master Inventory Preview
// panel and its underlying inventoryPreview data remain gated on
// hasFinancialAccess in page.tsx, since that panel legitimately needs the
// stricter capability.

import Link from "next/link";
import {
  PackageCheck,
  ListChecks,
  ArrowLeftRight,
  ClipboardList,
  FlaskConical,
  TrendingDown,
  ShieldAlert,
} from "lucide-react";
import { KpiTile } from "@/components/analytics/KpiTile";
import { DonutChart } from "@/components/analytics/DonutChart";
import { BarChart } from "@/components/analytics/BarChart";
import { WeeklyTrendChart, type WeeklyTrendDatum } from "@/components/analytics/WeeklyTrendChart";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import type { InspectionCaseListRow } from "@/lib/db/queries/transfers";
import type { ApprovalRequestRow } from "@/lib/db/queries/approvals";

export type ItemPreviewRow = {
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  totalQty: number;
  lots: Array<{
    lotId: string;
    lotNumber: string;
    locationLabel: string;
    qtyRemaining: number;
  }>;
};

export type RecentActivityItem = {
  id: string;
  description: string;
  timestamp?: string;
};

const FLOW_LABELS: Record<string, string> = { vmi: "VMI", trading: "Trading", supplies: "Supplies" };
const FLOW_COLORS: Record<string, string> = { vmi: "#2563EB", trading: "#0F172A", supplies: "#64748B" };

export function OfficeLanding({
  dateString,
  // KPI counts — each omitted (shown as "-") if user lacks the capability
  openWrrs,
  openPickLists,
  pendingTransfers,
  openInspections,
  pendingApprovals,
  inventoryKpis,
  hasReceivingAccess,
  hasPickListAccess,
  hasTransferAccess,
  hasInspectionAccess,
  hasApprovalAccess,
  hasFinancialAccess,
  hasReportingAccess,
  // Action queue rows (max 3 each)
  openWrrRows,
  openPickListRows,
  openInspectionRows,
  pendingApprovalRows,
  // Master inventory preview (top 5 items by stock level)
  inventoryPreview,
  // Recent Activity feed (R11.3)
  recentActivity,
  // Weekly transaction line graph (R11.3/R11.5 — qty + CBM only)
  weeklyTrend,
  // Monthly outgoing KPI summary (R11.3) — headline number + daily-
  // granularity bar graph (2026-08-19, was a stat-only block).
  monthlyOutgoingQty,
  // Dispatch rate ring + flow-type activity bar chart (2026-08-17 restyle) —
  // null when the session lacks pick_list.read, same omission pattern as
  // the heatmap.
  dispatchRate,
  flowActivity,
}: {
  dateString: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
  openInspections: number;
  pendingApprovals: number;
  inventoryKpis: { totalLotsInStock: number; totalCommittedQty: number; lowStockItemsCount: number } | null;
  hasReceivingAccess: boolean;
  hasPickListAccess: boolean;
  hasTransferAccess: boolean;
  hasInspectionAccess: boolean;
  hasApprovalAccess: boolean;
  hasFinancialAccess: boolean;
  hasReportingAccess: boolean;
  openWrrRows: WrrDocumentRow[];
  openPickListRows: PickListRow[];
  openInspectionRows: InspectionCaseListRow[];
  pendingApprovalRows: ApprovalRequestRow[];
  inventoryPreview: ItemPreviewRow[];
  recentActivity: RecentActivityItem[];
  weeklyTrend: WeeklyTrendDatum[];
  monthlyOutgoingQty: number;
  dispatchRate: { dispatched: number; notDispatched: number } | null;
  flowActivity: Array<{ flowType: string; count: number }> | null;
}) {
  return (
    <div className="mx-auto max-w-[1280px] px-3 py-4 sm:px-4 sm:py-6 md:px-6 lg:px-8 lg:py-10">
      {/* Page header */}
      <header className="mb-4 sm:mb-6">
        <h1 className="font-heading text-headline-xl font-extrabold text-on-surface lg:hidden">
          Overview Dashboard
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">{dateString}</p>
      </header>

      {/* ── Bento row: Dispatch Rate ring + Weekly Trend + Monthly stat ────
          Compact single column on mobile; 4-column bento on desktop
          (ring:1, trend:2, monthly:1). */}
      <section aria-label="Outgoing performance" className="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:gap-4 lg:grid-cols-4">
        {hasPickListAccess && dispatchRate ? (
          (() => {
            const total = dispatchRate.dispatched + dispatchRate.notDispatched;
            const pct = total > 0 ? Math.round((dispatchRate.dispatched / total) * 100) : 0;
            return (
              <div className="lg:col-span-1">
                <DonutChart
                  title="Dispatch Rate"
                  centerLabel="Dispatched"
                  centerValue={pct}
                  segments={[
                    { label: "Dispatched", value: dispatchRate.dispatched, statusToken: "available" },
                    { label: "In Progress", value: dispatchRate.notDispatched, statusToken: "pending" },
                  ]}
                />
              </div>
            );
          })()
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1 lg:col-span-1">
            <p className="font-body text-body-sm text-text-grey">Dispatch rate unavailable</p>
          </div>
        )}

        <div className="rounded-lg border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1 sm:p-5 lg:col-span-2">
          <h2 className="mb-1 font-heading text-headline-md font-semibold text-on-surface">
            Weekly Outgoing Trend
          </h2>
          <p className="mb-2 font-body text-body-sm text-text-grey">
            Quantity and CBM dispatched, last 7 days
          </p>
          <div data-testid="landing-weekly-trend">
            <WeeklyTrendChart data={weeklyTrend} />
          </div>
        </div>

        <div
          data-testid="landing-monthly-kpi"
          className="flex flex-col justify-center rounded-lg bg-brand-navy p-5 text-surface-white shadow-elevation-1 lg:col-span-1"
        >
          <p className="font-label text-label uppercase tracking-[0.05em] text-surface-white/70">
            Monthly Outgoing Qty
          </p>
          <p className="mt-2 font-heading text-headline-xl font-bold text-surface-white">
            {monthlyOutgoingQty.toLocaleString()}
          </p>
          <p className="mt-1 font-body text-body-sm text-surface-white/70">Month to date</p>
        </div>
      </section>

      {/* ── KPI tile strip ─────────────────────────────────────────────────
          6 operational count tiles. Capability-gated: tile shows "—" not an
          error state when the session lacks the required capability.
          Colored icon badge is an accent only — the figure itself stays
          text-on-surface, never colored text (KpiTile enforces this). */}
      <section aria-label="Key performance indicators" className="mb-4 sm:mb-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          <KpiTile
            label="Open WRRs"
            value={hasReceivingAccess ? openWrrs : "—"}
            icon={<PackageCheck size={20} />}
            accent="royal-blue"
            linkTo={hasReceivingAccess ? "/receiving" : undefined}
          />
          <KpiTile
            label="Active Picks"
            value={hasPickListAccess ? openPickLists : "—"}
            icon={<ListChecks size={20} />}
            accent="available"
            linkTo={hasPickListAccess ? "/outgoing" : undefined}
          />
          <KpiTile
            label="Pending Transfers"
            value={hasTransferAccess ? pendingTransfers : "—"}
            icon={<ArrowLeftRight size={20} />}
            accent="navy"
            linkTo={hasTransferAccess ? "/transfers" : undefined}
          />
          <KpiTile
            label="Open Inspections"
            value={hasInspectionAccess ? openInspections : "—"}
            icon={<FlaskConical size={20} />}
            accent="pending"
            linkTo={hasInspectionAccess ? "/inspection" : undefined}
          />
          {/* Low Stock — operational stock-count metric, gated reporting.read
              (NOT reporting.financial_read — that gate was wrong for a
              non-financial count). */}
          <KpiTile
            label="Low Stock Items"
            value={hasReportingAccess && inventoryKpis ? inventoryKpis.lowStockItemsCount : "—"}
            icon={<TrendingDown size={20} />}
            accent="red"
            linkTo={hasReportingAccess ? "/inventory" : undefined}
          />
          {/* Pending Approvals — gated fifo_override.approve */}
          <KpiTile
            label="Pending Approvals"
            value={hasApprovalAccess ? pendingApprovals : "—"}
            icon={<ShieldAlert size={20} />}
            accent="neutral"
            linkTo={hasApprovalAccess ? "/approvals" : undefined}
          />
        </div>
      </section>

      {/* ── Flow-type activity + Activity heatmap ──────────────────────────
          Side by side on desktop, stacked on mobile. Flow-type bar chart is
          this app's real equivalent of a generic "sales by platform" chart —
          VMI/Trading/Supplies is the one dimension every pick list
          partitions by. Heatmap gated reporting.read — omitted entirely if
          session lacks it (no locked placeholder), per R11.6. */}
      <section aria-label="Activity breakdown" className="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:gap-4 lg:grid-cols-2">
        {hasPickListAccess && flowActivity && flowActivity.length > 0 && (
          <BarChart
            title="Activity by Flow Type"
            xAxisLabel="Flow type"
            yAxisLabel="Pick lists"
            data={flowActivity.map((row) => ({
              label: FLOW_LABELS[row.flowType] ?? row.flowType,
              value: row.count,
              color: FLOW_COLORS[row.flowType],
            }))}
          />
        )}
        {heatmapData !== null && (
          <HomeDashboardHeatmapSection data={heatmapData} flowFilter={heatmapFilter} />
        )}
      </section>

      {/* ── Master Inventory Preview + Action Queues ───────────────────────
          Two panels side by side on desktop, stacked on mobile. */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">

        {/* Left: Master Inventory Preview (top 5 items by stock level) */}
        <section aria-label="Top inventory items" className="rounded-lg border border-outline-variant/30 bg-surface-white shadow-elevation-1">
          <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3 sm:px-5 sm:py-4">
            <h2 className="font-heading text-headline-md font-semibold text-on-surface">
              Top Stock Items
            </h2>
            <Link
              href="/inventory"
              className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              View All
            </Link>
          </div>

          {inventoryPreview.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-body text-body-md text-text-grey">No stock items available.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      Item
                    </th>
                    <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      Stock
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      Lots / Locations
                    </th>
                    <th className="sr-only px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {inventoryPreview.map((item) => {
                    // Collect dispersed locations (unique location labels across all lots)
                    const locations = [...new Set(item.lots.map((l) => l.locationLabel))];
                    const lotCount = item.lots.length;
                    return (
                      <tr key={item.itemId} className="hover:bg-surface-light-grey/50">
                        <td className="px-4 py-3">
                          <p className="font-mono text-mono-md font-bold text-on-surface">
                            {item.itemCode}
                          </p>
                          <p className="mt-0.5 font-body text-body-sm text-text-grey">
                            {item.itemName}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-mono-md text-on-surface">
                          {item.totalQty.toLocaleString()}
                          <span className="ml-1 font-body text-body-sm text-text-grey">
                            {item.uom}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-body text-body-sm text-text-grey">
                            {lotCount} lot{lotCount !== 1 ? "s" : ""}
                          </p>
                          <p className="mt-0.5 font-mono text-mono-md text-on-surface">
                            {locations.slice(0, 3).join(", ")}
                            {locations.length > 3 ? ` +${locations.length - 3}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <Link
                              href={`/inventory?item=${item.itemCode}`}
                              className="inline-flex h-8 items-center rounded border border-outline-variant/30 px-2 font-label text-body-sm text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                            >
                              Balance
                            </Link>
                            <Link
                              href={`/inventory?item=${item.itemCode}&view=lots`}
                              className="inline-flex h-8 items-center rounded border border-outline-variant/30 px-2 font-label text-body-sm text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                            >
                              Lots
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right: Action Queues */}
        <aside className="space-y-3 sm:space-y-4">
          {/* Recent Activity feed (R11.3) */}
          <div
            aria-label="Recent activity"
            data-testid="landing-recent-activity"
            className="rounded-lg border border-outline-variant/30 bg-surface-white shadow-elevation-1"
          >
            <div className="flex items-center gap-2 border-b border-outline-variant/30 px-4 py-3">
              <ClipboardList size={18} strokeWidth={2} aria-hidden="true" className="text-brand-navy" />
              <h3 className="font-heading text-headline-md font-semibold text-on-surface">
                Recent Activity
              </h3>
            </div>
            {recentActivity.length === 0 ? (
              <p className="px-4 py-4 font-body text-body-md text-text-grey">
                No recent activity.
              </p>
            ) : (
              <ul className="divide-y divide-outline-variant/30">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="px-4 py-3">
                    <p className="font-body text-body-md text-on-surface">{entry.description}</p>
                    {entry.timestamp && (
                      <time
                        dateTime={entry.timestamp}
                        className="mt-0.5 block font-body text-body-sm text-text-grey"
                      >
                        {new Date(entry.timestamp).toLocaleString()}
                      </time>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Open WRRs */}
          {hasReceivingAccess && (
            <div className="rounded-lg border border-outline-variant/30 bg-surface-white shadow-elevation-1">
              <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
                <h3 className="font-heading text-headline-md font-semibold text-on-surface">
                  Open WRRs
                </h3>
                <Link
                  href="/receiving"
                  className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  View all
                </Link>
              </div>
              {openWrrRows.length === 0 ? (
                <p className="px-4 py-4 font-body text-body-md text-status-available">
                  All clear
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/30">
                  {openWrrRows.map((wrr) => (
                    <div key={wrr.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-mono text-mono-md font-bold text-on-surface truncate">
                          {wrr.wrrNumber}
                        </p>
                        <p className="font-body text-body-sm text-text-grey truncate">
                          {wrr.vendorPartyName ?? "—"}
                        </p>
                      </div>
                      <Link
                        href={`/receiving/${wrr.id}/receive`}
                        className="shrink-0 inline-flex h-9 items-center rounded bg-primary px-3 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        Receive
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Allocated Pick Lists */}
          {hasPickListAccess && (
            <div className="rounded-lg border border-outline-variant/30 bg-surface-white shadow-elevation-1">
              <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
                <h3 className="font-heading text-headline-md font-semibold text-on-surface">
                  Active Pick Lists
                </h3>
                <Link
                  href="/outgoing"
                  className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  View all
                </Link>
              </div>
              {openPickListRows.length === 0 ? (
                <p className="px-4 py-4 font-body text-body-md text-status-available">
                  All clear
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/30">
                  {openPickListRows.map((pl) => (
                    <div key={pl.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <p className="font-mono text-mono-md font-bold text-on-surface truncate">
                        {pl.pickListNumber}
                      </p>
                      <Link
                        href={`/pick-lists/${pl.id}/pick`}
                        className="shrink-0 inline-flex h-9 items-center rounded bg-primary px-3 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        Pick
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pending Approvals */}
          {hasApprovalAccess && (
            <div className="rounded-lg border border-outline-variant/30 bg-surface-white shadow-elevation-1">
              <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
                <h3 className="font-heading text-headline-md font-semibold text-on-surface">
                  Pending Approvals
                </h3>
                <Link
                  href="/approvals"
                  className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  View all
                </Link>
              </div>
              {pendingApprovalRows.length === 0 ? (
                <p className="px-4 py-4 font-body text-body-md text-status-available">
                  All clear
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/30">
                  {pendingApprovalRows.map((req) => (
                    <div key={req.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <p className="font-label text-label uppercase text-status-pending truncate">
                        {req.approvalType.replace(/_/g, " ")}
                      </p>
                      <Link
                        href={`/approvals/${req.id}`}
                        className="shrink-0 inline-flex h-9 items-center rounded bg-primary px-3 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        Review
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Open Inspection Cases */}
          {hasInspectionAccess && (
            <div className="rounded-lg border border-outline-variant/30 bg-surface-white shadow-elevation-1">
              <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
                <h3 className="font-heading text-headline-md font-semibold text-on-surface">
                  Open Inspections
                </h3>
                <Link
                  href="/inspection"
                  className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  View all
                </Link>
              </div>
              {openInspectionRows.length === 0 ? (
                <p className="px-4 py-4 font-body text-body-md text-status-available">
                  All clear
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/30">
                  {openInspectionRows.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-mono text-mono-md font-bold text-on-surface truncate">
                          {c.itemCode}
                        </p>
                        <p className="font-body text-body-sm text-text-grey truncate">
                          {c.lotNumber}
                        </p>
                      </div>
                      <Link
                        href={`/inspection/${c.id}`}
                        className="shrink-0 inline-flex h-9 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        Inspect
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
