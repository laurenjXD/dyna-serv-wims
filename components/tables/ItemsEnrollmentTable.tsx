"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Package, Plus, Barcode } from "lucide-react";
import { DataTable } from "./DataTable";
import type { ItemListRow } from "@/lib/db/queries/items";

export function ItemsEnrollmentTable({
  data,
  canManage = false,
}: {
  data: ItemListRow[];
  canManage?: boolean;
}) {
  const columns = useMemo<ColumnDef<ItemListRow, unknown>[]>(() => [
    // 1. Item Code
    {
      accessorKey: "code",
      header: "Item Code",
      meta: {
        filterVariant: "text",
        filterLabel: "Item Code",
      },
      cell: (info) => (
        <span className="font-mono font-bold text-brand-navy">{String(info.getValue())}</span>
      ),
    },

    // 2. Item Name / Description
    {
      accessorKey: "name",
      header: "Item Name",
      meta: {
        filterVariant: "text",
        filterLabel: "Item Name",
      },
      cell: (info) => (
        <span className="font-medium text-slate-800">{String(info.getValue())}</span>
      ),
    },

    // 3. Barcode
    {
      accessorKey: "barcode",
      header: "Barcode",
      meta: {
        filterVariant: "text",
        filterLabel: "Barcode",
      },
      cell: (info) => (
        <span className="font-mono text-xs text-text-grey flex items-center gap-1">
          <Barcode size={13} className="text-slate-400" />
          {String(info.getValue())}
        </span>
      ),
    },

    // 4. UOM
    {
      accessorKey: "uom",
      header: "UOM",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "UOM",
        filterOptions: [
          { label: "Piece", value: "piece" },
          { label: "Box", value: "box" },
          { label: "Pallet", value: "pallet" },
          { label: "Meter", value: "meter" },
          { label: "Roll", value: "roll" },
        ],
      },
      cell: (info) => (
        <span className="font-mono text-xs uppercase text-text-grey font-semibold">{String(info.getValue())}</span>
      ),
    },

    // 5. Active Status
    {
      accessorKey: "isActive",
      header: "Status",
      meta: {
        filterVariant: "boolean",
        filterLabel: "Active Status",
      },
      cell: (info) => {
        const active = Boolean(info.getValue());
        return (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
              active
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
            {active ? "Active" : "Inactive"}
          </span>
        );
      },
    },

    // 6. Created Date
    {
      accessorKey: "createdAt",
      header: "Created Date",
      meta: {
        filterVariant: "date-range",
        filterLabel: "Created Date",
      },
      cell: (info) => (
        <span className="font-mono text-sm text-text-grey font-medium">
          {new Date(info.getValue() as string | Date).toLocaleDateString()}
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
        const item = info.row.original;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href={`/master-data/items/${item.id}`}
              className="rounded bg-slate-100 hover:bg-brand-navy hover:text-white px-2.5 py-1 text-xs font-bold text-slate-800 transition-colors shadow-sm"
            >
              View
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
      title="Master Item Catalog"
      subtitle="Catalog of all active inventory items, barcodes, and measurement specifications"
      icon={<Package size={18} />}
      actions={
        canManage ? (
          <Link
            href="/master-data/items/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-surface-white hover:bg-primary/90 transition-all shadow-sm"
          >
            <Plus size={14} /> New Item
          </Link>
        ) : null
      }
      emptyMessage="No items found matching the specified filters."
    />
  );
}
