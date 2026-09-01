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
  Filter,
  SlidersHorizontal,
} from "lucide-react";
import { ColumnFilter } from "./ColumnFilter";

// ── Built-in Standard TanStack Filter Functions ───────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  isRowExpanded?: (row: Row<TData>) => boolean;
  renderMobileCard?: (props: { row: Row<TData> }) => ReactNode;
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
  isRowExpanded,
  renderMobileCard,
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
  const [mobileFilterDrawerOpen, setMobileFilterDrawerOpen] = useState(false);

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
      const groupableCols = columns
        .filter((c) => c.enableGrouping !== false && "accessorKey" in c)
        .map((c) => String((c as { accessorKey?: string }).accessorKey ?? ""));
      setGrouping(groupableCols.slice(0, 2));
    }
  };

  const hasActiveFilters = columnFilters.length > 0 || Boolean(globalFilter);

  const clearAllFilters = () => {
    setColumnFilters([]);
    setGlobalFilter("");
  };

  const filterableHeaders = table
    .getHeaderGroups()[0]
    ?.headers.filter((header) => header.column.getCanFilter());

  return (
    <div className={`space-y-3 ${className}`}>
      {/* ── Bento-Box Header Toolbar (Soft Cream Theme + Glassmorphism) ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-[#F9F9F6] p-3.5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Title & Metadata */}
          <div className="flex items-center gap-3">
            {icon ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-navy text-surface-white shadow-sm shrink-0">
                {icon}
              </div>
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-navy text-surface-white shadow-sm shrink-0">
                <Database size={16} />
              </div>
            )}
            <div>
              {title && <h2 className="font-heading text-sm font-bold text-brand-navy leading-tight">{title}</h2>}
              {subtitle && <p className="font-body text-[11px] text-text-grey mt-0.5">{subtitle}</p>}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Global Omni-Search */}
            {enableGlobalSearch && (
              <div className="relative min-w-[180px] sm:min-w-[220px] grow sm:grow-0">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-grey" />
                <input
                  type="text"
                  value={globalFilter ?? ""}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  placeholder="Quick search records…"
                  className="h-8 w-full rounded-xl border border-slate-200 bg-surface-white pl-8 pr-7 text-xs text-on-surface placeholder:text-text-grey shadow-sm focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                />
                {globalFilter && (
                  <button
                    type="button"
                    onClick={() => setGlobalFilter("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-grey hover:text-on-surface"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {/* Mobile Filter Sheet Trigger (Visible only on Mobile) */}
            {filterableHeaders && filterableHeaders.length > 0 && (
              <button
                type="button"
                onClick={() => setMobileFilterDrawerOpen(!mobileFilterDrawerOpen)}
                className="md:hidden inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-surface-white px-2.5 text-xs font-bold text-slate-800 shadow-sm"
              >
                <SlidersHorizontal size={13} />
                Filters {columnFilters.length > 0 && `(${columnFilters.length})`}
              </button>
            )}

            {/* Grouping Toggle */}
            {enableGrouping && (
              <button
                type="button"
                onClick={toggleGrouping}
                className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition-all shadow-sm ${
                  isGrouped
                    ? "bg-brand-navy border-brand-navy text-surface-white"
                    : "bg-surface-white border-slate-200 text-slate-800 hover:bg-slate-50"
                }`}
              >
                <Layers size={13} />
                {isGrouped ? "Ungroup" : "Group"}
              </button>
            )}

            {/* Custom Header Actions */}
            {actions}

            {/* Clear All Filters */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex h-8 items-center gap-1 rounded-xl bg-rose-50 border border-rose-200 px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors shadow-sm"
              >
                <RotateCcw size={11} /> Reset ({columnFilters.length + (globalFilter ? 1 : 0)})
              </button>
            )}
          </div>
        </div>

        {/* Mobile Filter Drawer Dropdown (when toggled on mobile screens) */}
        {mobileFilterDrawerOpen && filterableHeaders && (
          <div className="md:hidden rounded-xl border border-slate-200 bg-white p-3 space-y-3 shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-brand-navy flex items-center gap-1.5">
                <Filter size={13} /> Column Filters
              </span>
              <button
                type="button"
                onClick={() => setMobileFilterDrawerOpen(false)}
                className="text-[11px] font-bold text-brand-navy hover:underline"
              >
                Done
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {filterableHeaders.map((header) => {
                const colHeader = header.column.columnDef.header;
                const headerText = typeof colHeader === "string" ? colHeader : header.column.id;
                return (
                  <div key={header.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                    <span className="text-xs font-semibold text-slate-800">{headerText}</span>
                    <ColumnFilter column={header.column} table={table} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Row count & Active status summary */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2 text-[11px] text-text-grey">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-on-surface">{table.getRowModel().rows.length}</strong> of{" "}
              <strong className="text-on-surface">{data.length}</strong> records
            </span>
            {hasActiveFilters && (
              <span className="rounded-full bg-blue-100/70 px-2 py-0.5 text-[9px] font-bold text-brand-navy uppercase tracking-wider">
                Filtered
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop Data-Dense Table (md:block) ────────────────────────── */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200/80 bg-surface-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            {/* Header with Sorting & Google Sheets-Style Filter Popovers */}
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-slate-200 bg-[#F4F6FB] select-none">
                  {headerGroup.headers.map((header) => {
                    const isSorted = header.column.getIsSorted();
                    const align = header.column.columnDef.meta?.align || "left";
                    const canFilter = header.column.getCanFilter();

                    return (
                      <th
                        key={header.id}
                        className={`px-3 py-3 font-heading text-sm font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap ${
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
                                : "justify-start"
                            }`}
                          >
                            {/* Sortable Header Label */}
                            <div
                              onClick={header.column.getToggleSortingHandler()}
                              className="flex items-center gap-1 cursor-pointer hover:text-brand-navy transition-colors"
                            >
                              <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                              {isSorted === "asc" ? (
                                <ArrowUp size={14} className="text-brand-navy font-bold shrink-0" />
                              ) : isSorted === "desc" ? (
                                <ArrowDown size={14} className="text-brand-navy font-bold shrink-0" />
                              ) : header.column.getCanSort() ? (
                                <ArrowUpDown size={13} className="opacity-30 shrink-0" />
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
                            className="px-4 py-12 text-center text-sm text-text-grey italic"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  if (row.getIsGrouped()) {
                    return (
                      <tr
                        key={row.id}
                        onClick={row.getToggleExpandedHandler()}
                        className="bg-[#EBF2FE]/80 hover:bg-[#E2ECFD] cursor-pointer transition-colors border-y border-blue-200 font-semibold"
                      >
                        <td colSpan={columns.length} className="px-3.5 py-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {row.getIsExpanded() ? (
                                <ChevronDown size={15} className="text-brand-navy" />
                              ) : (
                                <ChevronRight size={15} className="text-brand-navy" />
                              )}
                              <span className="font-heading text-sm font-bold text-brand-navy">
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
                              className={`px-3 py-3 whitespace-nowrap text-sm ${
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
                      {(row.getIsExpanded() || isRowExpanded?.(row)) && renderRowSubComponent && (
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

      {/* ── Mobile Floor-First Card List (block md:hidden) ─────────────── */}
      <div className="block md:hidden space-y-2.5">
        {table.getRowModel().rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-8 text-center text-xs text-text-grey italic">
            {emptyMessage}
          </div>
        ) : (
          table.getRowModel().rows.map((row) => {
            if (renderMobileCard) {
              return <React.Fragment key={row.id}>{renderMobileCard({ row })}</React.Fragment>;
            }

            // Default Floor Bento Card for any table
            const cells = row.getVisibleCells();
            const primaryCell = cells[0];
            const actionCell = cells.find((c) => c.column.id === "actions");
            const detailCells = cells.filter(
              (c) => c.column.id !== primaryCell?.column.id && c.column.id !== "actions"
            );

            return (
              <div
                key={row.id}
                className="rounded-2xl border border-slate-200/80 bg-surface-white p-3.5 shadow-sm hover:border-brand-navy/30 transition-all space-y-2.5"
              >
                {/* Mobile Card Header */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-text-grey block">
                      {String(primaryCell?.column.columnDef.header || "Item")}
                    </span>
                    <div className="text-xs font-bold text-brand-navy truncate">
                      {primaryCell && flexRender(primaryCell.column.columnDef.cell, primaryCell.getContext())}
                    </div>
                  </div>
                  {actionCell && (
                    <div className="shrink-0">
                      {flexRender(actionCell.column.columnDef.cell, actionCell.getContext())}
                    </div>
                  )}
                </div>

                {/* Mobile Card Grid Details */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {detailCells.map((cell) => {
                    const colHeader = cell.column.columnDef.header;
                    const label = typeof colHeader === "string" ? colHeader : cell.column.id;
                    return (
                      <div key={cell.id} className="min-w-0">
                        <span className="text-[10px] text-text-grey font-medium block truncate">
                          {label}
                        </span>
                        <div className="font-medium text-slate-800 truncate">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Optional Expandable Details */}
                {row.getIsExpanded() && renderRowSubComponent && (
                  <div className="pt-2 border-t border-slate-100">
                    {renderRowSubComponent({ row })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
