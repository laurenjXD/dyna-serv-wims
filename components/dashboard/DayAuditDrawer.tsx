"use client";

import React from "react";
import {
  X,
  Calendar,
  Layers,
  User,
  Clock,
  AlertTriangle,
  Lock,
  CheckCircle2,
  Package,
  FileSpreadsheet,
  Activity,
  History,
} from "lucide-react";
import type { BinAuditRecord, HeatmapMetricView } from "./types";

interface DayAuditDrawerProps {
  record: BinAuditRecord | null;
  metricView: HeatmapMetricView;
  onClose: () => void;
}

export function DayAuditDrawer({ record, metricView, onClose }: DayAuditDrawerProps) {
  if (!record) return null;

  const getMetricTitle = () => {
    switch (metricView) {
      case "pickActivity":
        return "Pick Activity Frequency";
      case "inventoryAging":
        return "Stock Inventory Aging";
      case "varianceRate":
        return "Cycle Count Variance Rate";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div className="relative flex h-full w-full max-w-lg flex-col bg-surface-white shadow-elevation-5 animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-brand-navy bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-lg">
                BIN {record.binId}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold font-mono ${
                  record.status === "critical"
                    ? "bg-rose-100 text-rose-800"
                    : record.status === "warning"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {record.status === "critical" ? (
                  <Lock size={11} />
                ) : record.status === "warning" ? (
                  <AlertTriangle size={11} />
                ) : (
                  <CheckCircle2 size={11} />
                )}
                {record.status.toUpperCase()}
              </span>
            </div>

            <h2 className="mt-2 font-heading text-title-lg font-bold text-brand-navy">
              Bin Shift Activity &amp; Audit Log
            </h2>

            <p className="mt-1 flex items-center gap-1.5 font-body text-xs text-text-grey font-medium">
              <Calendar size={13} className="text-slate-400" />
              <span>
                {record.monthName} {record.dayNumber}, {record.year} ({record.date})
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors focus:outline-none"
            aria-label="Close audit drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Key Metric Spotlight */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-2xs">
            <span className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
              {getMetricTitle()}
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-black text-brand-navy">
                {record.metricFormatted}
              </span>
              <span className="font-label text-xs text-slate-600 font-semibold">
                Shift Average
              </span>
            </div>
          </div>

          {/* QA Hold / Discrepancy Alerts */}
          {(record.holdReason || record.discrepancyLog) && (
            <div className="space-y-3">
              {record.holdReason && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-900">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <Lock size={14} className="text-rose-600" />
                    <span>Active QA Hold Flag</span>
                  </div>
                  <p className="font-body text-rose-800">{record.holdReason}</p>
                </div>
              )}

              {record.discrepancyLog && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <AlertTriangle size={14} className="text-amber-600" />
                    <span>Audit Discrepancy Note</span>
                  </div>
                  <p className="font-body text-amber-800">{record.discrepancyLog}</p>
                </div>
              )}
            </div>
          )}

          {/* Executed Shift Activities / SKUs */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-sm font-bold text-brand-navy flex items-center gap-1.5">
                <Activity size={15} className="text-blue-600" />
                <span>SKU Movements &amp; Floor Actions ({record.activities.length})</span>
              </h3>
              <span className="font-label text-[11px] text-text-grey">Oldest to Newest</span>
            </div>

            <div className="space-y-3">
              {record.activities.map((act, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200/80 bg-surface-white p-3.5 shadow-2xs hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-brand-navy">
                          {act.sku}
                        </span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            act.action === "PICK"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : act.action === "PUTAWAY"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-purple-50 text-purple-700 border border-purple-200"
                          }`}
                        >
                          {act.action}
                        </span>
                      </div>
                      <p className="mt-1 font-body text-xs font-medium text-slate-800">
                        {act.itemName}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {act.qty} {act.uom}
                      </span>
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-grey font-body">
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} className="text-slate-400" />
                      <span className="font-mono">{act.timestamp}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <User size={11} className="text-slate-400" />
                      <span className="font-mono">{act.operatorBadge}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-slate-600 font-semibold">{act.lotNumber}</span>
                    </div>
                  </div>

                  {act.notes && (
                    <p className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-600 font-body">
                      {act.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* QA Verification Notes */}
          {record.qaNotes && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 mb-1">
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span>Shift Supervisor Sign-off</span>
              </div>
              <p className="font-body text-slate-600">{record.qaNotes}</p>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-4 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-label text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Close Audit Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
