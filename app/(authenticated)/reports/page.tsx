// `/reports` — Reports & Analytics dashboard.
//
// Traceability:
//   specs/16-reporting-and-analytics/design.md (KPI cards FR-1.2, activity
//     heatmap FR-1.3, analytics domains FR-2 through FR-7)
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation),
//     §2 (typography), §1.3 (status colors)
//   specs/00-steering/revision-log.md (2026-08-07: /reports owns KPI dashboard,
//     not /; 2026-08-07: reporting.financial_read added for supervisor + admin)
//
// Surface: Office. Capability gate: reporting.read.
// Financial section gate: reporting.financial_read (supervisor/administrator only).
// Offline: all analytics are Tier 2 — online only, never cached.
// Aggregate queries MUST read lot_inventory_totals, never raw lot_location_balances.

import Link from "next/link";
import {
  BarChart2,
  PackageCheck,
  Truck,
  Layers,
  TrendingDown,
  AlertTriangle,
  ClipboardCheck,
  FlaskConical,
  ClipboardList,
  Download,
} from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { KpiCard } from "@/components/analytics/KpiCard";
import { KpiCardGroup } from "@/components/analytics/KpiCardGroup";
import { MovementChart, type MovementChartDatum } from "@/components/reporting/MovementChart";
import { MonthlyFlowChart, type MonthlyFlowDatum } from "@/components/reporting/MonthlyFlowChart";
import { getInventoryKpis } from "@/lib/analytics/queries/inventory";
import { getWrrVolumeTrend } from "@/lib/analytics/queries/receiving";
import { getPickListVolumeTrend } from "@/lib/analytics/queries/outbound";
import { getActivityHeatmap } from "@/lib/analytics/queries/heatmap";
import { listWrrDocuments } from "@/lib/db/queries/receiving";
import { listPickLists } from "@/lib/db/queries/withdrawals";
import { listInspectionCases } from "@/lib/db/queries/transfers";
import { listPendingApprovalRequests } from "@/lib/db/queries/approvals";
import { HeatmapSection } from "./_components/HeatmapSection";
import type { FlowType } from "@/components/analytics/types";

// ─── Flow filter mapping ───────────────────────────────────────────────────────
//
// URL filter param is lowercase ('vmi'/'trading'/'supplies'/'all') but the
// filter chips historically used uppercase labels. We normalise to lowercase
// for the analytics executor's AnalyticsFlow type.

function toAnalyticsFlow(filter: string): FlowType {
  const lower = filter.toLowerCase();
  if (lower === "vmi" || lower === "trading" || lower === "supplies") {
    return lower;
  }
  return "all";
}

// ─── Quick Access panel component ─────────────────────────────────────────────

