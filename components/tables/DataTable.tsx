"use client";

import React, { useState, useMemo, type ReactNode } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type GroupingState,
  type ExpandedState,
  type Row,
  type FilterFn,
} from "@tanstack/react-table";
import {
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  RotateCcw,
  Search,
  X,
  Database,
} from "lucide-react";
import { ColumnFilter } from "./ColumnFilter";

// ── Built-in Standard TanStack Filter Functions ───────────────────────────────
export const customFilterFns: Record<string, FilterFn<any>> = {
  // Text search
  textSearch: (row, columnId, filterValue: string) => {
    if (!filterValue) return true;
    const cellValue = String(row.getValue(columnId) || "").toLowerCase();
    const query = String(filterValue).toLowerCase();
    const mode = row._valuesCache?.[`${columnId}_mode`] || "contains";
    if (mode === "startsWith") return cellValue.startsWith(query);
    if (mode === "equals") return cellValue === query;
    return cellValue.includes(query);
  },

  // Numeric Range [min, max]
  numericRange: (row, columnId, filterValue: [number | "", number | ""]) => {
    if (!filterValue) return true;
    const [min, max] = filterValue;
    const cellValue = Number(row.getValue(columnId) || 0);
    if (min !== "" && cellValue < Number(min)) return false;
    if (max !== "" && cellValue > Number(max)) return false;
    return true;
  },

  // Date Range [startDate, endDate]
  dateRange: (row, columnId, filterValue: [string, string]) => {
    if (!filterValue) return true;
    const [start, end] = filterValue;
    const cellValue = row.getValue(columnId);
    if (!cellValue) return false;
    const rowDate = new Date(cellValue as string | Date).toISOString().split("T")[0];
    if (start && rowDate < start) return false;
    if (end && rowDate > end) return false;
    return true;
  },

  // Multi-Select / Dependent Multi-Select
  multiSelect: (row, columnId, filterValues: string[]) => {
    if (!filterValues || filterValues.length === 0) return true;
    const cellValue = String(row.getValue(columnId) || "");
    return filterValues.includes(cellValue);
  },

  // Status Pill
  statusPill: (row, columnId, statusVal: string) => {
    if (!statusVal || statusVal === "all") return true;
    const cell = String(row.getValue(columnId) || "").toLowerCase().replace(/[^a-z0-9]/g, "_");
    const query = statusVal.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return cell.includes(query);
  },

  // Boolean Toggle
  booleanToggle: (row, columnId, filterValue: boolean) => {
    if (filterValue === undefined) return true;
    const cell = row.getValue(columnId);
    return Boolean(cell) === filterValue;
  },
};

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  enableGrouping?: boolean;
  initialGrouping?: GroupingState;
  initialSorting?: SortingState;
  enableGlobalSearch?: boolean;
  renderRowSubComponent?: (props: { row: Row<TData> }) => ReactNode;
  actions?: ReactNode;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  title,
  subtitle,
  icon,
  enableGrouping = false,
  initialGrouping = [],
  initialSorting = [],
  enableGlobalSearch = true,
  renderRowSubComponent,
  actions,
  emptyMessage = "No records found matching current criteria.",
  className = "",
}: DataTableProps<TData>) {
  // Table State
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [grouping, setGrouping] = useState<GroupingState>(initialGrouping);
  const [expanded, setExpanded] = useState<ExpandedState>(true);

  // Auto-attach appropriate filterFn based on meta.filterVariant if not explicitly defined
  const enrichedColumns = useMemo(() => {
    return columns.map((col) => {
      const meta = col.meta;
      if (!col.filterFn && meta?.filterVariant) {
        if (meta.filterVariant === "text") {
          return { ...col, filterFn: customFilterFns.textSearch };
        }
        if (meta.filterVariant === "numeric-range") {
          return { ...col, filterFn: customFilterFns.numericRange };
        }
        if (meta.filterVariant === "date-range") {
          return { ...col, filterFn: customFilterFns.dateRange };
        }
        if (meta.filterVariant === "multi-select" || meta.filterVariant === "dependent-multi-select") {
          return { ...col, filterFn: customFilterFns.multiSelect };
        }
        if (meta.filterVariant === "status-pill") {
          return { ...col, filterFn: customFilterFns.statusPill };
        }
        if (meta.filterVariant === "boolean") {
          return { ...col, filterFn: customFilterFns.booleanToggle };
        }
      }
      return col;
    });
  }, [columns]);

  const table = useReactTable({
    data,
    columns: enrichedColumns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      grouping,
      expanded,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: enableGrouping ? getGroupedRowModel() : undefined,
    getExpandedRowModel: getExpandedRowModel(),
    filterFns: customFilterFns,
  });

  const isGrouped = grouping.length > 0;
  const toggleGrouping = () => {
    if (isGrouped) {
      setGrouping([]);
    } else if (initialGrouping.length > 0) {
      setGrouping(initialGrouping);
    } else {
      // Default to grouping first two grouping-eligible columns
      const groupableCols = columns
        .filter((c) => c.enableGrouping !== false && "accessorKey" in c)
        .map((c) => (c as any).accessorKey as string);
      setGrouping(groupableCols.slice(0, 2));
    }
  };

  const hasActiveFilters = columnFilters.length > 0 || Boolean(globalFilter);

  const clearAllFilters = () => {
    setColumnFilters([]);
    setGlobalFilter("");
  };

  return (
    <div className={`space-y-3.5 ${className}`}>
      {/* ── Bento-Box Header Toolbar (Soft Cream Theme + Glassmorphism) ── */}
      <div className="rounded-2xl border border-white/60 bg-[#F9F9F6]/90 p-4 shadow-elevation-1 backdrop-blur-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Title & Metadata */}
          <div className="flex items-center gap-3">
            {icon ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-surface-white shadow-sm">
                {icon}
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-surface-white shadow-sm">
                <Database size={18} />
              </div>
            )}
            <div>
              {title && <h2 className="font-heading text-base font-bold text-brand-navy">{title}</h2>}
              {subtitle && <p className="font-body text-xs text-text-grey">{subtitle}</p>}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Global Omni-Search */}
            {enableGlobalSearch && (
              <div className="relative min-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-grey" />
                <input
                  type="text"
                  value={globalFilter ?? ""}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  placeholder="Quick search all fields…"
                  className="h-9 w-full rounded-xl border border-slate-200 bg-surface-white pl-8 pr-8 text-xs text-on-surface placeholder:text-text-grey shadow-sm focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                />
                {globalFilter && (
                  <button
                    type="button"
                    onClick={() => setGlobalFilter("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-grey hover:text-on-surface"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            {/* Grouping Toggle */}
            {enableGrouping && (
              <button
                type="button"
                onClick={toggleGrouping}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-all shadow-sm ${
                  isGrouped
                    ? "bg-brand-navy border-brand-navy text-surface-white"
                    : "bg-surface-white border-slate-200 text-slate-800 hover:bg-slate-50"
                }`}
              >
                <Layers size={14} />
                {isGrouped ? "Ungroup" : "Group Columns"}
              </button>
            )}

            {/* Custom Header Actions */}
            {actions}

            {/* Clear All Filters */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex h-9 items-center gap-1 rounded-xl bg-rose-50 border border-rose-200 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors shadow-sm"
              >
                <RotateCcw size={12} /> Reset ({columnFilters.length + (globalFilter ? 1 : 0)})
              </button>
            )}
          </div>
        </div>

        {/* Row count & Active status summary */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2.5 text-xs text-text-grey">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-on-surface">{table.getRowModel().rows.length}</strong> of{" "}
              <strong className="text-on-surface">{data.length}</strong> records
            </span>
            {hasActiveFilters && (
              <span className="rounded-full bg-blue-100/70 px-2 py-0.5 text-[10px] font-bold text-brand-navy">
                Filtered
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Bento-Box Table Container (Horizontally Scrollable) ──── */}
      <div className="overflow-hidden rounded-2xl border border-white/80 bg-surface-white/95 shadow-elevation-1 backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            {/* Header with Sorting & Google Sheets-Style Filter Popovers */}
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-slate-200 bg-[#F2F5FB] select-none">
                  {headerGroup.headers.map((header) => {
                    const isSorted = header.column.getIsSorted();
                    const align = header.column.columnDef.meta?.align || "left";
                    const canFilter = header.column.getCanFilter();

                    return (
                      <th
                        key={header.id}
                        className={`px-3.5 py-3 font-heading text-xs font-bold text-slate-700 whitespace-nowrap ${
                          align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
                        }`}
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={`flex items-center gap-1 ${
                              align === "right"
                                ? "justify-end"
                                : align === "center"
                                ? "justify-center"
                                : "justify-between"
                            }`}
                          >
                            {/* Sortable Header Label */}
                            <div
                              onClick={header.column.getToggleSortingHandler()}
                              className="flex items-center gap-1 cursor-pointer hover:text-brand-navy transition-colors"
                            >
                              <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                              {isSorted === "asc" ? (
                                <ArrowUp size={13} className="text-brand-navy font-bold" />
                              ) : isSorted === "desc" ? (
                                <ArrowDown size={13} className="text-brand-navy font-bold" />
                              ) : header.column.getCanSort() ? (
                                <ArrowUpDown size={12} className="opacity-30" />
                              ) : null}
                            </div>

                            {/* Google Sheets-Style Filter Icon & Popover */}
                            {canFilter && (
                              <ColumnFilter column={header.column} table={table} />
                            )}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 font-body">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-12 text-center text-xs text-text-grey italic"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  if (row.getIsGrouped()) {
                    // Grouped Header Row with Aggregated Sum
                    return (
                      <tr
                        key={row.id}
                        onClick={row.getToggleExpandedHandler()}
                        className="bg-[#EBF2FE]/80 hover:bg-[#E2ECFD] cursor-pointer transition-colors border-y border-blue-200 font-semibold"
                      >
                        <td colSpan={columns.length} className="px-4 py-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {row.getIsExpanded() ? (
                                <ChevronDown size={17} className="text-brand-navy" />
                              ) : (
                                <ChevronRight size={17} className="text-brand-navy" />
                              )}
                              <span className="font-heading text-xs font-bold text-brand-navy">
                                {row.groupingColumnId}: {row.groupingColumnId ? String(row.getValue(row.groupingColumnId)) : ""}
                              </span>
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-brand-navy">
                                {row.subRows.length} item{row.subRows.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <React.Fragment key={row.id}>
                      <tr className="hover:bg-slate-50/80 transition-colors group">
                        {row.getVisibleCells().map((cell) => {
                          const align = cell.column.columnDef.meta?.align || "left";
                          return (
                            <td
                              key={cell.id}
                              className={`px-3.5 py-2.5 whitespace-nowrap ${
                                align === "right"
                                  ? "text-right"
                                  : align === "center"
                                  ? "text-center"
                                  : "text-left"
                              }`}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                      {/* Optional Expandable Sub-component / Details */}
                      {row.getIsExpanded() && renderRowSubComponent && (
                        <tr>
                          <td colSpan={row.getVisibleCells().length} className="p-0">
                            {renderRowSubComponent({ row })}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
