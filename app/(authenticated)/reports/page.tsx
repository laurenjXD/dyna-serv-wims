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
  Download,
  DollarSign,
  Users,
  Warehouse,
  Activity,
  FileSpreadsheet,
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
import {
  getGmroiAndTurnover,
  getDeadStockAndAgingReport,
  getStarsAndDogsMatrix,
} from "@/lib/analytics/queries/trading";
import {
  getVendorScorecards,
  getConsignmentLiabilityAging,
  getSellThroughComparison,
  getVmiStockoutRisk,
} from "@/lib/analytics/queries/vmi";
import {
  getTotalDistributionCost,
  getWarehousePickingDensity,
  getStorageProfitabilityHeatmap,
  getSpaceUtilizationForecast,
} from "@/lib/analytics/queries/spatial";
import { listWrrDocuments } from "@/lib/db/queries/receiving";
import { listPickLists } from "@/lib/db/queries/withdrawals";
import { listInspectionCases } from "@/lib/db/queries/transfers";
import { listPendingApprovalRequests } from "@/lib/db/queries/approvals";
import { HeatmapSection } from "./_components/HeatmapSection";
import { TradingCapitalSection } from "./_components/TradingCapitalSection";
import { VmiConsignmentSection } from "./_components/VmiConsignmentSection";
import { SpatialAnalyticsSection } from "./_components/SpatialAnalyticsSection";
import type { FlowType } from "@/components/analytics/types";