function QuickAccessSection({
  recentWrrs,
  openPickLists,
  openInspections,
  pendingApprovals,
  hasApprovalAccess,
}: {
  recentWrrs: Array<{ id: string; wrrNumber: string; status: string; vendorPartyName: string | null }>;
  openPickLists: Array<{ id: string; pickListNumber: string; status: string }>;
  openInspections: Array<{ id: string; itemCode: string; lotNumber: string }>;
  pendingApprovals: Array<{ id: string; approvalType: string }>;
  hasApprovalAccess: boolean;
}) {
  return (
    <section aria-label="Quick access" className="grid gap-6 lg:grid-cols-3">
      {/* Recent WRRs */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">Recent WRRs</h3>
          <Link href="/receiving" className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy">
            View all
          </Link>
        </div>
        {recentWrrs.length === 0 ? (
          <p className="px-4 py-6 font-body text-body-md text-text-grey">No active WRRs.</p>
        ) : (
          <div className="divide-y divide-outline-variant/30">
            {recentWrrs.map((wrr) => (
              <div key={wrr.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-mono-md font-bold text-on-surface truncate">{wrr.wrrNumber}</p>
                  <p className="font-body text-body-sm text-text-grey truncate">{wrr.vendorPartyName ?? "—"}</p>
                </div>
                <Link href={`/receiving/${wrr.id}/receive`} className="shrink-0 inline-flex h-9 items-center rounded bg-primary px-3 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy">
                  Receive
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open Pick Lists */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">Active Pick Lists</h3>
          <Link href="/outgoing" className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy">
            View all
          </Link>
        </div>
        {openPickLists.length === 0 ? (
          <p className="px-4 py-6 font-body text-body-md text-text-grey">No active pick lists.</p>
        ) : (
          <div className="divide-y divide-outline-variant/30">
            {openPickLists.map((pl) => (
              <div key={pl.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="font-mono text-mono-md font-bold text-on-surface">{pl.pickListNumber}</p>
                <Link href={`/pick-lists/${pl.id}/pick`} className="shrink-0 inline-flex h-9 items-center rounded bg-primary px-3 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy">
                  Go to Pick
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open Inspections + Pending Approvals */}
      <div className="space-y-4">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
          <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
            <h3 className="font-heading text-headline-md font-semibold text-on-surface">Inspections</h3>
            <Link href="/inspection" className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy">
              View all
            </Link>
          </div>
          {openInspections.length === 0 ? (
            <p className="px-4 py-4 font-body text-body-md text-text-grey">No open inspection cases.</p>
          ) : (
            <div className="divide-y divide-outline-variant/30">
              {openInspections.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-mono-md font-bold text-on-surface truncate">{c.itemCode}</p>
                    <p className="font-body text-body-sm text-text-grey truncate">{c.lotNumber}</p>
                  </div>
                  <Link href={`/inspection/${c.id}`} className="shrink-0 inline-flex h-9 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy">
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {hasApprovalAccess && (
          <div className="rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
              <h3 className="font-heading text-headline-md font-semibold text-on-surface">Pending Approvals</h3>
              <Link href="/approvals" className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy">
                View all
              </Link>
            </div>
            {pendingApprovals.length === 0 ? (
              <p className="px-4 py-4 font-body text-body-md text-status-available">All clear — no pending approvals.</p>
            ) : (
              <div className="divide-y divide-outline-variant/30">
                {pendingApprovals.map((req) => (
                  <div key={req.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <p className="font-label text-label uppercase text-status-pending truncate">{req.approvalType.replace("_", " ")}</p>
                    <Link href={`/approvals/${req.id}`} className="shrink-0 inline-flex h-9 items-center rounded bg-primary px-3 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy">
                      Review
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Monthly flow data (chart skeleton — trend series) ─────────────────────────
// These values are a reasonable static seed for the chart while the full
// time-series aggregation query (FR-2 per-period analytics) is not yet built.
// Clearly documented as static — not labelled as live data to the user.
const MONTHLY_FLOW_SEED: MonthlyFlowDatum[] = [
  { month: "Mar", vmi: 0, trading: 0, supplies: 0 },
  { month: "Apr", vmi: 0, trading: 0, supplies: 0 },
  { month: "May", vmi: 0, trading: 0, supplies: 0 },
  { month: "Jun", vmi: 0, trading: 0, supplies: 0 },
  { month: "Jul", vmi: 0, trading: 0, supplies: 0 },
  { month: "Aug", vmi: 0, trading: 0, supplies: 0 },
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
        <BarChart2 size={40} className="mx-auto mb-3 text-text-grey" aria-hidden="true" />
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
  const hasFinancialAccess =
    (await requirePermission(resolver, "reporting.financial_read")).kind === "authorized";

  const hasApprovalAccess =
    (await requirePermission(resolver, "fifo_override.approve")).kind === "authorized";

  // Normalize filter for analytics executor
  const activeFilter = toAnalyticsFlow(filterParam ?? "all");

  // ─── Parallel data fetching ────────────────────────────────────────────────

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const mtdRange = { startDate: startOfMonth, endDate: now };

  const [
    inventoryKpis,
    mtdReceiptsRaw,
    mtdDispatchesRaw,
    { total: pendingInspectionsCount },
    heatmapData,
    { rows: recentWrrs },
    { rows: openPickLists },
    { rows: openInspections },
    pendingApprovalsRows,
  ] = await Promise.all([
    // Inventory KPIs from lot_inventory_totals (spec 16 NFR — never raw lot_location_balances)
    getInventoryKpis(),
    // MTD receiving volume: WRR documents created this month
    getWrrVolumeTrend(mtdRange, activeFilter, "month"),
    // MTD dispatch volume: dispatched pick lists this month
    getPickListVolumeTrend(mtdRange, activeFilter, "month"),
    // Pending inspections count
    listInspectionCases(db, { status: "open", limit: 1 }),
    // 52-week activity heatmap
    getActivityHeatmap(activeFilter),
    // Quick Access: in-progress WRRs
    listWrrDocuments(db, { limit: 3, offset: 0, status: "receiving_in_progress" }),
    // Quick Access: allocated pick lists
    listPickLists(db, { limit: 3, offset: 0, status: "allocated" }),
    // Quick Access: open inspection cases
    listInspectionCases(db, { status: "open", limit: 3 }),
    // Quick Access: pending approvals (only if user has access)
    hasApprovalAccess
      ? listPendingApprovalRequests(db, { limit: 3, offset: 0 })
      : Promise.resolve({ rows: [], total: 0 }),
  ]);

  // MTD counts from aggregation results (rows may be empty when no data yet)
  const totalReceiptsMtd = mtdReceiptsRaw.length > 0
    ? Number((mtdReceiptsRaw[0] as Record<string, unknown>).count ?? 0)
    : 0;
  const totalDispatchesMtd = mtdDispatchesRaw.length > 0
    ? Number((mtdDispatchesRaw[0] as Record<string, unknown>).dispatched_count ?? 0)
    : 0;

  // Movement chart — derived from heatmap data (daily counts, last 8 data points for the chart)
  const movementChartData: MovementChartDatum[] = heatmapData
    .slice(-30) // last 30 days
    .map((point) => ({
      date: point.date,
      label: new Date(point.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: point.count,
    }));

  return (
    <div className="mx-auto max-w-container px-6 py-8 lg:px-8">
      <div className="mb-8">
        <h1 className="font-heading text-headline-xl font-extrabold text-on-surface">
          Reports &amp; Analytics
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Inventory activity, movement history, and KPI overview.
        </p>
      </div>

      {/* ── KPI Cards (FR-1.2: exactly 6 cards) ──────────────────────────────
          Spec 16 FR-1.2: Total Receipts MTD, Total Dispatches MTD,
          Total Lots In Stock, Total Committed Qty, Low Stock Items Count,
          Pending Inspections Count — do not add or drop any. */}
      <section aria-label="Key performance indicators">
        <KpiCardGroup>
          <KpiCard
            label="Total Receipts MTD"
            value={totalReceiptsMtd}
            trend={{ direction: "flat", pct: 0 }}
            icon={<PackageCheck size={22} />}
            linkTo="/receiving?tab=ledger"
          />
          <KpiCard
            label="Total Dispatches MTD"
            value={totalDispatchesMtd}
            trend={{ direction: "flat", pct: 0 }}
            icon={<Truck size={22} />}
            linkTo="/outgoing?tab=ledger"
          />
          <KpiCard
            label="Total Lots In Stock"
            value={inventoryKpis.totalLotsInStock}
            trend={{ direction: "flat", pct: 0 }}
            icon={<Layers size={22} />}
            linkTo="/inventory"
          />
          <KpiCard
            label="Total Committed Qty"
            value={inventoryKpis.totalCommittedQty}
            trend={{ direction: "flat", pct: 0 }}
            icon={<ClipboardCheck size={22} />}
            linkTo="/inventory?tab=pick-lists"
          />
          <KpiCard
            label="Low Stock Items"
            value={inventoryKpis.lowStockItemsCount}
            trend={{ direction: inventoryKpis.lowStockItemsCount > 0 ? "up" : "flat", pct: 0 }}
            icon={<TrendingDown size={22} />}
            statusColor={inventoryKpis.lowStockItemsCount > 0 ? "held" : undefined}
            linkTo="/inventory"
          />
          <KpiCard
            label="Pending Inspections"
            value={pendingInspectionsCount}
            trend={{ direction: pendingInspectionsCount > 0 ? "up" : "flat", pct: 0 }}
            icon={<FlaskConical size={22} />}
            statusColor={pendingInspectionsCount > 0 ? "pending" : undefined}
            linkTo="/inspection"
          />
        </KpiCardGroup>
      </section>

      {/* ── Activity Heatmap (FR-1.3: 52×7 grid, flow-filterable) ──────────
          Client component — filter changes navigate to /reports?filter=<flow>.
          Data is fetched server-side per the active filter in the URL. */}
      <section aria-label="Inventory activity heatmap" className="mt-8">
        <HeatmapSection data={heatmapData} flowFilter={activeFilter} />
      </section>

      {/* ── Quick Access Panel ────────────────────────────────────────────── */}
      <section aria-label="Quick access" className="mt-8">
        <h2 className="mb-4 font-heading text-headline-md font-semibold text-on-surface">
          Quick Access
        </h2>
        <QuickAccessSection
          recentWrrs={recentWrrs.map((w) => ({
            id: w.id,
            wrrNumber: w.wrrNumber,
            status: w.status,
            vendorPartyName: w.vendorPartyName,
          }))}
          openPickLists={openPickLists.map((pl) => ({
            id: pl.id,
            pickListNumber: pl.pickListNumber,
            status: pl.status,
          }))}
          openInspections={openInspections.map((c) => ({
            id: c.id,
            itemCode: c.itemCode,
            lotNumber: c.lotNumber,
          }))}
          pendingApprovals={pendingApprovalsRows.rows.map((r) => ({
            id: r.id,
            approvalType: r.approvalType,
          }))}
          hasApprovalAccess={hasApprovalAccess}
        />
      </section>

      {/* ── Movement Trend ────────────────────────────────────────────────── */}
      {movementChartData.length > 0 && (
        <section aria-label="Movement trend chart" className="mt-8">
          <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-headline-md font-semibold text-on-surface">
                  Movement Trend
                </h2>
                <p className="font-body text-body-sm text-text-grey">
                  Transactions per day — last 30 days
                </p>
              </div>
              <button
                type="button"
                className="flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                aria-label="Export movement history"
              >
                <Download size={16} aria-hidden="true" />
                Export
              </button>
            </div>
            <MovementChart data={movementChartData} />
          </div>
        </section>
      )}

      {/* ── Monthly Flow chart (static seed — FR-2 time-series pending) ──── */}
      <section aria-label="Monthly flow breakdown" className="mt-8">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
          <h2 className="font-heading text-headline-md font-semibold text-on-surface">Monthly Flow</h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Inbound vs. outbound volumes by flow type (FR-2 per-period time-series not yet aggregated — chart shows skeleton).
          </p>
          <MonthlyFlowChart data={MONTHLY_FLOW_SEED} />
        </div>
      </section>

      {!hasFinancialAccess && (
        <div className="mt-8 flex items-center gap-3 rounded-xl border border-outline-variant/30 bg-surface-light-grey px-4 py-4">
          <AlertTriangle size={20} className="shrink-0 text-status-pending" aria-hidden="true" />
          <p className="font-body text-body-md text-text-grey">
            Financial reporting sections (VMI billing, Trading margin) require{" "}
            <span className="font-mono text-mono-md">reporting.financial_read</span> access.
          </p>
        </div>
      )}
    </div>
  );
}
