"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet, FileText, ArrowRight, Clock, Building2, CheckCircle2 } from "lucide-react";
import { DataTable } from "@/components/tables/DataTable";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

export function WrrLedgerFilterableTable({ rows }: { rows: WrrDocumentRow[] }) {
  const columns = useMemo<ColumnDef<WrrDocumentRow, unknown>[]>(() => [
    // 1. WRR Number
    {
      accessorKey: "wrrNumber",
      header: "WRR Number",
      meta: {
        filterVariant: "text",
        filterLabel: "WRR Number",
      },
      cell: (info) => {
        const row = info.row.original;
        return (
          <Link
            href={`/receiving/${row.id}`}
            className="group inline-flex items-center gap-1.5 font-mono text-xs font-bold text-brand-navy hover:text-blue-700"
          >
            <FileText size={14} className="text-brand-navy/60 group-hover:text-blue-600 transition-colors" />
            <span className="group-hover:underline">{String(info.getValue())}</span>
          </Link>
        );
      },
    },

    // 2. Inventory Model / Flow Type
    {
      accessorKey: "flowType",
      header: "Inventory Model",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Model / Flow",
        filterOptions: [
          { label: "VMI (Consignment)", value: "vmi" },
          { label: "Trading (Owned)", value: "trading" },
          { label: "Supplies", value: "supplies" },
        ],
      },
      cell: (info) => {
        const flow = String(info.getValue()).toLowerCase();
        return (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              flow === "vmi"
                ? "bg-blue-50 text-blue-800 border border-blue-200"
                : flow === "trading"
                ? "bg-slate-100 text-slate-800 border border-slate-300"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}
          >
            {FLOW_LABELS[flow] ?? flow.toUpperCase()}
          </span>
        );
      },
    },

    // 3. Status
    {
      accessorKey: "status",
      header: "Status",
      meta: {
        filterVariant: "status-pill",
        filterLabel: "Status",
      },
      cell: () => (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={12} className="text-emerald-600" />
          Confirmed
        </span>
      ),
    },

    // 4. Organization
    {
      accessorKey: "vendorPartyName",
      header: "Organization",
      meta: {
        filterVariant: "text",
        filterLabel: "Organization",
      },
      cell: (info) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <Building2 size={13} className="text-slate-400 shrink-0" />
          <span className="font-medium text-xs text-slate-800 truncate">
            {String(info.getValue() || "—")}
          </span>
        </div>
      ),
    },

    // 5. Commercial Invoice / Reference
    {
      accessorKey: "commercialInvoiceNo",
      header: "Invoice / CIPL Ref",
      meta: {
        filterVariant: "text",
        filterLabel: "Invoice / Ref #",
      },
      cell: (info) => (
        <span className="font-mono text-xs text-slate-600">
          {String(info.getValue() || "—")}
        </span>
      ),
    },

    // 6. Confirmed / Received Timestamp (Date Range Filter)
    {
      accessorKey: "createdAt",
      header: "Received / Confirmed",
      meta: {
        filterVariant: "date-range",
        filterLabel: "Date Range",
      },
      cell: (info) => {
        const val = info.getValue();
        if (!val) return <span className="font-mono text-xs text-text-grey">—</span>;
        const d = new Date(val as string | Date);
        return (
          <div>
            <div className="font-mono text-xs font-bold text-slate-800">
              {d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            <div className="text-[11px] text-text-grey font-mono flex items-center gap-1 mt-0.5">
              <Clock size={10} className="text-text-grey/70" />
              {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        );
      },
    },

    // 7. Action
    {
      id: "actions",
      header: "Action",
      meta: {
        align: "right",
      },
      cell: (info) => {
        const row = info.row.original;
        return (
          <Link
            href={`/receiving/${row.id}`}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-surface-white hover:bg-brand-navy/90 transition-colors shadow-sm"
          >
            View WRR <ArrowRight size={12} />
          </Link>
        );
      },
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={rows}
      title="Incoming Transaction Ledger"
      subtitle="Immutable audit registry of confirmed warehouse receipts with multi-faceted filtering, flow types, and date ranges."
      icon={<FileSpreadsheet size={18} />}
      initialSorting={[{ id: "createdAt", desc: true }]}
      emptyMessage="No confirmed incoming receipts found."
    />
  );
}
