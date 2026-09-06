"use client";

import React, { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { TrendingUp, PackageX, DollarSign, Activity } from "lucide-react";
import { WaterfallChart, type WaterfallDatum } from "@/components/analytics/WaterfallChart";
import { ScatterPlot, type ScatterPlotDatum } from "@/components/analytics/ScatterPlot";
import type { GmroiSummary, AgingInventoryBucketRow } from "@/lib/analytics/queries/trading";

export type TradingCapitalSectionProps = {
  gmroi: GmroiSummary;
  agingRows: AgingInventoryBucketRow[];
  starsAndDogs: ScatterPlotDatum[];
};

export function TradingCapitalSection({
  gmroi,
  agingRows,
  starsAndDogs,
}: TradingCapitalSectionProps) {
  const [agingFilter, setAgingFilter] = useState<"all" | "90plus">("all");
  const [sorting, setSorting] = useState<SortingState>([]);

  const sampleWaterfallData: WaterfallDatum[] = [
    { label: "Purchase Price", value: 12500, type: "base" },
    { label: "Freight & Customs", value: 1800, type: "addition" },
    { label: "Inbound Handling", value: 650, type: "addition" },
    { label: "Storage Accrual", value: 950, type: "addition" },
    { label: "Total Landed Cost", value: 0, type: "total" },
  ];

  const filteredAging = useMemo(() => {
    return agingFilter === "90plus"
      ? agingRows.filter((r) => r.qty90PlusDays > 0)
      : agingRows;
  }, [agingRows, agingFilter]);

  const columns = useMemo<ColumnDef<AgingInventoryBucketRow>[]>(
    () => [
      {
        accessorKey: "itemCode",
        header: "Item Code & Name",
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-sm font-bold text-on-surface">
              {row.original.itemCode}
            </p>
            <p className="text-xs text-text-grey font-medium">
              {row.original.itemName}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "qty30Days",
        header: "0–30 Days",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-text-grey text-right block">
            {row.original.qty30Days.toLocaleString()}{" "}
            <span className="text-xs font-normal">{row.original.uom}</span>
          </span>
        ),
      },
      {
        accessorKey: "qty60Days",
        header: "31–60 Days",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-semibold text-amber-700 text-right block">
            {row.original.qty60Days.toLocaleString()}{" "}
            <span className="text-xs font-normal">{row.original.uom}</span>
          </span>
        ),
      },
      {
        accessorKey: "qty90PlusDays",
        header: "90+ Days (Dead)",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-bold text-status-held text-right block">
            {row.original.qty90PlusDays.toLocaleString()}{" "}
            <span className="text-xs font-normal">{row.original.uom}</span>
          </span>
        ),
      },
      {
        accessorKey: "totalQty",
        header: "Total Qty",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-semibold text-on-surface text-right block">
            {row.original.totalQty.toLocaleString()}{" "}
            <span className="text-xs font-normal">{row.original.uom}</span>
          </span>
        ),
      },
      {
        accessorKey: "totalValue",
        header: "Tied Value (₱)",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-bold text-brand-navy text-right block">
            ₱{row.original.totalValue.toLocaleString()}
          </span>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: filteredAging,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      {/* ── KPI Strip: GMROI & Capital Velocity ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              GMROI Score
            </span>
            <div className="rounded-md bg-emerald-50 p-2 text-status-available">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface">
            {gmroi.gmroiScore}x
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            ₱{gmroi.grossMarginTotal.toLocaleString()} margin on ₱{gmroi.averageInventoryValue.toLocaleString()} avg stock
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Inventory Turnover
            </span>
            <div className="rounded-md bg-blue-50 p-2 text-brand-royal-blue">
              <Activity size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface">
            {gmroi.inventoryTurnoverRatio} turns/yr
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Avg replenishment cycle: ~{Math.round(365 / (gmroi.inventoryTurnoverRatio || 1))} days
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Owned Stock Value
            </span>
            <div className="rounded-md bg-slate-100 p-2 text-brand-navy">
              <DollarSign size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface font-mono">
            ₱{gmroi.averageInventoryValue.toLocaleString()}
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Trading capital currently deployed in warehouse
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Dead Stock Exposure
            </span>
            <div className="rounded-md bg-rose-50 p-2 text-status-held">
              <PackageX size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-status-held font-mono">
            ₱{agingRows.reduce((acc, r) => acc + (r.qty90PlusDays > 0 ? (r.totalValue * (r.qty90PlusDays / (r.totalQty || 1))) : 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Inventory sitting &gt; 90 days with zero sales velocity
          </p>
        </div>
      </div>

      {/* ── Charts: Landed Cost Waterfall & Capital Portfolio Matrix ───────────── */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 lg:col-span-6">
          <div className="mb-4">
            <h3 className="font-heading text-headline-md font-semibold text-on-surface">
              Trading Landed Cost Build-Up
            </h3>
            <p className="font-body text-xs text-text-grey">
              Item buy cost + inbound freight + customs + handling + daily storage accrual.
            </p>
          </div>
          <div className="h-72 w-full">
            <WaterfallChart data={sampleWaterfallData} currency="₱" height={280} />
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 lg:col-span-6">
          <div className="mb-4">
            <h3 className="font-heading text-headline-md font-semibold text-on-surface">
              Capital Portfolio Matrix (Stars vs. Dogs)
            </h3>
            <p className="font-body text-xs text-text-grey">
              Gross Margin % vs. Sales Velocity (Units/mo). Focus capital on high-margin high-velocity.
            </p>
          </div>
          <div className="h-72 w-full">
            <ScatterPlot
              data={starsAndDogs}
              xLabel="Sales Velocity (Units/Month)"
              yLabel="Realized Margin %"
              height={280}
            />
          </div>
        </div>
      </div>

      {/* ── Aging Inventory Breakdown Table (Powered by TanStack Table) ────────── */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-heading text-headline-md font-semibold text-on-surface">
              Aging Capital Inventory Buckets
            </h3>
            <p className="font-body text-xs text-text-grey">
              Stock age analysis for owned trading items to prevent inventory write-offs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAgingFilter("all")}
              className={`rounded-lg px-3 py-1.5 font-label text-xs font-medium transition-colors ${
                agingFilter === "all"
                  ? "bg-brand-navy text-surface-white"
                  : "bg-slate-100 text-text-grey hover:bg-slate-200"
              }`}
            >
              All Aging Stock
            </button>
            <button
              type="button"
              onClick={() => setAgingFilter("90plus")}
              className={`rounded-lg px-3 py-1.5 font-label text-xs font-medium transition-colors ${
                agingFilter === "90plus"
                  ? "bg-rose-600 text-white"
                  : "bg-slate-100 text-text-grey hover:bg-slate-200"
              }`}
            >
              Critical (90+ Days Only)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-slate-200 bg-[#F4F6FB]">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 font-heading text-xs font-bold uppercase tracking-wider text-slate-700 select-none cursor-pointer"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1.5">
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
            <tbody className="divide-y divide-slate-100 font-body text-sm">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-6 text-center text-text-grey italic">
                    No stagnant inventory detected in this bracket.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-middle">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
