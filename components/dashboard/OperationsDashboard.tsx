"use client";

import React, { useState } from "react";
import { DashboardHeader, type DateHorizon } from "./DashboardHeader";
import { KpiGrid } from "./KpiGrid";
import { FlowMovementChart } from "./FlowMovementChart";
import { DeliveryPerformanceChart } from "./DeliveryPerformanceChart";
import { LocationOccupancyChart } from "./LocationOccupancyChart";
import { MonthlyHeatmap } from "./MonthlyHeatmap";
import { MasterInventoryTable } from "./MasterInventoryTable";
import { useRouter } from "next/navigation";
import type {
  DashboardKpiData,
  MonthlyFlowDatum,
  DeliveryPerformanceDatum,
  DeliveryPerformanceMiniMetrics,
  LocationOccupancyDatum,
  HeatmapCellDatum,
  MasterInventoryItem,
} from "./types";
import {
  CheckCircle2,
  AlertCircle,
  PieChart,
  Activity,
} from "lucide-react";

export interface OperationsDashboardProps {
  kpis?: DashboardKpiData;
  flowData?: Record<string, MonthlyFlowDatum[]>;
  occupancyData?: LocationOccupancyDatum[];
  deliveryPerformance?: {
    chartData: DeliveryPerformanceDatum[];
    miniMetrics: DeliveryPerformanceMiniMetrics;
  };
  heatmapGrid?: HeatmapCellDatum[][];
  masterInventory?: MasterInventoryItem[];
}

const DEFAULT_KPIS: DashboardKpiData = {
  valuation: { total: 2480500, trendPct: 4.2, trendDirection: "up", vmiAmount: 1600000, tradingAmount: 880500 },
  floorQueues: { pendingReceivingWrrs: 12, activePickLists: 8, pendingQcInspections: 3 },
  stockHealth: { lowStockCount: 5, heldLotsCount: 2, qcPassRatePct: 97.4 },
  financialSummary: { vmiDailyCbmRate: 0.48, vmiClientCount: 3, tradingMarginPct: 18.4, tradingMarginTargetPct: 20.0, pendingBillingAmount: 34200, pendingInvoicesCount: 7 },
};

export function OperationsDashboard({
  kpis = DEFAULT_KPIS,
  flowData,
  occupancyData,
  deliveryPerformance,
  heatmapGrid,
  masterInventory,
}: OperationsDashboardProps) {
  const router = useRouter();
  const [dateHorizon, setDateHorizon] = useState<DateHorizon>("30D MTD");
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null);
  const [reportErrorMessage, setReportErrorMessage] = useState<string | null>(null);
  const [mobilePerfTab, setMobilePerfTab] = useState<"otif" | "occupancy">("otif");
  const [activeStockFilter, setActiveStockFilter] = useState<"all" | "low_stock" | "held">("all");

  const handleRefresh = async () => {
    router.refresh();
  };

  // Dynamically filter chart data based on date horizon
  const filteredDeliveryPerformance = React.useMemo(() => {
    if (!deliveryPerformance) return undefined;
    const raw = deliveryPerformance.chartData || [];
    let sliced = raw;
    if (dateHorizon === "Today") sliced = raw.slice(-2);
    else if (dateHorizon === "7D") sliced = raw.slice(-3);
    else if (dateHorizon === "30D MTD") sliced = raw.slice(-6);
    else if (dateHorizon === "90D QTD") sliced = raw.slice(-9);

    return {
      chartData: sliced,
      miniMetrics: deliveryPerformance.miniMetrics,
    };
  }, [deliveryPerformance, dateHorizon]);

  const handleGenerateReport = async () => {
    try {
      setReportErrorMessage(null);
      const res = await fetch("/api/dashboard/inventory-pdf");
      if (!res.ok) {
        throw new Error(`Failed to generate PDF (${res.statusText})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wms-operations-inventory-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setReportSuccessMessage("Inventory Valuation & Live Performance Summary PDF generated and downloaded successfully.");
      setTimeout(() => {
        setReportSuccessMessage(null);
      }, 5000);
    } catch (err) {
      console.error(err);
      setReportErrorMessage("Failed to generate and download PDF report.");
    }
  };

  return (
    <div className="mx-auto max-w-container bg-background px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-8 space-y-6">
      {/* ── 1. Header & Global Toolbar ────────────────────────────────────── */}
      <DashboardHeader
        dateHorizon={dateHorizon}
        onDateHorizonChange={setDateHorizon}
        onRefresh={handleRefresh}
        onGenerateReport={handleGenerateReport}
      />

      {/* Report Generation Notification Toast */}
      {reportSuccessMessage && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{reportSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setReportSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-950 font-mono text-[11px] underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Message Toast */}
      {reportErrorMessage && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-900 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{reportErrorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setReportErrorMessage(null)}
            className="text-rose-700 hover:text-rose-950 font-mono text-[11px] underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── 2. Top Metric & KPI Cards (Bento Row) ─────────────────────────── */}
      <KpiGrid
        data={kpis}
        onFilterStockHealth={setActiveStockFilter}
        activeStockFilter={activeStockFilter}
      />

      {/* ── 3. Charts & Analytics Section ─────────────────────────────────── */}
      {/* 🖥️ DESKTOP BENTO GRID (>= 1024px) */}
      <div className="hidden lg:grid grid-cols-3 gap-6">
        {/* Monthly Flow Movement (2 Cols on Desktop) */}
        <div className="col-span-2">
          <FlowMovementChart initialData={flowData} />
        </div>

        {/* Warehouse Location Occupancy (1 Col on Desktop) */}
        <div className="col-span-1 h-full">
          <LocationOccupancyChart initialData={occupancyData} />
        </div>

        {/* Total Delivery Performance Multi-Line Chart (Full Width) */}
        <div className="col-span-3">
          <DeliveryPerformanceChart initialData={filteredDeliveryPerformance} />
        </div>
      </div>

      {/* 📱 MOBILE COMBINED PERFORMANCE CARDS (< 1024px) */}
      <div className="block lg:hidden space-y-4">
        {/* Throughput Flow Movement */}
        <FlowMovementChart initialData={flowData} />

        {/* Segmented Toggle Card: [ Delivery OTIF ] | [ Capacity Donut ] */}
        <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-bold mb-4">
            <button
              type="button"
              onClick={() => setMobilePerfTab("otif")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all ${
                mobilePerfTab === "otif"
                  ? "bg-white text-brand-navy shadow-2xs font-extrabold"
                  : "text-slate-600"
              }`}
            >
              <Activity size={14} />
              <span>Delivery OTIF SLA</span>
            </button>

            <button
              type="button"
              onClick={() => setMobilePerfTab("occupancy")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all ${
                mobilePerfTab === "occupancy"
                  ? "bg-white text-brand-navy shadow-2xs font-extrabold"
                  : "text-slate-600"
              }`}
            >
              <PieChart size={14} />
              <span>Capacity Donut</span>
            </button>
          </div>

          {mobilePerfTab === "otif" ? (
            <DeliveryPerformanceChart initialData={filteredDeliveryPerformance} />
          ) : (
            <LocationOccupancyChart initialData={occupancyData} />
          )}
        </div>
      </div>

      {/* ── 4. Monthly Location Heatmap with Interactive Audit Drawer ─────── */}
      <MonthlyHeatmap initialGrid={heatmapGrid} />

      {/* ── 5. Master Inventory Live Positions ────────────────────────────── */}
      <MasterInventoryTable initialData={masterInventory} statusFilter={activeStockFilter} />

    </div>
  );
}
