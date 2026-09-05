"use client";

import React, { useState } from "react";
import {
  FileText,
  Download,
  Play,
  Calendar,
  Clock,
  CheckCircle2,
  Share2,
  Sparkles,
  Layers,
  ArrowRight,
  FileSpreadsheet,
} from "lucide-react";
import type { PreBuiltTemplate, ReportFormat } from "./types";

interface TemplateCardGridProps {
  onRunTemplate: (template: PreBuiltTemplate, format: ReportFormat) => void;
  onScheduleTemplate: (template: PreBuiltTemplate) => void;
}

const DEFAULT_TEMPLATES: PreBuiltTemplate[] = [
  {
    id: "tpl-01",
    title: "Master Inventory Valuation & Balance Sheet",
    description: "Executive valuation summary of all active VMI and Trading SKU lots with aging tier breakdown.",
    category: "Financial",
    lastRunDate: "Today at 08:30",
    scheduleFrequency: "Daily at 08:00 AM",
    supportedFormats: ["PDF", "CSV", "XLSX"],
    recordCount: 1420,
    estimatedGenerationSec: 2,
  },
  {
    id: "tpl-02",
    title: "VMI Storage & CBM Reconciliation Statement",
    description: "Monthly customer billable CBM logs, dwell days, and accrued storage charges ready for invoicing.",
    category: "Settlement",
    lastRunDate: "Yesterday at 17:00",
    scheduleFrequency: "Monthly on 1st",
    supportedFormats: ["PDF", "XLSX"],
    recordCount: 380,
    estimatedGenerationSec: 3,
  },
  {
    id: "tpl-03",
    title: "Warehouse Throughput & Movement Audit",
    description: "Detailed inbound receipts, outbound picks, and internal transfer transactions with badge operator signatures.",
    category: "Operations",
    lastRunDate: "Aug 31 at 18:00",
    scheduleFrequency: "Weekly on Monday",
    supportedFormats: ["CSV", "XLSX"],
    recordCount: 4890,
    estimatedGenerationSec: 4,
  },
  {
    id: "tpl-04",
    title: "Delivery OTIF & Carrier SLA Performance",
    description: "On-time in-full delivery metrics, lead time distributions, and carrier damage claim rates.",
    category: "Operations",
    lastRunDate: "Aug 30 at 19:15",
    scheduleFrequency: "Weekly on Friday",
    supportedFormats: ["PDF", "CSV"],
    recordCount: 650,
    estimatedGenerationSec: 2,
  },
  {
    id: "tpl-05",
    title: "Trading Revenue & Realized Margin Report",
    description: "Consolidated sales revenue vs. cost of goods sold (COGS) with product line margin percentages.",
    category: "Financial",
    lastRunDate: "Aug 31 at 20:00",
    scheduleFrequency: "Monthly on End",
    supportedFormats: ["PDF", "XLSX"],
    recordCount: 920,
    estimatedGenerationSec: 3,
  },
];

export function TemplateCardGrid({
  onRunTemplate,
  onScheduleTemplate,
}: TemplateCardGridProps) {
  const templates: PreBuiltTemplate[] = DEFAULT_TEMPLATES;
  const [selectedFormats, setSelectedFormats] = useState<Record<string, ReportFormat>>({
    "tpl-01": "PDF",
    "tpl-02": "PDF",
    "tpl-03": "CSV",
    "tpl-04": "PDF",
    "tpl-05": "PDF",
  });

  const handleFormatChange = (templateId: string, format: ReportFormat) => {
    setSelectedFormats((prev) => ({ ...prev, [templateId]: format }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
        <div>
          <h3 className="font-heading text-title-md font-bold text-brand-navy dark:text-zinc-100 flex items-center gap-2">
            <FileText size={18} className="text-brand-navy dark:text-blue-400" />
            Pre-Built Report Templates &amp; Quick Runners
          </h3>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            One-tap report execution and automated cron schedules for instant operational audit exports.
          </p>
        </div>
      </div>

      {/* ── Desktop Grid (>= 1024px) ── */}
      <div className="hidden lg:grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => {
          const activeFormat = selectedFormats[tpl.id] ?? tpl.supportedFormats[0];

          return (
            <div
              key={tpl.id}
              className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                      tpl.category === "Financial"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : tpl.category === "Settlement"
                        ? "bg-blue-50 text-blue-800 border border-blue-200"
                        : "bg-purple-50 text-purple-800 border border-purple-200"
                    }`}
                  >
                    {tpl.category}
                  </span>

                  <span className="font-mono text-[10px] text-text-grey flex items-center gap-1">
                    <Clock size={11} />
                    {tpl.estimatedGenerationSec}s run
                  </span>
                </div>

                <h4 className="mt-2.5 font-heading text-title-sm font-bold text-brand-navy">
                  {tpl.title}
                </h4>

                <p className="mt-1 font-body text-xs text-text-grey line-clamp-2">
                  {tpl.description}
                </p>

                {/* Metadata Pills */}
                <div className="mt-3 flex items-center gap-3 text-[11px] text-text-grey font-mono bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 block">Records:</span>
                    <span className="font-bold text-slate-800">{tpl.recordCount.toLocaleString()}</span>
                  </div>
                  <div className="border-l border-slate-200 pl-3">
                    <span className="text-[10px] uppercase text-slate-400 block">Schedule:</span>
                    <span className="font-semibold text-slate-700 truncate block max-w-[120px]">{tpl.scheduleFrequency}</span>
                  </div>
                </div>
              </div>

              {/* Action Controls Footer */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                {/* Format Radio Pills */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-mono font-bold">
                  {tpl.supportedFormats.map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => handleFormatChange(tpl.id, fmt)}
                      className={`px-2 py-0.5 rounded-md transition-all ${
                        activeFormat === fmt
                          ? "bg-white text-brand-navy shadow-2xs font-black"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>

                {/* Run CTA Button */}
                <button
                  type="button"
                  onClick={() => onRunTemplate(tpl, activeFormat)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-brand-navy px-3 font-label text-xs font-bold text-white shadow-2xs hover:bg-brand-navy/90 active:scale-95 transition-all"
                >
                  <Play size={12} fill="white" />
                  <span>Run</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Mobile Horizontal Swipe Feed (< 1024px) ── */}
      <div className="block lg:hidden">
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-none">
          {templates.map((tpl) => {
            const activeFormat = selectedFormats[tpl.id] ?? tpl.supportedFormats[0];

            return (
              <div
                key={tpl.id}
                className="min-w-[280px] snap-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-center">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                      {tpl.category}
                    </span>
                    <span className="font-mono text-[10px] text-text-grey">{tpl.recordCount} rows</span>
                  </div>

                  <h4 className="mt-2 font-heading text-sm font-bold text-brand-navy">
                    {tpl.title}
                  </h4>
                  <p className="mt-1 font-body text-xs text-text-grey line-clamp-2">
                    {tpl.description}
                  </p>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {tpl.supportedFormats.map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => handleFormatChange(tpl.id, fmt)}
                        className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold ${
                          activeFormat === fmt ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRunTemplate(tpl, activeFormat)}
                    className="flex min-h-[40px] items-center gap-1 rounded-xl bg-brand-navy px-3 font-label text-xs font-bold text-white shadow-2xs"
                  >
                    <Play size={12} fill="white" />
                    <span>Run</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
