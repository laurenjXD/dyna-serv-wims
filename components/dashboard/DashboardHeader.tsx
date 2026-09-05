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
  Sparkles,
} from "lucide-react";

interface DashboardHeaderProps {
  onGenerateReport?: () => void;
}

export function DashboardHeader({ onGenerateReport }: DashboardHeaderProps) {
  const [facility, setFacility] = useState("Main Distribution Center – All Zones");
  const [dateHorizon, setDateHorizon] = useState("Month-to-Date (MTD)");
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("Just now (Live)");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showFacilityMenu, setShowFacilityMenu] = useState(false);
  const [showDateMenu, setShowDateMenu] = useState(false);

  const facilities = [
    "Main Distribution Center – All Zones",
    "Zone A – High Density Racks",
    "Zone B – Bulk Staging",
    "Cold Storage Facility",
    "Overflow Annex 1",
  ];

  const dateHorizons = [
    "Month-to-Date (MTD)",
    "Quarter-to-Date (QTD)",
    "Year-to-Date (YTD)",
    "Trailing 30 Days",
    "Custom Date Range...",
  ];

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      const now = new Date();
      setLastSyncTime(
        `${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} (Synced)`
      );
    }, 600);
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
    <header className="relative mb-6 rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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

        {/* Global Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Facility Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowFacilityMenu(!showFacilityMenu);
                setShowDateMenu(false);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-surface-white px-3.5 font-label text-xs font-bold text-slate-800 hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-navy shadow-xs transition-colors"
              aria-expanded={showFacilityMenu}
              aria-label="Select warehouse facility and zone"
            >
              <Building2 size={14} className="text-brand-navy/70" />
              <span className="max-w-[150px] sm:max-w-[200px] truncate">{facility}</span>
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

          {/* Date Horizon Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowDateMenu(!showDateMenu);
                setShowFacilityMenu(false);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-surface-white px-3.5 font-label text-xs font-bold text-slate-800 hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-navy shadow-xs transition-colors"
              aria-expanded={showDateMenu}
              aria-label="Select date horizon"
            >
              <Calendar size={14} className="text-brand-navy/70" />
              <span>{dateHorizon}</span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>

            {showDateMenu && (
              <div className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border border-slate-200 bg-surface-white p-1.5 shadow-elevation-3 animate-in fade-in zoom-in-95">
                <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-grey">
                  Analysis Horizon
                </p>
                {dateHorizons.map((horizon) => (
                  <button
                    key={horizon}
                    type="button"
                    onClick={() => {
                      setDateHorizon(horizon);
                      setShowDateMenu(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-label text-xs font-medium transition-colors ${
                      dateHorizon === horizon
                        ? "bg-blue-50 text-brand-navy font-bold"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span>{horizon}</span>
                    {dateHorizon === horizon && <Check size={14} className="text-brand-navy shrink-0" />}
                  </button>
                ))}
              </div>
            )}
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
            <span className="hidden sm:inline">{lastSyncTime}</span>
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
