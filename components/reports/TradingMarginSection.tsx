"use client";

import React, { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  Percent,
  Layers,
  ChevronRight,
  X,
  PieChart,
} from "lucide-react";
import type { TradingMarginRow, TradingCategoryPerformance } from "./types";
import { TablePagination } from "@/components/ui/TablePagination";

interface TradingMarginSectionProps {
  initialData?: {
    marginHistory: TradingMarginRow[];
    categoryBreakdown: TradingCategoryPerformance[];
  };
}

export function TradingMarginSection({ initialData }: TradingMarginSectionProps) {
  const defaultMarginData: TradingMarginRow[] = [];
  const defaultCategoryData: TradingCategoryPerformance[] = [];

  const marginData = initialData?.marginHistory && initialData.marginHistory.length > 0 ? initialData.marginHistory : defaultMarginData;
  const categoryData = initialData?.categoryBreakdown && initialData.categoryBreakdown.length > 0 ? initialData.categoryBreakdown : defaultCategoryData;

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [categorySorting, setCategorySorting] = useState<SortingState>([]);

  const categoryColumns = useMemo<ColumnDef<TradingCategoryPerformance>[]>(
    () => [
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => {
          const cat = row.original;
          return (
            <div>
              <span
                className="font-bold text-slate-900 block truncate max-w-[140px] text-[11px]"
                title={cat.category}
              >
                {cat.category}
              </span>
              <span className="font-mono text-[10px] text-text-secondary">
                {cat.unitsSold.toLocaleString()} units sold
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "grossRevenue",
        header: "Revenue",
        cell: ({ row }) => (
          <span className="font-mono text-right text-slate-800 text-xs block">
            ${row.original.grossRevenue.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "marginPct",
        header: "Margin %",
        cell: ({ row }) => {
          const cat = row.original;
          return (
            <div className="text-right">
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                  cat.marginPct >= 20
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {cat.marginPct}%
              </span>
            </div>
          );
        },
      },
    ],
    []
  );

  const categoryTable = useReactTable({
    data: categoryData,
    columns: categoryColumns,
    state: {
      sorting: categorySorting,
    },
    onSortingChange: setCategorySorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 5,
      },
    },
  });

  const currentMonthData = marginData[marginData.length - 1];
  const totalRevenue = categoryData.reduce((acc, c) => acc + c.grossRevenue, 0);
  const totalMargin = categoryData.reduce((acc, c) => acc + c.netMargin, 0);
  const avgMarginPct = totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100).toFixed(1) : "18.4";

  return (
    <div className="space-y-6">
      {/* ── Desktop & Mobile Container ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ── Left Column: Revenue, COGS & Realized Margin % ComposedChart ───── */}
        <div className="xl:col-span-7 rounded-2xl border border-slate-200/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div>
                <h3 className="font-heading text-title-md font-bold text-brand-navy dark:text-zinc-100 flex items-center gap-2">
                  <DollarSign size={18} className="text-brand-navy dark:text-blue-400" />
                  Trading Revenue, COGS &amp; Realized Margin
                </h3>
                <p className="mt-0.5 font-body text-xs text-text-grey">
                  Gross revenue vs. cost of goods sold with realized margin % trajectory.
                </p>
              </div>

              {/* Current Month Highlight Pill */}
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-mono">
                <span className="text-text-grey">MTD Realized:</span>
                <span className="font-bold text-brand-navy dark:text-blue-400">
                  {currentMonthData?.marginPct}%
                </span>
                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  Target: 20%
                </span>
              </div>
            </div>

            {/* Chart Area */}
            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={marginData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="period"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748B", fontSize: 11, fontWeight: 600 }}
                  />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748B", fontSize: 10, fontFamily: "monospace" }}
                    tickFormatter={(v) => `$${v / 1000}k`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[10, 30]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#002060", fontSize: 10, fontFamily: "monospace" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-elevation-2 font-body text-xs">
                            <p className="font-bold text-brand-navy mb-1.5 border-b border-slate-100 pb-1">
                              {label} Financial Realization
                            </p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-600">Gross Revenue:</span>
                                <span className="font-mono font-bold text-slate-900">
                                  ${Number(payload[0]?.value).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-600">COGS:</span>
                                <span className="font-mono font-bold text-slate-700">
                                  ${Number(payload[1]?.value).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between gap-4 pt-1 border-t border-slate-100">
                                <span className="text-brand-navy font-bold">Realized Margin:</span>
                                <span className="font-mono font-black text-brand-navy">
                                  {payload[2]?.value}%
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    iconType="circle"
                  />
                  <ReferenceLine
                    yAxisId="right"
                    y={20}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    label={{ value: "20% Target Margin", fill: "#D97706", fontSize: 10, position: "insideTopRight" }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="grossRevenue"
                    name="Gross Revenue"
                    fill="#002060"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="cogs"
                    name="COGS"
                    fill="#94A3B8"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="marginPct"
                    name="Realized Margin %"
                    stroke="#2563EB"
                    strokeWidth={3}
                    dot={{ fill: "#2563EB", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Summary Strip */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 flex flex-wrap items-center justify-between text-xs font-label">
            <div className="flex items-center gap-4">
              <span className="text-text-grey">Avg 6-Mo Margin: <strong className="text-slate-900 font-mono">{avgMarginPct}%</strong></span>
              <span className="text-text-grey">Target SLA: <strong className="text-emerald-700 font-mono">20.0%</strong></span>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              className="xl:hidden inline-flex items-center gap-1 font-bold text-brand-navy hover:underline text-xs"
            >
              <PieChart size={13} />
              <span>Category Breakdown ({categoryData.length})</span>
            </button>
          </div>
        </div>

        {/* ── Right Column: Trading Product Line Margin Breakdown Table ──────── */}
        <div className="xl:col-span-5 rounded-2xl border border-slate-200/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-heading text-title-md font-bold text-brand-navy dark:text-zinc-100 flex items-center gap-2">
                  <Layers size={17} className="text-brand-navy dark:text-blue-400" />
                  Product Line Margin Realization
                </h3>
                <p className="mt-0.5 font-body text-xs text-text-grey">
                  MTD Category volume &amp; realized margin %
                </p>
              </div>
            </div>

            {/* Desktop / Large Table Powered by TanStack Table */}
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left border-collapse">
                <thead>
                  {categoryTable.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-slate-200 bg-slate-50/70">
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wider text-slate-700 select-none cursor-pointer"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <div className="flex items-center gap-1">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {{
                              asc: " ↑",
                              desc: " ↓",
                            }[header.column.getIsSorted() as string] ?? null}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-slate-100 font-body text-xs">
                  {categoryTable.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2.5 align-middle">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-2 mt-3">
            <TablePagination
              pageIndex={categoryTable.getState().pagination.pageIndex}
              pageSize={categoryTable.getState().pagination.pageSize}
              pageCount={categoryTable.getPageCount()}
              totalCount={categoryData.length}
              canPreviousPage={categoryTable.getCanPreviousPage()}
              canNextPage={categoryTable.getCanNextPage()}
              onPageChange={(p) => categoryTable.setPageIndex(p)}
              onPageSizeChange={(newSize) => categoryTable.setPageSize(newSize)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
