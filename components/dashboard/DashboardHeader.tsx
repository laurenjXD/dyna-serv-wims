"use client";

import React, { useState } from "react";
import {
  Building2,
  Calendar,
  RefreshCw,
  FileDown,
  ChevronDown,
  Check,
  CheckCircle2,
  Radio,
  MapPin,
} from "lucide-react";

interface DashboardHeaderProps {
  onGenerateReport?: () => void;
}

export function DashboardHeader({ onGenerateReport }: DashboardHeaderProps) {
  const [facility, setFacility] = useState("Main Distribution Center – All Zones");
  const [dateHorizon, setDateHorizon] = useState("30D MTD");
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("Live 14:02");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showFacilityMenu, setShowFacilityMenu] = useState(false);

  const facilities = [
    "Main Distribution Center – All Zones",
    "Main DC - Zone A/B",
    "Cold Chain Storage",
    "Zone A – High Density Racks",
    "Zone B – Bulk Staging",
  ];

  const presets = ["Today", "7D", "30D MTD", "90D QTD", "Custom"];

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      const now = new Date();
      setLastSyncTime(
        `Live ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      );
    }, 500);
  };

  const handleReportClick = () => {
    setIsGeneratingPdf(true);
    if (onGenerateReport) {
      onGenerateReport();
    }
    setTimeout(() => {
      setIsGeneratingPdf(false);
    }, 1500);
  };

  return (
    <header className="relative mb-6 rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-4 sm:p-5 shadow-sm backdrop-blur-md">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 📱 MOBILE STICKY COMPACT HEADER (< 1024px)                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="block lg:hidden space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200/80 px-2.5 py-1 font-mono text-[11px] font-bold text-brand-navy">
              <MapPin size={12} className="text-primary" />
              Zone A · Aisle 01-06
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              {lastSyncTime}
            </span>
          </div>

          <button
            type="button"
            onClick={handleManualSync}
            aria-label="Refresh telemetry"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 active:scale-95"
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin text-primary" : ""} />
          </button>
        </div>

        {/* Horizontal Scrollable Date Preset Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDateHorizon(p)}
              className={`whitespace-nowrap rounded-xl px-3 py-1.5 font-label text-xs font-bold transition-all min-h-[36px] ${
                dateHorizon === p
                  ? "bg-brand-navy text-white shadow-2xs"
                  : "bg-slate-100/90 text-slate-700 hover:bg-slate-200/80"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 🖥️ DESKTOP TOOLBAR (>= 1024px)                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-row items-center justify-between gap-4">
        {/* Title & Live Status Indicator */}
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-heading text-title-lg sm:text-headline-md font-extrabold text-brand-navy tracking-tight">
              WMS Operations Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              REAL-TIME
            </span>
          </div>
          <p className="mt-1 font-body text-xs sm:text-sm text-text-grey">
            Executive oversight, floor queue telemetry, location occupancy, and stock positions.
          </p>
        </div>

        {/* Desktop Global Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Facility Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFacilityMenu(!showFacilityMenu)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-surface-white px-3.5 font-label text-xs font-bold text-slate-800 hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-navy shadow-xs transition-colors"
              aria-expanded={showFacilityMenu}
              aria-label="Select warehouse facility and zone"
            >
              <Building2 size={14} className="text-brand-navy/70" />
              <span className="max-w-[180px] truncate">{facility}</span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>

            {showFacilityMenu && (
              <div className="absolute right-0 z-30 mt-1.5 w-64 rounded-xl border border-slate-200 bg-surface-white p-1.5 shadow-elevation-3 animate-in fade-in zoom-in-95">
                <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-grey">
                  Warehouse Facility &amp; Zone
                </p>
                {facilities.map((fac) => (
                  <button
                    key={fac}
                    type="button"
                    onClick={() => {
                      setFacility(fac);
                      setShowFacilityMenu(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-label text-xs font-medium transition-colors ${
                      facility === fac
                        ? "bg-blue-50 text-brand-navy font-bold"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="truncate">{fac}</span>
                    {facility === fac && <Check size={14} className="text-brand-navy shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date Horizon Switcher */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-bold">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDateHorizon(preset)}
                className={`rounded-lg px-2.5 py-1.5 transition-all ${
                  dateHorizon === preset
                    ? "bg-white text-brand-navy shadow-2xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Sync Status Button */}
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 font-mono text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus:outline-none"
            title="Click to trigger manual refresh"
          >
            <RefreshCw size={13} className={`${isSyncing ? "animate-spin text-brand-navy" : "text-slate-400"}`} />
            <span>{lastSyncTime}</span>
          </button>

          {/* Primary Action: Generate Inventory Report (PDF) */}
          <button
            type="button"
            onClick={handleReportClick}
            disabled={isGeneratingPdf}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-4 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 active:scale-98 focus:outline-none focus:ring-2 focus:ring-brand-navy focus:ring-offset-2 transition-all cursor-pointer"
          >
            {isGeneratingPdf ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <FileDown size={14} />
                <span>Generate Inventory Report (PDF)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

