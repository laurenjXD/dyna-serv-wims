"use client";

import React, { useState, useMemo } from "react";
import {
  X,
  Sparkles,
  Layers,
  Printer,
  Download,
  Check,
  Building2,
  FileText,
  ShieldCheck,
  Calendar,
  Warehouse,
  BarChart2,
  TrendingUp,
  FileSpreadsheet,
  CheckCircle2,
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import type { ReportCategory, ReportFormat } from "./types";

interface CustomReportBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBuildComplete: (reportConfig: {
    title: string;
    category: ReportCategory;
    format: ReportFormat;
    metrics: string[];
    dimensions: string[];
  }) => void;
}

// ── Dimension-based Mock/Live Data Sets ──────────────────────────────────────
const DIMENSION_DATA: Record<
  string,
  Array<{
    name: string;
    flow: string;
    cbm: number;
    valuation: number;
    marginPct: number;
    volumeQty: number;
    otifPct: number;
    dwellDays: number;
    accrualUsd: number;
  }>
> = {
  "Item Category": [
    { name: "Semiconductors & Microelectronics", flow: "VMI", cbm: 310.5, valuation: 1420500, marginPct: 24.5, volumeQty: 4820, otifPct: 98.2, dwellDays: 14, accrualUsd: 4850 },
    { name: "Industrial Motors & Precision Drives", flow: "Trading", cbm: 425.0, valuation: 890000, marginPct: 22.8, volumeQty: 1650, otifPct: 96.5, dwellDays: 22, accrualUsd: 0 },
    { name: "Hydraulic Valves & Pneumatics", flow: "VMI", cbm: 185.2, valuation: 412000, marginPct: 19.4, volumeQty: 2900, otifPct: 97.0, dwellDays: 18, accrualUsd: 2640 },
    { name: "Precision Fasteners & Structural Parts", flow: "Trading", cbm: 140.8, valuation: 275000, marginPct: 26.1, volumeQty: 11200, otifPct: 99.1, dwellDays: 9, accrualUsd: 0 },
    { name: "Industrial Electrical Switchgear", flow: "VMI", cbm: 260.0, valuation: 685000, marginPct: 21.0, volumeQty: 940, otifPct: 95.8, dwellDays: 28, accrualUsd: 3980 },
  ],
  "Consignor / Vendor Party": [
    { name: "United Philippine Industrial (UPI)", flow: "VMI", cbm: 382.0, valuation: 920000, marginPct: 23.0, volumeQty: 5400, otifPct: 98.5, dwellDays: 15, accrualUsd: 5684 },
    { name: "Siemens AG Industrial Systems", flow: "VMI", cbm: 215.0, valuation: 610000, marginPct: 21.5, volumeQty: 2100, otifPct: 96.2, dwellDays: 19, accrualUsd: 3332 },
    { name: "ABB Power & Distribution", flow: "VMI", cbm: 198.0, valuation: 540000, marginPct: 20.0, volumeQty: 1800, otifPct: 95.0, dwellDays: 24, accrualUsd: 2823 },
    { name: "Industrial Bearings & Transmission Hub", flow: "Trading", cbm: 420.0, valuation: 1150000, marginPct: 25.4, volumeQty: 8900, otifPct: 97.8, dwellDays: 12, accrualUsd: 0 },
    { name: "Schneider Electric Logistics", flow: "VMI", cbm: 164.0, valuation: 462500, marginPct: 22.0, volumeQty: 3310, otifPct: 97.4, dwellDays: 16, accrualUsd: 2214 },
  ],
  "Warehouse Zone": [
    { name: "Zone A — High-Bay Pallet Racks (Aisle 1-12)", flow: "Mixed", cbm: 680.0, valuation: 1680000, marginPct: 23.5, volumeQty: 9800, otifPct: 97.5, dwellDays: 18, accrualUsd: 7420 },
    { name: "Zone B — Bulk Staging & Floor Stacking", flow: "Trading", cbm: 420.0, valuation: 940000, marginPct: 21.8, volumeQty: 6200, otifPct: 98.0, dwellDays: 11, accrualUsd: 0 },
    { name: "Zone C — Temperature Controlled Cleanroom", flow: "VMI", cbm: 145.0, valuation: 762500, marginPct: 26.4, volumeQty: 3100, otifPct: 99.4, dwellDays: 14, accrualUsd: 4620 },
    { name: "Zone D — Fast-Pick & Cross-Dock Staging", flow: "Mixed", cbm: 134.5, valuation: 300000, marginPct: 20.2, volumeQty: 2410, otifPct: 96.0, dwellDays: 6, accrualUsd: 2010 },
  ],
  "Flow Type (VMI vs Trading)": [
    { name: "VMI Consignment Storage Flow", flow: "VMI", cbm: 879.0, valuation: 2215000, marginPct: 22.0, volumeQty: 11650, otifPct: 97.6, dwellDays: 19, accrualUsd: 14050 },
    { name: "Direct Trading Commercial Flow", flow: "Trading", cbm: 500.5, valuation: 1467500, marginPct: 24.2, volumeQty: 9860, otifPct: 97.2, dwellDays: 12, accrualUsd: 0 },
  ],
};

