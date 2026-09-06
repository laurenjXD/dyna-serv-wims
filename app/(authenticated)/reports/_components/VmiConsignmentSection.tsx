"use client";

import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { ShieldCheck, AlertCircle, Users, Receipt } from "lucide-react";
import type {
  VendorScorecardRow,
  ConsignmentLiabilityAgingRow,
  SellThroughComparisonDatum,
  VmiStockoutRiskRow,
} from "@/lib/analytics/queries/vmi";

export type VmiConsignmentSectionProps = {
  vendorScorecards: VendorScorecardRow[];
  liabilityAging: ConsignmentLiabilityAgingRow[];
  sellThrough: SellThroughComparisonDatum[];
  stockoutRisks: VmiStockoutRiskRow[];
};

export function VmiConsignmentSection({
  vendorScorecards,
  liabilityAging,
  sellThrough,
  stockoutRisks,
}: VmiConsignmentSectionProps) {
  const totalLiability = liabilityAging.reduce((acc, r) => acc + r.totalUnbilledLiability, 0);

  const [liabilitySorting, setLiabilitySorting] = useState<SortingState>([]);
  const [scorecardSorting, setScorecardSorting] = useState<SortingState>([]);

  const liabilityColumns = useMemo<ColumnDef<ConsignmentLiabilityAgingRow>[]>(
    () => [
      {
        accessorKey: "vendorName",
        header: "Vendor / Supplier",
        cell: ({ row }) => (
          <span className="font-semibold text-on-surface">
            {row.original.vendorName}
          </span>
        ),
      },
      {
        accessorKey: "current0To30Days",
        header: "0–30 Days",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-text-grey text-right block">
            ₱{row.original.current0To30Days.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "aging31To60Days",
        header: "31–60 Days",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-text-grey text-right block">
            ₱{row.original.aging31To60Days.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "aging61To90Days",
        header: "61–90 Days",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-amber-700 font-semibold text-right block">
            ₱{row.original.aging61To90Days.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "aging90PlusDays",
        header: "90+ Days",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-bold text-status-held text-right block">
            ₱{row.original.aging90PlusDays.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "totalUnbilledLiability",
        header: "Total Liability (₱)",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-bold text-brand-navy text-right block">
            ₱{row.original.totalUnbilledLiability.toLocaleString()}
          </span>
        ),
      },
    ],
    []
  );

  const scorecardColumns = useMemo<ColumnDef<VendorScorecardRow>[]>(
    () => [
      {
        accessorKey: "vendorName",
        header: "Vendor",
        cell: ({ row }) => (
          <span className="font-semibold text-on-surface">
            {row.original.vendorName}
          </span>
        ),
      },
      {
        accessorKey: "wrrCount",
        header: "WRR Batches",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-semibold text-center block">
            {row.original.wrrCount}
          </span>
        ),
      },
      {
        accessorKey: "totalReceivedQty",
        header: "Received Qty",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-semibold text-right block">
            {row.original.totalReceivedQty.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "fillRatePct",
        header: "Fill Rate",
        cell: ({ row }) => {
          const rate = row.original.fillRatePct;
          return (
            <div className="text-center">
              <span
                className={`inline-block rounded px-2.5 py-0.5 font-mono text-xs font-bold ${
                  rate >= 98
                    ? "bg-emerald-100 text-emerald-800"
                    : rate >= 95
                    ? "bg-amber-100 text-amber-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {rate}%
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "onTimeDeliveryPct",
        header: "On-Time %",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-text-grey text-center block">
            {row.original.onTimeDeliveryPct}%
          </span>
        ),
      },
      {
        accessorKey: "discrepancyCount",
        header: "Discrepancies",
        cell: ({ row }) => {
          const count = row.original.discrepancyCount;
          return (
            <div className="text-center font-mono text-xs">
              {count > 0 ? (
                <span className="font-semibold text-status-held">{count}</span>
              ) : (
                <span className="text-status-available">0</span>
              )}
            </div>
          );
        },
      },
    ],
    []
  );

  const liabilityTable = useReactTable({
    data: liabilityAging,
    columns: liabilityColumns,
    state: { sorting: liabilitySorting },
    onSortingChange: setLiabilitySorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const scorecardTable = useReactTable({
    data: vendorScorecards,
    columns: scorecardColumns,
    state: { sorting: scorecardSorting },
    onSortingChange: setScorecardSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      {/* ── KPI Summary Strip ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Consignment Liability
            </span>
            <div className="rounded-md bg-blue-50 p-2 text-brand-royal-blue">
              <Receipt size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface font-mono">
            ₱{totalLiability.toLocaleString()}
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Unbilled consumed stock owed to VMI suppliers
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Avg Vendor Fill Rate
            </span>
            <div className="rounded-md bg-emerald-50 p-2 text-status-available">
              <ShieldCheck size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-status-available">
            {vendorScorecards.length > 0
              ? (
                  vendorScorecards.reduce((acc, v) => acc + v.fillRatePct, 0) /
                  vendorScorecards.length
                ).toFixed(1)
              : "98.5"}
            %
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Quantity match on inbound receipts
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Active VMI Vendors
            </span>
            <div className="rounded-md bg-slate-100 p-2 text-brand-navy">
              <Users size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface">
            {vendorScorecards.length}
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Consignment partners with stock in warehouse
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              VMI Stockout Risks
            </span>
            <div className="rounded-md bg-amber-50 p-2 text-amber-600">
              <AlertCircle size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-amber-600">
            {stockoutRisks.length} Items
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Items breaching minimum safety threshold
          </p>
        </div>
      </div>

      {/* ── Sell-Through Rate by Ownership Chart ─────────────────────────────── */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div className="mb-4">
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">
            Sell-Through &amp; Depletion Velocity by Ownership
          </h3>
          <p className="font-body text-xs text-text-grey">
            Comparison of monthly depleted units between Owned Trading inventory vs Consigned VMI stock.
          </p>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sellThrough} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fill: "#64748B", fontSize: 12 }} />
              <YAxis tick={{ fill: "#64748B", fontSize: 12, fontFamily: "Roboto Mono" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: "8px",
                  border: "1px solid #E2E8F0",
                  fontFamily: "Outfit, sans-serif",
                }}
              />
              <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
              <Bar dataKey="vmiDepletedQty" name="VMI Consigned Units" fill="#2E4094" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tradingDepletedQty" name="Trading Owned Units" fill="#002060" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Consignment Liability Aging Report Table ─────────────────────────── */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div className="mb-4">
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">
            Consignment Liability Aging Report
          </h3>
          <p className="font-body text-xs text-text-grey">
            Unbilled consumed VMI stock grouped by aging since withdrawal date.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              {liabilityTable.getHeaderGroups().map((headerGroup) => (
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
              {liabilityTable.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={liabilityColumns.length} className="py-6 text-center text-text-grey italic">
                    No active consignment liabilities recorded.
                  </td>
                </tr>
              ) : (
                liabilityTable.getRowModel().rows.map((row) => (
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

      {/* ── Vendor Scorecards Table ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div className="mb-4">
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">
            Vendor Scorecards (Fill Rate &amp; Inbound Accuracy)
          </h3>
          <p className="font-body text-xs text-text-grey">
            Supplier ranking evaluated on quantity conformance and receipt discrepancy frequency.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              {scorecardTable.getHeaderGroups().map((headerGroup) => (
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
              {scorecardTable.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={scorecardColumns.length} className="py-6 text-center text-text-grey italic">
                    No vendor scorecard data available.
                  </td>
                </tr>
              ) : (
                scorecardTable.getRowModel().rows.map((row) => (
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
