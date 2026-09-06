"use client";

import React, { useState } from "react";
import {
  X,
  Sparkles,
  Layers,
  Database,
  Calendar,
  Download,
  Check,
  ChevronRight,
  BarChart2,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
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

export function CustomReportBuilderModal({
  isOpen,
  onClose,
  onBuildComplete,
}: CustomReportBuilderModalProps) {
  const [step, setStep] = useState<number>(1);
  const [reportTitle, setReportTitle] = useState("Custom_Warehouse_Analytics_Report");
  const [category, setCategory] = useState<ReportCategory>("Financial");
  const [format, setFormat] = useState<ReportFormat>("PDF");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    "Total Inventory Valuation",
    "Occupied CBM & Space Utilization",
    "Realized Margin %",
  ]);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([
    "Item Category",
    "Consignor / Vendor Party",
    "Warehouse Zone",
  ]);

  if (!isOpen) return null;

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    );
  };

  const toggleDimension = (dim: string) => {
    setSelectedDimensions((prev) =>
      prev.includes(dim) ? prev.filter((d) => d !== dim) : [...prev, dim]
    );
  };

  const handleFinish = () => {
    onBuildComplete({
      title: reportTitle,
      category,
      format,
      metrics: selectedMetrics,
      dimensions: selectedDimensions,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-elevation-2 overflow-hidden">
        {/* ── Modal Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy text-white">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="font-heading text-sm font-bold text-brand-navy">
                Custom Analytics Report Builder
              </h3>
              <p className="text-[11px] font-body text-text-grey">
                Step {step} of 3 — Configure multidimensional query parameters
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Step Indicators ───────────────────────────────────────────── */}
        <div className="flex border-b border-slate-100 bg-white px-6 py-2.5 text-xs font-label font-semibold">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-1.5 pb-1 border-b-2 mr-6 ${
              step === 1 ? "border-brand-navy text-brand-navy font-bold" : "border-transparent text-text-grey"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px]">1</span>
            <span>Dataset &amp; Scope</span>
          </button>

          <button
            type="button"
            onClick={() => setStep(2)}
            className={`flex items-center gap-1.5 pb-1 border-b-2 mr-6 ${
              step === 2 ? "border-brand-navy text-brand-navy font-bold" : "border-transparent text-text-grey"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px]">2</span>
            <span>Metrics &amp; Grouping</span>
          </button>

          <button
            type="button"
            onClick={() => setStep(3)}
            className={`flex items-center gap-1.5 pb-1 border-b-2 ${
              step === 3 ? "border-brand-navy text-brand-navy font-bold" : "border-transparent text-text-grey"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px]">3</span>
            <span>Format &amp; Output</span>
          </button>
        </div>

        {/* ── Step Content ──────────────────────────────────────────────── */}
        <div className="overflow-y-auto p-6 space-y-4">
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in">
              <div>
                <label className="font-label text-xs font-bold text-slate-800">
                  Report Artifact Identifier
                </label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-xs font-bold text-brand-navy focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                />
              </div>

              <div>
                <label className="font-label text-xs font-bold text-slate-800">
                  Business Domain Category
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  {(["Financial", "Inventory", "Operations", "Settlement"] as ReportCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
                        category === cat
                          ? "border-brand-navy bg-blue-50/50 text-brand-navy font-bold shadow-xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-label text-xs">{cat} Analytics</span>
                      {category === cat && <Check size={14} className="text-brand-navy" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <div>
                <label className="font-label text-xs font-bold text-slate-800">
                  Select Computed Quantitative Metrics
                </label>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    "Total Inventory Valuation",
                    "Occupied CBM & Space Utilization",
                    "Realized Margin %",
                    "Inbound WRR Receiving Volume",
                    "Outbound Pick List Throughput",
                    "OTIF Delivery Conformance Rate",
                    "Unbilled VMI Storage Accruals",
                  ].map((metric) => {
                    const isSelected = selectedMetrics.includes(metric);
                    return (
                      <button
                        key={metric}
                        type="button"
                        onClick={() => toggleMetric(metric)}
                        className={`flex items-center justify-between rounded-xl border p-2.5 text-left text-xs transition-all ${
                          isSelected
                            ? "border-blue-600 bg-blue-50 text-brand-navy font-bold"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span>{metric}</span>
                        {isSelected && <Check size={13} className="text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <label className="font-label text-xs font-bold text-slate-800">
                  Select Grouping Dimensions &amp; Breakdown Axes
                </label>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    "Item Category",
                    "Consignor / Vendor Party",
                    "Warehouse Zone",
                    "Flow Type (VMI / Trading)",
                    "Fiscal Period / Month",
                    "Carrier & Vehicle Class",
                  ].map((dim) => {
                    const isSelected = selectedDimensions.includes(dim);
                    return (
                      <button
                        key={dim}
                        type="button"
                        onClick={() => toggleDimension(dim)}
                        className={`flex items-center justify-between rounded-xl border p-2.5 text-left text-xs transition-all ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-50 text-indigo-950 font-bold"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span>{dim}</span>
                        {isSelected && <Check size={13} className="text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-in fade-in">
              <div>
                <label className="font-label text-xs font-bold text-slate-800">
                  Primary Delivery Format
                </label>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  {(["PDF", "CSV", "XLSX"] as ReportFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setFormat(fmt)}
                      className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center transition-all ${
                        format === fmt
                          ? "border-brand-navy bg-blue-50/60 text-brand-navy font-bold shadow-xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {fmt === "PDF" ? (
                        <FileText size={24} className="text-brand-navy mb-1.5" />
                      ) : (
                        <FileSpreadsheet size={24} className="text-emerald-700 mb-1.5" />
                      )}
                      <span className="font-mono text-sm font-black">{fmt}</span>
                      <span className="text-[10px] text-text-grey mt-0.5">
                        {fmt === "PDF" ? "Formatted Document" : fmt === "CSV" ? "Flat Data Ledger" : "Multi-Tab Workbook"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary of Configuration */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-1.5 font-body">
                <p className="font-bold text-slate-900 border-b border-slate-200 pb-1">Report Configuration Summary</p>
                <p className="text-slate-700"><strong>Title:</strong> {reportTitle}</p>
                <p className="text-slate-700"><strong>Category:</strong> {category} Analytics</p>
                <p className="text-slate-700"><strong>Metrics:</strong> {selectedMetrics.length} selected</p>
                <p className="text-slate-700"><strong>Dimensions:</strong> {selectedDimensions.length} selected</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Modal Footer ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/90 px-6 py-3.5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="inline-flex h-8.5 items-center rounded-lg border border-slate-200 bg-white px-3 font-label text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="inline-flex h-8.5 items-center gap-1 rounded-lg bg-brand-navy px-4 font-label text-xs font-bold text-white hover:bg-brand-navy/90 shadow-2xs"
              >
                <span>Continue</span>
                <ChevronRight size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-emerald-700 px-4 font-label text-xs font-bold text-white hover:bg-emerald-800 shadow-2xs"
              >
                <Sparkles size={13} />
                <span>Generate &amp; Archive Report</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
