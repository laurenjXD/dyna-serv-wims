"use client";

import React, { useState } from "react";
import { DashboardHeader } from "./DashboardHeader";
import { KpiGrid } from "./KpiGrid";
import { FlowMovementChart } from "./FlowMovementChart";
import { DeliveryPerformanceChart } from "./DeliveryPerformanceChart";
import { LocationOccupancyChart } from "./LocationOccupancyChart";
import { MonthlyHeatmap } from "./MonthlyHeatmap";
import { MasterInventoryTable } from "./MasterInventoryTable";
import { DASHBOARD_KPIS_SEED } from "./data/seedData";
import { CheckCircle2, FileText, Download } from "lucide-react";

export function OperationsDashboard() {
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null);

  const handleGenerateReport = () => {
    setReportSuccessMessage("Inventory Valuation & Performance Summary PDF generated successfully.");
    setTimeout(() => {
      setReportSuccessMessage(null);
    }, 4000);
  };

  return (
    <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* ── 1. Header & Global Toolbar ────────────────────────────────────── */}
      <DashboardHeader onGenerateReport={handleGenerateReport} />

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

      {/* ── 2. Top Metric & KPI Cards (Bento Row) ─────────────────────────── */}
      <KpiGrid data={DASHBOARD_KPIS_SEED} />

      {/* ── 3. Charts & Analytics Section (Bento Grid) ────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Monthly Flow Movement (2 Cols on Desktop) */}
        <div className="lg:col-span-2">
          <FlowMovementChart />
        </div>

        {/* Warehouse Location Occupancy (1 Col on Desktop) */}
        <div className="lg:col-span-1">
          <LocationOccupancyChart />
        </div>

        {/* Total Delivery Performance Multi-Line Chart (Full Width) */}
        <div className="lg:col-span-3">
          <DeliveryPerformanceChart />
        </div>
      </div>

      {/* ── 4. Monthly Location Heatmap with Interactive Audit Drawer ─────── */}
      <MonthlyHeatmap />

      {/* ── 5. Master Inventory Live Positions (TanStack Data Table) ──────── */}
      <MasterInventoryTable />
    </div>
  );
}
