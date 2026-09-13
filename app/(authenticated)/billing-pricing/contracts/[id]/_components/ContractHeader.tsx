"use client";

import Link from "next/link";
import { ArrowLeft, Plus, Building, Calendar, DollarSign, Clock } from "lucide-react";
import type { ContractDetailResult } from "@/lib/actions/contracts";

interface ContractHeaderProps {
  contract: NonNullable<ContractDetailResult>["contract"];
}

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  active: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  draft: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  suspended: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  expired: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-300" },
  pending_approval: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
};

export function ContractHeader({ contract }: ContractHeaderProps) {
  const statusStyle = STATUS_BADGES[contract.status] ?? {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
  };

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1 space-y-4">
      {/* Top row with Back navigation and Action buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/billing-pricing/contracts"
          className="inline-flex items-center gap-1.5 font-label text-label-md font-bold text-text-grey hover:text-brand-navy transition-colors"
        >
          <ArrowLeft size={16} /> Back to Commercial Contracts
        </Link>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/billing-pricing/contracts/${contract.id}/rules/new`}
            className="inline-flex h-9.5 items-center gap-1.5 rounded-xl bg-brand-navy px-4 font-label text-label font-bold text-white shadow-2xs hover:bg-brand-navy/90 transition-colors"
          >
            <Plus size={15} />
            <span>Add Pricing Rule</span>
          </Link>
        </div>
      </div>

      {/* Contract Title, Badges, and Metadata Summary */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-t border-outline-variant/30 pt-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-heading text-headline-md font-extrabold text-on-surface">
              {contract.contractNumber}
            </h1>
            <span className="rounded-xl border border-brand-navy/20 bg-brand-navy/10 px-3 py-1 font-mono text-mono-xs font-bold text-brand-navy uppercase">
              {contract.contractType.replace("_", " + ")}
            </span>
            <span
              className={`rounded-xl border px-3 py-1 font-label text-label-xs font-bold uppercase tracking-wider ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
            >
              {contract.status.replace("_", " ")}
            </span>
          </div>

          <p className="mt-1.5 flex items-center gap-2 font-body text-body-sm text-text-grey">
            <Building size={15} className="text-brand-navy shrink-0" />
            <span>Customer Organization:</span>
            <strong className="text-on-surface">{contract.partyName}</strong>
          </p>
        </div>

        {/* Quick Metadata Badges */}
        <div className="flex flex-wrap items-center gap-3 text-body-xs font-medium">
          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-light-grey/60 px-3 py-1.5">
            <Calendar size={14} className="text-text-grey" />
            <span className="text-text-grey">Effective:</span>
            <span className="font-mono font-bold text-on-surface">
              {contract.effectiveDate} &rarr; {contract.expirationDate ?? "Open-Ended"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-light-grey/60 px-3 py-1.5">
            <DollarSign size={14} className="text-text-grey" />
            <span className="text-text-grey">Billing Currency:</span>
            <span className="font-mono font-bold text-brand-navy">{contract.currency}</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-light-grey/60 px-3 py-1.5">
            <Clock size={14} className="text-text-grey" />
            <span className="text-text-grey">Terms:</span>
            <span className="font-body font-bold text-on-surface">{contract.paymentTerms || "Net 30"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