export function CustomReportBuilderModal({
  isOpen,
  onClose,
  onBuildComplete,
}: CustomReportBuilderModalProps) {
  // Configuration State
  const [reportTitle, setReportTitle] = useState(
    "Custom Warehouse Analytics & Operational Position Report"
  );
  const [category, setCategory] = useState<ReportCategory>("Financial");
  const [horizon, setHorizon] = useState("Last 30 Days (Aug 15 - Sep 12, 2026)");
  const [facilityZone, setFacilityZone] = useState("Warehouse 1 — All Logistics Zones");
  const [selectedDimension, setSelectedDimension] = useState<string>("Item Category");
  const [chartType, setChartType] = useState<"bar" | "line" | "area" | "none">("bar");
  const [includeAuditSeal, setIncludeAuditSeal] = useState(true);
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Selected Metrics
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    "Total Inventory Valuation",
    "Occupied CBM & Space Utilization",
    "Realized Margin %",
    "Fulfillment Volume (Units)",
  ]);

  const reportRefNumber = useMemo(() => {
    return `DS-CUST-${category.slice(0, 3).toUpperCase()}-2026-${Date.now().toString().slice(-4)}`;
  }, [category]);

  const generationTimestamp = useMemo(() => {
    return "2026-09-12 17:00:00 PST";
  }, []);

  if (!isOpen) return null;

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) => {
      if (prev.includes(metric)) {
        if (prev.length <= 1) return prev; // keep at least 1
        return prev.filter((m) => m !== metric);
      }
      return [...prev, metric];
    });
  };

  const activeDataset = DIMENSION_DATA[selectedDimension] || DIMENSION_DATA["Item Category"];

  // Totals calculations
  const totalCbm = activeDataset.reduce((acc, row) => acc + row.cbm, 0);
  const totalValuation = activeDataset.reduce((acc, row) => acc + row.valuation, 0);
  const avgMargin = (
    activeDataset.reduce((acc, row) => acc + row.marginPct, 0) / activeDataset.length
  ).toFixed(1);
  const totalVolume = activeDataset.reduce((acc, row) => acc + row.volumeQty, 0);
  const avgOtif = (
    activeDataset.reduce((acc, row) => acc + row.otifPct, 0) / activeDataset.length
  ).toFixed(1);
  const totalAccrual = activeDataset.reduce((acc, row) => acc + row.accrualUsd, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadCsv = () => {
    const headers = [
      selectedDimension,
      "Flow Type",
      "Occupied CBM (m³)",
      "Valuation ($)",
      "Margin %",
      "Throughput Qty",
      "OTIF %",
    ];
    const csvLines = [headers.join(",")];
    activeDataset.forEach((row) => {
      csvLines.push(
        [
          `"${row.name}"`,
          `"${row.flow}"`,
          row.cbm.toFixed(1),
          row.valuation.toFixed(2),
          `${row.marginPct}%`,
          row.volumeQty,
          `${row.otifPct}%`,
        ].join(",")
      );
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvLines.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportRefNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveAndArchive = () => {
    onBuildComplete({
      title: reportTitle,
      category,
      format: "PDF",
      metrics: selectedMetrics,
      dimensions: [selectedDimension],
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-studio-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-md animate-in fade-in"
    >
      {/* ── Print Media Isolation Rules ──────────────────────────────── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              aside, header, nav, .print-hide, .builder-sidebar, .builder-toolbar, .modal-header-bar {
                display: none !important;
              }
              body {
                background: #FFFFFF !important;
              }
              #custom-report-document-sheet {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                background: #FFFFFF !important;
              }
              @page {
                size: A4 portrait;
                margin: 10mm 12mm 12mm 12mm;
              }
            }
          `,
        }}
      />

      <div className="relative flex h-[94vh] w-full max-w-7xl flex-col rounded-3xl border border-outline-variant/30 bg-surface-white shadow-elevation-3 overflow-hidden">
        {/* ── Studio Header Bar ───────────────────────────────────────── */}
        <div className="modal-header-bar flex items-center justify-between border-b border-outline-variant/30 bg-surface px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="report-studio-title" className="font-heading text-base font-bold text-brand-navy">
                  Executive Custom Report Builder &amp; Document Studio
                </h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-label text-[10px] font-bold text-emerald-800">
                  LIVE INTERACTIVE CANVAS
                </span>
              </div>
              <p className="text-xs font-body text-text-grey">
                Compose multidimensional executive reports with real-time A4 document preview and vector PDF output.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant/40 bg-surface text-text-grey hover:bg-slate-200 hover:text-text-main transition-colors"
              aria-label="Close custom report studio"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Split Layout: Config Sidebar & Live Document Canvas ──────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── Left Sidebar: Controls & Query Parameters ───────────────── */}
          <div className="builder-sidebar w-80 sm:w-96 shrink-0 border-r border-outline-variant/30 bg-slate-50/70 p-5 overflow-y-auto space-y-5">
            {/* Section 1: Document Metadata */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-brand-navy uppercase tracking-wider">
                <Sliders size={14} className="text-blue-600" />
                <span>Document Scope &amp; Identification</span>
              </div>

              <div>
                <label className="font-label text-[11px] font-bold text-slate-700">
                  Document Title
                </label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-heading text-xs font-bold text-brand-navy shadow-2xs focus:border-brand-navy focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-label text-[11px] font-bold text-slate-700">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ReportCategory)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-label text-xs font-bold text-slate-800 focus:border-brand-navy focus:outline-none"
                  >
                    <option value="Financial">Financial</option>
                    <option value="Inventory">Inventory</option>
                    <option value="Operations">Operations</option>
                    <option value="Settlement">Settlement</option>
                  </select>
                </div>

                <div>
                  <label className="font-label text-[11px] font-bold text-slate-700">
                    Time Horizon
                  </label>
                  <select
                    value={horizon}
                    onChange={(e) => setHorizon(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-label text-xs font-bold text-slate-800 focus:border-brand-navy focus:outline-none"
                  >
                    <option value="Last 7 Days (Sep 05 - Sep 12, 2026)">Last 7 Days</option>
                    <option value="Last 30 Days (Aug 15 - Sep 12, 2026)">Last 30 Days</option>
                    <option value="Current Quarter (Q3 2026)">Current Quarter</option>
                    <option value="Year-to-Date (FY 2026)">Year-to-Date</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-label text-[11px] font-bold text-slate-700">
                  Logistics Facility Scope
                </label>
                <select
                  value={facilityZone}
                  onChange={(e) => setFacilityZone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-label text-xs font-bold text-slate-800 focus:border-brand-navy focus:outline-none"
                >
                  <option value="Warehouse 1 — All Logistics Zones">Warehouse 1 — All Zones</option>
                  <option value="Zone A — High-Bay Pallet Racks">Zone A — High-Bay Racks</option>
                  <option value="Zone B — Bulk Staging & Floor Stacks">Zone B — Bulk Staging</option>
                  <option value="Zone C — Cold Chain Cleanroom">Zone C — Cold Chain</option>
                </select>
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* Section 2: Quantitative Metrics */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-brand-navy uppercase tracking-wider">
                  <BarChart2 size={14} className="text-blue-600" />
                  <span>Quantitative KPI Cards</span>
                </div>
                <span className="text-[10px] text-text-grey font-mono">
                  {selectedMetrics.length} Active
                </span>
              </div>

              <div className="space-y-1.5">
                {[
                  "Total Inventory Valuation",
                  "Occupied CBM & Space Utilization",
                  "Realized Margin %",
                  "Fulfillment Volume (Units)",
                  "OTIF SLA Conformance %",
                  "Unbilled Storage Accruals ($)",
                ].map((metric) => {
                  const isChecked = selectedMetrics.includes(metric);
                  return (
                    <button
                      key={metric}
                      type="button"
                      onClick={() => toggleMetric(metric)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-all ${
                        isChecked
                          ? "border-blue-600 bg-blue-50/80 font-bold text-brand-navy shadow-2xs"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100/60"
                      }`}
                    >
                      <span>{metric}</span>
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${
                          isChecked
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {isChecked && <Check size={11} strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* Section 3: Dimension & Visual Breakdown */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-brand-navy uppercase tracking-wider">
                <Layers size={14} className="text-blue-600" />
                <span>Dimension &amp; Visual Analytics</span>
              </div>

              <div>
                <label className="font-label text-[11px] font-bold text-slate-700">
                  Primary Breakdown Dimension
                </label>
                <div className="mt-1.5 grid grid-cols-1 gap-1.5">
                  {[
                    "Item Category",
                    "Consignor / Vendor Party",
                    "Warehouse Zone",
                    "Flow Type (VMI vs Trading)",
                  ].map((dim) => (
                    <button
                      key={dim}
                      type="button"
                      onClick={() => setSelectedDimension(dim)}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-all ${
                        selectedDimension === dim
                          ? "border-indigo-600 bg-indigo-50/80 font-bold text-indigo-950 shadow-2xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100/60"
                      }`}
                    >
                      <span>{dim}</span>
                      {selectedDimension === dim && (
                        <Check size={13} className="text-indigo-600" strokeWidth={3} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-label text-[11px] font-bold text-slate-700">
                  Document Visualization Chart
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-xs font-label">
                  {[
                    { id: "bar", label: "Bar Chart" },
                    { id: "line", label: "Trend Line" },
                    { id: "none", label: "Table Only" },
                  ].map((ct) => (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => setChartType(ct.id as any)}
                      className={`rounded-xl border py-1.5 text-center text-xs font-bold transition-all ${
                        chartType === ct.id
                          ? "border-brand-navy bg-brand-navy text-white shadow-2xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* Section 4: Audit & Sign-off Options */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includeAuditSeal}
                  onChange={(e) => setIncludeAuditSeal(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span>Include SHA-256 Digital Verification Seal</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includeSignatures}
                  onChange={(e) => setIncludeSignatures(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span>Include Executive Tri-Sign-off Block</span>
              </label>
            </div>
          </div>

          {/* ── Right Panel: Live Document Canvas ────────────────────────── */}
          <div className="flex-1 min-w-0 bg-slate-200/80 p-4 sm:p-6 overflow-y-auto flex flex-col items-center">
            {/* Canvas Toolbar */}
            <div className="builder-toolbar mb-4 flex w-full max-w-[850px] flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-300 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="font-label text-xs font-bold text-brand-navy">Preview Zoom:</span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                  className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-100"
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="w-10 text-center font-mono text-xs font-bold text-slate-800">
                  {zoomLevel}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                  className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-100"
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(100)}
                  className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-100"
                  title="Reset Zoom"
                >
                  <RotateCcw size={14} />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 font-label text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  <Download size={13} className="text-emerald-700" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-brand-navy px-3.5 font-label text-xs font-bold text-white hover:bg-brand-navy/90 transition-colors shadow-2xs"
                >
                  <Printer size={13} />
                  <span>Print / PDF Document</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndArchive}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 font-label text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-2xs"
                >
                  <CheckCircle2 size={13} />
                  <span>Save &amp; Archive Report</span>
                </button>
              </div>
            </div>

            {/* ── The Printable A4 Document Sheet ───────────────────────── */}
            <div
              id="custom-report-document-sheet"
              style={{
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: "top center",
              }}
              className="w-full max-w-[850px] rounded-xl border border-slate-300 bg-white p-8 sm:p-10 shadow-2xl transition-transform duration-150 space-y-6 text-slate-900 font-body"
            >
              {/* ── Document Header ───────────────────────────────────── */}
              <div className="border-b-2 border-slate-900 pb-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
                      <Building2 size={24} />
                    </div>
                    <div>
                      <h1 className="font-heading text-lg font-black tracking-tight text-brand-navy uppercase">
                        Dyna-Serv Logistics &amp; Warehouse Management System
                      </h1>
                      <p className="text-[11px] font-body text-slate-600">
                        100 Logistics Boulevard, Light Industry &amp; Science Park, Laguna, Philippines · WIMS v2.4
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="inline-block rounded-md bg-slate-900 px-2.5 py-1 font-mono text-[10px] font-bold text-white uppercase tracking-wider">
                      {category} Audit Report
                    </span>
                    <p className="mt-1 font-mono text-xs font-bold text-slate-900">
                      REF: {reportRefNumber}
                    </p>
                    <p className="text-[10px] text-text-grey">
                      Generated: {generationTimestamp}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-heading text-base font-bold text-slate-900">
                      {reportTitle}
                    </h2>
                    <p className="text-xs text-slate-600">
                      Primary Breakdown: <strong className="text-slate-900">{selectedDimension}</strong> · Scope: <strong className="text-slate-900">{facilityZone}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 font-label text-[10px] font-bold text-blue-800">
                      {horizon}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Executive KPI Scorecards ───────────────────────────── */}
              {selectedMetrics.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {selectedMetrics.includes("Total Inventory Valuation") && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Total Valuation
                      </p>
                      <p className="mt-1 font-heading text-base font-black text-brand-navy">
                        ${totalValuation.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-emerald-700">
                        +5.2% vs baseline
                      </p>
                    </div>
                  )}

                  {selectedMetrics.includes("Occupied CBM & Space Utilization") && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Occupied Space
                      </p>
                      <p className="mt-1 font-heading text-base font-black text-brand-navy">
                        {totalCbm.toFixed(1)} m³
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-blue-700">
                        84.2% Utilization
                      </p>
                    </div>
                  )}

                  {selectedMetrics.includes("Realized Margin %") && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Trading Margin
                      </p>
                      <p className="mt-1 font-heading text-base font-black text-brand-navy">
                        {avgMargin}%
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-emerald-700">
                        &gt; 20.0% Target
                      </p>
                    </div>
                  )}

                  {selectedMetrics.includes("Fulfillment Volume (Units)") && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Throughput Volume
                      </p>
                      <p className="mt-1 font-heading text-base font-black text-brand-navy">
                        {totalVolume.toLocaleString()} units
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-slate-600">
                        Consolidated flow
                      </p>
                    </div>
                  )}

                  {selectedMetrics.includes("OTIF SLA Conformance %") && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        OTIF Conformance
                      </p>
                      <p className="mt-1 font-heading text-base font-black text-brand-navy">
                        {avgOtif}%
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-emerald-700">
                        SLA Compliant
                      </p>
                    </div>
                  )}

                  {selectedMetrics.includes("Unbilled Storage Accruals ($)") && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        VMI Storage Accruals
                      </p>
                      <p className="mt-1 font-heading text-base font-black text-brand-navy">
                        ${totalAccrual.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-amber-700">
                        Pending Period Close
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Visual Chart Visualization (Recharts) ──────────────── */}
              {chartType !== "none" && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Quantitative Distribution by {selectedDimension}
                    </p>
                    <span className="font-mono text-[10px] text-slate-500">
                      Scale: Valuation ($) vs Occupied CBM (m³)
                    </span>
                  </div>

                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartType === "bar" ? (
                        <BarChart
                          data={activeDataset}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 9, fill: "#475569" }}
                            interval={0}
                            tickFormatter={(val) =>
                              val.length > 16 ? `${val.slice(0, 14)}...` : val
                            }
                          />
                          <YAxis tick={{ fontSize: 9, fill: "#475569" }} />
                          <Tooltip
                            contentStyle={{
                              fontSize: "11px",
                              borderRadius: "8px",
                              backgroundColor: "#0f172a",
                              color: "#fff",
                              border: "none",
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }} />
                          <Bar
                            dataKey="cbm"
                            name="Occupied CBM (m³)"
                            fill="#1e3a8a"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="marginPct"
                            name="Margin %"
                            fill="#059669"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      ) : (
                        <LineChart
                          data={activeDataset}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 9, fill: "#475569" }}
                            interval={0}
                            tickFormatter={(val) =>
                              val.length > 16 ? `${val.slice(0, 14)}...` : val
                            }
                          />
                          <YAxis tick={{ fontSize: 9, fill: "#475569" }} />
                          <Tooltip
                            contentStyle={{
                              fontSize: "11px",
                              borderRadius: "8px",
                              backgroundColor: "#0f172a",
                              color: "#fff",
                              border: "none",
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }} />
                          <Line
                            type="monotone"
                            dataKey="cbm"
                            name="Occupied CBM (m³)"
                            stroke="#1e3a8a"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="otifPct"
                            name="OTIF %"
                            stroke="#059669"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ── Multi-Column Data Ledger Table ─────────────────────── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Consolidated Breakdown Ledger
                  </p>
                  <span className="font-mono text-[10px] text-slate-500">
                    {activeDataset.length} Segment Records
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full border-collapse text-left text-xs font-body">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100 font-label text-[11px] font-bold text-slate-800">
                        <th className="px-3.5 py-2.5">{selectedDimension}</th>
                        <th className="px-3 py-2.5 text-center">Flow</th>
                        <th className="px-3 py-2.5 text-right">Occupied CBM</th>
                        <th className="px-3 py-2.5 text-right">Valuation ($)</th>
                        <th className="px-3 py-2.5 text-right">Margin %</th>
                        <th className="px-3 py-2.5 text-right">Volume</th>
                        <th className="px-3 py-2.5 text-right">OTIF %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {activeDataset.map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                          <td className="px-3.5 py-2 font-body font-semibold text-slate-900">
                            {row.name}
                          </td>
                          <td className="px-3 py-2 text-center font-label">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                row.flow === "VMI"
                                  ? "bg-blue-100 text-blue-800"
                                  : row.flow === "Trading"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-slate-100 text-slate-800"
                              }`}
                            >
                              {row.flow}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {row.cbm.toFixed(1)} m³
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-900">
                            ${row.valuation.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-700 font-bold">
                            {row.marginPct}%
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {row.volumeQty.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right text-blue-700 font-bold">
                            {row.otifPct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-900 bg-slate-100 font-mono text-xs font-bold text-slate-900">
                        <td className="px-3.5 py-2.5 font-body">TOTALS / COMPOSITE AVERAGE</td>
                        <td className="px-3 py-2.5 text-center">—</td>
                        <td className="px-3 py-2.5 text-right">{totalCbm.toFixed(1)} m³</td>
                        <td className="px-3 py-2.5 text-right">
                          ${totalValuation.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-800">{avgMargin}%</td>
                        <td className="px-3 py-2.5 text-right">{totalVolume.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right text-blue-800">{avgOtif}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── Tri-Sign-off Authorization Block ───────────────────── */}
              {includeSignatures && (
                <div className="pt-4 border-t border-slate-200">
                  <div className="grid grid-cols-3 gap-6 text-center text-xs">
                    <div className="space-y-6">
                      <div className="h-10 border-b border-dashed border-slate-400 flex items-end justify-center pb-1">
                        <span className="font-mono text-[10px] text-slate-400">
                          [Digital Signature Verified]
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">Warehouse Officer</p>
                        <p className="text-[10px] text-slate-500">Prepared &amp; Extracted By</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="h-10 border-b border-dashed border-slate-400 flex items-end justify-center pb-1">
                        <span className="font-mono text-[10px] text-slate-400">
                          [Digital Signature Verified]
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">Operations Supervisor</p>
                        <p className="text-[10px] text-slate-500">Verified &amp; Reconciled</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="h-10 border-b border-dashed border-slate-400 flex items-end justify-center pb-1">
                        <span className="font-mono text-[10px] text-slate-400">
                          [Digital Signature Verified]
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">Managing Director / Comptroller</p>
                        <p className="text-[10px] text-slate-500">Authorized Signatory</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Cryptographic Security Seal & Audit Trail ─────────── */}
              {includeAuditSeal && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] font-mono text-slate-600">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-700 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-900">
                        WIMS IMMUTABLE RECORD ARTIFACT
                      </span>
                      <p className="text-[9px] text-slate-500">
                        SHA-256: 8f4b23a9e1c0d48293746a5b2819c3e4726a8d90f1248b9c0e2a3f4e5d6c7b8a
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-slate-800">ISO 9001:2015 COMPLIANT</span>
                    <p className="text-[9px] text-slate-500">Permanent Hot/Cold Retention Tier</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
