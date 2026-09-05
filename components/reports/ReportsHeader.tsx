"use client";

import React, { useState } from "react";
import {
  FileText,
  Download,
  Plus,
  Calendar,
  Building2,
  Filter,
  Sparkles,
  ChevronDown,
  Search,
  BadgePercent,
  SlidersHorizontal,
} from "lucide-react";
import type { DateHorizon, FacilityZone } from "./types";

interface ReportsHeaderProps {
  facility: FacilityZone;
  horizon: DateHorizon;
  startDate: string;
  endDate: string;
  onFacilityChange: (f: FacilityZone) => void;
  onHorizonChange: (h: DateHorizon) => void;
  onStartDateChange: (d: string) => void;
  onEndDateChange: (d: string) => void;
  onOpenReportBuilder: () => void;
  onQuickGeneratePdf: () => void;
  onExportRawData: (format: "csv" | "xlsx") => void;
}

export function ReportsHeader({
  facility,
  horizon,
  startDate,
  endDate,
  onFacilityChange,
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
    <div className="space-y-4">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 📱 MOBILE STICKY TITLE & FAST CONTROLS (< 1024px)                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="block lg:hidden space-y-3 rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-4 shadow-sm backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl font-black text-brand-navy">
              Reports &amp; Settlement
            </h1>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-navy border border-blue-200">
                Aug 2026 MTD
              </span>
              <span className="text-[11px] text-text-grey">All Facilities</span>
            </div>
          </div>

          {/* Primary + New Report Button (Min 48px Touch Target) */}
          <button
            type="button"
            onClick={onOpenReportBuilder}
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-brand-navy px-3.5 font-heading text-xs font-bold text-white shadow-md active:scale-95 transition-transform"
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
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-9 pr-3 font-body text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-navy"
          />
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 🖥️ DESKTOP TITLE & CONTROLS (>= 1024px)                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl sm:text-3xl font-black text-brand-navy tracking-tight">
              Warehouse Reports &amp; Financial Settlement Hub
            </h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-brand-navy border border-blue-200">
              AUDITED VMI &amp; TRADING
            </span>
          </div>
          <p className="mt-1 font-body text-xs sm:text-sm text-text-grey">
            Generate, audit, schedule, and reconcile billing, inventory positions, and throughput movement.
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-3 shadow-2xs backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          {/* Facility & Zone Selector */}
          <div className="flex items-center gap-1.5">
            <Building2 size={15} className="text-brand-navy/70 shrink-0 ml-1" />
            <label htmlFor="facility-select" className="font-label text-xs font-bold text-text-grey sr-only">
              Facility &amp; Zone
            </label>
            <select
              id="facility-select"
              value={facility}
              onChange={(e) => onFacilityChange(e.target.value as FacilityZone)}
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-label text-xs font-bold text-brand-navy focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
            >
              <option value="all">All Facilities &amp; Zones</option>
              <option value="main-dc-a">Main DC – High-Bay Zone A</option>
              <option value="main-dc-b">Main DC – Racks Zone B</option>
              <option value="cold-chain">Cold Chain Storage</option>
            </select>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Date Horizon & Preset Switcher */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-semibold">
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
        </div>

        {/* Inline Date Range Picker for Custom Horizon */}
        {horizon === "custom" && (
          <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
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
