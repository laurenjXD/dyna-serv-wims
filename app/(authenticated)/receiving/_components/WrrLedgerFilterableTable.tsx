"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet, FileText, ArrowRight } from "lucide-react";
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
        filterLabel: "WRR #",
      },
      cell: (info) => {
        const row = info.row.original;
        return (
          <Link
            href={`/receiving/${row.id}`}
            className="font-mono font-bold text-brand-navy flex items-center gap-1.5 hover:underline"
          >
            <FileText size={14} className="text-brand-navy/60" />
            {String(info.getValue())}
          </Link>
        );
      },
    },

    // 2. Flow Type
    {
      accessorKey: "flowType",
      header: "Flow Type",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Flow Type",
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
            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              flow === "vmi"
                ? "bg-blue-50 text-blue-800 border border-blue-200"
                : flow === "trading"
                ? "bg-slate-100 text-slate-900 border border-slate-300"
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
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Confirmed
        </span>
      ),
    },

    // 4. Vendor / Supplier
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

    // 5. Reference / BL #
    {
      accessorKey: "referenceNumber",
      header: "Invoice / BL #",
      meta: {
        filterVariant: "text",
        filterLabel: "Invoice / Ref #",
      },
      cell: (info) => (
        <span className="font-mono text-xs text-text-grey">{String(info.getValue() || "—")}</span>
      ),
    },

    // 6. Confirmed Date
    {
      accessorKey: "createdAt",
      header: "Received / Created",
      meta: {
        filterVariant: "date-range",
        filterLabel: "Date Range",
      },
      cell: (info) => (
        <span className="font-mono text-xs text-slate-600">
          {new Date(info.getValue() as string | Date).toLocaleDateString()}
        </span>
      ),
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
            className="inline-flex items-center gap-1 rounded bg-brand-navy px-2.5 py-1 text-[11px] font-bold text-surface-white hover:bg-brand-navy/90 transition-colors shadow-sm"
          >
            View <ArrowRight size={11} />
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
      subtitle="Immutable registry of confirmed warehouse receipts with per-field Google Sheets filtering, flow types, and date windowing"
      icon={<FileSpreadsheet size={18} />}
      initialSorting={[{ id: "createdAt", desc: true }]}
      emptyMessage="No confirmed incoming receipts found."
    />
  );
}
