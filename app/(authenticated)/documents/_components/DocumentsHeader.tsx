"use client";

import { FileText } from "lucide-react";

interface DocumentsHeaderProps {
  totalCount: number;
  activeTabLabel: string;
}

export function DocumentsHeader({ totalCount, activeTabLabel }: DocumentsHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-navy/10 text-brand-navy">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="font-heading text-headline-xl font-extrabold text-on-surface">
              Documents Center
            </h1>
            <p className="font-body text-body-md text-text-grey">
              Authoritative document archive for WRRs, pick lists, delivery receipts, statements, and customs clearances.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-white px-3 py-1.5 font-label text-label font-bold text-on-surface shadow-elevation-1">
          <span className="h-2 w-2 rounded-full bg-status-available" />
          {totalCount.toLocaleString()} {activeTabLabel} records
        </span>
      </div>
    </div>
  );
}
