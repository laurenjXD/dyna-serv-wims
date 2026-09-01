"use client";

import React, { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { History, FileText, User, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { DataTable } from "./DataTable";

export type TransactionLedgerRow = {
  id: string;
  timestamp: string | Date;
  transactionType: "Receiving" | "Dispatch" | "Transfer" | "Adjustment" | "Return";
  referenceDocument: string;
  inventoryModel: "Trading" | "VMI" | "Consignment" | "Internal" | "Supplies";
  actorName: string;
  hasVariance: boolean;
  expectedQty: number;
  actualQty: number;
  uom: string;
  locationLabel: string;
};

export function TransactionLedgerTable({
  data,
}: {
  data: TransactionLedgerRow[];
}) {
  const columns = useMemo<ColumnDef<TransactionLedgerRow, any>[]>(() => [
    // 1. Date / Time (Sortable, descending default, Date Range Picker)
    {
      accessorKey: "timestamp",
      header: "Date / Time",
      meta: {
        filterVariant: "date-range",
        filterLabel: "Date Range",
      },
      cell: (info) => {
        const d = new Date(info.getValue());
        return (
          <div>
            <div className="font-mono text-xs font-bold text-slate-800">
              {d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            <div className="text-[11px] text-text-grey font-mono flex items-center gap-1">
              <Clock size={11} />
              {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        );
      },
    },

    // 2. Transaction Type (Categorical Multi-select: Receiving, Dispatch, Transfer, Adjustment)
    {
      accessorKey: "transactionType",
      header: "Type",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Transaction Type",
        filterOptions: [
          { label: "Receiving (WRR)", value: "Receiving" },
          { label: "Dispatch (Pick List)", value: "Dispatch" },
          { label: "Transfer", value: "Transfer" },
          { label: "Adjustment", value: "Adjustment" },
          { label: "Return", value: "Return" },
        ],
      },
      cell: (info) => {
        const type = String(info.getValue());
        return (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
              type === "Receiving"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : type === "Dispatch"
                ? "bg-blue-50 text-blue-800 border border-blue-200"
                : type === "Transfer"
                ? "bg-purple-50 text-purple-800 border border-purple-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}
          >
            {type}
          </span>
        );
      },
    },

    // 3. Reference Document (Text Search: e.g. WRR-2026-0891)
    {
      accessorKey: "referenceDocument",
      header: "Reference Document",
      meta: {
        filterVariant: "text",
        filterLabel: "Reference Doc",
      },
      cell: (info) => (
        <span className="font-mono text-xs font-bold text-brand-navy flex items-center gap-1">
          <FileText size={13} className="text-slate-400" />
          {String(info.getValue())}
        </span>
      ),
    },

    // 4. Inventory Model (Categorical Multi-select: Trading, VMI, Consignment, Internal)
    {
      accessorKey: "inventoryModel",
      header: "Model",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Inventory Model",
        filterOptions: [
          { label: "Trading (Owned)", value: "Trading" },
          { label: "VMI", value: "VMI" },
          { label: "Consignment", value: "Consignment" },
          { label: "Internal Supplies", value: "Internal" },
          { label: "Supplies", value: "Supplies" },
        ],
      },
      cell: (info) => (
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-800">
          {String(info.getValue())}
        </span>
      ),
    },

    // 5. Expected Qty
    {
      accessorKey: "expectedQty",
      header: "Expected",
      meta: {
        align: "right",
      },
      cell: (info) => (
        <div className="text-right font-mono text-xs text-slate-600">
          {Number(info.getValue())?.toLocaleString()}{" "}
          <span className="text-[10px] text-text-grey">{info.row.original.uom}</span>
        </div>
      ),
    },

    // 6. Actual Qty
    {
      accessorKey: "actualQty",
      header: "Actual",
      meta: {
        align: "right",
      },
      cell: (info) => (
        <div className="text-right font-mono text-xs font-bold text-slate-900">
          {Number(info.getValue())?.toLocaleString()}{" "}
          <span className="text-[10px] font-normal text-text-grey">{info.row.original.uom}</span>
        </div>
      ),
    },

    // 7. Variance / Exceptions (Boolean toggle: Expected Qty != Actual Qty)
    {
      accessorKey: "hasVariance",
      header: "Variance / Exception",
      meta: {
        filterVariant: "boolean",
        filterLabel: "Variances / Exceptions",
      },
      cell: (info) => {
        const hasVar = Boolean(info.getValue());
        const row = info.row.original;
        const diff = row.actualQty - row.expectedQty;

        if (!hasVar) {
          return (
            <div className="flex items-center gap-1 text-emerald-700 text-xs font-mono font-semibold">
              <CheckCircle size={13} /> 0 Match
            </div>
          );
        }

        return (
          <div className="inline-flex items-center gap-1 rounded bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-rose-700 font-mono text-xs font-bold">
            <AlertTriangle size={13} />
            {diff > 0 ? `+${diff}` : diff}
          </div>
        );
      },
    },

    // 8. Location
    {
      accessorKey: "locationLabel",
      header: "Location",
      meta: {
        filterVariant: "text",
        filterLabel: "Location",
      },
      cell: (info) => (
        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
          {String(info.getValue() || "—")}
        </span>
      ),
    },

    // 9. Actor / User (Dropdown select)
    {
      accessorKey: "actorName",
      header: "Actor / User",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Actor",
      },
      cell: (info) => (
        <span className="flex items-center gap-1 text-xs text-slate-800 font-medium">
          <User size={13} className="text-slate-400" />
          {String(info.getValue())}
        </span>
      ),
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={data}
      title="Transaction Ledger"
      subtitle="Chronological event log with date range windowing and variance exception filtering"
      icon={<History size={18} />}
      initialSorting={[{ id: "timestamp", desc: true }]}
      emptyMessage="No ledger transactions found matching the selected filters."
    />
  );
}
