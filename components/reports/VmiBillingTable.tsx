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
  Building2,
  FileText,
  Clock,
  Receipt,
  Search,
} from "lucide-react";
import type { VmiBillingRow } from "./types";
import { TablePagination } from "@/components/ui/TablePagination";
import { Badge } from "@/components/ui/Badge";

interface VmiBillingTableProps {
  initialData?: VmiBillingRow[];
  onGenerateInvoicePdf: (row: VmiBillingRow) => void;
  onAuditDwellTime: (row: VmiBillingRow) => void;
}

export function VmiBillingTable({
  initialData,
  onGenerateInvoicePdf,
  onAuditDwellTime,
}: VmiBillingTableProps) {
  const [data] = useState<VmiBillingRow[]>(initialData || []);
  const [searchTerm, setSearchTerm] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "mtdAccruedStorage", desc: true },
  ]);

  const columns = useMemo<ColumnDef<VmiBillingRow>[]>(
    () => [
      {
        accessorKey: "clientName",
        header: "Client / Consignor",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-primary font-bold text-xs shrink-0 border border-blue-100">
                <Building2 size={14} />
              </div>
              <div>
                <span className="font-heading font-bold text-text-primary block text-sm">
                  {item.clientName}
                </span>
                <span className="font-mono text-[11px] text-text-secondary">
                  {item.clientCode} · {item.contactPerson}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "allocatedSpaceCbm",
        header: "Allocated CBM",
        cell: ({ row }) => (
          <span className="font-mono text-text-secondary text-xs">
            {row.original.allocatedSpaceCbm} m³
          </span>
        ),
      },
      {
        accessorKey: "occupiedCbm",
        header: "Occupied CBM",
        cell: ({ row }) => (
          <span className="font-mono font-bold text-text-primary text-xs">
            {row.original.occupiedCbm} m³
          </span>
        ),
      },
      {
        accessorKey: "utilizationPct",
        header: "Utilization",
        cell: ({ row }) => {
          const pct = row.original.utilizationPct;
          return (
            <div className="flex items-center gap-2">
              <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${
                    pct > 80 ? "bg-amber-500" : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <span className="font-mono text-xs font-semibold text-text-primary">
                {pct}%
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "contractedRatePerCbmDay",
        header: "Rate / m³ / Day",
        cell: ({ row }) => (
          <span className="font-mono text-text-secondary text-xs">
            ${row.original.contractedRatePerCbmDay}
          </span>
        ),
      },
      {
        accessorKey: "mtdAccruedStorage",
        header: "MTD Accrued",
        cell: ({ row }) => (
          <span className="font-mono font-bold text-emerald-700 text-xs">
            $
            {row.original.mtdAccruedStorage.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        ),
      },
      {
        accessorKey: "billingStatus",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.billingStatus;
          return (
            <Badge
              size="sm"
              variant={
                status === "Ready to Invoice"
                  ? "success"
                  : status === "Draft Generated"
                  ? "primary"
                  : "neutral"
              }
            >
              {status}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onAuditDwellTime(item)}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 font-label text-xs font-semibold text-text-primary hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <Clock size={13} className="text-slate-500" />
                <span>Audit</span>
              </button>
              <button
                type="button"
                onClick={() => onGenerateInvoicePdf(item)}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 font-label text-xs font-bold text-white hover:bg-primary-hover transition-colors shadow-2xs"
              >
                <FileText size={13} />
                <span>SOA</span>
              </button>
            </div>
          );
        },
      },
    ],
    [onAuditDwellTime, onGenerateInvoicePdf]
  );

  const filteredData = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return data.filter(
      (row) =>
        normalized.length === 0 ||
        row.clientName.toLowerCase().includes(normalized) ||
        row.clientCode.toLowerCase().includes(normalized)
    );
  }, [data, searchTerm]);

  const totalAccrued = data.reduce((acc, row) => acc + row.mtdAccruedStorage, 0);
  const totalOccupied = data.reduce((acc, row) => acc + row.occupiedCbm, 0);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 5,
      },
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
      {/* ── Table Header & Controls ────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-lg font-bold text-text-primary flex items-center gap-2">
              <Receipt size={18} className="text-primary" />
              VMI Client Storage &amp; CBM Billing Reconciliation
            </h3>
            <Badge size="sm" variant="primary">
              AUDIT READY
            </Badge>
          </div>
          <p className="mt-0.5 font-body text-xs text-text-secondary">
            Consolidated daily CBM consumption, contracted rates, and unbilled storage accruals across consignment clients.
          </p>
        </div>

        {/* Global Stats and Search Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search VMI Client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-xl border border-border bg-surface pl-9 pr-3 font-body text-xs text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-xl border border-border font-mono text-xs">
            <div>
              <span className="text-[10px] text-text-secondary uppercase block">Total Occupied:</span>
              <span className="font-bold text-text-primary">{totalOccupied.toLocaleString()} m³</span>
            </div>
            <div className="border-l border-border pl-3">
              <span className="text-[10px] text-text-secondary uppercase block">MTD Accrued:</span>
              <span className="font-bold text-emerald-700">
                ${totalAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── TanStack Table View ─────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-[#F4F6FB]">
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
          <tbody className="divide-y divide-border/60">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center font-body text-xs text-text-secondary"
                >
                  No VMI billing clients match your search.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-slate-50 transition-colors"
                >
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

        {filteredData.length > 0 && (
          <div className="p-3 border-t border-border">
            <TablePagination
              pageIndex={table.getState().pagination.pageIndex}
              pageSize={table.getState().pagination.pageSize}
              pageCount={table.getPageCount()}
              totalCount={filteredData.length}
              canPreviousPage={table.getCanPreviousPage()}
              canNextPage={table.getCanNextPage()}
              onPageChange={(p) => table.setPageIndex(p)}
              onPageSizeChange={(newSize) => table.setPageSize(newSize)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
