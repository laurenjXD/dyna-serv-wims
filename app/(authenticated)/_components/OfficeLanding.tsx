"use client";

import React from "react";
import Link from "next/link";
import {
  PackageCheck,
  ListChecks,
  ArrowLeftRight,
  ClipboardList,
  FlaskConical,
  TrendingDown,
  ShieldAlert,
  Barcode,
  ArrowRight,
  PieChart,
} from "lucide-react";
import { QuickJumpScanner } from "@/app/(authenticated)/receiving/_components/QuickJumpScanner";
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
  flowType?: "vmi" | "trading" | "supplies";
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
const FLOW_COLORS: Record<string, string> = { vmi: "#2563EB", trading: "#002060", supplies: "#64748B" };

export function OfficeLanding({
  dateString,
  openWrrs,
  openPickLists,
  pendingTransfers,
  openInspections,
  pendingApprovals,
  inventoryKpis,
  hasReceivingAccess,
  quickJumpAction,
  hasPickListAccess,
  hasTransferAccess,
  hasInspectionAccess,
  hasApprovalAccess,
  hasFinancialAccess: _hasFinancialAccess,
  hasReportingAccess,
  openWrrRows: _openWrrRows,
  openPickListRows: _openPickListRows,
  openInspectionRows: _openInspectionRows,
  pendingApprovalRows: _pendingApprovalRows,
  inventoryPreview,
  recentActivity,
  weeklyTrend,
  monthlyOutgoingQty,
  monthlyTrend,
  dispatchRate,
  flowActivity,
  stockOwnershipSplit,
}: {
  dateString: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
  openInspections: number;
  pendingApprovals: number;
  inventoryKpis: { totalLotsInStock: number; totalCommittedQty: number; lowStockItemsCount: number } | null;
  hasReceivingAccess: boolean;
  quickJumpAction?: (formData: FormData) => void;
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
  monthlyTrend: WeeklyTrendDatum[];
  dispatchRate: { dispatched: number; notDispatched: number } | null;
  flowActivity: Array<{ flowType: string; count: number }> | null;
  stockOwnershipSplit?: { trading: number; vmi: number; supplies: number };
}) {
  // Compute default ownership split if not provided
  const ownership = stockOwnershipSplit ?? {
    trading: inventoryPreview.filter((i) => i.flowType === "trading").reduce((s, i) => s + i.totalQty, 0) || 45,
    vmi: inventoryPreview.filter((i) => i.flowType === "vmi").reduce((s, i) => s + i.totalQty, 0) || 50,
    supplies: inventoryPreview.filter((i) => i.flowType === "supplies").reduce((s, i) => s + i.totalQty, 0) || 5,
  };

  const totalStockQty = (ownership.trading + ownership.vmi + ownership.supplies) || 1;

  return (
    <div className="mx-auto max-w-[1360px] space-y-6 px-4 py-6 md:px-6 lg:px-8">
      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-on-surface">
            Operational Overview
          </h1>
          <p className="font-body text-xs sm:text-sm text-text-grey mt-0.5">{dateString}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/reports"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-white px-3.5 font-label text-xs font-semibold text-brand-navy shadow-sm transition-all hover:bg-slate-50 hover:shadow"
          >
            Reports Center
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* ── Quick Jump Bar ──────────────────────────────────────────────────── */}
      {hasReceivingAccess && quickJumpAction && (
        <section className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Barcode size={20} className="text-brand-navy" aria-hidden="true" />
            <h2 className="font-heading text-sm font-bold text-brand-navy">Quick Jump to Receiving</h2>
          </div>
          <QuickJumpScanner action={quickJumpAction} />
        </section>
      )}

      {/* ── 1. Top-Level KPI Tile Strip (6 Metrics) ─────────────────────────── */}
      <section aria-label="Key performance indicators">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
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
          <KpiTile
            label="Low Stock Items"
            value={hasReportingAccess && inventoryKpis ? inventoryKpis.lowStockItemsCount : "—"}
            icon={<TrendingDown size={20} />}
            accent="red"
            linkTo={hasReportingAccess ? "/inventory" : undefined}
          />
          <KpiTile
            label="Pending Approvals"
            value={hasApprovalAccess ? pendingApprovals : "—"}
            icon={<ShieldAlert size={20} />}
            accent="neutral"
            linkTo={hasApprovalAccess ? "/approvals" : undefined}
          />
        </div>
      </section>

      {/* ── 2. High-Level Visualizations Bento Grid ─────────────────────────── */}
      <section aria-label="Operational visualizations" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Visual 1: Dispatch Rate Ring */}
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          {hasPickListAccess && dispatchRate ? (
            (() => {
              const total = dispatchRate.dispatched + dispatchRate.notDispatched;
              const pct = total > 0 ? Math.round((dispatchRate.dispatched / total) * 100) : 0;
              return (
                <DonutChart
                  title="Dispatch Rate"
                  centerLabel="Dispatched"
                  centerValue={pct}
                  segments={[
                    { label: "Dispatched", value: dispatchRate.dispatched, statusToken: "available" },
                    { label: "In Progress", value: dispatchRate.notDispatched, statusToken: "pending" },
                  ]}
                />
              );
            })()
          ) : (
            <div className="flex h-64 items-center justify-center text-xs text-text-grey font-medium">
              Dispatch rate unavailable
            </div>
          )}
        </div>

        {/* Visual 2: Weekly Outgoing Trend */}
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="font-heading text-sm font-semibold text-on-surface">
                Weekly Outgoing Trend
              </h2>
              <p className="font-body text-xs text-text-grey">
                Daily quantity and CBM dispatched (last 7 days)
              </p>
            </div>
          </div>
          <div data-testid="landing-weekly-trend">
            <WeeklyTrendChart data={weeklyTrend} />
          </div>
        </div>

        {/* Visual 3: Monthly Outgoing Stat Block */}
        <div
          data-testid="landing-monthly-kpi"
          className="flex flex-col justify-between rounded-2xl bg-brand-navy p-5 text-surface-white shadow-elevation-1"
        >
          <div>
            <p className="font-label text-xs uppercase tracking-wider text-surface-white/70 font-bold">
              Monthly Outgoing
            </p>
            <p className="mt-2 font-heading text-3xl font-extrabold text-surface-white">
              {monthlyOutgoingQty.toLocaleString()}
            </p>
            <p className="mt-1 font-body text-xs text-surface-white/70">Units dispatched MTD</p>
          </div>

          {monthlyTrend.length > 0 && (
            <div
              data-testid="landing-monthly-trend-graph"
              role="img"
              aria-label={`Daily outgoing quantity trend for the month, ${monthlyTrend.length} days`}
              className="mt-6 flex h-16 items-end gap-1"
            >
              {monthlyTrend.map((day, index) => {
                const max = Math.max(1, ...monthlyTrend.map((d) => d.qty));
                const heightPct = Math.max(8, Math.round((day.qty / max) * 100));
                return (
                  <div
                    key={`${day.period}-${index}`}
                    title={`Day ${day.period}: ${day.qty.toLocaleString()}`}
                    className="min-w-[3px] flex-1 rounded-t-sm bg-surface-white/40 transition-[height] hover:bg-surface-white/80"
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── 3. Stock Ownership & Flow Activity Breakdown ───────────────────── */}
      <section aria-label="Stock split and flow activity" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Stock Ownership Split Donut */}
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <DonutChart
            title="Stock Ownership Split"
            centerLabel="Total Ratio"
            centerValue={100}
            segments={[
              {
                label: `VMI Consigned (${Math.round((ownership.vmi / totalStockQty) * 100)}%)`,
                value: ownership.vmi,
                statusToken: "pending",
              },
              {
                label: `Owned Trading (${Math.round((ownership.trading / totalStockQty) * 100)}%)`,
                value: ownership.trading,
                statusToken: "available",
              },
              {
                label: `Internal Supplies (${Math.round((ownership.supplies / totalStockQty) * 100)}%)`,
                value: ownership.supplies,
                statusToken: "neutral",
              },
            ]}
          />
        </div>

        {/* Activity by Flow Type Bar Chart */}
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          {hasPickListAccess && flowActivity && flowActivity.length > 0 ? (
            <BarChart
              title="Activity by Flow Type"
              xAxisLabel="Flow Type"
              yAxisLabel="Dispatches"
              data={flowActivity.map((row) => ({
                label: FLOW_LABELS[row.flowType] ?? row.flowType,
                value: row.count,
                color: FLOW_COLORS[row.flowType],
              }))}
            />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center text-xs text-text-grey font-medium">
              <PieChart size={32} className="mb-2 text-slate-300" />
              <p>No flow dispatch data in current period</p>
            </div>
          )}
        </div>
      </section>

      {/* ── 4. Actionable Queues & Lists (2-Column Bento) ───────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Left: Top Stock Items Preview with Frosted Glass Badges */}
        <section aria-label="Top inventory items" className="rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1 overflow-hidden">
          <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4">
            <div>
              <h2 className="font-heading text-base font-semibold text-on-surface">
                Top Stock Items Preview
              </h2>
              <p className="font-body text-xs text-text-grey">Top inventory items with flow partition badges</p>
            </div>
            <Link
              href="/inventory"
              className="font-label text-xs font-bold text-brand-navy underline hover:text-brand-royal-blue"
            >
              View All
            </Link>
          </div>

          {inventoryPreview.length === 0 ? (
            <div className="px-5 py-12 text-center text-xs text-text-grey italic">
              No stock items available in the active warehouse.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F4F6FB] font-heading text-xs font-bold uppercase tracking-wider text-slate-700">
                    <th className="px-4 py-3">Item Code &amp; Flow</th>
                    <th className="px-4 py-3 text-right">Available Qty</th>
                    <th className="px-4 py-3">Locations</th>
                    <th className="px-4 py-3 text-right">Quick Jumps</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-body text-sm">
                  {inventoryPreview.map((item) => {
                    const locations = [...new Set(item.lots.map((l) => l.locationLabel))];
                    const flow = item.flowType ?? "trading";
                    return (
                      <tr key={item.itemId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-on-surface">
                              {item.itemCode}
                            </span>
                            {/* Frosted Glass Badge */}
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider backdrop-blur-md ${
                                flow === "vmi"
                                  ? "bg-blue-100/70 text-blue-800 border border-blue-200"
                                  : flow === "trading"
                                  ? "bg-slate-100/80 text-slate-900 border border-slate-300"
                                  : "bg-amber-100/70 text-amber-800 border border-amber-200"
                              }`}
                            >
                              {flow}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs font-medium text-text-grey">{item.itemName}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-bold text-on-surface">
                          {item.totalQty.toLocaleString()}{" "}
                          <span className="font-normal text-xs text-text-grey">{item.uom}</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <p className="font-mono text-xs font-semibold text-slate-700">
                            {locations.slice(0, 2).join(", ")}
                            {locations.length > 2 ? ` +${locations.length - 2}` : ""}
                          </p>
                          <p className="text-xs text-text-grey font-medium">{item.lots.length} lot(s)</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1.5">
                            <Link
                              href={`/inventory?item=${item.itemCode}`}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-brand-navy hover:bg-slate-50 hover:border-brand-navy shadow-2xs"
                            >
                              Balance
                            </Link>
                            <Link
                              href={`/inventory?item=${item.itemCode}&view=lots`}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-brand-navy hover:bg-slate-50 hover:border-brand-navy shadow-2xs"
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

        {/* Right: Chronological Activity Feed */}
        <div className="space-y-4">
          <div
            aria-label="Recent activity"
            data-testid="landing-recent-activity"
            className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <ClipboardList size={16} className="text-brand-navy" />
              <h3 className="font-heading text-sm font-semibold text-on-surface">
                Recent Activity Feed
              </h3>
            </div>
            {recentActivity.length === 0 ? (
              <p className="py-6 text-xs text-text-grey italic text-center">No recent transactions recorded today.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="py-2.5">
                    <p className="font-body text-xs font-medium text-on-surface">{entry.description}</p>
                    {entry.timestamp && (
                      <time
                        dateTime={entry.timestamp}
                        className="mt-0.5 block font-mono text-[11px] text-text-grey"
                      >
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </time>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
