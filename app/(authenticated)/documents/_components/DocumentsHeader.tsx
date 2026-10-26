"use client";

import { FileText } from "lucide-react";

interface DocumentsHeaderProps {
  totalCount: number;
  activeTabLabel: string;
}

export function DocumentsHeader({ totalCount, activeTabLabel }: DocumentsHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-navy/10 text-brand-navy mt-0.5">
          <FileText size={22} />
        </div>
        <div className="min-w-0">
          <h1 className="font-heading text-title-lg sm:text-headline-xl font-extrabold text-on-surface tracking-tight">
            Documents Center
          </h1>
          <p className="mt-0.5 font-body text-xs sm:text-body-sm text-text-grey leading-relaxed">
            Authoritative document archive for WRRs, pick lists, delivery receipts, statements, and customs clearances.
          </p>
        </div>
      </div>

      <div className="flex items-center self-start sm:self-auto shrink-0">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/30 bg-surface-white px-3 py-1 font-label text-xs font-semibold text-on-surface shadow-2xs">
          <span className="h-2 w-2 rounded-full bg-status-available animate-pulse" />
          <span className="font-mono font-bold">{totalCount.toLocaleString()}</span> {activeTabLabel} records
        </span>
      </div>
    </div>
  );
}