// ─── Flow filter mapping ───────────────────────────────────────────────────────

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
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">Open Pick Lists</h3>
          <Link href="/outgoing" className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy">
            View all
          </Link>
        </div>
        {openPickLists.length === 0 ? (
          <p className="px-4 py-6 font-body text-body-md text-text-grey">No open pick lists.</p>
        ) : (
          <div className="divide-y divide-outline-variant/30">
            {openPickLists.map((pl) => (
              <div key={pl.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-mono-md font-bold text-on-surface truncate">{pl.pickListNumber}</p>
                  <p className="font-label text-label uppercase text-status-pending truncate">{pl.status}</p>
                </div>
                <Link href={`/outgoing/${pl.id}/pick`} className="shrink-0 inline-flex h-9 items-center rounded bg-primary px-3 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy">
                  Pick
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Approvals or Inspections */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">Open Inspections</h3>
          <Link href="/inspection" className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy">
            View all
          </Link>
        </div>
        {openInspections.length === 0 ? (
          <p className="px-4 py-6 font-body text-body-md text-text-grey">No open inspection cases.</p>
        ) : (
          <div className="divide-y divide-outline-variant/30">
            {openInspections.map((insp) => (
              <div key={insp.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-mono-md font-bold text-on-surface truncate">{insp.itemCode}</p>
                  <p className="font-mono text-mono-sm text-text-grey truncate">Lot {insp.lotNumber}</p>
                </div>
                <Link href={`/inspection`} className="shrink-0 inline-flex h-9 items-center rounded bg-primary px-3 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy">
                  Inspect
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Monthly flow static seed ─────────────────────────────────────────────────
const MONTHLY_FLOW_SEED: MonthlyFlowDatum[] = [
  { month: "Apr", vmi: 12400, trading: 4200, supplies: 850 },
  { month: "May", vmi: 14100, trading: 4900, supplies: 920 },
  { month: "Jun", vmi: 15600, trading: 5300, supplies: 980 },
  { month: "Jul", vmi: 16200, trading: 5100, supplies: 1050 },
  { month: "Aug", vmi: 17800, trading: 6200, supplies: 1100 },
  { month: "Sep", vmi: 18400, trading: 6500, supplies: 1180 },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ filter?: string; tab?: string }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const { filter: filterParam, tab: tabParam } = await searchParams;

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

  const activeTab = tabParam ?? "operational";

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
    gmroiData,
    agingRows,
    starsAndDogsData,
    vendorScorecards,
    liabilityAging,
    sellThroughData,
    stockoutRisks,
    tdcData,
    pickingDensity,
    profitabilityHeatmap,
    spaceForecast,
  ] = await Promise.all([
    getInventoryKpis(),
    getWrrVolumeTrend(mtdRange, activeFilter, "month"),
    getPickListVolumeTrend(mtdRange, activeFilter, "month"),
    listInspectionCases(db, { status: "open", limit: 1 }),
    getActivityHeatmap(activeFilter),
    listWrrDocuments(db, { limit: 3, offset: 0, status: "receiving_in_progress" }),
    listPickLists(db, { limit: 3, offset: 0, status: "allocated" }),
    listInspectionCases(db, { status: "open", limit: 3 }),
    hasApprovalAccess
      ? listPendingApprovalRequests(db, { limit: 3, offset: 0 })
      : Promise.resolve({ rows: [], total: 0 }),
    // BI Section Datasets
    getGmroiAndTurnover(),
    getDeadStockAndAgingReport(),
    getStarsAndDogsMatrix(),
    getVendorScorecards(),
    getConsignmentLiabilityAging(),
    getSellThroughComparison(),
    getVmiStockoutRisk(),
    getTotalDistributionCost(),
    getWarehousePickingDensity(),
    getStorageProfitabilityHeatmap(),
    getSpaceUtilizationForecast(),
  ]);

  const totalReceiptsMtd = mtdReceiptsRaw.length > 0
    ? Number((mtdReceiptsRaw[0] as Record<string, unknown>).count ?? 0)
    : 0;
  const totalDispatchesMtd = mtdDispatchesRaw.length > 0
    ? Number((mtdDispatchesRaw[0] as Record<string, unknown>).dispatched_count ?? 0)
    : 0;

  const movementChartData: MovementChartDatum[] = heatmapData
    .slice(-30)
    .map((point) => ({
      date: point.date,
      label: new Date(point.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: point.count,
    }));

  return (
    <div className="mx-auto max-w-container px-6 py-8 lg:px-8">
      {/* ── Page Header & Bento Navigation Tabs ───────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-headline-xl font-extrabold text-on-surface">
            Data Analytics &amp; Reports
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Executive oversight, vendor liabilities, spatial efficiency, and BI analytics.
          </p>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 p-1.5 font-label text-xs font-semibold">
          <Link
            href="/reports?tab=operational"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors ${
              activeTab === "operational"
                ? "bg-white text-brand-navy shadow-sm"
                : "text-text-grey hover:text-on-surface"
            }`}
          >
            <Activity size={15} />
            Operational &amp; Heatmap
          </Link>

          <Link
            href="/reports?tab=trading"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors ${
              activeTab === "trading"
                ? "bg-white text-brand-navy shadow-sm"
                : "text-text-grey hover:text-on-surface"
            }`}
          >
            <DollarSign size={15} />
            Trading &amp; Capital
          </Link>

          <Link
            href="/reports?tab=vmi"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors ${
              activeTab === "vmi"
                ? "bg-white text-brand-navy shadow-sm"
                : "text-text-grey hover:text-on-surface"
            }`}
          >
            <Users size={15} />
            VMI &amp; Consignment
          </Link>

          <Link
            href="/reports?tab=spatial"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors ${
              activeTab === "spatial"
                ? "bg-white text-brand-navy shadow-sm"
                : "text-text-grey hover:text-on-surface"
            }`}
          >
            <Warehouse size={15} />
            Warehouse &amp; Spatial
          </Link>

          <Link
            href="/reports?tab=export"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors ${
              activeTab === "export"
                ? "bg-white text-brand-navy shadow-sm"
                : "text-text-grey hover:text-on-surface"
            }`}
          >
            <FileSpreadsheet size={15} />
            Exports
          </Link>
        </div>
      </div>

      {/* ── TAB 1: Operational & Flow Overview ──────────────────────────────── */}
      {activeTab === "operational" && (
        <div className="space-y-8">
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

          <section aria-label="Inventory activity heatmap">
            <HeatmapSection data={heatmapData} flowFilter={activeFilter} />
          </section>

          <section aria-label="Quick access">
            <h2 className="mb-4 font-heading text-headline-md font-semibold text-on-surface">
              Quick Action Queues
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

          {movementChartData.length > 0 && (
            <section aria-label="Movement trend chart">
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
                  <Link
                    href="/reports?tab=export"
                    className="flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    <Download size={16} aria-hidden="true" />
                    Export
                  </Link>
                </div>
                <MovementChart data={movementChartData} />
              </div>
            </section>
          )}

          <section aria-label="Monthly flow breakdown">
            <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
              <h2 className="font-heading text-headline-md font-semibold text-on-surface">Monthly Flow</h2>
              <p className="mt-1 font-body text-body-sm text-text-grey">
                Inbound vs. outbound volumes by flow type (VMI, Trading, Supplies).
              </p>
              <MonthlyFlowChart data={MONTHLY_FLOW_SEED} />
            </div>
          </section>
        </div>
      )}

      {/* ── TAB 2: Trading & Capital BI ─────────────────────────────────────── */}
      {activeTab === "trading" && (
        <div>
          {hasFinancialAccess ? (
            <TradingCapitalSection
              gmroi={gmroiData}
              agingRows={agingRows}
              starsAndDogs={starsAndDogsData}
            />
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-outline-variant/30 bg-surface-light-grey p-8 text-center">
              <AlertTriangle size={24} className="shrink-0 text-status-pending" />
              <p className="font-body text-body-md text-text-grey">
                Trading capital and GMROI analytics require{" "}
                <span className="font-mono text-mono-md">reporting.financial_read</span> permission.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: VMI & Consignment BI ─────────────────────────────────────── */}
      {activeTab === "vmi" && (
        <VmiConsignmentSection
          vendorScorecards={vendorScorecards}
          liabilityAging={liabilityAging}
          sellThrough={sellThroughData}
          stockoutRisks={stockoutRisks}
        />
      )}

      {/* ── TAB 4: Warehouse & Spatial Analytics ────────────────────────────── */}
      {activeTab === "spatial" && (
        <SpatialAnalyticsSection
          tdcData={tdcData}
          pickingDensity={pickingDensity}
          profitabilityHeatmap={profitabilityHeatmap}
          spaceForecast={spaceForecast}
        />
      )}

      {/* ── TAB 5: Data Extract Center ──────────────────────────────────────── */}
      {activeTab === "export" && (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
          <h2 className="font-heading text-headline-md font-semibold text-on-surface">
            Data Extract &amp; Reports Export Center
          </h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Download keyset-paginated Excel (.xlsx) and CSV exports with audit trail compliance.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="font-semibold text-on-surface">Transaction Movement Ledger</p>
              <p className="mt-1 text-xs text-text-grey">Complete immutable inventory transaction log with lot &amp; location tracking.</p>
              <a
                href="/api/reports/export?type=transactions"
                download
                className="mt-4 inline-flex h-9 items-center gap-2 rounded bg-primary px-3 font-label text-xs text-white hover:bg-primary-hover"
              >
                <Download size={14} /> Download Ledger (CSV)
              </a>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <p className="font-semibold text-on-surface">Connected Lot History Export</p>
              <p className="mt-1 text-xs text-text-grey">3-year tiered audit history of every lot life-cycle event.</p>
              <a
                href="/api/reports/export?type=lots"
                download
                className="mt-4 inline-flex h-9 items-center gap-2 rounded bg-primary px-3 font-label text-xs text-white hover:bg-primary-hover"
              >
                <Download size={14} /> Export Lot Workbook (XLSX)
              </a>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <p className="font-semibold text-on-surface">Vendor Consignment Balances</p>
              <p className="mt-1 text-xs text-text-grey">Current unbilled consumed inventory balances by vendor party.</p>
              <a
                href="/api/reports/export?type=vmi_balances"
                download
                className="mt-4 inline-flex h-9 items-center gap-2 rounded bg-primary px-3 font-label text-xs text-white hover:bg-primary-hover"
              >
                <Download size={14} /> Export VMI Balances
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
