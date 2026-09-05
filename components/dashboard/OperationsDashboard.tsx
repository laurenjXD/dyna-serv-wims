"use client";

import React, { useState } from "react";
import { DashboardHeader } from "./DashboardHeader";
import { KpiGrid } from "./KpiGrid";
import { FlowMovementChart } from "./FlowMovementChart";
import { DeliveryPerformanceChart } from "./DeliveryPerformanceChart";
import { LocationOccupancyChart } from "./LocationOccupancyChart";
import { MonthlyHeatmap } from "./MonthlyHeatmap";
import { MasterInventoryTable } from "./MasterInventoryTable";
import { verifyBarcodeAction } from "@/lib/actions/scanner";
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
  FileText,
  Scan,
  Camera,
  X,
  PieChart,
  Activity,
  Loader2,
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
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null);
  const [reportErrorMessage, setReportErrorMessage] = useState<string | null>(null);
  const [mobilePerfTab, setMobilePerfTab] = useState<"otif" | "occupancy">("otif");
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [customScanInput, setCustomScanInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [activeStockFilter, setActiveStockFilter] = useState<"all" | "low_stock" | "held">("all");

  const handleGenerateReport = () => {
    setReportSuccessMessage("Inventory Valuation & Live Performance Summary generated successfully.");
    setTimeout(() => {
      setReportSuccessMessage(null);
    }, 4000);
  };

  const handleExecuteScan = async (code: string) => {
    if (!code || isScanning) return;
    setIsScanning(true);
    try {
      const res = await verifyBarcodeAction(code);
      if (res.success) {
        setReportErrorMessage(null);
        setReportSuccessMessage(`Live Barcode Verified: ${res.data?.title} (${res.data?.code}) · ${res.data?.details}`);
      } else {
        setReportSuccessMessage(null);
        setReportErrorMessage(res.message);
      }
      setIsScanModalOpen(false);
      setCustomScanInput("");
      setTimeout(() => {
        setReportSuccessMessage(null);
        setReportErrorMessage(null);
      }, 5000);
    } catch (err) {
      console.error(err);
      setReportErrorMessage("Failed to verify barcode with server.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-24 lg:pb-8">
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
        <div className="col-span-1">
          <LocationOccupancyChart initialData={occupancyData} />
        </div>

        {/* Total Delivery Performance Multi-Line Chart (Full Width) */}
        <div className="col-span-3">
          <DeliveryPerformanceChart initialData={deliveryPerformance} />
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
            <DeliveryPerformanceChart initialData={deliveryPerformance} />
          ) : (
            <LocationOccupancyChart initialData={occupancyData} />
          )}
        </div>
      </div>

      {/* ── 4. Monthly Location Heatmap with Interactive Audit Drawer ─────── */}
      <MonthlyHeatmap initialGrid={heatmapGrid} />

      {/* ── 5. Master Inventory Live Positions ────────────────────────────── */}
      <MasterInventoryTable initialData={masterInventory} />

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 📱 FIXED FLOATING BOTTOM ACTION DOCK (< 1024px)                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="fixed bottom-3 inset-x-3 z-40 lg:hidden flex items-center justify-between gap-2.5 bg-brand-navy/95 text-white p-2 rounded-2xl shadow-2xl backdrop-blur-lg border border-white/20">
        {/* Prominent Scan Barcode/QR Camera Button */}
        <button
          type="button"
          onClick={() => setIsScanModalOpen(true)}
          className="flex-1 flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-hover px-4 font-heading text-sm font-bold text-white shadow-md active:scale-95 transition-transform"
        >
          <Camera size={19} />
          <span>Scan Barcode / QR</span>
        </button>

        {/* Quick PDF Export */}
        <button
          type="button"
          onClick={handleGenerateReport}
          aria-label="Generate Quick PDF Report"
          className="flex min-h-[48px] w-12 items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/10 active:scale-95 transition-transform shrink-0"
        >
          <FileText size={18} />
        </button>
      </div>

      {/* ── Interactive Scan Modal / Drawer ───────────────────────────────── */}
      {isScanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-surface-white p-6 shadow-elevation-4 border border-slate-200 animate-in slide-in-from-bottom-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-brand-navy">
                  <Scan size={18} />
                </div>
                <div>
                  <h3 className="font-heading text-headline-sm font-extrabold text-brand-navy">
                    Live Barcode Scanner
                  </h3>
                  <p className="font-body text-[11px] text-text-grey">
                    Query live SKU, Bin Location, or Lot Number
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScanModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Viewfinder simulation */}
            <div className="mt-4 relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-slate-950 p-6 text-center text-white overflow-hidden min-h-[160px]">
              <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-primary/10 animate-pulse pointer-events-none"></div>
              <div className="h-24 w-24 rounded-xl border-2 border-primary relative flex items-center justify-center">
                <div className="h-0.5 w-full bg-red-500 shadow-[0_0_8px_#ef4444] animate-bounce"></div>
              </div>
              <p className="mt-3 font-mono text-xs text-slate-300">
                Ready for physical handheld or camera scanner
              </p>
            </div>

            {/* Manual Code Entry */}
            <div className="mt-4 space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleExecuteScan(customScanInput);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Enter SKU, Bin, or Lot..."
                  value={customScanInput}
                  onChange={(e) => setCustomScanInput(e.target.value)}
                  className="flex-1 h-11 rounded-xl border border-slate-200 px-3 font-mono text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isScanning || !customScanInput.trim()}
                  className="h-11 px-4 rounded-xl bg-brand-navy text-white font-label text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isScanning && <Loader2 size={13} className="animate-spin" />}
                  <span>Verify</span>
                </button>
              </form>

              {/* Quick Preset Buttons */}
              <div className="pt-2 border-t border-slate-100">
                <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey mb-2">
                  Sample Master SKU Lookups:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleExecuteScan("SKU-DSGC-8841")}
                    className="flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs font-bold text-slate-800 hover:bg-blue-50 active:scale-95"
                  >
                    SKU-DSGC-8841
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExecuteScan("A1-01")}
                    className="flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs font-bold text-slate-800 hover:bg-blue-50 active:scale-95"
                  >
                    BIN-A1-01
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
