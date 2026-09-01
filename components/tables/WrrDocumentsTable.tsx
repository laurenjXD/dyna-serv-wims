"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText } from "lucide-react";
import { DataTable } from "./DataTable";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  staged_pending_arrival: "Staged / Pending Arrival",
  receiving_in_progress: "Receiving in Progress",
  confirmed: "Confirmed",
  cancelled: "cancelled",
};

export function WrrDocumentsTable({
  data,
}: {
  data: WrrDocumentRow[];
  canCreate?: boolean;
}) {
  const columns = useMemo<ColumnDef<WrrDocumentRow, unknown>[]>(() => [
    // 1. WRR NUMBER
    {
      accessorKey: "wrrNumber",
      header: "WRR Number",
      meta: {
        filterVariant: "text",
        filterLabel: "WRR #",
      },
      cell: (info) => {
        const row = info.row.original;
        return (
          <Link
            href={`/receiving/${row.id}`}
            className="font-mono font-bold text-slate-900 flex items-center gap-2 hover:text-brand-navy hover:underline group"
          >
            <FileText size={15} className="text-slate-400 group-hover:text-brand-navy transition-colors shrink-0" />
            <span>{String(info.getValue())}</span>
          </Link>
        );
      },
    },

    // 2. FLOW TYPE
    {
      accessorKey: "flowType",
      header: "Flow Type",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Flow Type",
        filterOptions: [
          { label: "VMI", value: "vmi" },
          { label: "Trading", value: "trading" },
          { label: "Supplies", value: "supplies" },
        ],
      },
      cell: (info) => {
        const flow = String(info.getValue()).toLowerCase();
        return (
          <span className="inline-block rounded-full bg-[#EBF3FE] text-[#1A73E8] border border-[#CBE2FD] px-3 py-0.5 text-xs font-bold uppercase tracking-wider">
            {FLOW_LABELS[flow] ?? flow.toUpperCase()}
          </span>
        );
      },
    },

    // 3. STATUS
    {
      accessorKey: "status",
      header: "Status",
      meta: {
        filterVariant: "status-pill",
        filterLabel: "Status",
      },
      cell: (info) => {
        const st = String(info.getValue());
        const isConfirmed = st === "confirmed";
        const isInProgress = st === "receiving_in_progress";
        const isStaged = st === "staged_pending_arrival";

        const badgeClass = isConfirmed
          ? "bg-[#E8F8F0] text-[#1E8E5A] border-[#C6EFDC]"
          : isInProgress
          ? "bg-[#EBF3FE] text-[#1A73E8] border-[#CBE2FD]"
          : isStaged
          ? "bg-[#FEF6E7] text-[#B76E00] border-[#FDE6B8]"
          : "bg-[#F1F3F4] text-[#5F6368] border-[#DADCE0]";

        const dotClass = isConfirmed
          ? "bg-[#1E8E5A]"
          : isInProgress
          ? "bg-[#1A73E8]"
          : isStaged
          ? "bg-[#B76E00]"
          : "bg-[#5F6368]";

        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold border ${badgeClass}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
            {STATUS_LABELS[st] ?? st}
          </span>
        );
      },
    },

    // 4. ORGANIZATION
    {
      accessorKey: "vendorPartyName",
      header: "Organization",
      meta: {
        filterVariant: "text",
        filterLabel: "Organization",
      },
      cell: (info) => (
        <span className="text-slate-800 font-medium text-sm">{String(info.getValue() || "—")}</span>
      ),
    },

    // 6. CREATED DATE
    {
      accessorKey: "createdAt",
      header: "Created Date",
      meta: {
        filterVariant: "date-range",
        filterLabel: "Created Date",
      },
      cell: (info) => {
        const val = info.getValue();
        if (!val) return <span className="text-slate-400">—</span>;
        const d = new Date(val as string | Date);
        return (
          <span className="font-mono text-slate-700 text-sm font-medium">
            {d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}
          </span>
        );
      },
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={data}
      showHeader={false}
      initialSorting={[{ id: "createdAt", desc: true }]}
      emptyMessage="No WRR documents found."
    />
  );
}
