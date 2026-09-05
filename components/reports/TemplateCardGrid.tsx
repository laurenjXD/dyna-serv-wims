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
          <h3 className="font-heading text-title-md font-bold text-brand-navy flex items-center gap-2">
            <FileText size={18} className="text-brand-navy" />
            Standard Operational Report Templates &amp; Schedules
          </h3>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            One-click execution and automated cron schedules for recurring executive &amp; consignor reports.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => {
          const activeFormat = selectedFormats[tpl.id] ?? tpl.supportedFormats[0];

          return (
            <div
              key={tpl.id}
              className="relative rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between"
            >
              <div>
                {/* Category Badge & Estimate */}
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

                  <span className="font-mono text-[10px] text-text-grey flex items-center gap-1">
                    <Clock size={11} />
                    ~{tpl.estimatedGenerationSec}s run
                  </span>
                </div>

                {/* Title & Description */}
                <h4 className="mt-3 font-heading text-base font-bold text-slate-900 leading-snug">
                  {tpl.title}
                </h4>
                <p className="mt-1.5 font-body text-xs text-text-grey leading-relaxed line-clamp-2">
                  {tpl.description}
                </p>

                {/* Meta details */}
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] font-body">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-text-grey">Auto-Schedule:</span>
                    <span className="font-semibold text-slate-800">{tpl.scheduleFrequency}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-text-grey">Last Run:</span>
                    <span className="font-mono text-slate-700">{tpl.lastRunDate}</span>
                  </div>
                </div>
              </div>

              {/* Format Selectors & Action Buttons */}
              <div className="mt-5 space-y-3">
                {/* Format selection pills */}
                <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs">
                  {tpl.supportedFormats.map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => handleFormatChange(tpl.id, fmt)}
                      className={`flex-1 rounded-lg py-1 text-center font-bold text-[10px] transition-all ${
                        activeFormat === fmt
                          ? "bg-white text-brand-navy shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
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
                    className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-navy px-3 font-label text-xs font-bold text-white shadow-2xs hover:bg-brand-navy/90 transition-colors"
                  >
                    <Play size={12} className="fill-white" />
                    <span>Run Now</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onScheduleTemplate(tpl)}
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 font-label text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
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
    </div>
  );
}
