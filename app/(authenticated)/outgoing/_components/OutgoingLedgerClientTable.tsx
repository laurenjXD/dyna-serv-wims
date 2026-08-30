"use client";

import { useState, useMemo } from "react";
import {
  FileText,
  X,
  Upload,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { OutgoingLedgerRow } from "@/lib/db/queries/withdrawals";

interface OutgoingLedgerClientTableProps {
  rows: OutgoingLedgerRow[];
  uploadDeliveryReceiptAction: (formData: FormData) => void;
}

type SortField =
  | "createdAt"
  | "drKey"
  | "deliveryReceiptStatus"
  | "transactionNumber"
  | "itemCode"
  | "itemName"
  | "qty"
  | "customerPartyName";

type SortDirection = "asc" | "desc";

export function OutgoingLedgerClientTable({
  rows,
  uploadDeliveryReceiptAction,
}: OutgoingLedgerClientTableProps) {
  const [selectedDrNumber, setSelectedDrNumber] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "uploaded" | "missing">("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  // Group rows by Delivery Receipt (or Pick List #)
  const drGroups = useMemo(() => {
    return rows.reduce<Record<string, OutgoingLedgerRow[]>>((acc, row) => {
      const drKey = row.pickListNumber ? `DR-${row.pickListNumber.replace(/^PL-/, "")}` : `TX-${row.transactionNumber}`;
      if (!acc[drKey]) acc[drKey] = [];
      acc[drKey].push(row);
      return acc;
    }, {});
  }, [rows]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filteredAndSortedRows = useMemo(() => {
    return rows
      .filter((row) => {
        // Status filter
        if (statusFilter !== "all" && row.deliveryReceiptStatus !== statusFilter) {
          return false;
        }

        // Omni Search
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const drKey = row.pickListNumber ? `DR-${row.pickListNumber.replace(/^PL-/, "")}` : `TX-${row.transactionNumber}`;
        const searchCorpus = `${drKey} ${row.transactionNumber} ${row.pickListNumber ?? ""} ${row.itemCode} ${row.itemName} ${row.lotNumber} ${row.fromLocationLabel} ${row.customerPartyName ?? ""} ${row.performedByUserId ?? ""}`.toLowerCase();
        return searchCorpus.includes(q);
      })
      .sort((a, b) => {
        const getDrKey = (r: OutgoingLedgerRow) => (r.pickListNumber ? `DR-${r.pickListNumber.replace(/^PL-/, "")}` : `TX-${r.transactionNumber}`);

        if (sortField === "createdAt") {
          const timeA = new Date(a.createdAt).getTime();
          const timeB = new Date(b.createdAt).getTime();
          return sortDir === "asc" ? timeA - timeB : timeB - timeA;
        }

        if (sortField === "qty") {
          return sortDir === "asc" ? a.qty - b.qty : b.qty - a.qty;
        }

        let valA = sortField === "drKey" ? getDrKey(a) : ((a[sortField as keyof OutgoingLedgerRow] as string) || "");
        let valB = sortField === "drKey" ? getDrKey(b) : ((b[sortField as keyof OutgoingLedgerRow] as string) || "");

        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [rows, searchQuery, statusFilter, sortField, sortDir]);

  const totalDispatchedQty = useMemo(() => {
    return filteredAndSortedRows.reduce((sum, r) => sum + r.qty, 0);
  }, [filteredAndSortedRows]);

  const selectedRows = selectedDrNumber ? drGroups[selectedDrNumber] ?? [] : [];
  const activeDrMeta = selectedRows[0];

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="opacity-40" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp size={14} className="text-brand-navy font-bold" />
    ) : (
      <ArrowDown size={14} className="text-brand-navy font-bold" />
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Search & Filter Toolbar ────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 lg:flex-row lg:items-center lg:justify-between">
        {/* Omni Search Box */}
        <div className="relative flex-1 min-w-[280px]">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by DR #, Transaction #, Item Code, Lot #, Location, Customer…"
            className="h-11 w-full rounded-xl border border-outline-variant/40 bg-surface-light-grey/40 pl-10 pr-10 font-body text-body-sm text-on-surface placeholder:text-text-grey focus:border-brand-navy focus:bg-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-grey hover:text-on-surface"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* DR Status Dropdown */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
            <span className="font-label text-label-xs uppercase text-text-grey">DR Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "uploaded" | "missing")}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All DR Statuses</option>
              <option value="uploaded">Uploaded</option>
              <option value="missing">Missing</option>
            </select>
          </div>

          {(searchQuery || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 font-label text-label-xs font-bold text-status-held hover:bg-status-held/10"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Stats ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 text-body-sm text-text-grey px-1">
        <span>Showing <strong className="text-on-surface">{filteredAndSortedRows.length}</strong> transactions</span>
        <span>&bull;</span>
        <span>Total Units Dispatched: <strong className="font-mono text-on-surface">{totalDispatchedQty.toLocaleString()}</strong></span>
      </div>

      {/* ── Main Outgoing Ledger Table ─────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-2">
        {filteredAndSortedRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md font-semibold text-on-surface">No outgoing transactions match your filter.</p>
            <p className="mt-1 font-body text-body-sm text-text-grey">Try adjusting your search terms or DR status.</p>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey select-none">
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("createdAt")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Date/Time</span>
                      {renderSortIcon("createdAt")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("drKey")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Delivery Receipt #</span>
                      {renderSortIcon("drKey")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("deliveryReceiptStatus")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>DR Status</span>
                      {renderSortIcon("deliveryReceiptStatus")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    DR / POD Upload
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("transactionNumber")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Transaction #</span>
                      {renderSortIcon("transactionNumber")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("itemCode")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Item Code</span>
                      {renderSortIcon("itemCode")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("itemName")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Item Name</span>
                      {renderSortIcon("itemName")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Lot Number
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("qty")}
                      className="flex items-center justify-end gap-1 font-bold uppercase hover:text-brand-navy w-full"
                    >
                      <span>Qty</span>
                      {renderSortIcon("qty")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    From Location
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Pick List #
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("customerPartyName")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Customer Organization</span>
                      {renderSortIcon("customerPartyName")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Performed By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {filteredAndSortedRows.map((row) => {
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
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-navy/30 bg-surface-white px-3 font-label text-body-xs font-bold text-brand-navy hover:bg-brand-navy/5"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            Upload
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-text-grey">
                        {row.transactionNumber}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">
                        {row.itemCode}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        {row.itemName}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-text-grey">
                        {row.lotNumber}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-mono-md font-bold text-on-surface">
                        {row.qty.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-text-grey">
                        {row.fromLocationLabel}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-text-grey">
                        {row.pickListNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-on-surface">
                        {row.customerPartyName ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-body text-body-md text-text-grey">
                        <span title={row.performedByUserId}>{row.performedByDisplayName ?? row.performedByUserId}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (< 768px) */}
            <div className="divide-y divide-outline-variant/30 md:hidden">
              {filteredAndSortedRows.map((row) => {
                const drKey = row.pickListNumber
                  ? `DR-${row.pickListNumber.replace(/^PL-/, "")}`
                  : `TX-${row.transactionNumber}`;
                const groupCount = drGroups[drKey]?.length ?? 1;

                return (
                  <div key={row.transactionId} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedDrNumber(drKey)}
                            className="font-mono text-title-sm font-bold text-brand-navy hover:underline"
                          >
                            {drKey}
                          </button>
                          {groupCount > 1 && (
                            <span className="rounded-full bg-brand-navy/10 px-2 py-0.5 font-label text-label-xs font-semibold text-brand-navy">
                              {groupCount} items
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 font-body text-body-sm font-semibold text-on-surface">
                          {row.customerPartyName ?? "Customer not recorded"}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 font-label text-label-xs font-bold ${
                          row.deliveryReceiptStatus === "uploaded"
                            ? "bg-status-available/15 text-status-available"
                            : "bg-status-pending/15 text-status-pending"
                        }`}
                      >
                        {row.deliveryReceiptStatus === "uploaded" ? "DR Uploaded" : "DR Missing"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-light-grey/60 p-2.5 font-mono text-body-xs">
                      <div>
                        <span className="text-text-grey block text-mono-xs uppercase">Item Code</span>
                        <span className="font-bold text-on-surface">{row.itemCode}</span>
                      </div>
                      <div>
                        <span className="text-text-grey block text-mono-xs uppercase">Dispatched Qty</span>
                        <span className="font-bold text-brand-navy">{row.qty.toLocaleString()} PCS</span>
                      </div>
                      <div>
                        <span className="text-text-grey block text-mono-xs uppercase">Lot Number</span>
                        <span className="text-on-surface">{row.lotNumber}</span>
                      </div>
                      <div>
                        <span className="text-text-grey block text-mono-xs uppercase">From Location</span>
                        <span className="text-on-surface">{row.fromLocationLabel}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-body-xs text-text-grey">
                        {row.createdAt.toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedDrNumber(drKey)}
                        className="inline-flex h-9 items-center rounded-lg border border-outline-variant/60 bg-surface-white px-3 font-label text-label-xs font-bold text-brand-navy hover:bg-surface-light-grey"
                      >
                        View DR Details &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── DR Group Items Modal ───────────────────────────────────────── */}
      {selectedDrNumber && activeDrMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-surface-white shadow-elevation-5 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-light-grey px-6 py-4">
              <div>
                <span className="font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                  Delivery Receipt Details
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
                <span className="text-text-grey block">Customer:</span>
                <strong className="text-on-surface">{activeDrMeta.customerPartyName ?? "—"}</strong>
              </div>
              <div>
                <span className="text-text-grey block">Pick List:</span>
                <strong className="font-mono text-on-surface">{activeDrMeta.pickListNumber ?? "—"}</strong>
              </div>
              <div>
                <span className="text-text-grey block">Dispatched Date:</span>
                <strong className="text-on-surface">{activeDrMeta.createdAt.toLocaleDateString()}</strong>
              </div>
              <div>
                <span className="text-text-grey block">Total Items:</span>
                <strong className="text-on-surface">{selectedRows.length} Line Items</strong>
              </div>
            </div>

            {/* Table of items inside this DR */}
            <div className="flex-1 overflow-y-auto p-6">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                    <th className="px-4 py-2 font-label text-label uppercase text-text-grey">Item Code</th>
                    <th className="px-4 py-2 font-label text-label uppercase text-text-grey">Item Name</th>
                    <th className="px-4 py-2 font-label text-label uppercase text-text-grey">Lot Number</th>
                    <th className="px-4 py-2 font-label text-label uppercase text-text-grey text-right">Dispatched Qty</th>
                    <th className="px-4 py-2 font-label text-label uppercase text-text-grey">From Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
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
            <div className="flex items-center justify-end border-t border-outline-variant/30 bg-surface-light-grey px-6 py-4">
              <button
                type="button"
                onClick={() => setSelectedDrNumber(null)}
                className="rounded-xl bg-brand-navy px-5 py-2.5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 focus:outline-none"
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
