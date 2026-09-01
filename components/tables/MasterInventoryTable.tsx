"use client";

import React, { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Package } from "lucide-react";
import { DataTable } from "./DataTable";

export type MasterInventoryRow = {
  id: string;
  itemCode: string;
  itemName: string;
  inventoryModel: "Trading" | "VMI" | "Consignment" | "Internal" | "Supplies";
  categoryName: string;
  subcategoryName: string;
  status: "In-Stock" | "Low Stock" | "Out of Stock";
  totalStock: number;
  availableStock: number;
  uom: "Pallet" | "Box" | "Piece" | "CBM" | "Meter" | "Roll";
  primaryLocation: string;
};

export function MasterInventoryTable({
  data,
  onPickItem,
}: {
  data: MasterInventoryRow[];
  onPickItem?: (item: MasterInventoryRow) => void;
}) {
  const columns = useMemo<ColumnDef<MasterInventoryRow, any>[]>(() => [
    // 1. SKU / Item Code (Text Search: Contains / Starts With)
    {
      accessorKey: "itemCode",
      header: "SKU / Code",
      meta: {
        filterVariant: "text",
        filterLabel: "SKU",
      },
      cell: (info) => (
        <span className="font-mono font-bold text-brand-navy">{String(info.getValue())}</span>
      ),
    },

    // 2. Item Name (Text Search)
    {
      accessorKey: "itemName",
      header: "Item Name",
      meta: {
        filterVariant: "text",
        filterLabel: "Item Name",
      },
      cell: (info) => <span className="font-medium text-slate-800">{String(info.getValue())}</span>,
    },

    // 3. Inventory Model (Categorical Multi-select: Trading, VMI, Consignment, Internal)
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
      cell: (info) => {
        const val = String(info.getValue());
        return (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
              val === "VMI" || val === "Consignment"
                ? "bg-blue-50 text-blue-800 border border-blue-200"
                : val === "Trading"
                ? "bg-slate-100 text-slate-900 border border-slate-300"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}
          >
            {val}
          </span>
        );
      },
    },

    // 4. Category (Categorical Multi-select)
    {
      accessorKey: "categoryName",
      header: "Category",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Category",
      },
      cell: (info) => <span className="font-medium text-slate-700">{String(info.getValue() || "—")}</span>,
    },

    // 5. Subcategory (Dependent Categorical: options update based on Category selection)
    {
      accessorKey: "subcategoryName",
      header: "Subcategory",
      meta: {
        filterVariant: "dependent-multi-select",
        parentColumnId: "categoryName",
        filterLabel: "Subcategory",
      },
      cell: (info) => <span className="text-text-grey">{String(info.getValue() || "—")}</span>,
    },

    // 6. Status (Pill toggles: In-Stock, Low Stock, Out of Stock)
    {
      accessorKey: "status",
      header: "Status",
      meta: {
        filterVariant: "status-pill",
        filterLabel: "Stock Status",
      },
      cell: (info) => {
        const st = String(info.getValue());
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
              st === "In-Stock"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : st === "Low Stock"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                st === "In-Stock" ? "bg-emerald-500" : st === "Low Stock" ? "bg-amber-500" : "bg-rose-500"
              }`}
            />
            {st}
          </span>
        );
      },
    },

    // 7. Total Stock (Numeric range inputs + Aggregated sum)
    {
      accessorKey: "totalStock",
      header: "Total Stock",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Total Stock",
        align: "right",
      },
      aggregationFn: "sum",
      cell: (info) => (
        <span className="font-mono font-bold text-slate-900">
          {Number(info.getValue())?.toLocaleString()}
        </span>
      ),
    },

    // 8. Available Stock (Numeric range inputs + Aggregated sum)
    {
      accessorKey: "availableStock",
      header: "Available",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Available Stock",
        align: "right",
      },
      aggregationFn: "sum",
      cell: (info) => (
        <span className="font-mono font-bold text-emerald-700">
          {Number(info.getValue())?.toLocaleString()}
        </span>
      ),
    },

    // 9. Unit of Measure (UOM: Categorical Multi-select)
    {
      accessorKey: "uom",
      header: "UOM",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Unit of Measure",
        filterOptions: [
          { label: "Piece (PCS)", value: "Piece" },
          { label: "Box", value: "Box" },
          { label: "Pallet", value: "Pallet" },
          { label: "CBM", value: "CBM" },
          { label: "Meter", value: "Meter" },
          { label: "Roll", value: "Roll" },
        ],
      },
      cell: (info) => <span className="font-mono text-[11px] text-text-grey uppercase">{String(info.getValue())}</span>,
    },

    // 10. Primary Location (Text Search)
    {
      accessorKey: "primaryLocation",
      header: "Primary Location",
      meta: {
        filterVariant: "text",
        filterLabel: "Primary Location",
      },
      cell: (info) => (
        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
          {String(info.getValue() || "—")}
        </span>
      ),
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={data}
      title="Master Inventory Table"
      subtitle="Google Sheets-style per-column filtering with category hierarchy volume aggregation"
      icon={<Package size={18} />}
      enableGrouping={true}
      initialGrouping={["categoryName", "subcategoryName"]}
      initialSorting={[{ id: "totalStock", desc: true }]}
      emptyMessage="No inventory items match the specified filters."
    />
  );
}
