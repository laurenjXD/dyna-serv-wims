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
import { PRE_BUILT_TEMPLATES_SEED } from "./data/reportsSeedData";

interface TemplateCardGridProps {
  onRunTemplate: (template: PreBuiltTemplate, format: ReportFormat) => void;
  onScheduleTemplate: (template: PreBuiltTemplate) => void;
}

export function TemplateCardGrid({
  onRunTemplate,
  onScheduleTemplate,
}: TemplateCardGridProps) {
  const templates: PreBuiltTemplate[] = PRE_BUILT_TEMPLATES_SEED;
  const [selectedFormats, setSelectedFormats] = useState<Record<string, ReportFormat>>({
    "tpl-01": "PDF",
    "tpl-02": "PDF",
    "tpl-03": "PDF",
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
              className="relative rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between"
            >
              <div>
                {/* Category Badge & Estimate */}
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-label text-[10px] font-bold ${
                      tpl.category === "Financial"
                        ? "bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                        : tpl.category === "Inventory"
                        ? "bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                        : tpl.category === "Settlement"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                        : "bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
                    }`}
                  >
                    {tpl.category}
                  </span>

                  <span className="font-mono text-[10px] text-text-grey flex items-center gap-1">
                    <Clock size={11} />
                    ~{tpl.estimatedGenerationSec}s run
                  </span>
                </div>

                {/* Title & Description */}
                <h4 className="mt-3 font-heading text-base font-bold text-slate-900 dark:text-zinc-100 leading-snug">
                  {tpl.title}
                </h4>
                <p className="mt-1.5 font-body text-xs text-text-grey leading-relaxed line-clamp-2">
                  {tpl.description}
                </p>

                {/* Meta details */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 space-y-1.5 text-[11px] font-body">
                  <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
                    <span className="text-text-grey">Auto-Schedule:</span>
                    <span className="font-semibold text-slate-800 dark:text-zinc-200">{tpl.scheduleFrequency}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
                    <span className="text-text-grey">Last Run:</span>
                    <span className="font-mono text-slate-700 dark:text-zinc-300">{tpl.lastRunDate}</span>
                  </div>
                </div>
              </div>

              {/* Format Selectors & Action Buttons */}
              <div className="mt-5 space-y-3">
                {/* Format selection pills */}
                <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-zinc-800 p-1 font-label text-xs">
                  {tpl.supportedFormats.map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => handleFormatChange(tpl.id, fmt)}
                      className={`flex-1 rounded-lg py-1 text-center font-bold text-[10px] transition-all ${
                        activeFormat === fmt
                          ? "bg-white dark:bg-zinc-700 text-brand-navy dark:text-white shadow-2xs"
                          : "text-slate-600 dark:text-zinc-400 hover:text-slate-900"
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>

                {/* Run Now & Schedule Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRunTemplate(tpl, activeFormat)}
                    className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-navy dark:bg-blue-600 px-3 font-label text-xs font-bold text-white shadow-2xs hover:bg-brand-navy/90 dark:hover:bg-blue-700 transition-colors"
                  >
                    <Download size={13} className="text-white" />
                    <span>Download {activeFormat}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onScheduleTemplate(tpl)}
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 font-label text-xs font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs"
                    title="Configure Automated Schedule"
                  >
                    <Calendar size={13} className="text-slate-500" />
                    <span>Schedule</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Mobile Snap Carousel (< 1024px) ── */}
      <div className="block lg:hidden">
        <div className="flex gap-3 overflow-x-auto pb-3 pt-1 snap-x snap-mandatory scroll-smooth no-scrollbar">
          {templates.map((tpl) => {
            const activeFormat = selectedFormats[tpl.id] ?? tpl.supportedFormats[0];

            return (
              <div
                key={tpl.id}
                className="w-[85vw] max-w-[340px] shrink-0 snap-center rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 p-4.5 shadow-sm flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-label text-[10px] font-bold ${
                        tpl.category === "Financial"
                          ? "bg-purple-50 text-purple-800 border border-purple-200"
                          : tpl.category === "Inventory"
                          ? "bg-blue-50 text-blue-800 border border-blue-200"
                          : tpl.category === "Settlement"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-slate-100 text-slate-800 border border-slate-200"
                      }`}
                    >
                      {tpl.category}
                    </span>
                    <span className="font-mono text-[10px] text-text-grey">
                      ~{tpl.estimatedGenerationSec}s execution
                    </span>
                  </div>

                  <h4 className="mt-2.5 font-heading text-sm font-bold text-slate-900 dark:text-zinc-100">
                    {tpl.title}
                  </h4>
                  <p className="mt-1 font-body text-xs text-text-grey line-clamp-2">
                    {tpl.description}
                  </p>
                </div>

                {/* Mobile Format Switcher & 48px Action Button */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-zinc-800 p-1 font-label text-xs">
                    {tpl.supportedFormats.map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => handleFormatChange(tpl.id, fmt)}
                        className={`flex-1 min-h-[36px] rounded-lg py-1 text-center font-bold text-xs transition-all ${
                          activeFormat === fmt
                            ? "bg-white dark:bg-zinc-700 text-brand-navy dark:text-white shadow-xs"
                            : "text-slate-600 dark:text-zinc-400"
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRunTemplate(tpl, activeFormat)}
                    className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-brand-navy dark:bg-blue-600 text-white font-label text-xs font-bold shadow-sm active:scale-98 transition-all"
                  >
                    <Download size={16} />
                    <span>Download {activeFormat} Report</span>
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
