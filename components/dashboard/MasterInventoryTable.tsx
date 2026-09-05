"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Search,
  Package,
  Layers,
  FlaskConical,
  ClipboardList,
  MoreVertical,
  Building2,
  AlertTriangle,
  Lock,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Filter,
} from "lucide-react";
import type { MasterInventoryItem, FlowTypeFilter } from "./types";
import { MASTER_INVENTORY_SEED } from "./data/seedData";

export function MasterInventoryTable() {
  const [data] = useState<MasterInventoryItem[]>(MASTER_INVENTORY_SEED);
  const [globalFilter, setGlobalFilter] = useState("");
  const [flowFilter, setFlowFilter] = useState<FlowTypeFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  // Filtered dataset
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesFlow = flowFilter === "all" || item.flowType === flowFilter;
      const matchesSearch =
        globalFilter === "" ||
        item.itemCode.toLowerCase().includes(globalFilter.toLowerCase()) ||
        item.description.toLowerCase().includes(globalFilter.toLowerCase()) ||
        item.partyName.toLowerCase().includes(globalFilter.toLowerCase());

      return matchesFlow && matchesSearch;
    });
  }, [data, flowFilter, globalFilter]);

  const columns = useMemo<ColumnDef<MasterInventoryItem>[]>(
    () => [
      // 1. Item Code
      {
        accessorKey: "itemCode",
        header: "Item Code",
        cell: (info) => (
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-xs text-brand-navy">
              {String(info.getValue())}
            </span>
          </div>
        ),
      },

      // 2. Description
      {
        accessorKey: "description",
        header: "Description",
        cell: (info) => (
          <div className="max-w-[260px] truncate font-medium text-xs text-slate-800" title={String(info.getValue())}>
            {String(info.getValue())}
          </div>
        ),
      },

      // 3. Flow Type
      {
        accessorKey: "flowType",
        header: "Flow Type",
        cell: (info) => {
          const val = String(info.getValue());
          return (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                val === "vmi"
                  ? "bg-blue-50 text-blue-800 border border-blue-200"
                  : val === "trading"
                  ? "bg-indigo-50 text-indigo-800 border border-indigo-200"
                  : "bg-slate-100 text-slate-800 border border-slate-200"
              }`}
            >
              {val.toUpperCase()}
            </span>
          );
        },
      },

      // 4. Party / Vendor
      {
        accessorKey: "partyName",
        header: "Party / Vendor",
        cell: (info) => (
          <div className="flex items-center gap-1.5 text-xs text-slate-700">
            <Building2 size={13} className="text-slate-400 shrink-0" />
            <span className="truncate max-w-[140px] font-medium">{String(info.getValue())}</span>
          </div>
        ),
      },

      // 5. Available Qty
      {
        accessorKey: "availableQty",
        header: () => <div className="text-right">Available Qty</div>,
        cell: (info) => {
          const row = info.row.original;
          const qty = Number(info.getValue());
          return (
            <div className="text-right">
              <span className={`font-mono font-bold text-xs ${qty === 0 ? "text-rose-700" : "text-slate-900"}`}>
                {qty.toLocaleString()} {row.uom}
              </span>
            </div>
          );
        },
      },

      // 6. Reorder Level
      {
        accessorKey: "reorderLevel",
        header: () => <div className="text-right">Reorder Level</div>,
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="text-right">
              <span className="font-mono text-xs font-semibold text-text-grey">
                {Number(info.getValue()).toLocaleString()} {row.uom}
              </span>
            </div>
          );
        },
      },

      // 7. Status Badges
      {
        accessorKey: "status",
        header: "Status",
        cell: (info) => {
          const status = String(info.getValue());
          if (status === "available") {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 size={11} />
                Available
              </span>
            );
          }
          if (status === "low_stock") {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                <AlertTriangle size={11} />
                Low Stock
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
              <Lock size={11} />
              Held / Quarantine
            </span>
          );
        },
      },

      // 8. Actions
      {
        id: "actions",
        header: () => <div className="text-center">Actions</div>,
        cell: (info) => {
          const row = info.row.original;
          const isMenuOpen = activeActionMenuId === row.id;

          return (
            <div className="relative flex items-center justify-center">
              <div className="flex items-center gap-1">
                {/* Direct Lot Balances Link */}
                <Link
                  href="/inventory"
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 font-label text-[11px] font-bold text-brand-navy hover:bg-slate-50 transition-colors shadow-2xs"
                  title="View item lot balances in Master Inventory"
                >
                  <Layers size={11} />
                  <span>Lots</span>
                </Link>

                {/* More Action Dropdown */}
                <button
                  type="button"
                  onClick={() => setActiveActionMenuId(isMenuOpen ? null : row.id)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none"
                  aria-label="More actions for item"
                >
                  <MoreVertical size={13} />
                </button>
              </div>

              {/* Action Dropdown Menu */}
              {isMenuOpen && (
                <div className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-elevation-3 animate-in fade-in">
                  <Link
                    href="/inventory"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-label text-xs font-medium text-slate-700 hover:bg-slate-100"
                    onClick={() => setActiveActionMenuId(null)}
                  >
                    <Layers size={13} className="text-slate-400" />
                    <span>View Lot Balances</span>
                  </Link>

                  <Link
                    href="/inspection"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-label text-xs font-medium text-slate-700 hover:bg-slate-100"
                    onClick={() => setActiveActionMenuId(null)}
                  >
                    <FlaskConical size={13} className="text-slate-400" />
                    <span>Create Inspection Case</span>
                  </Link>

                  <Link
                    href="/inventory?tab=pick-lists"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-label text-xs font-medium text-slate-700 hover:bg-slate-100"
                    onClick={() => setActiveActionMenuId(null)}
                  >
                    <ClipboardList size={13} className="text-slate-400" />
                    <span>Allocate to Pick List</span>
                  </Link>
                </div>
              )}
            </div>
          );
        },
      },
    ],
    [activeActionMenuId]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const flowPills: Array<{ key: FlowTypeFilter; label: string }> = [
    { key: "all", label: "All Items" },
    { key: "vmi", label: "VMI" },
    { key: "trading", label: "Trading" },
    { key: "supplies", label: "Supplies" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm">
      {/* Table Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-title-md font-bold text-brand-navy">
              Master Inventory Live Positions
            </h2>
            <span className="rounded-md bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] font-bold text-slate-700">
              Showing {filteredData.length} of 1,248 items
            </span>
          </div>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            Authoritative SKU stock levels, reorder thresholds, and active warehouse allocations
          </p>
        </div>

        {/* Filter Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Flow Type Filter Pills */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-semibold">
            {flowPills.map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => setFlowFilter(pill.key)}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  flowFilter === pill.key
                    ? "bg-white text-brand-navy font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search SKU, Description, Party..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 font-body text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy shadow-2xs"
            />
          </div>

          {/* View All Master Inventory CTA */}
          <Link
            href="/inventory"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 font-label text-xs font-bold text-brand-navy hover:bg-slate-100 transition-colors shadow-2xs"
          >
            <span>Stock View</span>
            <ExternalLink size={12} />
          </Link>
        </div>
      </div>

      {/* TanStack Table Grid */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-slate-200/80 bg-slate-50/70">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3.5 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-text-grey"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100 font-body text-xs">
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3.5 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-xs text-text-grey">
                  No inventory items match your filter criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-text-grey">
        <span className="font-mono text-[11px]">
          Showing {filteredData.length} records in active buffer
        </span>
        <Link
          href="/inventory"
          className="font-label font-bold text-brand-navy hover:underline flex items-center gap-1"
        >
          <span>Open Full Master Inventory (1,248 items)</span>
          <ChevronRight size={13} />
        </Link>
      </div>
    </div>
  );
}
