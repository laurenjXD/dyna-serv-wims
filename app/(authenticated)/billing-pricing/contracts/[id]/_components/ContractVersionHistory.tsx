"use client";

import { History, CheckCircle2, Clock } from "lucide-react";
interface ContractVersionHistoryProps {
  activeVersion?: {
    id?: string;
    versionNumber?: number;
    effectiveDate?: string;
    changeSummary?: string | null;
    isActive?: boolean;
  } | null;
}

export function ContractVersionHistory({ activeVersion }: ContractVersionHistoryProps) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1 space-y-4">
      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
        <div>
          <h3 className="font-heading text-title-md font-bold text-on-surface flex items-center gap-2">
            <History size={20} className="text-brand-navy" />
            Contract Version &amp; Revision History
          </h3>
          <p className="font-body text-body-sm text-text-grey">
            Effective version timeline and historical rate revisions.
          </p>
        </div>
      </div>

      <div className="relative pl-6 space-y-6 before:absolute before:bottom-0 before:left-2 before:top-2 before:w-0.5 before:bg-outline-variant/40">
        {/* Active Version Item */}
        <div className="relative flex items-start gap-4">
          <div className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 ring-4 ring-emerald-50">
            <CheckCircle2 size={12} className="text-white" />
          </div>
          <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-heading text-title-sm font-bold text-on-surface">
                  Version {activeVersion?.versionNumber ?? 1} (Current Active)
                </span>
                <span className="rounded-lg bg-emerald-600 px-2 py-0.5 font-label text-label-xs font-bold text-white uppercase">
                  Active
                </span>
              </div>
              <span className="font-mono text-mono-xs text-text-grey">
                Effective: {activeVersion?.effectiveDate ?? "Present"}
              </span>
            </div>
            <p className="mt-2 font-body text-body-xs text-text-grey">
              {activeVersion?.changeSummary || "Initial commercial rate contract creation."}
            </p>
          </div>
        </div>

        {/* Previous Version Placeholder / Baseline */}
        <div className="relative flex items-start gap-4 opacity-70">
          <div className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-400 ring-4 ring-slate-100">
            <Clock size={12} className="text-white" />
          </div>
          <div className="flex-1 rounded-xl border border-outline-variant/30 bg-surface-light-grey/40 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-heading text-title-sm font-semibold text-text-grey">
                Initial Drafting &amp; Review
              </span>
              <span className="font-mono text-mono-xs text-text-grey">
                Pre-Execution
              </span>
            </div>
            <p className="mt-1 font-body text-body-xs text-text-grey">
              Drafted and finalized through Master Inventory commercial configuration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
