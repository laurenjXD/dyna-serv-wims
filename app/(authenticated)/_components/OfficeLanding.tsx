// `OfficeLanding` — office-tier presentation for `/`.
//
// Extracted from app/(authenticated)/page.tsx per
// specs/05-ui-shell-and-navigation/tasks.md §7 so it can be tested directly
// (app/(authenticated)/__tests__/OfficeLanding.test.tsx) without going
// through the page's server-side data-fetching layer. Purely presentational
// — props in, JSX out, no DB calls here.
//
// Traceability:
//   specs/05-ui-shell-and-navigation/design.md §3.2 (`/` route: capability
//     "none", surface "shared"; office heatmap widget gated by
//     reporting.read at the widget level).
//   specs/05-ui-shell-and-navigation/requirements.md
//     R11.3 — `/` SHALL aggregate read-only summary counts, Quick Actions,
//       Open Work Queue, Approval monitoring badge, Weekly transaction line
//       graph (outgoing qty + CBM — see R11.5 scope note below), and
//       Monthly outgoing KPI summary.
//     R11.5 — `/` SHALL NOT display financial/margin KPI cards. The "sales"
//       ($) series named in R11.3 is out of scope for `/` per this session's
//       confirmed decision: no pricing/billing backend exists yet, so the
//       weekly trend graph is quantity + CBM only, never a dollar figure.
//     R11.6 — reporting.read → ActivityHeatmap widget, office/party only.
//
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
import { KpiCard } from "@/components/analytics/KpiCard";
import { KpiCardGroup } from "@/components/analytics/KpiCardGroup";
import { WeeklyTrendChart, type WeeklyTrendDatum } from "@/components/analytics/WeeklyTrendChart";
import { HomeDashboardHeatmapSection } from "./HomeDashboardHeatmapSection";
import type { FlowType } from "@/components/analytics/types";
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
  // Heatmap — null means the user lacks reporting.read
  heatmapData,
  heatmapFilter,
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
  // Monthly outgoing KPI summary (R11.3)
  monthlyOutgoingQty,
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
  heatmapData: Array<{ date: string; count: number }> | null;
  heatmapFilter: FlowType;
  openWrrRows: WrrDocumentRow[];
  openPickListRows: PickListRow[];
  openInspectionRows: InspectionCaseListRow[];
  pendingApprovalRows: ApprovalRequestRow[];
  inventoryPreview: ItemPreviewRow[];
  recentActivity: RecentActivityItem[];
  weeklyTrend: WeeklyTrendDatum[];
  monthlyOutgoingQty: number;
}) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-6 lg:px-8 lg:py-10">
      {/* Page header */}
      <header className="mb-6">
        <h1 className="font-heading text-headline-xl font-extrabold text-on-surface lg:hidden">
          Overview Dashboard
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">{dateString}</p>
      </header>

      {/* ── Row 1: KPI strip ───────────────────────────────────────────────
          6 operational count cards. Capability-gated: card shows "—" not an
          error state when the session lacks the required capability.
          brand-design-system.md §2: data-display (Space Grotesk SemiBold) for
          numbers, label (Inter SemiBold uppercase) for captions.
          Left-accent-bar only on nonzero attention items: low stock, pending
          approvals. */}
      <section aria-label="Key performance indicators" className="mb-8">
        <KpiCardGroup>
          {hasReceivingAccess ? (
            <KpiCard
              label="Open WRRs"
              value={openWrrs}
              trend={{ direction: "flat", pct: 0 }}
              icon={<PackageCheck size={22} />}
              linkTo="/receiving"
            />
          ) : (
            <KpiCard
              label="Open WRRs"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<PackageCheck size={22} />}
            />
          )}

          {hasPickListAccess ? (
            <KpiCard
              label="Active Picks"
              value={openPickLists}
              trend={{ direction: "flat", pct: 0 }}
              icon={<ListChecks size={22} />}
              linkTo="/outgoing"
            />
          ) : (
            <KpiCard
              label="Active Picks"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<ListChecks size={22} />}
            />
          )}

          {hasTransferAccess ? (
            <KpiCard
              label="Pending Transfers"
              value={pendingTransfers}
              trend={{ direction: pendingTransfers > 0 ? "up" : "flat", pct: 0 }}
              icon={<ArrowLeftRight size={22} />}
              statusColor={pendingTransfers > 0 ? "pending" : undefined}
              linkTo="/transfers"
            />
          ) : (
            <KpiCard
              label="Pending Transfers"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<ArrowLeftRight size={22} />}
            />
          )}

          {hasInspectionAccess ? (
            <KpiCard
              label="Open Inspections"
              value={openInspections}
              trend={{ direction: openInspections > 0 ? "up" : "flat", pct: 0 }}
              icon={<FlaskConical size={22} />}
              statusColor={openInspections > 0 ? "pending" : undefined}
              linkTo="/inspection"
            />
          ) : (
            <KpiCard
              label="Open Inspections"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<FlaskConical size={22} />}
            />
          )}

          {/* Low Stock — operational stock-count metric, gated reporting.read
              (NOT reporting.financial_read — that gate was wrong for a
              non-financial count). */}
          {hasReportingAccess && inventoryKpis ? (
            <KpiCard
              label="Low Stock Items"
              value={inventoryKpis.lowStockItemsCount}
              trend={{ direction: inventoryKpis.lowStockItemsCount > 0 ? "up" : "flat", pct: 0 }}
              icon={<TrendingDown size={22} />}
              statusColor={inventoryKpis.lowStockItemsCount > 0 ? "held" : undefined}
              linkTo="/inventory"
            />
          ) : (
            <KpiCard
              label="Low Stock Items"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<TrendingDown size={22} />}
            />
          )}

          {/* Pending Approvals — gated fifo_override.approve */}
          {hasApprovalAccess ? (
            <KpiCard
              label="Pending Approvals"
              value={pendingApprovals}
              trend={{ direction: pendingApprovals > 0 ? "up" : "flat", pct: 0 }}
              icon={<ShieldAlert size={22} />}
              statusColor={pendingApprovals > 0 ? "pending" : undefined}
              linkTo="/approvals"
            />
          ) : (
            <KpiCard
              label="Pending Approvals"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<ShieldAlert size={22} />}
            />
          )}
        </KpiCardGroup>
      </section>

      {/* ── Row 2: Activity Heatmap ───────────────────────────────────────
          Gated reporting.read — omitted entirely if session lacks it (no
          locked placeholder). brand-design-system.md §3.2 R11.6. */}
      {heatmapData !== null && (
        <section aria-label="Inventory activity heatmap" className="mb-8">
          <HomeDashboardHeatmapSection
            data={heatmapData}
            flowFilter={heatmapFilter}
          />
        </section>
      )}

      {/* ── Row 2.5: Weekly trend + Monthly KPI ────────────────────────────
          R11.3 — weekly transaction line graph (outgoing qty + CBM only,
          per R11.5 scope decision — no $/sales series) and monthly outgoing
          KPI summary, side by side on desktop. */}
      <section aria-label="Outgoing trend" className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-md border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
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
          className="flex flex-col justify-center rounded-md border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1"
        >
          <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
            Monthly Outgoing Qty
          </p>
          <p className="mt-2 font-heading text-data-display font-semibold text-on-surface">
            {monthlyOutgoingQty}
          </p>
        </div>
      </section>

      {/* ── Row 3: Master Inventory Preview + Action Queues ───────────────
          Two panels side by side on desktop, stacked on mobile. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">

        {/* Left: Master Inventory Preview (top 5 items by stock level) */}
        <section aria-label="Top inventory items" className="rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
          <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4">
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
        <aside className="space-y-4">
          {/* Recent Activity feed (R11.3) */}
          <div
            aria-label="Recent activity"
            data-testid="landing-recent-activity"
            className="rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1"
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
            <div className="rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
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
                        className="shrink-0 inline-flex h-9 items-center rounded bg-brand-red px-3 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
            <div className="rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
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
                        className="shrink-0 inline-flex h-9 items-center rounded bg-brand-red px-3 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
            <div className="rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
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
                        className="shrink-0 inline-flex h-9 items-center rounded bg-brand-red px-3 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
            <div className="rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
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
