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
  type PaginationState,
} from "@tanstack/react-table";
import {
  Search,
  Layers,
  FlaskConical,
  ClipboardList,
  MoreVertical,
  Building2,
  AlertTriangle,
  Lock,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import type { MasterInventoryItem, FlowTypeFilter } from "./types";
import { TablePagination } from "@/components/ui/TablePagination";

interface MasterInventoryTableProps {
  initialData?: MasterInventoryItem[];
}

export function MasterInventoryTable({ initialData }: MasterInventoryTableProps) {
  const [data] = useState<MasterInventoryItem[]>(initialData || []);
  const [globalFilter, setGlobalFilter] = useState("");
  const [flowFilter, setFlowFilter] = useState<FlowTypeFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 5,
  });
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
            <span className="font-mono font-bold text-xs text-brand-navy dark:text-blue-400">
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
          <div className="max-w-[260px] truncate font-medium text-xs text-slate-800 dark:text-zinc-200" title={String(info.getValue())}>
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
                  ? "bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                  : val === "trading"
                  ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
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
          <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-zinc-300">
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
              <span className={`font-mono font-bold text-xs ${qty === 0 ? "text-rose-700 dark:text-rose-400" : "text-slate-900 dark:text-zinc-100"}`}>
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
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 size={11} />
                Available
              </span>
            );
          }
          if (status === "low_stock") {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                <AlertTriangle size={11} />
                Low Stock
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-400">
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
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 font-label text-[11px] font-bold text-brand-navy dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs"
                  title="View item lot balances in Master Inventory"
                >
                  <Layers size={11} />
                  <span>Lots</span>
                </Link>

                {/* More Action Dropdown */}
                <button
                  type="button"
                  onClick={() => setActiveActionMenuId(isMenuOpen ? null : row.id)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 focus:outline-none"
                  aria-label="More actions for item"
                >
                  <MoreVertical size={13} />
                </button>
              </div>

              {/* Action Dropdown Menu */}
              {isMenuOpen && (
                <div className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1.5 shadow-elevation-3 animate-in fade-in">
                  <Link
                    href="/inventory"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-label text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-700"
                    onClick={() => setActiveActionMenuId(null)}
                  >
                    <Layers size={13} className="text-slate-400" />
                    <span>View Lot Balances</span>
                  </Link>

                  <Link
                    href="/inspection"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-label text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-700"
                    onClick={() => setActiveActionMenuId(null)}
                  >
                    <FlaskConical size={13} className="text-slate-400" />
                    <span>Create Inspection Case</span>
                  </Link>

                  <Link
                    href="/inventory?tab=pick-lists"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-label text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-700"
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
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const totalPages = Math.ceil(filteredData.length / pagination.pageSize);
  const pagedMobileData = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize;
    return filteredData.slice(start, start + pagination.pageSize);
  }, [filteredData, pagination.pageIndex, pagination.pageSize]);

  const flowPills: Array<{ key: FlowTypeFilter; label: string }> = [
    { key: "all", label: "All Items" },
    { key: "vmi", label: "VMI" },
    { key: "trading", label: "Trading" },
    { key: "supplies", label: "Supplies" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-surface-white dark:bg-zinc-900/80 p-5 shadow-sm">
      {/* Table Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-title-md font-bold text-brand-navy dark:text-zinc-100">
              Master Inventory Live Positions
            </h2>
            <span className="rounded-md bg-slate-100 dark:bg-zinc-800 px-2.5 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:text-zinc-300">
              {filteredData.length} SKUs Listed
            </span>
          </div>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            Authoritative SKU stock levels, reorder thresholds, and active warehouse allocations
          </p>
        </div>

        {/* Filter Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Flow Type Filter Pills */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-zinc-800 p-1 font-label text-xs font-semibold">
            {flowPills.map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => {
                  setFlowFilter(pill.key);
                  setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  flowFilter === pill.key
                    ? "bg-white dark:bg-zinc-700 text-brand-navy dark:text-white font-bold shadow-2xs"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900"
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
              onChange={(e) => {
                setGlobalFilter(e.target.value);
                setPagination((prev) => ({ ...prev, pageIndex: 0 }));
              }}
              className="h-9 w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-9 pr-3 font-body text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy shadow-2xs"
            />
          </div>

          {/* View All Master Inventory CTA */}
          <Link
            href="/inventory"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 font-label text-xs font-bold text-brand-navy dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors shadow-2xs"
          >
            <span>Stock View</span>
            <ExternalLink size={12} />
          </Link>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 📱 MOBILE CARD FEED (< 1024px)                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="mt-4 block lg:hidden space-y-3">
        {pagedMobileData.length > 0 ? (
          pagedMobileData.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-3"
            >
              {/* Line 1: Bold Monospace SKU + Status Badge */}
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-black text-brand-navy dark:text-blue-400">
                  {item.itemCode}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                    item.status === "available"
                      ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                      : item.status === "low_stock"
                      ? "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                      : "bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                  }`}
                >
                  {item.status === "available" && <CheckCircle2 size={11} />}
                  {item.status === "low_stock" && <AlertTriangle size={11} />}
                  {item.status === "held" && <Lock size={11} />}
                  {item.status === "available"
                    ? "Available"
                    : item.status === "low_stock"
                    ? "Low Stock"
                    : "Held / Quarantine"}
                </span>
              </div>

              {/* Line 2: Description & Vendor */}
              <div>
                <p className="font-body text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  {item.description}
                </p>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-text-grey">
                  <Building2 size={12} className="text-slate-400" />
                  <span>{item.partyName}</span>
                  <span>·</span>
                  <span className="uppercase font-mono font-bold text-slate-700 dark:text-zinc-300">{item.flowType}</span>
                </div>
              </div>

              {/* Line 3: Stock: 1,450 Units Available (Reorder: 200) */}
              <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-zinc-800/60 p-2.5">
                <div>
                  <p className="font-label text-[10px] uppercase font-bold text-text-grey">
                    Available Stock
                  </p>
                  <p className="font-mono text-sm font-black text-slate-900 dark:text-zinc-100">
                    {item.availableQty.toLocaleString()} {item.uom}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-label text-[10px] uppercase font-bold text-text-grey">
                    Reorder Threshold
                  </p>
                  <p className="font-mono text-xs font-semibold text-amber-800 dark:text-amber-400">
                    {item.reorderLevel.toLocaleString()} {item.uom}
                  </p>
                </div>
              </div>

              {/* Actions: Two 44px+ touch buttons per card */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link
                  href="/inventory"
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-label text-xs font-bold text-slate-700 dark:text-zinc-200 shadow-2xs active:bg-slate-100"
                >
                  <Layers size={14} className="text-slate-500" />
                  <span>View Lots</span>
                </Link>
                <Link
                  href="/outgoing"
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-brand-navy dark:bg-blue-600 font-label text-xs font-bold text-white shadow-2xs active:bg-brand-navy/90"
                >
                  <ClipboardList size={14} />
                  <span>Allocate Pick</span>
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center text-xs text-text-grey">
            No inventory items match your filter criteria.
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 🖥️ DESKTOP TANSTACK TABLE (>= 1024px)                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="mt-4 hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/50">
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
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 font-body text-xs">
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/50 transition-colors">
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

      {/* ── Standard Pagination Toolbar (Desktop & Mobile) ───────────────── */}
      <TablePagination
        currentPage={pagination.pageIndex + 1}
        totalPages={totalPages}
        pageSize={pagination.pageSize}
        totalItems={filteredData.length}
        onPageChange={(page) => setPagination((prev) => ({ ...prev, pageIndex: page - 1 }))}
        onPageSizeChange={(newSize) => setPagination({ pageIndex: 0, pageSize: newSize })}
        pageSizeOptions={[5, 10, 20, 50]}
        className="border-t border-slate-100 dark:border-zinc-800 mt-4"
      />
    </div>
  );
}
