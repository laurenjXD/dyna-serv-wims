"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet, Plus, FileText, ArrowRight } from "lucide-react";
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
};

export function WrrDocumentsTable({
  data,
  canCreate = false,
}: {
  data: WrrDocumentRow[];
  canCreate?: boolean;
}) {
  const columns = useMemo<ColumnDef<WrrDocumentRow, any>[]>(() => [
    // 1. WRR Number
    {
      accessorKey: "wrrNumber",
      header: "WRR Number",
      meta: {
        filterVariant: "text",
        filterLabel: "WRR #",
      },
      cell: (info) => (
        <span className="font-mono font-bold text-brand-navy flex items-center gap-1.5">
          <FileText size={14} className="text-brand-navy/60" />
          {String(info.getValue())}
        </span>
      ),
    },

    // 2. Flow Type (Multi-Select)
    {
      accessorKey: "flowType",
      header: "Flow Type",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Flow Type",
        filterOptions: [
          { label: "VMI (Consignment)", value: "vmi" },
          { label: "Trading (Owned)", value: "trading" },
          { label: "Internal Supplies", value: "supplies" },
        ],
      },
      cell: (info) => {
        const flow = String(info.getValue());
        return (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
              flow === "vmi"
                ? "bg-blue-50 text-blue-800 border border-blue-200"
                : flow === "trading"
                ? "bg-slate-100 text-slate-900 border border-slate-300"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}
          >
            {FLOW_LABELS[flow] ?? flow}
          </span>
        );
      },
    },

    // 3. Status (Status Pills)
    {
      accessorKey: "status",
      header: "Status",
      meta: {
        filterVariant: "status-pill",
        filterLabel: "Status",
      },
      cell: (info) => {
        const st = String(info.getValue());
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
              st === "confirmed"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : st === "receiving_in_progress"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : st === "staged_pending_arrival"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                st === "confirmed"
                  ? "bg-emerald-500"
                  : st === "receiving_in_progress"
                  ? "bg-blue-500"
                  : st === "staged_pending_arrival"
                  ? "bg-amber-500"
                  : "bg-slate-400"
              }`}
            />
            {STATUS_LABELS[st] ?? st}
          </span>
        );
      },
    },

    // 4. Vendor / Supplier (Text Search)
    {
      accessorKey: "vendorPartyName",
      header: "Supplier / Vendor",
      meta: {
        filterVariant: "text",
        filterLabel: "Supplier",
      },
      cell: (info) => (
        <span className="font-medium text-slate-800">{String(info.getValue() || "—")}</span>
      ),
    },

    // 5. Reference Invoice / BL
    {
      accessorKey: "referenceNumber",
      header: "Invoice / BL #",
      meta: {
        filterVariant: "text",
        filterLabel: "Ref #",
      },
      cell: (info) => (
        <span className="font-mono text-xs text-text-grey">{String(info.getValue() || "—")}</span>
      ),
    },

    // 6. Created Date (Date Range)
    {
      accessorKey: "createdAt",
      header: "Created Date",
      meta: {
        filterVariant: "date-range",
        filterLabel: "Created Date",
      },
      cell: (info) => (
        <span className="font-mono text-xs text-text-grey">
          {new Date(info.getValue()).toLocaleDateString()}
        </span>
      ),
    },

    // 7. Actions
    {
      id: "actions",
      header: "Action",
      meta: {
        align: "right",
      },
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href={`/receiving/${row.id}`}
              className="inline-flex items-center gap-1 rounded bg-brand-navy px-2.5 py-1 text-[11px] font-bold text-surface-white hover:bg-brand-navy/90 transition-colors shadow-sm"
            >
              Open <ArrowRight size={11} />
            </Link>
          </div>
        );
      },
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={data}
      title="Warehouse Receiving Reports (WRR)"
      subtitle="Inbound documents registry with Google Sheets header filtering, multi-flow filtering, and date windowing"
      icon={<FileSpreadsheet size={18} />}
      initialSorting={[{ id: "createdAt", desc: true }]}
      actions={
        canCreate ? (
          <Link
            href="/receiving/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-surface-white hover:bg-primary/90 transition-all shadow-sm"
          >
            <Plus size={14} /> New WRR
          </Link>
        ) : null
      }
      emptyMessage="No WRR documents found matching the specified filters."
    />
  );
}
