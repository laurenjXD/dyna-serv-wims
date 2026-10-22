"use client";

import React, { useState } from "react";
import { DashboardHeader, type DateHorizon } from "./DashboardHeader";
import { KpiGrid } from "./KpiGrid";
import { FlowMovementChart } from "./FlowMovementChart";
import { DeliveryPerformanceChart } from "./DeliveryPerformanceChart";
import { LocationOccupancyChart } from "./LocationOccupancyChart";
import { DashboardOmniSearch } from "./DashboardOmniSearch";
import { useRouter } from "next/navigation";
import type {
  DashboardKpiData,
  MonthlyFlowDatum,
  DeliveryPerformanceDatum,
  DeliveryPerformanceMiniMetrics,
  LocationOccupancyDatum,
} from "./types";
import {
  CheckCircle2,
  AlertCircle,
  PieChart,
  Activity,
} from "lucide-react";
import { WorkflowState } from "@/components/ui/WorkflowState";

export interface OperationsDashboardProps {
  kpis?: DashboardKpiData;
  flowData?: Record<string, MonthlyFlowDatum[]>;
  occupancyData?: LocationOccupancyDatum[];
  deliveryPerformance?: {
    chartData: DeliveryPerformanceDatum[];
    miniMetrics: DeliveryPerformanceMiniMetrics;
  };
  recentActivity?: Array<{ id: string; description: string; timestamp?: string }>;
}

export function OperationsDashboard({
  kpis,
  flowData,
  occupancyData,
  deliveryPerformance,
  recentActivity = [],
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
    <div className="mx-auto max-w-container bg-background px-4 py-6 pb-32 sm:px-6 lg:px-8 lg:pb-8 space-y-6">
      {/* ── 1. Header & Global Toolbar ────────────────────────────────────── */}
      <DashboardHeader
        dateHorizon={dateHorizon}
        onDateHorizonChange={setDateHorizon}
        onRefresh={handleRefresh}
        onGenerateReport={handleGenerateReport}
      />

      <DashboardOmniSearch />

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
      {kpis ? (
        <KpiGrid
          data={kpis}
          onFilterStockHealth={setActiveStockFilter}
          activeStockFilter={activeStockFilter}
        />
      ) : (
        <WorkflowState
          kind="unavailable"
          title="Live KPI data is unavailable"
          description="The dashboard could not load current totals. No placeholder values are being shown. Refresh and retry, or continue with the available operational views."
          actionLabel="Refresh dashboard"
          onAction={() => router.refresh()}
          testId="dashboard-kpis-unavailable"
        />
      )}

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

      <section aria-labelledby="recent-activity-heading" className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent-activity-heading" className="font-heading text-title-md font-bold text-brand-navy">Recent activity</h2>
          <span className="font-label text-label-xs font-bold uppercase tracking-wide text-text-grey">Live feed</span>
        </div>
        {recentActivity.length > 0 ? (
          <ol className="mt-3 divide-y divide-border">
            {recentActivity.map((activity) => (
              <li key={activity.id} className="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0 font-body text-body-sm text-on-surface">{activity.description}</span>
                {activity.timestamp && <time dateTime={activity.timestamp} className="shrink-0 font-mono text-label-xs text-text-grey">{new Date(activity.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 font-body text-body-sm text-text-grey">No recent warehouse activity.</p>
        )}
      </section>

    </div>
  );
}
