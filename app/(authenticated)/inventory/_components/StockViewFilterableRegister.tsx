"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import { LotQrViewer } from "./LotQrViewer";

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

export type AggregatedLot = {
  lotId: string;
  lotNumber: string;
  lotStatus: string;
  expiryDate: string | null;
  receivedAt: Date | string;
  locationLabels: string[];
  availableQty: number;
  priority: number;
};

export type GroupedItem = {
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  isPerishable: boolean;
  flowType: "vmi" | "trading" | "supplies";
  organizationId: string | null;
  availableQty: number;
  codes: string;
  lotNumbers: string;
  locationLabels: string;
  customerName: string | null;
  totalIn: number;
  totalOut: number;
  pcsOnHand: number;
  boxesOnHand: number;
  cbmOccupied: number;
  lots: AggregatedLot[];
};

type SortField =
  | "itemCode"
  | "itemName"
  | "customerName"
  | "totalIn"
  | "totalOut"
  | "pcsOnHand"
  | "boxesOnHand"
  | "cbmOccupied";

type SortDirection = "asc" | "desc";

export function StockViewFilterableRegister({ items }: { items: GroupedItem[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFlow, setSelectedFlow] = useState<string>("all");
  const [stockStatus, setStockStatus] = useState<"all" | "in_stock" | "zero_stock">("all");
  const [sortField, setSortField] = useState<SortField>("itemCode");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filteredAndSortedItems = useMemo(() => {
    return items
      .filter((item) => {
        // Flow filter
        if (selectedFlow !== "all" && item.flowType !== selectedFlow) {
          return false;
        }

        // Stock status filter
        if (stockStatus === "in_stock" && item.pcsOnHand <= 0) {
          return false;
        }
        if (stockStatus === "zero_stock" && item.pcsOnHand > 0) {
          return false;
        }

        // Omni-search
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const searchCorpus = `${item.itemCode} ${item.itemName} ${item.codes} ${item.lotNumbers} ${item.locationLabels} ${item.customerName} ${item.flowType}`.toLowerCase();
        return searchCorpus.includes(q);
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (typeof valA === "string") {
          valA = (valA || "").toLowerCase();
          valB = ((valB as string) || "").toLowerCase();
          return sortDir === "asc"
            ? (valA as string).localeCompare(valB as string)
            : (valB as string).localeCompare(valA as string);
        }

        const numA = Number(valA || 0);
        const numB = Number(valB || 0);
        return sortDir === "asc" ? numA - numB : numB - numA;
      });
  }, [items, searchQuery, selectedFlow, stockStatus, sortField, sortDir]);

  // Metric totals
  const totals = useMemo(() => {
    return filteredAndSortedItems.reduce(
      (acc, item) => {
        acc.pcs += item.pcsOnHand;
        acc.boxes += item.boxesOnHand;
        acc.cbm += item.cbmOccupied;
        return acc;
      },
      { pcs: 0, boxes: 0, cbm: 0 }
    );
  }, [filteredAndSortedItems]);

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
      {/* ── Filter & Search Toolbar ────────────────────────────────────── */}
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
            placeholder="Search by Item Code, Description, Lot #, Location, Customer…"
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

        {/* Quick Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Flow Type Filter */}
          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
            <span className="font-label text-label-xs uppercase text-text-grey">Flow:</span>
            <select
              value={selectedFlow}
              onChange={(e) => setSelectedFlow(e.target.value)}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Flows</option>
              <option value="vmi">VMI</option>
              <option value="trading">Trading</option>
              <option value="supplies">Supplies</option>
            </select>
          </div>

          {/* Stock Availability Filter */}
          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
            <span className="font-label text-label-xs uppercase text-text-grey">Stock:</span>
            <select
              value={stockStatus}
              onChange={(e) => setStockStatus(e.target.value as "all" | "in_stock" | "zero_stock")}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Stock Levels</option>
              <option value="in_stock">In Stock (&gt;0)</option>
              <option value="zero_stock">Zero Stock (=0)</option>
            </select>
          </div>

          {(searchQuery || selectedFlow !== "all" || stockStatus !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedFlow("all");
                setStockStatus("all");
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 font-label text-label-xs font-bold text-status-held hover:bg-status-held/10"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Stats Strip ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 text-body-sm text-text-grey px-1">
        <span>Showing <strong className="text-on-surface">{filteredAndSortedItems.length}</strong> items</span>
        <span>&bull;</span>
        <span>Total Available: <strong className="font-mono text-on-surface">{totals.pcs.toLocaleString()} PCS</strong></span>
        <span>&bull;</span>
        <span>Boxes: <strong className="font-mono text-on-surface">{totals.boxes.toLocaleString()}</strong></span>
        <span>&bull;</span>
        <span>Total CBM: <strong className="font-mono text-on-surface">{totals.cbm.toLocaleString(undefined, { maximumFractionDigits: 3 })} m³</strong></span>
      </div>

      {/* ── Main Inventory Table ──────────────────────────────────────── */}
      {filteredAndSortedItems.length === 0 ? (
        <div className="rounded-xl border border-outline-variant/40 bg-surface-white p-12 text-center shadow-elevation-1">
          <p className="font-body text-body-md font-semibold text-on-surface">No stock matches your search criteria.</p>
          <p className="mt-1 font-body text-body-sm text-text-grey">Try adjusting your filters or search terms.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant/50 bg-surface-white shadow-elevation-1">
          <div className="hidden overflow-x-auto md:block">
            <div className="min-w-[1500px]">
              {/* Header with Click-to-Sort Columns */}
              <div
                role="row"
                className="grid grid-cols-[1.15fr_1.8fr_1.5fr_1.35fr_1.55fr_1.55fr_0.8fr_0.9fr_0.95fr_1fr_1fr] gap-4 bg-[#EDF2FF] px-5 py-3 font-label text-label font-bold tracking-[0.04em] text-text-grey select-none"
              >
                <button
                  type="button"
                  onClick={() => handleSort("itemCode")}
                  className="flex items-center gap-1 text-left font-bold uppercase hover:text-brand-navy"
                >
                  <span>Item Code</span>
                  {renderSortIcon("itemCode")}
                </button>

                <button
                  type="button"
                  onClick={() => handleSort("itemName")}
                  className="flex items-center gap-1 text-left font-bold uppercase hover:text-brand-navy"
                >
                  <span>Description</span>
                  {renderSortIcon("itemName")}
                </button>

                <span>Codes</span>
                <span>Lot No.</span>
                <span>Location</span>

                <button
                  type="button"
                  onClick={() => handleSort("customerName")}
                  className="flex items-center gap-1 text-left font-bold uppercase hover:text-brand-navy"
                >
                  <span>Customer</span>
                  {renderSortIcon("customerName")}
                </button>

                <button
                  type="button"
                  onClick={() => handleSort("totalIn")}
                  className="flex items-center justify-end gap-1 font-bold uppercase hover:text-brand-navy"
                >
                  <span>Total In</span>
                  {renderSortIcon("totalIn")}
                </button>

                <button
                  type="button"
                  onClick={() => handleSort("totalOut")}
                  className="flex items-center justify-end gap-1 font-bold uppercase hover:text-brand-navy"
                >
                  <span>Total Out</span>
                  {renderSortIcon("totalOut")}
                </button>

                <button
                  type="button"
                  onClick={() => handleSort("pcsOnHand")}
                  className="flex items-center justify-end gap-1 font-bold uppercase hover:text-brand-navy"
                >
                  <span>SPQ</span>
                  {renderSortIcon("pcsOnHand")}
                </button>

                <button
                  type="button"
                  onClick={() => handleSort("boxesOnHand")}
                  className="flex items-center justify-end gap-1 font-bold uppercase hover:text-brand-navy"
                >
                  <span>Boxes</span>
                  {renderSortIcon("boxesOnHand")}
                </button>

                <button
                  type="button"
                  onClick={() => handleSort("cbmOccupied")}
                  className="flex items-center justify-end gap-1 font-bold uppercase hover:text-brand-navy"
                >
                  <span>CBM</span>
                  {renderSortIcon("cbmOccupied")}
                </button>
              </div>

              {/* Rows */}
              {filteredAndSortedItems.map((item) => (
                <details key={item.itemId} className="group border-t border-outline-variant/30">
                  <summary className="grid cursor-pointer list-none grid-cols-[1.15fr_1.8fr_1.5fr_1.35fr_1.55fr_1.55fr_0.8fr_0.9fr_0.95fr_1fr_1fr] gap-3 px-4 py-3 font-body text-body-sm text-on-surface outline-none transition-colors hover:bg-[#F7F9FF] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 items-center gap-2 font-heading font-bold">
                      <ChevronRight
                        size={18}
                        aria-hidden="true"
                        className="shrink-0 text-text-grey transition-transform group-open:rotate-90"
                      />
                      <span className="truncate">{item.itemCode}</span>
                    </span>
                    <span className="truncate">
                      {item.itemName}
                      <span className="ml-2 rounded bg-brand-navy/10 px-1.5 py-0.5 text-body-xs font-bold text-brand-navy">
                        {FLOW_LABELS[item.flowType]}
                      </span>
                    </span>
                    <span className="truncate text-text-grey" title={item.codes || undefined}>
                      {item.codes || "—"}
                    </span>
                    <span className="truncate text-text-grey" title={item.lotNumbers}>
                      {item.lotNumbers || "—"}
                    </span>
                    <span className="truncate text-text-grey" title={item.locationLabels}>
                      {item.locationLabels || "—"}
                    </span>
                    <span className="truncate text-text-grey" title={item.customerName || undefined}>
                      {item.customerName || "—"}
                    </span>
                    <span className="text-right font-mono text-mono-md text-on-surface">
                      {item.totalIn.toLocaleString()}
                    </span>
                    <span className="text-right font-mono text-mono-md text-on-surface">
                      {item.totalOut.toLocaleString()}
                    </span>
                    <span className="text-right font-mono text-mono-md font-bold text-on-surface">
                      {item.pcsOnHand.toLocaleString()}
                    </span>
                    <span className="text-right font-mono text-mono-md text-on-surface">
                      {item.boxesOnHand.toLocaleString()}
                    </span>
                    <span className="text-right font-mono text-mono-md text-on-surface">
                      {item.cbmOccupied.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    </span>
                  </summary>
                  <InventoryItemDetails item={item} />
                </details>
              ))}
            </div>
          </div>

          {/* Mobile responsive accordion view */}
          <div className="divide-y divide-outline-variant/30 md:hidden">
            {filteredAndSortedItems.map((item) => (
              <details key={item.itemId} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    size={21}
                    aria-hidden="true"
                    className="shrink-0 text-text-grey transition-transform group-open:rotate-90"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-title-md font-bold text-on-surface">
                      {item.itemCode}
                    </span>
                    <span className="mt-1 block truncate font-body text-body-sm text-text-grey">
                      {item.itemName} &bull; {item.lots.length} lot{item.lots.length === 1 ? "" : "s"}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-mono-sm text-text-grey">
                      <span>PCS: <strong className="text-on-surface">{item.pcsOnHand.toLocaleString()}</strong></span>
                      <span>Boxes: <strong className="text-on-surface">{item.boxesOnHand.toLocaleString()}</strong></span>
                      <span>CBM: <strong className="text-on-surface">{item.cbmOccupied.toLocaleString(undefined, { maximumFractionDigits: 3 })}</strong></span>
                    </span>
                  </span>
                </summary>
                <InventoryItemDetails item={item} />
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryItemDetails({ item }: { item: GroupedItem }) {
  return (
    <div className="border-t border-outline-variant/20 bg-[#F8FAFF] px-4 py-3 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-body text-body-sm text-text-grey">
          Lots are shown in {item.isPerishable ? "FEFO" : "FIFO"} order.
        </p>
        <div className="flex items-center gap-3">
          <span className="font-label text-mono-sm text-text-grey">
            {item.pcsOnHand.toLocaleString()} {item.uom} available
          </span>
          <Link
            href="/inventory?tab=pick-lists"
            className="inline-flex h-9 items-center rounded-lg bg-brand-navy px-3 font-label text-label-xs font-bold text-surface-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Create Pick List
          </Link>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {item.lots.map((lot) => (
          <details
            key={lot.lotId}
            className="group w-full max-w-[340px] rounded-lg border border-outline-variant/30 bg-surface-white shadow-elevation-1"
          >
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 py-1.5 outline-none transition-colors hover:bg-surface-light-grey/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-2.5">
                <ChevronDown
                  size={17}
                  aria-hidden="true"
                  className="shrink-0 text-text-grey transition-transform group-open:rotate-180"
                />
                <span className="truncate font-mono text-mono-md font-bold text-on-surface" title={lot.lotNumber}>
                  {lot.lotNumber}
                </span>
              </span>
              <span className="font-label text-label-xs font-bold text-primary group-open:hidden">
                View
              </span>
            </summary>
            <div className="border-t border-outline-variant/20 px-3 py-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-label text-label-xs font-bold text-text-grey">Lot details</p>
                <span className="rounded-full bg-brand-navy/10 px-2 py-0.5 font-label text-mono-xs font-bold text-brand-navy">
                  {item.isPerishable ? "FEFO" : "FIFO"} #{lot.priority}
                </span>
              </div>
              <p
                className="truncate font-body text-body-sm text-text-grey"
                title={lot.locationLabels.join(", ")}
              >
                {lot.locationLabels.length === 1
                  ? `Location ${lot.locationLabels[0]}`
                  : `Locations ${lot.locationLabels.join(", ")}`}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <dt className="font-label text-mono-xs uppercase text-text-grey">Available</dt>
                  <dd className="mt-0.5 font-body text-body-md text-on-surface">
                    {lot.availableQty.toLocaleString()} {item.uom}
                  </dd>
                </div>
                <div>
                  <dt className="font-label text-mono-xs uppercase text-text-grey">Expiry</dt>
                  <dd className="mt-0.5 truncate font-body text-body-md text-on-surface">
                    {lot.expiryDate ?? "Not dated"}
                  </dd>
                </div>
                <div>
                  <dt className="font-label text-mono-xs uppercase text-text-grey">Received</dt>
                  <dd className="mt-0.5 font-body text-body-md text-on-surface">
                    {new Date(lot.receivedAt).toLocaleDateString()}
                  </dd>
                </div>
                <div>
                  <dt className="font-label text-mono-xs uppercase text-text-grey">Status</dt>
                  <dd className="mt-0.5 truncate font-body text-body-md lowercase text-on-surface">
                    {lot.lotStatus}
                  </dd>
                </div>
              </dl>
              <LotQrViewer lotId={lot.lotId} lotNumber={lot.lotNumber} itemCode={item.itemCode} compact />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
