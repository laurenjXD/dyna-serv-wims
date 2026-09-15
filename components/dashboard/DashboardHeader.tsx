"use client";

import React, { useState } from "react";
import {
  Calendar,
  RefreshCw,
  FileDown,
} from "lucide-react";

export type DateHorizon = "Today" | "7D" | "30D MTD" | "90D QTD" | "Custom";

interface DashboardHeaderProps {
  dateHorizon: DateHorizon;
  onDateHorizonChange: (horizon: DateHorizon) => void;
  onRefresh?: () => Promise<void> | void;
  onGenerateReport?: () => Promise<void> | void;
}

export function DashboardHeader({
  dateHorizon,
  onDateHorizonChange,
  onRefresh,
  onGenerateReport,
}: DashboardHeaderProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const presets: DateHorizon[] = ["Today", "7D", "30D MTD", "90D QTD", "Custom"];

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  const handleReportClick = async () => {
    setIsGeneratingPdf(true);
    try {
      if (onGenerateReport) {
        await onGenerateReport();
      }
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <header className="mb-6 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Title & Subtitle */}
        <div>
          <h1 className="font-heading text-title-lg sm:text-headline-md font-extrabold text-brand-navy tracking-tight">
            Operations Dashboard
          </h1>
          <p className="mt-0.5 font-body text-body-xs sm:text-body-sm text-text-grey">
            Real-time warehouse telemetry, location occupancy, and stock positions
          </p>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Date Horizon Switcher */}
          <div className="flex items-center gap-1 rounded-xl bg-surface-light-grey p-1 font-label text-label-xs font-bold">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onDateHorizonChange(preset)}
                className={`rounded-lg px-3 py-1.5 transition-all ${
                  dateHorizon === preset
                    ? "bg-brand-navy text-white shadow-sm font-extrabold"
                    : "text-text-grey hover:text-on-surface hover:bg-surface/60"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 font-label text-label-xs font-bold text-text-grey hover:text-on-surface hover:bg-surface-light-grey transition-colors focus:outline-none"
            title="Refresh dashboard data"
          >
            <RefreshCw size={13} className={isSyncing ? "animate-spin text-brand-navy" : ""} />
            <span>Refresh</span>
          </button>

          {/* Primary Action: Export / Generate Report */}
          <button
            type="button"
            onClick={handleReportClick}
            disabled={isGeneratingPdf}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-navy px-3.5 font-label text-label-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 active:scale-98 focus:outline-none transition-all cursor-pointer"
          >
            {isGeneratingPdf ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <FileDown size={13} />
                <span>Export Report (PDF)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
