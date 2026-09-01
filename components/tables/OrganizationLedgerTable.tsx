"use client";

import React, { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { History, FileText, Clock } from "lucide-react";
import { DataTable } from "./DataTable";

export type OrganizationTransactionRow = {
  id: string;
  timestamp: string | Date;
  movementType: "inbound_receipt" | "outbound_dispatch" | "transfer" | "adjustment" | "vmi_consumption";
  referenceDocument: string;
  itemCode: string;
  itemName: string;
  lotNumber: string;
  quantity: number;
  uom: string;
  locationLabel: string;
  balanceAfter?: number;
};

export function OrganizationLedgerTable({
  data,
  organizationName,
}: {
  data: OrganizationTransactionRow[];
  organizationName?: string;
}) {
  const columns = useMemo<ColumnDef<OrganizationTransactionRow, unknown>[]>(() => [
    // 1. Date / Time (Date Range filter)
    {
      accessorKey: "timestamp",
      header: "Date / Time",
      meta: {
        filterVariant: "date-range",
        filterLabel: "Date Range",
      },
      cell: (info) => {
        const d = new Date(info.getValue() as string | Date);
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

    // 2. Movement Type (Categorical Multi-Select)
    {
      accessorKey: "movementType",
      header: "Movement Type",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Movement Type",
        filterOptions: [
          { label: "Inbound Receipt (WRR)", value: "inbound_receipt" },
          { label: "Outbound Dispatch", value: "outbound_dispatch" },
          { label: "Transfer", value: "transfer" },
          { label: "VMI Consumption", value: "vmi_consumption" },
          { label: "Adjustment", value: "adjustment" },
        ],
      },
      cell: (info) => {
        const type = String(info.getValue());
        return (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
              type === "inbound_receipt"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : type === "outbound_dispatch" || type === "vmi_consumption"
                ? "bg-blue-50 text-blue-800 border border-blue-200"
                : type === "transfer"
                ? "bg-purple-50 text-purple-800 border border-purple-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}
          >
            {type.replace("_", " ")}
          </span>
        );
      },
    },

    // 3. Reference Document (Text search: e.g. WRR #, Pick List #, SOA #)
    {
      accessorKey: "referenceDocument",
      header: "Reference Doc",
      meta: {
        filterVariant: "text",
        filterLabel: "Ref Doc",
      },
      cell: (info) => (
        <span className="font-mono text-xs font-bold text-brand-navy flex items-center gap-1">
          <FileText size={13} className="text-slate-400" />
          {String(info.getValue())}
        </span>
      ),
    },

    // 4. SKU & Item
    {
      accessorKey: "itemCode",
      header: "Item",
      meta: {
        filterVariant: "text",
        filterLabel: "Item Code",
      },
      cell: (info) => {
        const row = info.row.original;
        return (
          <div>
            <span className="font-mono font-bold text-slate-900">{String(info.getValue())}</span>
            <span className="block text-[11px] text-text-grey truncate max-w-[200px]">{row.itemName}</span>
          </div>
        );
      },
    },

    // 5. Lot Number (Text search)
    {
      accessorKey: "lotNumber",
      header: "Lot #",
      meta: {
        filterVariant: "text",
        filterLabel: "Lot Number",
      },
      cell: (info) => (
        <span className="font-mono text-xs text-slate-800 font-semibold">{String(info.getValue())}</span>
      ),
    },

    // 6. Quantity (Numeric Range + Aggregation sum)
    {
      accessorKey: "quantity",
      header: "Quantity",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Quantity",
        align: "right",
      },
      aggregationFn: "sum",
      cell: (info) => {
        const row = info.row.original;
        const qty = Number(info.getValue());
        const isPositive = row.movementType === "inbound_receipt" || qty > 0;
        return (
          <div className={`text-right font-mono text-xs font-bold ${isPositive ? "text-emerald-700" : "text-slate-900"}`}>
            {isPositive ? `+${qty.toLocaleString()}` : qty.toLocaleString()}{" "}
            <span className="text-[10px] font-normal text-text-grey">{row.uom}</span>
          </div>
        );
      },
    },

    // 7. Location
    {
      accessorKey: "locationLabel",
      header: "Location",
      meta: {
        filterVariant: "text",
        filterLabel: "Location",
      },
      cell: (info) => (
        <span className="font-mono text-xs text-text-grey bg-slate-100 px-2 py-0.5 rounded">
          {String(info.getValue() || "—")}
        </span>
      ),
    },

    // 8. Balance After (Numeric Range)
    {
      accessorKey: "balanceAfter",
      header: "Balance After",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Balance After",
        align: "right",
      },
      cell: (info) => {
        const val = info.getValue();
        if (val === undefined || val === null) return <span className="text-text-grey">—</span>;
        return (
          <div className="text-right font-mono text-xs font-bold text-brand-navy">
            {Number(val).toLocaleString()}{" "}
            <span className="text-[10px] font-normal text-text-grey">{info.row.original.uom}</span>
          </div>
        );
      },
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={data}
      title={organizationName ? `${organizationName} — Transaction Ledger` : "Organization Transaction Ledger"}
      subtitle="Complete chronological audit trail of all receipts, releases, transfers, and VMI consumptions"
      icon={<History size={18} />}
      initialSorting={[{ id: "timestamp", desc: true }]}
      emptyMessage="No ledger transactions found matching the selected filters."
    />
  );
}
