"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import type { Column, Table, RowData } from "@tanstack/react-table";
import {
  Filter,
  X,
  Check,
  Search,
  Calendar,
  AlertCircle,
} from "lucide-react";

// Extend TanStack Table types with Dyna-Serv filterVariant metadata
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    filterVariant?:
      | "text"
      | "numeric-range"
      | "date-range"
      | "multi-select"
      | "dependent-multi-select"
      | "status-pill"
      | "boolean";
    filterOptions?: Array<{ label: string; value: string | number | boolean; count?: number }>;
    parentColumnId?: string;
    filterLabel?: string;
    textMode?: "contains" | "startsWith" | "equals";
    align?: "left" | "center" | "right";
  }
}

// ── Google Sheets-Style Glassmorphic Filter Popover Shell ─────────────────────
export function ColumnFilter<TData extends RowData>({
  column,
  table,
}: {
  column: Column<TData, unknown>;
  table: Table<TData>;
}) {
  const meta = column.columnDef.meta;
  const filterVariant = meta?.filterVariant || "text";
  const columnHeader = typeof column.columnDef.header === "string" ? column.columnDef.header : column.id;
  const filterLabel = meta?.filterLabel || columnHeader;

  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Determine if column currently has an active filter
  const filterValue = column.getFilterValue();
  const isActive = useMemo(() => {
    if (filterValue === undefined || filterValue === null || filterValue === "") return false;
    if (Array.isArray(filterValue)) {
      if (filterValue.length === 0) return false;
      if (filterValue.length === 2 && filterValue[0] === "" && filterValue[1] === "") return false;
      return true;
    }
    if (typeof filterValue === "boolean") return filterValue === true;
    return true;
  }, [filterValue]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleClear = () => {
    column.setFilterValue(undefined);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-flex items-center ml-1.5" ref={popoverRef}>
      {/* Funnel Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        aria-label={`Filter by ${filterLabel}`}
        title={`Filter by ${filterLabel}`}
        className={`flex h-6 w-6 items-center justify-center rounded-md transition-all ${
          isActive
            ? "bg-brand-navy text-surface-white shadow-sm ring-1 ring-brand-navy/30"
            : "text-text-grey hover:bg-slate-200/80 hover:text-on-surface"
        }`}
      >
        <Filter size={11} className={isActive ? "fill-current stroke-current" : ""} />
      </button>

      {/* Glassmorphic Popover Menu */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-2 z-50 min-w-[240px] max-w-[320px] rounded-2xl border border-white/80 bg-surface-white/95 p-4 shadow-elevation-2 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          style={{
            boxShadow:
              "0 20px 25px -5px rgba(0, 32, 96, 0.08), 0 8px 10px -6px rgba(0, 32, 96, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.9)",
          }}
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
            <span className="font-heading text-xs font-bold text-brand-navy flex items-center gap-1.5">
              <Filter size={12} className="text-brand-navy" />
              {filterLabel}
            </span>
            {isActive && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-0.5"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>

          {/* Context-Specific Filter Controls based on meta.filterVariant */}
          {filterVariant === "text" && (
            <TextFilterContent column={column} filterLabel={filterLabel} />
          )}

          {filterVariant === "numeric-range" && (
            <NumericRangeFilterContent column={column} />
          )}

          {filterVariant === "date-range" && (
            <DateRangeFilterContent column={column} />
          )}

          {filterVariant === "multi-select" && (
            <MultiSelectFilterContent column={column} table={table} />
          )}

          {filterVariant === "dependent-multi-select" && (
            <DependentMultiSelectFilterContent column={column} table={table} />
          )}

          {filterVariant === "status-pill" && (
            <StatusPillFilterContent column={column} />
          )}

          {filterVariant === "boolean" && (
            <BooleanFilterContent column={column} filterLabel={filterLabel} />
          )}
        </div>
      )}
    </div>
  );
}

// ── 1. Text Filter Variant ───────────────────────────────────────────────────
function TextFilterContent<TData extends RowData>({
  column,
  filterLabel,
}: {
  column: Column<TData, unknown>;
  filterLabel: string;
}) {
  const value = (column.getFilterValue() as string) || "";
  const [mode, setMode] = useState<"contains" | "startsWith" | "equals">(
    column.columnDef.meta?.textMode || "contains"
  );

  const handleInputChange = (val: string) => {
    column.setFilterValue(val || undefined);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex rounded-lg bg-slate-100 p-0.5 text-[10px] font-bold text-text-grey">
        {(["contains", "startsWith", "equals"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md py-1 capitalize transition-all ${
              mode === m ? "bg-surface-white font-bold text-brand-navy shadow-sm" : "hover:text-on-surface"
            }`}
          >
            {m === "startsWith" ? "Starts with" : m}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-grey" />
        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={`Search ${filterLabel}…`}
          className="h-8 w-full rounded-lg border border-slate-200 bg-surface-white pl-8 pr-2.5 text-xs text-on-surface placeholder:text-text-grey focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
          autoFocus
        />
      </div>
    </div>
  );
}

// ── 2. Numeric Range Filter Variant ──────────────────────────────────────────
function NumericRangeFilterContent<TData extends RowData>({
  column,
}: {
  column: Column<TData, unknown>;
}) {
  const [min, max] = ((column.getFilterValue() as [number | "", number | ""]) || ["", ""]);

  const handleMinChange = (val: string) => {
    const num = val === "" ? "" : Number(val);
    column.setFilterValue(num !== "" || max !== "" ? [num, max] : undefined);
  };

  const handleMaxChange = (val: string) => {
    const num = val === "" ? "" : Number(val);
    column.setFilterValue(min !== "" || num !== "" ? [min, num] : undefined);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold uppercase text-text-grey">Min</label>
          <input
            type="number"
            value={min}
            onChange={(e) => handleMinChange(e.target.value)}
            placeholder="0"
            className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-surface-white px-2 text-xs font-mono text-on-surface focus:border-brand-navy focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-text-grey">Max</label>
          <input
            type="number"
            value={max}
            onChange={(e) => handleMaxChange(e.target.value)}
            placeholder="Max"
            className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-surface-white px-2 text-xs font-mono text-on-surface focus:border-brand-navy focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

// ── 3. Date Range Filter Variant ─────────────────────────────────────────────
function DateRangeFilterContent<TData extends RowData>({
  column,
}: {
  column: Column<TData, unknown>;
}) {
  const [startDate, endDate] = ((column.getFilterValue() as [string, string]) || ["", ""]);

  const handleStartChange = (val: string) => {
    column.setFilterValue(val !== "" || endDate !== "" ? [val, endDate] : undefined);
  };

  const handleEndChange = (val: string) => {
    column.setFilterValue(startDate !== "" || val !== "" ? [startDate, val] : undefined);
  };

  const setPreset = (days: number) => {
    const end = new Date().toISOString().split("T")[0];
    const d = new Date();
    d.setDate(d.getDate() - days);
    const start = d.toISOString().split("T")[0];
    column.setFilterValue([start, end]);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setPreset(7)}
          className="flex-1 rounded-md bg-slate-100 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
        >
          Last 7D
        </button>
        <button
          type="button"
          onClick={() => setPreset(30)}
          className="flex-1 rounded-md bg-slate-100 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
        >
          Last 30D
        </button>
        <button
          type="button"
          onClick={() => setPreset(0)}
          className="flex-1 rounded-md bg-slate-100 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
        >
          Today
        </button>
      </div>
      <div className="space-y-1.5">
        <div>
          <label className="text-[10px] font-bold uppercase text-text-grey flex items-center gap-1">
            <Calendar size={10} /> Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleStartChange(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-surface-white px-2 text-xs font-mono text-on-surface focus:border-brand-navy focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-text-grey flex items-center gap-1">
            <Calendar size={10} /> End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => handleEndChange(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-surface-white px-2 text-xs font-mono text-on-surface focus:border-brand-navy focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

// ── 4. Categorical Multi-Select Filter Variant ────────────────────────────────
function MultiSelectFilterContent<TData extends RowData>({
  column,
  table,
}: {
  column: Column<TData, unknown>;
  table: Table<TData>;
}) {
  const selectedValues = (column.getFilterValue() as string[]) || [];
  const [search, setSearch] = useState("");

  // Extract distinct options either from meta.filterOptions or dynamically from table rows
  const options = useMemo(() => {
    if (column.columnDef.meta?.filterOptions) {
      return column.columnDef.meta.filterOptions;
    }
    const counts = new Map<string, number>();
    table.getCoreRowModel().rows.forEach((row) => {
      const val = String(row.getValue(column.id) || "");
      if (val) counts.set(val, (counts.get(val) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ label: value, value, count }));
  }, [column, table]);

  const filteredOptions = options.filter((opt) =>
    String(opt.label).toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (val: string) => {
    const next = selectedValues.includes(val)
      ? selectedValues.filter((v) => v !== val)
      : [...selectedValues, val];
    column.setFilterValue(next.length > 0 ? next : undefined);
  };

  const selectAll = () => column.setFilterValue(options.map((o) => String(o.value)));
  const deselectAll = () => column.setFilterValue(undefined);

  return (
    <div className="space-y-2">
      {options.length > 5 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="h-7 w-full rounded-md border border-slate-200 bg-slate-50/50 px-2 text-xs text-on-surface placeholder:text-text-grey focus:bg-surface-white focus:outline-none"
        />
      )}
      <div className="flex justify-between text-[10px] font-bold text-brand-navy">
        <button type="button" onClick={selectAll} className="hover:underline">
          Select All ({options.length})
        </button>
        <button type="button" onClick={deselectAll} className="hover:underline text-text-grey">
          Clear
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
        {filteredOptions.map((opt) => {
          const optStr = String(opt.value);
          const isChecked = selectedValues.includes(optStr);
          return (
            <label
              key={optStr}
              className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-slate-100/80 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors ${
                    isChecked
                      ? "bg-brand-navy border-brand-navy text-surface-white"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {isChecked && <Check size={10} strokeWidth={3} />}
                </div>
                <span className="font-medium text-slate-800">{opt.label}</span>
              </div>
              {opt.count !== undefined && (
                <span className="text-[10px] font-mono text-text-grey">{opt.count}</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── 5. Dependent Categorical Multi-Select Filter Variant ───────────────────────
function DependentMultiSelectFilterContent<TData extends RowData>({
  column,
  table,
}: {
  column: Column<TData, unknown>;
  table: Table<TData>;
}) {
  const parentColumnId = column.columnDef.meta?.parentColumnId || "categoryName";
  const parentFilterValue = table.getColumn(parentColumnId)?.getFilterValue() as string[] | undefined;

  const selectedValues = (column.getFilterValue() as string[]) || [];
  const [search, setSearch] = useState("");

  // Dynamically compute options based on active parent category selection
  const options = useMemo(() => {
    const counts = new Map<string, number>();
    table.getCoreRowModel().rows.forEach((row) => {
      if (parentFilterValue && parentFilterValue.length > 0) {
        const parentVal = String(row.getValue(parentColumnId) || "");
        if (!parentFilterValue.includes(parentVal)) return;
      }
      const val = String(row.getValue(column.id) || "");
      if (val && val !== "null" && val !== "undefined") {
        counts.set(val, (counts.get(val) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ label: value, value, count }));
  }, [column, table, parentColumnId, parentFilterValue]);

  const filteredOptions = options.filter((opt) =>
    String(opt.label).toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (val: string) => {
    const next = selectedValues.includes(val)
      ? selectedValues.filter((v) => v !== val)
      : [...selectedValues, val];
    column.setFilterValue(next.length > 0 ? next : undefined);
  };

  const selectAll = () => column.setFilterValue(options.map((o) => String(o.value)));
  const deselectAll = () => column.setFilterValue(undefined);

  return (
    <div className="space-y-2">
      {parentFilterValue && parentFilterValue.length > 0 && (
        <div className="rounded bg-blue-50/70 p-1.5 text-[10px] text-blue-900 border border-blue-100 flex items-center gap-1">
          <AlertCircle size={12} className="shrink-0 text-blue-700" />
          <span>Filtered by parent: <strong>{parentFilterValue.join(", ")}</strong></span>
        </div>
      )}

      {options.length > 5 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subcategories…"
          className="h-7 w-full rounded-md border border-slate-200 bg-slate-50/50 px-2 text-xs text-on-surface placeholder:text-text-grey focus:bg-surface-white focus:outline-none"
        />
      )}

      <div className="flex justify-between text-[10px] font-bold text-brand-navy">
        <button type="button" onClick={selectAll} className="hover:underline">
          Select All ({options.length})
        </button>
        <button type="button" onClick={deselectAll} className="hover:underline text-text-grey">
          Clear
        </button>
      </div>

      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
        {filteredOptions.length === 0 ? (
          <p className="text-[11px] text-text-grey italic py-2">No subcategories available</p>
        ) : (
          filteredOptions.map((opt) => {
            const optStr = String(opt.value);
            const isChecked = selectedValues.includes(optStr);
            return (
              <label
                key={optStr}
                className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-slate-100/80 cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors ${
                      isChecked
                        ? "bg-brand-navy border-brand-navy text-surface-white"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {isChecked && <Check size={10} strokeWidth={3} />}
                  </div>
                  <span className="font-medium text-slate-800">{opt.label}</span>
                </div>
                {opt.count !== undefined && (
                  <span className="text-[10px] font-mono text-text-grey">{opt.count}</span>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── 6. Status Pill Filter Variant ─────────────────────────────────────────────
function StatusPillFilterContent<TData extends RowData>({
  column,
}: {
  column: Column<TData, unknown>;
}) {
  const current = (column.getFilterValue() as string) || "all";

  const options = [
    { value: "all", label: "All Statuses" },
    { value: "in_stock", label: "In-Stock" },
    { value: "low_stock", label: "Low Stock" },
    { value: "out_of_stock", label: "Out of Stock" },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => column.setFilterValue(opt.value === "all" ? undefined : opt.value)}
          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
            current === opt.value
              ? "bg-brand-navy text-surface-white shadow-sm"
              : "hover:bg-slate-100 text-slate-700"
          }`}
        >
          <span>{opt.label}</span>
          {current === opt.value && <Check size={13} strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

// ── 7. Boolean Toggle Filter Variant ──────────────────────────────────────────
function BooleanFilterContent<TData extends RowData>({
  column,
  filterLabel,
}: {
  column: Column<TData, unknown>;
  filterLabel: string;
}) {
  const value = (column.getFilterValue() as boolean) || false;

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => column.setFilterValue(e.target.checked ? true : undefined)}
          className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-brand-navy"
        />
        <span>Show only {filterLabel}</span>
      </label>
    </div>
  );
}
