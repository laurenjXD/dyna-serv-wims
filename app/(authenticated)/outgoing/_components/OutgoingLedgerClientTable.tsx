"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Layers, Package, X, Upload } from "lucide-react";
import type { OutgoingLedgerRow } from "@/lib/db/queries/withdrawals";

interface OutgoingLedgerClientTableProps {
  rows: OutgoingLedgerRow[];
  uploadDeliveryReceiptAction: (formData: FormData) => void;
}

export function OutgoingLedgerClientTable({
  rows,
  uploadDeliveryReceiptAction,
}: OutgoingLedgerClientTableProps) {
  const [selectedDrNumber, setSelectedDrNumber] = useState<string | null>(null);

  // Group rows by Delivery Receipt (or Pick List #)
  const drGroups = rows.reduce<Record<string, OutgoingLedgerRow[]>>((acc, row) => {
    const drKey = row.pickListNumber ? `DR-${row.pickListNumber.replace(/^PL-/, "")}` : `TX-${row.transactionNumber}`;
    if (!acc[drKey]) acc[drKey] = [];
    acc[drKey].push(row);
    return acc;
  }, {});

  const selectedRows = selectedDrNumber ? drGroups[selectedDrNumber] ?? [] : [];
  const activeDrMeta = selectedRows[0];

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-2">
      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="font-body text-body-md text-text-grey">No outgoing transactions yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Date/Time
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Delivery Receipt #
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  DR Status
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  DR / POD Upload
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Transaction #
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Item Code
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Item Name
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Lot Number
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Qty
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  From Location
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Pick List #
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Customer Organization
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Performed By
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {rows.map((row) => {
                const drKey = row.pickListNumber
                  ? `DR-${row.pickListNumber.replace(/^PL-/, "")}`
                  : `TX-${row.transactionNumber}`;
                const groupCount = drGroups[drKey]?.length ?? 1;

                return (
                  <tr key={row.transactionId} className="hover:bg-surface-light-grey/50">
                    <td className="whitespace-nowrap px-4 py-3 font-body text-body-md text-text-grey">
                      {row.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDrNumber(drKey)}
                          className="group flex items-center gap-1.5 font-mono text-mono-md font-bold text-brand-navy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy rounded"
                          title="Click to view all items associated with this Delivery Receipt"
                        >
                          <FileText className="h-4 w-4 text-brand-navy/70 group-hover:text-brand-navy" />
                          <span>{drKey}</span>
                        </button>
                        {groupCount > 1 && (
                          <button
                            type="button"
                            onClick={() => setSelectedDrNumber(drKey)}
                            className="inline-flex items-center rounded-full bg-brand-navy/10 px-2 py-0.5 font-label text-label-xs font-semibold text-brand-navy hover:bg-brand-navy/20"
                            title={`${groupCount} items dispatched under this DR`}
                          >
                            {groupCount} items
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 font-label text-mono-sm font-bold ${
                          row.deliveryReceiptStatus === "uploaded"
                            ? "bg-status-available/15 text-status-available"
                            : "bg-status-pending/15 text-status-pending"
                        }`}
                      >
                        {row.deliveryReceiptStatus === "uploaded" ? "Uploaded" : "Missing"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <form
                        action={uploadDeliveryReceiptAction}
                        encType="multipart/form-data"
                        className="flex min-w-52 items-center gap-2"
                      >
                        <input type="hidden" name="pickListId" value={row.pickListId ?? ""} />
                        <input
                          required
                          type="file"
                          name="deliveryReceipt"
                          accept="application/pdf,image/png,image/jpeg"
                          className="max-w-40 text-body-sm"
                        />
                        <button
                          type="submit"
                          disabled={!row.pickListId}
                          className="inline-flex h-9 items-center rounded bg-primary px-3 font-label text-mono-sm font-bold text-surface-white hover:opacity-90 disabled:opacity-50"
                        >
                          <Upload className="mr-1 h-3.5 w-3.5" />
                          Upload
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.transactionNumber}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">
                      {row.itemCode}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {row.itemName}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.lotNumber}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">
                      {row.qty.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.fromLocationLabel}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.pickListNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {row.customerPartyName ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.performedByUserId}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dedicated DR Details Modal Popup */}
      {selectedDrNumber && activeDrMeta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dr-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-4xl rounded-2xl bg-surface-white shadow-elevation-3 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-light-grey px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-surface-white">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="dr-modal-title" className="font-heading text-title-md font-bold text-on-surface">
                    Delivery Receipt Details
                  </h2>
                  <p className="font-mono text-body-sm font-semibold text-brand-navy">
                    {selectedDrNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDrNumber(null)}
                className="rounded-lg p-2 text-text-grey hover:bg-outline-variant/20 hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* DR Metadata Banner */}
            <div className="grid grid-cols-2 gap-4 border-b border-outline-variant/20 bg-accent-indigo-50/30 px-6 py-4 sm:grid-cols-4">
              <div>
                <p className="font-label text-label-xs uppercase text-text-grey">Customer Organization</p>
                <p className="mt-0.5 font-body text-body-md font-bold text-on-surface">
                  {activeDrMeta.customerPartyName ?? "—"}
                </p>
              </div>
              <div>
                <p className="font-label text-label-xs uppercase text-text-grey">Date / Time Dispatched</p>
                <p className="mt-0.5 font-body text-body-md font-semibold text-on-surface">
                  {activeDrMeta.createdAt.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="font-label text-label-xs uppercase text-text-grey">Associated Pick List</p>
                <p className="mt-0.5 font-mono text-body-md font-bold text-brand-navy">
                  {activeDrMeta.pickListNumber ?? "—"}
                </p>
              </div>
              <div>
                <p className="font-label text-label-xs uppercase text-text-grey">DR Document Status</p>
                <span
                  className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 font-label text-label-xs font-bold ${
                    activeDrMeta.deliveryReceiptStatus === "uploaded"
                      ? "bg-status-available/15 text-status-available"
                      : "bg-status-pending/15 text-status-pending"
                  }`}
                >
                  {activeDrMeta.deliveryReceiptStatus === "uploaded" ? "Uploaded" : "Missing"}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="max-h-[60vh] overflow-y-auto p-6">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-brand-navy" />
                  <h3 className="font-heading text-title-sm font-bold text-on-surface">
                    Dispatched Items ({selectedRows.length})
                  </h3>
                </div>
                <span className="font-mono text-body-sm font-bold text-brand-navy">
                  Total Units: {selectedRows.reduce((sum, r) => sum + r.qty, 0).toLocaleString()}
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-outline-variant/30">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                      <th className="px-4 py-2.5 font-label text-label-xs uppercase text-text-grey">Item Code</th>
                      <th className="px-4 py-2.5 font-label text-label-xs uppercase text-text-grey">Description</th>
                      <th className="px-4 py-2.5 font-label text-label-xs uppercase text-text-grey">Lot Number</th>
                      <th className="px-4 py-2.5 font-label text-label-xs uppercase text-text-grey">Dispatched Qty</th>
                      <th className="px-4 py-2.5 font-label text-label-xs uppercase text-text-grey">From Location</th>
                      <th className="px-4 py-2.5 font-label text-label-xs uppercase text-text-grey">Transaction #</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20 font-body text-body-sm">
                    {selectedRows.map((itemRow) => (
                      <tr key={itemRow.transactionId} className="hover:bg-surface-light-grey/40">
                        <td className="px-4 py-3 font-mono font-bold text-on-surface">{itemRow.itemCode}</td>
                        <td className="px-4 py-3 text-on-surface">{itemRow.itemName}</td>
                        <td className="px-4 py-3 font-mono text-text-grey">{itemRow.lotNumber}</td>
                        <td className="px-4 py-3 font-mono font-bold text-brand-navy">{itemRow.qty.toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-text-grey">{itemRow.fromLocationLabel}</td>
                        <td className="px-4 py-3 font-mono text-text-grey">{itemRow.transactionNumber}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-outline-variant/30 bg-surface-light-grey px-6 py-4">
              <p className="font-body text-body-xs text-text-grey">
                Dispatched under {activeDrMeta.pickListNumber ?? "Pick List"} by user {activeDrMeta.performedByUserId}
              </p>
              <button
                type="button"
                onClick={() => setSelectedDrNumber(null)}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-on-surface px-5 font-label text-label font-bold text-surface-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
