"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  FileText,
  X,
  Upload,
  Clock,
  Building2,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  FileSpreadsheet,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { DataTable } from "@/components/tables/DataTable";
import type { OutgoingLedgerRow } from "@/lib/db/queries/withdrawals";

interface OutgoingLedgerClientTableProps {
  rows: OutgoingLedgerRow[];
  uploadDeliveryReceiptAction: (formData: FormData) => void;
  removeDeliveryReceiptAction: (formData: FormData) => void;
}

export function OutgoingLedgerClientTable({
  rows,
  uploadDeliveryReceiptAction,
  removeDeliveryReceiptAction,
}: OutgoingLedgerClientTableProps) {
  const [selectedDrNumber, setSelectedDrNumber] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<OutgoingLedgerRow | null>(null);

  // Group rows by Delivery Receipt (or Pick List #)
  const drGroups = useMemo(() => {
    return rows.reduce<Record<string, OutgoingLedgerRow[]>>((acc, row) => {
      const drKey = row.pickListNumber
        ? `DR-${row.pickListNumber.replace(/^PL-/, "")}`
        : "Direct Dispatch";
      if (!acc[drKey]) acc[drKey] = [];
      acc[drKey].push(row);
      return acc;
    }, {});
  }, [rows]);

  const totalDispatchedQty = useMemo(() => {
    return rows.reduce((sum, r) => sum + r.qty, 0);
  }, [rows]);

  const missingDrCount = useMemo(() => {
    const missingDrs = new Set(
      rows
        .filter((row) => row.deliveryReceiptStatus !== "uploaded")
        .map((row) => row.pickListNumber ?? row.transactionId),
    );
    return missingDrs.size;
  }, [rows]);

  const selectedRows = selectedDrNumber ? drGroups[selectedDrNumber] ?? [] : [];
  const activeDrMeta = selectedRows[0];

  const columns = useMemo<ColumnDef<OutgoingLedgerRow, unknown>[]>(() => [
    // 1. Date / Time (Date Range Filter)
    {
      accessorKey: "createdAt",
      header: "Date / Time",
      meta: {
        filterVariant: "date-range",
        filterLabel: "Date Range",
      },
      cell: (info) => {
        const d = new Date(info.getValue() as string | Date);
        return (
          <div className="min-w-[110px]">
            <div className="font-mono text-xs font-bold text-slate-800">
              {d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            <div className="text-[11px] text-text-grey font-mono flex items-center gap-1 mt-0.5">
              <Clock size={11} className="text-text-grey/70" />
              {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        );
      },
    },

    // 2. Delivery Receipt #
    {
      id: "drKey",
      accessorFn: (row) =>
        row.pickListNumber ? `DR-${row.pickListNumber.replace(/^PL-/, "")}` : "Direct Dispatch",
      header: "Delivery Receipt #",
      meta: {
        filterVariant: "text",
        filterLabel: "DR #",
      },
      cell: (info) => {
        const drKey = String(info.getValue());
        const groupCount = drGroups[drKey]?.length ?? 1;

        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDrNumber(drKey)}
              className="group flex items-center gap-1.5 font-mono text-xs font-bold text-brand-navy hover:text-blue-700 hover:underline focus:outline-none"
              title="Click to view all items under this Delivery Receipt"
            >
              <FileText size={14} className="text-brand-navy/60 group-hover:text-blue-600 transition-colors" />
              <span>{drKey}</span>
            </button>
            {groupCount > 1 && (
              <button
                type="button"
                onClick={() => setSelectedDrNumber(drKey)}
                className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 font-label text-[10px] font-bold text-brand-navy border border-blue-200 hover:bg-blue-100 transition-colors"
                title={`${groupCount} items dispatched under this DR`}
              >
                {groupCount} items
              </button>
            )}
          </div>
        );
      },
    },

    // 3. DR Status
    {
      accessorKey: "deliveryReceiptStatus",
      header: "DR Status",
      meta: {
        filterVariant: "status-pill",
        filterLabel: "DR Status",
      },
      cell: (info) => {
        const isUploaded = info.getValue() === "uploaded";
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
              isUploaded
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}
          >
            {isUploaded ? <CheckCircle2 size={11} className="text-emerald-600" /> : <AlertCircle size={11} className="text-amber-600" />}
            {isUploaded ? "Uploaded" : "Missing POD"}
          </span>
        );
      },
    },

    // 4. Signed POD Document Actions
    {
      id: "podDocument",
      header: "Signed POD",
      meta: {
        align: "center",
      },
      cell: (info) => {
        const row = info.row.original;
        if (row.deliveryReceiptPath) {
          return (
            <div className="flex items-center gap-1.5">
              {row.deliveryReceiptUrl ? (
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(row)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-surface-white px-2.5 font-label text-xs font-bold text-brand-navy hover:bg-slate-50 transition-colors shadow-sm"
                  title="View uploaded delivery receipt document"
                >
                  <FileText size={12} />
                  View
                </button>
              ) : (
                <span className="font-body text-[11px] text-text-grey">Uploaded</span>
              )}
              <form action={removeDeliveryReceiptAction}>
                <input type="hidden" name="pickListId" value={row.pickListId ?? ""} />
                <button
                  type="submit"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition-colors"
                  title="Remove uploaded document"
                >
                  <Trash2 size={13} />
                </button>
              </form>
            </div>
          );
        }

        return (
          <form
            action={uploadDeliveryReceiptAction}
            encType="multipart/form-data"
            className="flex items-center gap-1"
          >
            <input type="hidden" name="pickListId" value={row.pickListId ?? ""} />
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 font-label text-xs font-bold text-brand-navy hover:bg-blue-100 transition-colors">
              <Upload size={12} />
              Upload POD
              <input
                required
                type="file"
                name="deliveryReceipt"
                accept="application/pdf,image/png,image/jpeg"
                className="sr-only"
                onChange={(event) => {
                  if (event.currentTarget.files?.length) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </label>
          </form>
        );
      },
    },

    // 5. Item Code
    {
      accessorKey: "itemCode",
      header: "Item Code",
      meta: {
        filterVariant: "text",
        filterLabel: "Item Code",
      },
      cell: (info) => (
        <span className="font-mono font-bold text-xs text-brand-navy">{String(info.getValue())}</span>
      ),
    },

    // 6. Item Name
    {
      accessorKey: "itemName",
      header: "Item Name",
      meta: {
        filterVariant: "text",
        filterLabel: "Item Name",
      },
      cell: (info) => (
        <div className="max-w-[200px] font-medium text-xs text-slate-800 truncate" title={String(info.getValue())}>
          {String(info.getValue())}
        </div>
      ),
    },

    // 7. Lot Number
    {
      accessorKey: "lotNumber",
      header: "Lot Number",
      meta: {
        filterVariant: "text",
        filterLabel: "Lot Number",
      },
      cell: (info) => (
        <span className="font-mono text-xs text-slate-600">{String(info.getValue())}</span>
      ),
    },

    // 8. Dispatched Qty
    {
      accessorKey: "qty",
      header: "Dispatched Qty",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Qty Range",
        align: "right",
      },
      cell: (info) => (
        <span className="font-mono font-bold text-xs text-slate-900">
          {Number(info.getValue()).toLocaleString()}
        </span>
      ),
    },

    // 9. From Location
    {
      accessorKey: "fromLocationLabel",
      header: "From Location",
      meta: {
        filterVariant: "text",
        filterLabel: "Location",
      },
      cell: (info) => (
        <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 border border-slate-200">
          {String(info.getValue())}
        </span>
      ),
    },

    // 10. Pick List #
    {
      accessorKey: "pickListNumber",
      header: "Pick List #",
      meta: {
        filterVariant: "text",
        filterLabel: "Pick List #",
      },
      cell: (info) => {
        const val = String(info.getValue() || "—");
        const row = info.row.original;
        if (!row.pickListId) return <span className="font-mono text-xs text-text-grey">{val}</span>;
        return (
          <Link
            href={`/pick-lists/${row.pickListId}/dispatch`}
            className="font-mono text-xs font-bold text-brand-navy hover:underline"
          >
            {val}
          </Link>
        );
      },
    },

    // 11. Customer Organization
    {
      accessorKey: "customerPartyName",
      header: "Customer Organization",
      meta: {
        filterVariant: "text",
        filterLabel: "Customer",
      },
      cell: (info) => (
        <div className="flex items-center gap-1.5 min-w-0 max-w-[180px]">
          <Building2 size={13} className="text-slate-400 shrink-0" />
          <span className="font-medium text-xs text-slate-800 truncate">
            {String(info.getValue() || "—")}
          </span>
        </div>
      ),
    },

    // 12. Performed By
    {
      accessorKey: "performedByDisplayName",
      header: "Dispatched By",
      meta: {
        filterVariant: "text",
        filterLabel: "Dispatched By",
      },
      cell: (info) => {
        const row = info.row.original;
        return (
          <span className="text-xs text-text-grey truncate max-w-[140px]" title={row.performedByUserId}>
            {String(info.getValue() || row.performedByUserId)}
          </span>
        );
      },
    },
  ], [drGroups, removeDeliveryReceiptAction, uploadDeliveryReceiptAction]);

  return (
    <div className="space-y-4">
      {/* ── KPI Summary Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand-navy border border-blue-200">
              <Package size={20} />
            </div>
            <div>
              <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                Total Dispatched Units
              </p>
              <p className="font-mono text-title-md font-bold text-brand-navy">
                {totalDispatchedQty.toLocaleString()} <span className="text-xs font-normal text-text-grey">PCS</span>
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700 border border-slate-200">
              <Layers size={20} />
            </div>
            <div>
              <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                Delivery Receipts
              </p>
              <p className="font-mono text-title-md font-bold text-slate-800">
                {Object.keys(drGroups).length} <span className="text-xs font-normal text-text-grey">Total DRs</span>
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
              missingDrCount > 0
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}>
              {missingDrCount > 0 ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            </div>
            <div>
              <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                Missing Signed PODs
              </p>
              <p className={`font-mono text-title-md font-bold ${missingDrCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                {missingDrCount} <span className="text-xs font-normal text-text-grey">{missingDrCount > 0 ? "Pending Upload" : "All Uploaded"}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── TanStack DataTable ─────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={rows}
        title="Outgoing Dispatch Ledger"
        subtitle="Immutable transaction audit log of released shipments with multi-field filtering, date ranges, and POD proof-of-delivery tracking."
        icon={<FileSpreadsheet size={18} />}
        initialSorting={[{ id: "createdAt", desc: true }]}
        emptyMessage="No outgoing transactions recorded."
      />

      {/* ── PDF / Image Receipt Viewer Modal ───────────────────────────── */}
      {selectedReceipt?.deliveryReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface-white shadow-elevation-5">
            <div className="flex items-start justify-between gap-4 border-b border-outline-variant/30 bg-surface-light-grey px-5 py-4">
              <div>
                <span className="font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                  Signed Delivery Receipt Document
                </span>
                <h2 className="font-mono text-headline-sm font-bold text-brand-navy">
                  {selectedReceipt.pickListNumber ? `DR-${selectedReceipt.pickListNumber.replace(/^PL-/, "")}` : `Pick List #${selectedReceipt.pickListId}`}
                </h2>
                <p className="mt-1 font-body text-body-sm text-text-grey">
                  Uploaded: {selectedReceipt.deliveryReceiptUploadedAt ? new Date(selectedReceipt.deliveryReceiptUploadedAt).toLocaleString() : "Date unavailable"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="rounded-lg p-2 text-text-grey hover:bg-outline-variant/20 hover:text-on-surface focus:outline-none"
                aria-label="Close receipt viewer"
              >
                <X size={20} />
              </button>
            </div>
            <iframe
              title="Uploaded delivery receipt"
              src={selectedReceipt.deliveryReceiptUrl}
              className="min-h-[65vh] w-full border-0"
            />
          </div>
        </div>
      )}

      {/* ── DR Group Items Modal ───────────────────────────────────────── */}
      {selectedDrNumber && activeDrMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-surface-white shadow-elevation-5 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-light-grey px-6 py-4">
              <div>
                <span className="font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                  Delivery Receipt Inspection
                </span>
                <h2 className="font-mono text-headline-md font-bold text-brand-navy">
                  {selectedDrNumber}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDrNumber(null)}
                className="rounded-lg p-2 text-text-grey hover:bg-outline-variant/20 hover:text-on-surface focus:outline-none"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* DR Metadata Bar */}
            <div className="grid grid-cols-2 gap-4 border-b border-outline-variant/20 bg-[#F8FAFF] px-6 py-3 font-body text-body-sm sm:grid-cols-4">
              <div>
                <span className="text-text-grey block text-xs">Customer:</span>
                <strong className="text-on-surface">{activeDrMeta.customerPartyName ?? "—"}</strong>
              </div>
              <div>
                <span className="text-text-grey block text-xs">Pick List:</span>
                <strong className="font-mono text-on-surface">{activeDrMeta.pickListNumber ?? "—"}</strong>
              </div>
              <div>
                <span className="text-text-grey block text-xs">Dispatched Date:</span>
                <strong className="text-on-surface">{new Date(activeDrMeta.createdAt).toLocaleDateString()}</strong>
              </div>
              <div>
                <span className="text-text-grey block text-xs">Line Items:</span>
                <strong className="text-on-surface">{selectedRows.length} items</strong>
              </div>
            </div>

            {/* Table of items inside this DR */}
            <div className="flex-1 overflow-y-auto p-6">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                    <th className="px-4 py-2.5 font-label text-label uppercase text-text-grey">Item Code</th>
                    <th className="px-4 py-2.5 font-label text-label uppercase text-text-grey">Item Name</th>
                    <th className="px-4 py-2.5 font-label text-label uppercase text-text-grey">Lot Number</th>
                    <th className="px-4 py-2.5 font-label text-label uppercase text-text-grey text-right">Qty</th>
                    <th className="px-4 py-2.5 font-label text-label uppercase text-text-grey">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30 font-body text-body-sm">
                  {selectedRows.map((item) => (
                    <tr key={item.transactionId} className="hover:bg-surface-light-grey/30">
                      <td className="px-4 py-3 font-mono font-bold text-on-surface">{item.itemCode}</td>
                      <td className="px-4 py-3 text-on-surface">{item.itemName}</td>
                      <td className="px-4 py-3 font-mono text-text-grey">{item.lotNumber}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-on-surface">{item.qty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-text-grey">{item.fromLocationLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-outline-variant/30 bg-surface-light-grey px-6 py-4">
              {activeDrMeta.pickListId && (
                <a
                  href={`/api/pick-lists/${activeDrMeta.pickListId}/receipt`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-brand-navy/30 bg-surface-white px-4 py-2 font-label text-xs font-bold text-brand-navy hover:bg-brand-navy/5 transition-colors shadow-sm"
                >
                  <ExternalLink size={13} />
                  Print Acknowledgement Receipt
                </a>
              )}
              <button
                type="button"
                onClick={() => setSelectedDrNumber(null)}
                className="rounded-xl bg-brand-navy px-5 py-2 font-label text-xs font-bold text-surface-white hover:bg-brand-navy/90 transition-colors shadow-sm focus:outline-none"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
