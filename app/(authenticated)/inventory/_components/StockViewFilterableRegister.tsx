"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { ChevronDown, Package } from "lucide-react";
import { DataTable } from "@/components/tables/DataTable";
import { LotQrViewer } from "./LotQrViewer";

export type AggregatedLot = {
  lotId: string;
  lotNumber: string;
  lotStatus: string;
  expiryDate: string | null;
  receivedAt: Date | string;
  locationLabels: string[];
  availableQty: number;
  priority: number;
};

export type GroupedItem = {
  itemId: string;
  itemCode: string;
  itemName: string;
  categoryName: string | null;
  subcategoryName: string | null;
  inventoryModel: string;
  uom: string;
  isPerishable: boolean;
  flowType: "vmi" | "trading" | "supplies";
  organizationId: string | null;
  availableQty: number;
  codes: string;
  lotNumbers: string;
  locationLabels: string;
  customerName: string | null;
  totalIn: number;
  totalOut: number;
  pcsOnHand: number;
  boxesOnHand: number;
  cbmOccupied: number;
  lots: AggregatedLot[];
};

export function StockViewFilterableRegister({ items }: { items: GroupedItem[] }) {
  const columns = useMemo<ColumnDef<GroupedItem, unknown>[]>(() => [
    // 1. SKU / Item Code (Text Search)
    {
      accessorKey: "itemCode",
      header: "SKU / Code",
      meta: {
        filterVariant: "text",
        filterLabel: "Item Code",
      },
      cell: (info) => {
        const item = info.row.original;
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-slate-900">{String(info.getValue())}</span>
            {item.isPerishable && (
              <span className="rounded bg-rose-50 px-1 py-0.2 text-[9px] font-bold text-rose-700 border border-rose-200 uppercase">
                FEFO
              </span>
            )}
          </div>
        );
      },
    },

    // 2. Inventory Model (Multi-Select)
    {
      accessorKey: "inventoryModel",
      header: "Model",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Model",
        filterOptions: [
          { label: "Trading (Owned)", value: "TRADING" },
          { label: "VMI (Consignment)", value: "VMI" },
          { label: "Supplies", value: "SUPPLIES" },
        ],
      },
      cell: (info) => {
        const val = String(info.getValue() || "TRADING").toUpperCase();
        return (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
              val === "VMI"
                ? "bg-blue-100 text-blue-800 border border-blue-200"
                : val === "TRADING"
                ? "bg-slate-100 text-slate-900 border border-slate-300"
                : "bg-amber-100 text-amber-800 border border-amber-200"
            }`}
          >
            {val}
          </span>
        );
      },
    },

    // 3. Category (Multi-Select)
    {
      accessorKey: "categoryName",
      header: "Category",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Category",
      },
      cell: (info) => (
        <span className="font-medium text-slate-700">{String(info.getValue() || "—")}</span>
      ),
    },

    // 4. Subcategory (Dependent Multi-Select)
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

    // 5. Description / Customer (Text Search)
    {
      accessorKey: "itemName",
      header: "Description",
      meta: {
        filterVariant: "text",
        filterLabel: "Description",
      },
      cell: (info) => {
        const item = info.row.original;
        return (
          <div className="max-w-[220px]">
            <p className="font-medium text-slate-900 truncate" title={item.itemName}>
              {item.itemName}
            </p>
            {item.customerName && (
              <p className="text-[11px] text-text-grey truncate" title={item.customerName}>
                {item.customerName}
              </p>
            )}
          </div>
        );
      },
    },

    // 6. Total In (Numeric Range)
    {
      accessorKey: "totalIn",
      header: "Total In",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Total In",
        align: "right",
      },
      aggregationFn: "sum",
      cell: (info) => (
        <span className="font-mono text-slate-600">
          {Number(info.getValue())?.toLocaleString()}
        </span>
      ),
    },

    // 7. Total Out (Numeric Range)
    {
      accessorKey: "totalOut",
      header: "Total Out",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Total Out",
        align: "right",
      },
      aggregationFn: "sum",
      cell: (info) => (
        <span className="font-mono text-slate-600">
          {Number(info.getValue())?.toLocaleString()}
        </span>
      ),
    },

    // 8. Stock on Hand (PCS) - Highlighted Numeric Range
    {
      accessorKey: "pcsOnHand",
      header: "Stock on Hand",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Available Stock (PCS)",
        align: "right",
      },
      aggregationFn: "sum",
      cell: (info) => {
        const item = info.row.original;
        return (
          <div className="font-mono font-bold text-brand-navy bg-blue-50/70 rounded px-2 py-0.5 inline-block">
            {Number(info.getValue())?.toLocaleString()}{" "}
            <span className="text-[10px] font-normal text-text-grey">{item.uom}</span>
          </div>
        );
      },
    },

    // 9. Boxes (Numeric Range)
    {
      accessorKey: "boxesOnHand",
      header: "Boxes",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Boxes",
        align: "right",
      },
      aggregationFn: "sum",
      cell: (info) => (
        <span className="font-mono text-slate-600">
          {Number(info.getValue())?.toLocaleString()}
        </span>
      ),
    },

    // 10. CBM (Numeric Range)
    {
      accessorKey: "cbmOccupied",
      header: "CBM",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "CBM",
        align: "right",
      },
      aggregationFn: "sum",
      cell: (info) => (
        <span className="font-mono text-slate-600">
          {Number(info.getValue())?.toLocaleString(undefined, { maximumFractionDigits: 3 })}
        </span>
      ),
    },

    // 11. Lots & Locations (Text search)
    {
      accessorKey: "locationLabels",
      header: "Locations",
      meta: {
        filterVariant: "text",
        filterLabel: "Locations",
      },
      cell: (info) => {
        const item = info.row.original;
        return (
          <div className="text-[11px] text-text-grey truncate max-w-[150px]">
            <span className="font-semibold text-slate-700">{item.lots.length} lot(s)</span>
            <span className="ml-1 font-mono">[{item.locationLabels || "—"}]</span>
          </div>
        );
      },
    },

    // 12. Quick Action
    {
      id: "actions",
      header: "Action",
      meta: {
        align: "right",
      },
      cell: (info) => {
        const item = info.row.original;
        return (
          <Link
            href={`/inventory?tab=pick-lists&item=${item.itemCode}`}
            className="rounded bg-brand-navy px-2.5 py-1 text-[11px] font-bold text-white hover:bg-brand-navy/90 transition-colors shadow-sm"
          >
            Pick
          </Link>
        );
      },
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={items}
      title="Master Inventory Register"
      subtitle="Per-column Google Sheets filtering, dynamic subcategories, and category volume aggregation"
      icon={<Package size={18} />}
      enableGrouping={true}
      initialGrouping={["categoryName", "subcategoryName"]}
      initialSorting={[{ id: "pcsOnHand", desc: true }]}
      renderRowSubComponent={({ row }: { row: Row<GroupedItem> }) => (
        <InventoryItemLotDrawer item={row.original} />
      )}
      emptyMessage="No inventory items match the specified filters."
    />
  );
}

function InventoryItemLotDrawer({ item }: { item: GroupedItem }) {
  return (
    <div className="border-t border-blue-100 bg-[#F8FAFF] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 pb-2">
        <div className="text-xs text-text-grey">
          <span>Lots for <strong className="font-mono text-brand-navy">{item.itemCode}</strong> shown in <strong>{item.isPerishable ? "FEFO" : "FIFO"}</strong> order.</span>
        </div>
        <div className="text-xs font-mono font-bold text-brand-navy">
          Total Available: {item.pcsOnHand.toLocaleString()} {item.uom}
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {item.lots.map((lot) => (
          <details
            key={lot.lotId}
            className="group rounded-xl border border-slate-200 bg-surface-white p-3 shadow-sm hover:border-brand-navy/40 transition-all"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 outline-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-1.5 min-w-0">
                <ChevronDown size={15} className="text-text-grey transition-transform group-open:rotate-180 shrink-0" />
                <span className="font-mono text-xs font-bold text-slate-900 truncate" title={lot.lotNumber}>
                  {lot.lotNumber}
                </span>
              </div>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-brand-navy">
                {lot.availableQty.toLocaleString()} {item.uom}
              </span>
            </summary>

            <div className="mt-3 border-t border-slate-100 pt-2 space-y-1.5 text-xs">
              <div className="flex justify-between text-text-grey">
                <span>Location:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {lot.locationLabels.join(", ") || "—"}
                </span>
              </div>
              <div className="flex justify-between text-text-grey">
                <span>Expiry:</span>
                <span className="font-mono text-slate-800">{lot.expiryDate || "Not dated"}</span>
              </div>
              <div className="flex justify-between text-text-grey">
                <span>Status:</span>
                <span className="font-semibold text-emerald-700 lowercase">{lot.lotStatus}</span>
              </div>

              <div className="pt-2">
                <LotQrViewer lotId={lot.lotId} lotNumber={lot.lotNumber} itemCode={item.itemCode} compact />
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
