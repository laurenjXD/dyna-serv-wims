"use client";

import { X, GitCommit, FileCode, Check } from "lucide-react";
import type { SystemAuditEvent } from "@/app/(authenticated)/settings/security/actions";

interface AuditDiffModalProps {
  event: SystemAuditEvent | null;
  onClose: () => void;
}

export function AuditDiffModal({ event, onClose }: AuditDiffModalProps) {
  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#F8FAFC] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-base font-bold text-slate-900">{event.action}</h3>
                <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-slate-600 uppercase">
                  {event.module}
                </span>
              </div>
              <p className="font-body text-xs text-slate-500">
                Actor: <strong className="text-slate-700">{event.actor}</strong> · {new Date(event.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono mb-1">
              Event Target &amp; Description
            </span>
            <p className="font-body text-slate-800 bg-[#F8FAFC] p-3 rounded-xl border border-slate-200/80">
              {event.rawDetails}
            </p>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono mb-1">
              Device &amp; Network Context
            </span>
            <p className="font-mono text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              {event.deviceContext}
            </p>
          </div>

          {/* Delta / Changes Diff */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block font-mono mb-2">
              State Mutation Delta (Before vs. After)
            </span>

            {event.changesDelta ? (
              <div className="space-y-2">
                {Object.entries(event.changesDelta).map(([field, delta]) => (
                  <div key={field} className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                    <div className="bg-slate-100 px-3 py-1.5 font-mono font-bold text-slate-700 border-b border-slate-200">
                      Field: {field}
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-slate-100 bg-[#F8FAFC]">
                      <div className="p-3">
                        <span className="font-mono text-[10px] font-bold text-rose-600 uppercase block mb-1">
                          - Before Mutation
                        </span>
                        <pre className="font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                          {typeof delta.before === "object" ? JSON.stringify(delta.before, null, 2) : String(delta.before ?? "null")}
                        </pre>
                      </div>
                      <div className="p-3 bg-emerald-50/40">
                        <span className="font-mono text-[10px] font-bold text-emerald-700 uppercase block mb-1">
                          + After Mutation
                        </span>
                        <pre className="font-mono text-[11px] text-emerald-900 whitespace-pre-wrap">
                          {typeof delta.after === "object" ? JSON.stringify(delta.after, null, 2) : String(delta.after ?? "null")}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 italic">No state mutation delta recorded for this event.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-[#F8FAFC] px-6 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-brand-navy px-4 py-2 font-label text-xs font-bold text-white shadow-xs hover:bg-brand-navy/90"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
