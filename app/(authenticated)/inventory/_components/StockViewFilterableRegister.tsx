"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { ChevronDown, Package, Layers, ArrowRight, PackagePlus, Building2, Eye } from "lucide-react";
import { DataTable } from "@/components/tables/DataTable";
import { LotQrViewer } from "./LotQrViewer";
import { OpeningStockImportModal } from "./OpeningStockImportModal";
import { ItemDetailModal } from "./ItemDetailModal";

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
  organizationName?: string | null;
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
  spq: number;
  boxesOnHand: number;
  totalQty: number;
  pcsOnHand?: number;
  cbmOccupied: number;
  lots: AggregatedLot[];
};

export function StockViewFilterableRegister({ items }: { items: GroupedItem[] }) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [selectedItemForView, setSelectedItemForView] = useState<GroupedItem | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const columns = useMemo<ColumnDef<GroupedItem, unknown>[]>(() => [
    // 1. Item Code (Priority Identifier)
    {
      accessorKey: "itemCode",
      header: "Item Code",
      meta: {
        filterVariant: "text",
        filterLabel: "Item Code",
      },
      cell: (info) => {
        const item = info.row.original;
        return (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setExpandedItemId(expandedItemId === item.itemId ? null : item.itemId)}
              className="inline-flex min-w-0 items-center gap-1 text-left font-mono font-bold text-brand-navy hover:underline"
              title="Show lot details"
            >
              {expandedItemId === item.itemId ? <ChevronDown size={14} className="shrink-0" /> : <ChevronDown size={14} className="-rotate-90 shrink-0" />}
              <span className="truncate">{String(info.getValue())}</span>
            </button>
            {item.isPerishable && (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200 uppercase tracking-wider">
                FEFO
              </span>
            )}
          </div>
        );
      },
    },

    // 2. Description / Item Name
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
            <p className="font-semibold text-slate-800 truncate" title={item.itemName}>
              {item.itemName}
            </p>
          </div>
        );
      },
    },

    // 3. Organization (Search / Filter)
    {
      accessorKey: "organizationName",
      header: "Organization",
      meta: {
        filterVariant: "text",
        filterLabel: "Organization",
      },
      cell: (info) => {
        const val = String(info.getValue() || "—");
        return (
          <div className="flex items-center gap-1.5 max-w-[170px]">
            <Building2 size={13} className="text-slate-400 shrink-0" />
            <span className="font-medium text-sm text-slate-800 truncate" title={val}>
              {val}
            </span>
          </div>
        );
      },
    },

    // 4. Lots & Locations (Consolidated Interactive Pill)
    {
      id: "lotsAndLocations",
      accessorFn: (row) => `${row.lotNumbers} ${row.locationLabels}`,
      header: "Lots & Locations",
      meta: {
        filterVariant: "text",
        filterLabel: "Lot or Location",
      },
      cell: (info) => {
        const item = info.row.original;
        const isExpanded = expandedItemId === item.itemId;
        const lotCount = item.lots.length;
        const locationCount = new Set(item.lots.flatMap((l) => l.locationLabels).filter(Boolean)).size;

        return (
          <button
            type="button"
            onClick={() => setExpandedItemId(isExpanded ? null : item.itemId)}
            className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition-all shadow-sm ${
              isExpanded
                ? "border-brand-navy bg-brand-navy text-surface-white"
                : "border-slate-200 bg-surface-white text-brand-navy hover:bg-slate-50 hover:border-brand-navy/40"
            }`}
            title={`View ${lotCount} lot(s) across ${locationCount} location(s)`}
          >
            <Layers size={13} className={isExpanded ? "text-surface-white" : "text-brand-navy/70"} />
            <span>
              {lotCount} {lotCount === 1 ? "Lot" : "Lots"} · {locationCount} {locationCount === 1 ? "Loc" : "Locs"}
            </span>
            <ChevronDown
              size={13}
              className={`transition-transform duration-200 ${isExpanded ? "rotate-180 text-surface-white" : "text-slate-400 group-hover:text-brand-navy"}`}
            />
          </button>
        );
      },
    },

    // 6. Inventory Model (Trading, VMI, Supplies)
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
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
              val === "VMI"
                ? "bg-blue-50 text-blue-800 border border-blue-200"
                : val === "TRADING"
                ? "bg-slate-100 text-slate-900 border border-slate-300"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}
          >
            {val}
          </span>
        );
      },
    },

    // 6. Category
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

    // 7. Subcategory
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

    // 8. Total In
    {
      accessorKey: "totalIn",
      header: "Total In",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Total In",
        align: "right",
      },
      cell: (info) => (
        <span className="font-mono text-slate-600">
          {Number(info.getValue() || 0).toLocaleString()}
        </span>
      ),
    },

    // 9. Total Out
    {
      accessorKey: "totalOut",
      header: "Total Out",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Total Out",
        align: "right",
      },
      cell: (info) => (
        <span className="font-mono text-slate-600">
          {Number(info.getValue() || 0).toLocaleString()}
        </span>
      ),
    },

    // 10. SPQ (Standard Pack Quantity per Box)
    {
      accessorKey: "spq",
      header: "SPQ",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "SPQ",
        align: "right",
      },
      cell: (info) => {
        const item = info.row.original;
        return (
          <span className="font-mono font-medium text-slate-700">
            {Number(info.getValue() || item.spq || 1).toLocaleString()}
          </span>
        );
      },
    },

    // 11. Boxes on Hand
    {
      accessorKey: "boxesOnHand",
      header: "Boxes",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Boxes",
        align: "right",
      },
      cell: (info) => (
        <span className="font-mono text-slate-700">
          {Number(info.getValue() || 0).toLocaleString()}
        </span>
      ),
    },

    // 12. Total Qty (SPQ × Boxes)
    {
      accessorKey: "totalQty",
      header: "Total Qty",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Total Quantity (SPQ × Boxes)",
        align: "right",
      },
      cell: (info) => {
        const item = info.row.original;
        const total = Number(info.getValue() || item.totalQty || (item.spq * item.boxesOnHand) || 0);
        return (
          <span className="font-mono font-bold text-brand-navy">
            {total.toLocaleString()}
          </span>
        );
      },
    },

    // 13. UOM (Unit of Measure from Item Enrollment — beside Total Qty)
    {
      accessorKey: "uom",
      header: "UOM",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "UOM",
      },
      cell: (info) => {
        const val = String(info.getValue() || "").toUpperCase();
        return (
          <span className="font-mono text-xs font-semibold text-slate-700 uppercase bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            {val || "—"}
          </span>
        );
      },
    },

    // 14. CBM
    {
      accessorKey: "cbmOccupied",
      header: "CBM",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "CBM",
        align: "right",
      },
      cell: (info) => (
        <span className="font-mono text-slate-600">
          {Number(info.getValue() || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
        </span>
      ),
    },

    // 14. Quick Action (View Item Master Details & Movement Audit)
    {
      id: "actions",
      header: "Action",
      meta: {
        align: "right",
      },
      cell: (info) => {
        const item = info.row.original;
        return (
          <button
            type="button"
            onClick={() => setSelectedItemForView(item)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-surface-white hover:bg-brand-navy/90 transition-all shadow-sm"
          >
            <Eye size={13} /> View
          </button>
        );
      },
    },
  ], [expandedItemId]);

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={items}
        title="Master Inventory Register"
        subtitle="Item catalog with per-field Google Sheets filtering by SKU, category, subcategory, SPQ, boxes, and total quantity"
        icon={<Package size={18} />}
        enableGrouping={false}
        initialSorting={[{ id: "totalQty", desc: true }]}
        emptyMessage="No inventory items match the specified filters."
        actions={
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-brand-navy px-3 text-xs font-bold text-surface-white hover:bg-brand-navy/90 transition-all shadow-sm shrink-0"
          >
            <PackagePlus size={14} /> Import Opening Stock
          </button>
        }
        isRowExpanded={(row) => expandedItemId === row.original.itemId}
        renderRowSubComponent={({ row }) => {
          const item = row.original;
          const total = item.totalQty ?? item.spq * item.boxesOnHand;
          return (
            <div className="border-t border-blue-100 bg-[#F8FAFF] px-4 py-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-slate-700">
                  Lots for <strong className="font-mono text-brand-navy">{item.itemCode}</strong> · {item.isPerishable ? "FEFO" : "FIFO"}
                </span>
                <span className="font-mono text-sm font-bold text-brand-navy">Total Available: {total.toLocaleString()} {item.uom}</span>
              </div>
              <div className="grid justify-start gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {item.lots.map((lot) => (
                  <div key={lot.lotId} className="flex min-w-[200px] flex-col justify-between rounded border border-blue-200 bg-surface-white p-2.5 text-xs shadow-sm">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-bold text-brand-navy">{lot.lotNumber}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            lot.lotStatus === "available"
                              ? "bg-status-available/15 text-status-available"
                              : lot.lotStatus === "hold"
                              ? "bg-status-held/15 text-status-held"
                              : "bg-status-pending/15 text-status-pending"
                          }`}
                        >
                          {lot.lotStatus}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-slate-700">
                        Locations: <strong>{lot.locationLabels.join(", ") || "—"}</strong>
                      </p>
                      {lot.expiryDate && (
                        <p className="font-mono text-[11px] text-text-grey">
                          Exp: {new Date(lot.expiryDate).toLocaleDateString()}
                        </p>
                      )}
                      <p className="font-mono text-sm font-bold text-slate-900 mt-1">
                        {lot.availableQty.toLocaleString()} <span className="text-xs font-normal text-text-grey">pckgs</span>
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-end border-t border-slate-100 pt-2">
                      <LotQrViewer
                        lotId={lot.lotId}
                        lotNumber={lot.lotNumber}
                        itemCode={item.itemCode}
                        compact
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }}
        renderMobileCard={({ row }) => {
          const item = row.original;
          const isLotsExpanded = expandedItemId === item.itemId;
          const totalCalculated = item.totalQty || (item.spq * item.boxesOnHand) || 0;
          const modelVal = String(item.inventoryModel || "TRADING").toUpperCase();

          return (
            <div className="space-y-3">
              {/* Card Header: Item Code, Model Badge & View Action */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-brand-navy">{item.itemCode}</span>
                    {item.isPerishable && (
                      <span className="rounded bg-rose-50 px-1 py-0.2 text-[10px] font-bold text-rose-700 border border-rose-200">
                        FEFO
                      </span>
                    )}
                  </div>
                  <span
                    className={`inline-block rounded-full px-2 py-0.2 text-[10px] font-bold uppercase tracking-wider ${
                      modelVal === "VMI"
                        ? "bg-blue-50 text-blue-800 border border-blue-200"
                        : modelVal === "TRADING"
                        ? "bg-slate-100 text-slate-800 border border-slate-300"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {modelVal}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItemForView(item)}
                  className="inline-flex h-8 items-center gap-1 rounded-xl bg-brand-navy px-3 text-xs font-bold text-surface-white shadow-sm hover:bg-brand-navy/90"
                >
                  <Eye size={12} /> View
                </button>
              </div>

              {/* Description & Category */}
              <div>
                <p className="text-xs font-semibold text-slate-900">{item.itemName}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-grey mt-0.5">
                  <span>{item.categoryName || "Uncategorized"}</span>
                  {item.subcategoryName && (
                    <>
                      <span>·</span>
                      <span>{item.subcategoryName}</span>
                    </>
                  )}
                  {item.customerName && (
                    <>
                      <span>·</span>
                      <span className="font-medium text-slate-700">{item.customerName}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Key Metrics: Current Net Balance (Total Qty) with Boxes & SPQ as subtitle */}
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-brand-navy block">
                    Current Net Balance
                  </span>
                  <p className="font-mono text-base font-bold text-brand-navy mt-0.5">
                    {totalCalculated.toLocaleString()}{" "}
                    <span className="text-xs font-normal text-slate-600">{item.uom || "PCS"}</span>
                  </p>
                  <p className="text-[11px] font-mono text-text-grey mt-0.5">
                    {item.boxesOnHand.toLocaleString()} boxes · SPQ: {item.spq.toLocaleString()} {item.uom || "PCS"}/box
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-brand-navy">
                  <Package size={18} />
                </div>
              </div>

              {/* Lots & Location Drawer Trigger */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-text-grey text-[11px] font-mono">
                  Location: <strong className="text-slate-800">{item.locationLabels || "—"}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setExpandedItemId(isLotsExpanded ? null : item.itemId)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-navy hover:underline"
                >
                  <Layers size={12} /> {item.lots.length} lot(s) {isLotsExpanded ? "▲" : "▼"}
                </button>
              </div>

              {/* Mobile Expanded Lots View */}
              {isLotsExpanded && (
                <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                  {item.lots.map((lot) => (
                    <div key={lot.lotId} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-brand-navy">{lot.lotNumber}</span>
                        <span className="rounded bg-blue-50 px-1.5 py-0.2 text-[10px] font-bold text-brand-navy">
                          {lot.availableQty.toLocaleString()} {item.uom}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-text-grey">
                        <span>Location: {lot.locationLabels.join(", ") || "—"}</span>
                        <span>Exp: {lot.expiryDate || "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }}
      />

      {/* Item Detail & Movement Audit Modal */}
      <ItemDetailModal
        isOpen={Boolean(selectedItemForView)}
        onClose={() => setSelectedItemForView(null)}
        groupedItem={selectedItemForView}
      />

      {/* Opening Stock Import Modal */}
      {isImportModalOpen && (
        <OpeningStockImportModal
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
