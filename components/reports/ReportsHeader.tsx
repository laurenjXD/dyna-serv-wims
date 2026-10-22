"use client";

import React, { useState } from "react";
import {
  FileText,
  Download,
  Plus,
  ChevronDown,
  Search,
} from "lucide-react";
import type { DateHorizon } from "./types";

interface ReportsHeaderProps {
  horizon: DateHorizon;
  startDate: string;
  endDate: string;
  onHorizonChange: (h: DateHorizon) => void;
  onStartDateChange: (d: string) => void;
  onEndDateChange: (d: string) => void;
  onOpenReportBuilder: () => void;
  onQuickGeneratePdf: () => void;
  onExportRawData: (format: "csv" | "xlsx") => void;
}

function formatDateLabel(value: string): string {
  if (!value) return "Select date";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

export function ReportsHeader({
  horizon,
  startDate,
  endDate,
  onHorizonChange,
  onStartDateChange,
  onEndDateChange,
  onOpenReportBuilder,
  onQuickGeneratePdf,
  onExportRawData,
}: ReportsHeaderProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [mobileSearch, setMobileSearch] = useState("");

  return (
    <div className="space-y-3">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 📱 MOBILE STICKY TITLE & FAST CONTROLS (< 1024px)                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="block lg:hidden space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-title-lg font-bold text-brand-navy">
              Reports &amp; Settlement
            </h1>
            <p className="mt-0.5 font-body text-body-xs text-text-grey">
              Ledgers, audit history, and throughput billing
            </p>
          </div>

          {/* Primary + New Report Button (Min 48px Touch Target) */}
          <button
            type="button"
            onClick={onOpenReportBuilder}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-brand-navy px-3.5 font-label text-label-xs font-bold text-white shadow-sm active:scale-95 transition-transform"
          >
            <Plus size={16} />
            <span>+ New Report</span>
          </button>
        </div>

        {/* Instant Report Search Bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search report archive, VMI consignors..."
            value={mobileSearch}
            onChange={(e) => setMobileSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-surface-light-grey/60 pl-9 pr-3 font-body text-body-xs text-on-surface placeholder:text-text-grey focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-navy"
          />
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 🖥️ DESKTOP TITLE & CONTROLS (>= 1024px)                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-title-lg sm:text-headline-md font-extrabold text-brand-navy tracking-tight">
            Warehouse Reports &amp; Financial Settlement
          </h1>
          <p className="mt-0.5 font-body text-body-xs sm:text-body-sm text-text-grey">
            Generate, audit, schedule, and reconcile billing, inventory positions, and throughput movement
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-surface-white px-3.5 font-label text-xs font-bold text-brand-navy hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy shadow-2xs transition-colors"
            >
              <Download size={14} className="text-brand-navy" />
              <span>Export Raw Data</span>
              <ChevronDown size={13} className="text-slate-400" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 z-40 mt-1.5 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-elevation-3 animate-in fade-in">
                <button
                  type="button"
                  onClick={() => {
                    onExportRawData("csv");
                    setShowExportMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-label text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Download size={13} className="text-slate-400" />
                  <span>Download Ledger (.CSV)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExportRawData("xlsx");
                    setShowExportMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-label text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FileText size={13} className="text-slate-400" />
                  <span>Download Workbook (.XLSX)</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onQuickGeneratePdf}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 font-label text-xs font-bold text-brand-navy hover:bg-blue-100/80 focus:outline-none focus:ring-2 focus:ring-brand-navy shadow-2xs transition-colors"
          >
            <FileText size={14} className="text-brand-navy" />
            <span>Generate Full Inventory PDF</span>
          </button>

          <button
            type="button"
            onClick={onOpenReportBuilder}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-navy px-4 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-brand-navy transition-colors"
          >
            <Plus size={15} />
            <span>Custom Report Builder</span>
          </button>
        </div>
      </div>

      {/* ── Global Filters Toolbar ────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white/80 p-2.5 shadow-2xs backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/80">
        <div className="flex min-w-max items-center gap-3 whitespace-nowrap">
          {/* Date Horizon & Preset Switcher */}
          <div className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-semibold">
            <button
              type="button"
              onClick={() => onHorizonChange("7D")}
              className={`rounded-lg px-2.5 py-1 transition-all ${
                horizon === "7D" ? "bg-white text-brand-navy font-bold shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              7D
            </button>
            <button
              type="button"
              onClick={() => onHorizonChange("30D")}
              className={`rounded-lg px-2.5 py-1 transition-all ${
                horizon === "30D" ? "bg-white text-brand-navy font-bold shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              30D MTD
            </button>
            <button
              type="button"
              onClick={() => onHorizonChange("90D")}
              className={`rounded-lg px-2.5 py-1 transition-all ${
                horizon === "90D" ? "bg-white text-brand-navy font-bold shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              90D QTD
            </button>
            <button
              type="button"
              onClick={() => onHorizonChange("custom")}
              className={`rounded-lg px-2.5 py-1 transition-all ${
                horizon === "custom" ? "bg-white text-brand-navy font-bold shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Custom
            </button>
          </div>

          {/* Active Date Span Pill */}
          <span className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-700">
            {formatDateLabel(startDate)} to {formatDateLabel(endDate)}
          </span>
        </div>

        {/* Inline Date Range Picker for Custom Horizon */}
        {horizon === "custom" && (
          <div className="flex shrink-0 items-center gap-2 border-l border-slate-100 pl-3">
            <div className="flex items-center gap-1.5">
              <span className="font-label text-[11px] font-bold text-text-grey">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs text-slate-800 focus:border-brand-navy focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-label text-[11px] font-bold text-text-grey">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs text-slate-800 focus:border-brand-navy focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
