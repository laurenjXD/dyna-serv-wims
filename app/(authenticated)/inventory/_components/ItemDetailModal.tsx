"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Package,
  Layers,
  Calendar,
  Building2,
  Barcode,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  FileText,
  User,
  ShieldCheck,
  Clock,
  History,
  Info,
  QrCode,
  Tag,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Truck,
  Search,
  CalendarDays,
  SlidersHorizontal,
  Filter,
} from "lucide-react";
import type { GroupedItem } from "./StockViewFilterableRegister";
import { getItemAuditDetailAction } from "../_actions";
import type { ItemDetail } from "@/lib/db/queries/items";
import type { ItemMovementRow } from "@/lib/db/queries/inventory";
import { LotQrViewer } from "./LotQrViewer";

interface ItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupedItem: GroupedItem | null;
}

export function ItemDetailModal({ isOpen, onClose, groupedItem }: ItemDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"specs" | "stock" | "movements">("specs");
  const [loading, setLoading] = useState(false);
  const [itemDetail, setItemDetail] = useState<ItemDetail | null>(null);
  const [movements, setMovements] = useState<ItemMovementRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Movement tab interactive filters
  const [movementDateFilter, setMovementDateFilter] = useState<string>("");
  const [movementTypeFilter, setMovementTypeFilter] = useState<"all" | "inbound" | "outbound" | "transfer">("all");
  const [movementSearch, setMovementSearch] = useState<string>("");
  const [isDailyTrailGrouped, setIsDailyTrailGrouped] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen && groupedItem) {
      setLoading(true);
      setError(null);
      getItemAuditDetailAction(groupedItem.itemId)
        .then((res) => {
          if (res.ok && res.item) {
            setItemDetail(res.item);
            setMovements(res.movements || []);
          } else {
            setError(res.error || "Failed to load master item details");
          }
        })
        .catch((err) => {
          setError(err?.message || "Failed to fetch item data");
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setItemDetail(null);
      setMovements([]);
      setActiveTab("specs");
      setMovementDateFilter("");
      setMovementTypeFilter("all");
      setMovementSearch("");
    }
  }, [isOpen, groupedItem]);

  if (!isOpen || !groupedItem) return null;

  const totalBoxes = groupedItem.boxesOnHand;
  const effectiveSpq = itemDetail?.spq ?? groupedItem.spq ?? 1;
  const totalUnits = groupedItem.totalQty ?? totalBoxes * effectiveSpq;
  const uom = (itemDetail?.uom || groupedItem.uom || "PCS").toUpperCase();
  const currency = itemDetail?.currency || "USD";

  // Financial & Pricing calculations
  const unitBuyingPrice = itemDetail?.buyingPrice ? Number(itemDetail.buyingPrice) : null;
  const unitSellingPrice = itemDetail?.sellingPrice ? Number(itemDetail.sellingPrice) : null;
  const boxBuyingPrice = unitBuyingPrice !== null ? unitBuyingPrice * effectiveSpq : null;
  const boxSellingPrice = unitSellingPrice !== null ? unitSellingPrice * effectiveSpq : null;
  const marginPercent =
    unitBuyingPrice !== null && unitSellingPrice !== null && unitBuyingPrice > 0
      ? (((unitSellingPrice - unitBuyingPrice) / unitBuyingPrice) * 100).toFixed(1)
      : null;
  const totalStockCostValuation = unitBuyingPrice !== null ? unitBuyingPrice * totalUnits : null;
  const totalStockSellingValuation = unitSellingPrice !== null ? unitSellingPrice * totalUnits : null;

  // Filtered movements logic
  const filteredMovements = movements.filter((txn) => {
    // 1. Date filter (format: YYYY-MM-DD)
    if (movementDateFilter) {
      const txnDateStr = new Date(txn.createdAt).toISOString().slice(0, 10);
      if (txnDateStr !== movementDateFilter) return false;
    }
    // 2. Type filter
    if (movementTypeFilter === "inbound") {
      if (txn.movementType !== "receive" && txn.movementType !== "putaway") return false;
    } else if (movementTypeFilter === "outbound") {
      if (txn.movementType !== "pick" && txn.movementType !== "dispatch") return false;
    } else if (movementTypeFilter === "transfer") {
      if (
        txn.movementType === "receive" ||
        txn.movementType === "putaway" ||
        txn.movementType === "pick" ||
        txn.movementType === "dispatch"
      ) {
        return false;
      }
    }
    // 3. Search filter
    if (movementSearch.trim()) {
      const term = movementSearch.toLowerCase().trim();
      const match =
        txn.transactionNumber?.toLowerCase().includes(term) ||
        txn.lotNumber?.toLowerCase().includes(term) ||
        txn.wrrNumber?.toLowerCase().includes(term) ||
        txn.pickListNumber?.toLowerCase().includes(term) ||
        txn.commercialInvoiceNo?.toLowerCase().includes(term) ||
        txn.arReferenceNo?.toLowerCase().includes(term) ||
        txn.fromLocationLabel?.toLowerCase().includes(term) ||
        txn.toLocationLabel?.toLowerCase().includes(term) ||
        txn.performedByUserName?.toLowerCase().includes(term);
      if (!match) return false;
    }
    return true;
  });

  // Calculate filtered totals
  let filteredInBoxes = 0;
  let filteredOutBoxes = 0;
  for (const txn of filteredMovements) {
    if (txn.movementType === "receive" || txn.movementType === "putaway") {
      filteredInBoxes += txn.qty;
    } else if (txn.movementType === "pick" || txn.movementType === "dispatch") {
      filteredOutBoxes += txn.qty;
    }
  }
  const filteredNetBoxes = filteredInBoxes - filteredOutBoxes;
  const filteredInUnits = filteredInBoxes * effectiveSpq;
  const filteredOutUnits = filteredOutBoxes * effectiveSpq;
  const filteredNetUnits = filteredNetBoxes * effectiveSpq;

  // Group by date for Daily History Trail
  const dailyGroups = (() => {
    const map = new Map<
      string,
      {
        date: string;
        dateObj: Date;
        inBoxes: number;
        outBoxes: number;
        txns: ItemMovementRow[];
      }
    >();
    for (const txn of filteredMovements) {
      const dateKey = new Date(txn.createdAt).toLocaleDateString("en-CA"); // YYYY-MM-DD
      let group = map.get(dateKey);
      if (!group) {
        group = {
          date: dateKey,
          dateObj: new Date(txn.createdAt),
          inBoxes: 0,
          outBoxes: 0,
          txns: [],
        };
        map.set(dateKey, group);
      }
      if (txn.movementType === "receive" || txn.movementType === "putaway") {
        group.inBoxes += txn.qty;
      } else if (txn.movementType === "pick" || txn.movementType === "dispatch") {
        group.outBoxes += txn.qty;
      }
      group.txns.push(txn);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.dateObj.getTime() - a.dateObj.getTime(),
    );
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-surface-white shadow-2xl">
        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#F8FAFF] px-6 py-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-surface-white shadow-sm">
              <Package size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="item-modal-title" className="font-mono text-lg font-bold text-brand-navy truncate">
                  {groupedItem.itemCode}
                </h2>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                    groupedItem.inventoryModel === "VMI"
                      ? "bg-blue-50 text-blue-800 border border-blue-200"
                      : groupedItem.inventoryModel === "TRADING"
                      ? "bg-slate-100 text-slate-900 border border-slate-300"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                >
                  {groupedItem.inventoryModel}
                </span>
                {groupedItem.isPerishable && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200 uppercase">
                    FEFO Perishable
                  </span>
                )}
                {itemDetail?.isActive === false && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                    Inactive
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm font-medium text-slate-700 truncate" title={groupedItem.itemName}>
                {groupedItem.itemName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-navy transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="flex border-b border-slate-200 bg-surface-white px-6">
          <button
            type="button"
            onClick={() => setActiveTab("specs")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === "specs"
                ? "border-brand-navy text-brand-navy"
                : "border-transparent text-text-grey hover:text-slate-800"
            }`}
          >
            <Info size={14} /> Master Specifications
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stock")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === "stock"
                ? "border-brand-navy text-brand-navy"
                : "border-transparent text-text-grey hover:text-slate-800"
            }`}
          >
            <Layers size={14} /> Live Stock & Lots ({groupedItem.lots.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("movements")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === "movements"
                ? "border-brand-navy text-brand-navy"
                : "border-transparent text-text-grey hover:text-slate-800"
            }`}
          >
            <History size={14} /> Movement History & Audit ({movements.length})
          </button>
        </div>

        {/* ── Modal Body Content ── */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#FAFAFA]/60">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-text-grey">
              <RefreshCw size={24} className="animate-spin text-brand-navy" />
              <p className="text-sm font-medium">Loading item master data and ledger transactions…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 flex items-center gap-3">
              <AlertTriangle size={20} className="shrink-0 text-rose-600" />
              <div>
                <p className="font-bold text-sm">Error Loading Details</p>
                <p className="text-xs">{error}</p>
              </div>
            </div>
          ) : (
            <>
              {/* ── Tab 1: Master Specifications & Dimensions ── */}
              {activeTab === "specs" && (
                <div className="space-y-6">
                  {/* Identifiers Grid */}
                  <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm space-y-4">
                    <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-brand-navy flex items-center gap-2">
                      <Barcode size={15} /> Master Identifiers & Hierarchy
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-text-grey font-medium">Dyna-Serv Item Code</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5">{itemDetail?.code || groupedItem.itemCode}</p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Master Barcode</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5 flex items-center gap-1">
                          <Barcode size={13} className="text-slate-400" />
                          {itemDetail?.barcode || "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Customer Item Code (PN)</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5">
                          {itemDetail?.customerItemCode || "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Supplier Item Code</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5">
                          {itemDetail?.supplierItemCode || "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">DSGC Item Number</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5">
                          {itemDetail?.dsgcItemNumber || "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Category</span>
                        <p className="font-medium text-slate-900 mt-0.5">{groupedItem.categoryName || "—"}</p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Subcategory</span>
                        <p className="font-medium text-slate-900 mt-0.5">{groupedItem.subcategoryName || "—"}</p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Organization / Vendor</span>
                        <p className="font-medium text-slate-900 mt-0.5 flex items-center gap-1 truncate">
                          <Building2 size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">{groupedItem.organizationName || groupedItem.customerName || "—"}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Packaging & Volumetric Dimensions */}
                  <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm space-y-4">
                    <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-brand-navy flex items-center gap-2">
                      <Package size={15} /> Packaging, Dimensions & Weight
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-text-grey font-medium">Enrolled Unit of Measure (UOM)</span>
                        <p className="font-mono font-bold text-brand-navy mt-0.5 uppercase">{uom}</p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">SPQ (Units per Box)</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5">
                          {effectiveSpq.toLocaleString()} {uom}/box
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Box Dimensions (L × W × H)</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5">
                          {itemDetail?.lengthCm ? `${itemDetail.lengthCm} × ${itemDetail.widthCm} × ${itemDetail.heightCm} cm` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Gross Volume (CBM per Box)</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5">
                          {itemDetail?.volumeCbm ? `${Number(itemDetail.volumeCbm).toFixed(4)} CBM` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Boxes per Standard Pallet</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5">
                          {itemDetail?.boxesPerPallet ? `${itemDetail.boxesPerPallet} boxes` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Gross Weight per Box</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5">
                          {itemDetail?.weightKg ? `${itemDetail.weightKg} kg` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">SPQ Meterage (if Roll)</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5">
                          {itemDetail?.spqMeter ? `${itemDetail.spqMeter} m/roll` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Item Type</span>
                        <p className="font-medium text-slate-900 mt-0.5 capitalize">{itemDetail?.itemType || "Standard"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Pricing, Valuation & Rate Structure */}
                  <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/30 p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
                      <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-2">
                        <Tag size={15} className="text-emerald-700" /> Reference Pricing & Inventory Valuation
                      </h3>
                      <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        Currency: {currency}
                      </span>
                    </div>

                    {/* Pricing KPI Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                      {/* Buying Price (Unit) */}
                      <div className="rounded-xl border border-slate-200/80 bg-surface-white p-3.5 shadow-sm">
                        <span className="text-[11px] font-medium text-text-grey block">Buying Price (per {uom})</span>
                        <p className="font-mono text-lg font-bold text-slate-900 mt-1">
                          {unitBuyingPrice !== null ? `${currency} ${unitBuyingPrice.toFixed(4)}` : "—"}
                        </p>
                        {boxBuyingPrice !== null && (
                          <span className="text-[10px] font-mono text-text-grey block mt-0.5">
                            ≈ {currency} {boxBuyingPrice.toFixed(2)} / box
                          </span>
                        )}
                      </div>

                      {/* Selling Price (Unit) */}
                      <div className="rounded-xl border border-slate-200/80 bg-surface-white p-3.5 shadow-sm">
                        <span className="text-[11px] font-medium text-text-grey block">Selling Price (per {uom})</span>
                        <p className="font-mono text-lg font-bold text-brand-navy mt-1">
                          {unitSellingPrice !== null ? `${currency} ${unitSellingPrice.toFixed(4)}` : "—"}
                        </p>
                        {boxSellingPrice !== null && (
                          <span className="text-[10px] font-mono text-text-grey block mt-0.5">
                            ≈ {currency} {boxSellingPrice.toFixed(2)} / box
                          </span>
                        )}
                      </div>

                      {/* Gross Margin % */}
                      <div className="rounded-xl border border-slate-200/80 bg-surface-white p-3.5 shadow-sm">
                        <span className="text-[11px] font-medium text-text-grey block">Est. Margin / Markup</span>
                        <p className="font-mono text-lg font-bold text-emerald-700 mt-1">
                          {marginPercent !== null ? `+${marginPercent}%` : "—"}
                        </p>
                        <span className="text-[10px] text-text-grey block mt-0.5">
                          {marginPercent !== null ? "Ref spread" : "No pricing baseline"}
                        </span>
                      </div>

                      {/* Total On-Hand Stock Valuation */}
                      <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 p-3.5 shadow-sm">
                        <span className="text-[11px] font-bold text-emerald-900 block">Total Stock Valuation</span>
                        <p className="font-mono text-lg font-bold text-emerald-950 mt-1">
                          {totalStockCostValuation !== null
                            ? `${currency} ${totalStockCostValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : totalStockSellingValuation !== null
                            ? `${currency} ${totalStockSellingValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "—"}
                        </p>
                        <span className="text-[10px] font-mono text-emerald-800 block mt-0.5">
                          {totalUnits.toLocaleString()} {uom} on hand
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Valuation & Inventory Rules */}
                  <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm space-y-4">
                    <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-brand-navy flex items-center gap-2">
                      <Tag size={15} /> Thresholds, Flow Classification & Metadata
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-text-grey font-medium">Inventory Model / Flow</span>
                        <p className="font-mono font-bold text-brand-navy mt-0.5 uppercase">
                          {groupedItem.inventoryModel}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Minimum Safety Reorder Level</span>
                        <p className="font-mono font-bold text-slate-900 mt-0.5">
                          {itemDetail?.minReorderLevel ? `${itemDetail.minReorderLevel.toLocaleString()} ${uom}` : "0 (No threshold)"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Perishability / Expiry (FEFO)</span>
                        <p className="font-semibold text-slate-900 mt-0.5">
                          {groupedItem.isPerishable ? "Yes — Mandatory Expiry Date Required" : "No (Standard FIFO)"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">VMI Movement Category</span>
                        <p className="font-medium text-slate-900 mt-0.5 uppercase">
                          {itemDetail?.vmiMovementCategory || "Uncategorized"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Enrolled Since</span>
                        <p className="font-mono text-slate-700 mt-0.5">
                          {itemDetail?.createdAt ? new Date(itemDetail.createdAt).toLocaleDateString() : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Last Modified</span>
                        <p className="font-mono text-slate-700 mt-0.5">
                          {itemDetail?.updatedAt ? new Date(itemDetail.updatedAt).toLocaleDateString() : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-grey font-medium">Active Master Status</span>
                        <p className="font-semibold text-emerald-700 mt-0.5">
                          {itemDetail?.isActive !== false ? "Active for Operations" : "Inactive"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 2: Live Stock & Lots Breakdown ── */}
              {activeTab === "stock" && (
                <div className="space-y-6">
                  {/* Stock Position KPI Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="rounded-2xl border border-blue-200/80 bg-blue-50/60 p-3.5 shadow-sm">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900 block truncate">Total Boxes</span>
                      <p className="font-mono text-xl font-bold text-brand-navy mt-1">
                        {totalBoxes.toLocaleString()}{" "}
                        <span className="text-xs font-normal text-text-grey">boxes</span>
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-3.5 shadow-sm">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 block truncate">Total Quantity</span>
                      <p className="font-mono text-xl font-bold text-emerald-800 mt-1">
                        {totalUnits.toLocaleString()}{" "}
                        <span className="text-xs font-normal text-text-grey">{uom}</span>
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-3.5 shadow-sm">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 block truncate">Stock Valuation</span>
                      <p className="font-mono text-xl font-bold text-emerald-900 mt-1 truncate" title={totalStockCostValuation ? `${currency} ${totalStockCostValuation.toFixed(2)}` : "—"}>
                        {totalStockCostValuation !== null
                          ? `${currency} ${totalStockCostValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                          : totalStockSellingValuation !== null
                          ? `${currency} ${totalStockSellingValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-3.5 shadow-sm">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block truncate">Occupied Space</span>
                      <p className="font-mono text-xl font-bold text-slate-900 mt-1">
                        {Number(groupedItem.cbmOccupied || 0).toFixed(3)}{" "}
                        <span className="text-xs font-normal text-text-grey">CBM</span>
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-3.5 shadow-sm">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block truncate">Active Lots</span>
                      <p className="font-mono text-xl font-bold text-brand-navy mt-1">
                        {groupedItem.lots.length}{" "}
                        <span className="text-xs font-normal text-text-grey">lots active</span>
                      </p>
                    </div>
                  </div>

                  {/* Active Lots Table */}
                  <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm space-y-4">
                    <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-brand-navy flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Layers size={15} /> Active Storage Lots & QR Codes
                      </span>
                      <span className="text-text-grey font-mono text-xs">{groupedItem.lots.length} lot records</span>
                    </h3>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-bold uppercase">
                            <th className="py-2.5 px-3">Lot Number</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Locations</th>
                            <th className="py-2.5 px-3 text-right">Available Boxes</th>
                            <th className="py-2.5 px-3 text-right">Total Units</th>
                            <th className="py-2.5 px-3">Manufacture Date</th>
                            <th className="py-2.5 px-3">Expiry Date</th>
                            <th className="py-2.5 px-3 text-right">QR Label</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-body">
                          {groupedItem.lots.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-6 text-center text-text-grey italic">
                                No active stock lots currently on hand.
                              </td>
                            </tr>
                          ) : (
                            groupedItem.lots.map((lot) => {
                              const lotUnits = lot.availableQty * effectiveSpq;
                              return (
                                <tr key={lot.lotId} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-3 px-3 font-mono font-bold text-brand-navy">{lot.lotNumber}</td>
                                  <td className="py-3 px-3">
                                    <span
                                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                        lot.lotStatus === "available"
                                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : lot.lotStatus === "hold"
                                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                                          : "bg-rose-50 text-rose-700 border border-rose-200"
                                      }`}
                                    >
                                      {lot.lotStatus}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                      {lot.locationLabels?.join(", ") || "—"}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                                    {lot.availableQty.toLocaleString()}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono font-bold text-brand-navy">
                                    {lotUnits.toLocaleString()} {uom}
                                  </td>
                                  <td className="py-3 px-3 font-mono text-slate-700">
                                    {lot.receivedAt ? new Date(lot.receivedAt).toLocaleDateString() : "—"}
                                  </td>
                                  <td className="py-3 px-3 font-mono text-slate-700">
                                    {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString() : "—"}
                                  </td>
                                  <td className="py-3 px-3 text-right">
                                    <LotQrViewer
                                      lotId={lot.lotId}
                                      lotNumber={lot.lotNumber}
                                      itemCode={groupedItem.itemCode}
                                      compact
                                    />
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 3: Movement History & Person in Charge Audit Ledger ── */}
              {activeTab === "movements" && (
                <div className="space-y-5">
                  {/* Filter & Search Toolbar */}
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Left: Date Filter & Presets */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-surface-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs shadow-sm">
                          <CalendarDays size={14} className="text-brand-navy shrink-0" />
                          <input
                            type="date"
                            value={movementDateFilter}
                            onChange={(e) => setMovementDateFilter(e.target.value)}
                            aria-label="Filter by specific date"
                            className="bg-transparent font-mono text-xs text-slate-800 focus:outline-none"
                          />
                          {movementDateFilter && (
                            <button
                              type="button"
                              onClick={() => setMovementDateFilter("")}
                              className="ml-1 text-[11px] font-bold text-slate-400 hover:text-slate-700"
                              title="Clear date filter"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setMovementDateFilter("")}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                              !movementDateFilter
                                ? "bg-brand-navy text-surface-white shadow-sm"
                                : "bg-surface-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            All Time
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const todayStr = new Date().toLocaleDateString("en-CA");
                              setMovementDateFilter(todayStr);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                              movementDateFilter === new Date().toLocaleDateString("en-CA")
                                ? "bg-brand-navy text-surface-white shadow-sm"
                                : "bg-surface-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            Today
                          </button>
                        </div>
                      </div>

                      {/* Right: View Mode Toggle & Search */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={movementSearch}
                            onChange={(e) => setMovementSearch(e.target.value)}
                            placeholder="Search lot, doc #, operator..."
                            className="h-8 w-48 rounded-xl border border-slate-200 bg-surface-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                          />
                        </div>

                        <div className="flex rounded-xl border border-slate-200 bg-surface-white p-0.5 shadow-sm">
                          <button
                            type="button"
                            onClick={() => setIsDailyTrailGrouped(true)}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                              isDailyTrailGrouped
                                ? "bg-brand-navy text-surface-white shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Daily Trail
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsDailyTrailGrouped(false)}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                              !isDailyTrailGrouped
                                ? "bg-brand-navy text-surface-white shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Flat Log
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Movement Type Filter Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/60">
                      <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                        <Filter size={12} /> Movement Type:
                      </span>
                      {[
                        { id: "all", label: "All Movements" },
                        { id: "inbound", label: "Inbound / Received" },
                        { id: "outbound", label: "Outbound / Dispatched" },
                        { id: "transfer", label: "Internal Transfers" },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setMovementTypeFilter(tab.id as typeof movementTypeFilter)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                            movementTypeFilter === tab.id
                              ? "bg-brand-navy text-surface-white shadow-sm"
                              : "bg-surface-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Summary Metric Cards for Filtered Range */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-900">
                        <span>Received (Inbound)</span>
                        <ArrowDownRight size={16} className="text-emerald-700" />
                      </div>
                      <p className="font-mono text-lg font-bold text-emerald-800 mt-1">
                        +{filteredInBoxes.toLocaleString()} <span className="text-xs font-normal">boxes</span>
                      </p>
                      <p className="font-mono text-xs text-emerald-700 mt-0.5">
                        +{filteredInUnits.toLocaleString()} {uom}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-rose-900">
                        <span>Dispatched (Outbound)</span>
                        <ArrowUpRight size={16} className="text-rose-700" />
                      </div>
                      <p className="font-mono text-lg font-bold text-rose-800 mt-1">
                        -{filteredOutBoxes.toLocaleString()} <span className="text-xs font-normal">boxes</span>
                      </p>
                      <p className="font-mono text-xs text-rose-700 mt-0.5">
                        -{filteredOutUnits.toLocaleString()} {uom}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-blue-900">
                        <span>Net Range Delta</span>
                        <TrendingUp size={16} className="text-brand-navy" />
                      </div>
                      <p className="font-mono text-lg font-bold text-brand-navy mt-1">
                        {filteredNetBoxes >= 0 ? `+${filteredNetBoxes.toLocaleString()}` : filteredNetBoxes.toLocaleString()} <span className="text-xs font-normal">boxes</span>
                      </p>
                      <p className="font-mono text-xs text-blue-800 mt-0.5">
                        {filteredNetUnits >= 0 ? `+${filteredNetUnits.toLocaleString()}` : filteredNetUnits.toLocaleString()} {uom}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-purple-200/80 bg-purple-50/70 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-purple-900">
                        <span>Pack SPQ Factor</span>
                        <Package size={16} className="text-purple-700" />
                      </div>
                      <p className="font-mono text-lg font-bold text-purple-800 mt-1">
                        {effectiveSpq.toLocaleString()} <span className="text-xs font-normal">{uom}/box</span>
                      </p>
                      <p className="font-mono text-xs text-purple-700 mt-0.5">
                        Current On Hand: {totalBoxes.toLocaleString()} boxes
                      </p>
                    </div>
                  </div>

                  {/* Daily Trail Sections or Flat Table */}
                  {filteredMovements.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-surface-white p-12 text-center text-text-grey italic shadow-sm">
                      No inventory movements match the selected date or filter criteria.
                    </div>
                  ) : isDailyTrailGrouped ? (
                    <div className="space-y-4">
                      {dailyGroups.map((group) => {
                        const dayNetBoxes = group.inBoxes - group.outBoxes;
                        const dayInUnits = group.inBoxes * effectiveSpq;
                        const dayOutUnits = group.outBoxes * effectiveSpq;
                        const dayNetUnits = dayNetBoxes * effectiveSpq;

                        return (
                          <div
                            key={group.date}
                            className="rounded-2xl border border-slate-200/90 bg-surface-white overflow-hidden shadow-sm"
                          >
                            {/* Day Header Banner */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#F8FAFF] px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-navy text-surface-white">
                                  <CalendarDays size={14} />
                                </span>
                                <div>
                                  <span className="font-heading text-xs font-bold text-brand-navy">
                                    {group.dateObj.toLocaleDateString(undefined, {
                                      weekday: "long",
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </span>
                                  <span className="text-[11px] font-mono text-text-grey ml-2">
                                    ({group.txns.length} transactions)
                                  </span>
                                </div>
                              </div>

                              {/* Day KPI summary pill */}
                              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono font-bold">
                                {group.inBoxes > 0 && (
                                  <span className="rounded-md bg-emerald-100/70 text-emerald-800 px-2 py-0.5 border border-emerald-200">
                                    Recv: +{group.inBoxes} bx (+{dayInUnits.toLocaleString()} {uom})
                                  </span>
                                )}
                                {group.outBoxes > 0 && (
                                  <span className="rounded-md bg-rose-100/70 text-rose-800 px-2 py-0.5 border border-rose-200">
                                    Disp: -{group.outBoxes} bx (-{dayOutUnits.toLocaleString()} {uom})
                                  </span>
                                )}
                                <span className="rounded-md bg-blue-100/70 text-brand-navy px-2 py-0.5 border border-blue-200">
                                  Net: {dayNetBoxes >= 0 ? `+${dayNetBoxes}` : dayNetBoxes} bx ({dayNetUnits >= 0 ? `+${dayNetUnits.toLocaleString()}` : dayNetUnits.toLocaleString()} {uom})
                                </span>
                              </div>
                            </div>

                            {/* Day Ledger Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] text-slate-600 font-bold uppercase tracking-wider">
                                    <th className="py-2 px-3">Time</th>
                                    <th className="py-2 px-3">Txn Number</th>
                                    <th className="py-2 px-3">Movement Type</th>
                                    <th className="py-2 px-3">From → To</th>
                                    <th className="py-2 px-3 text-right">SPQ</th>
                                    <th className="py-2 px-3 text-right">Boxes</th>
                                    <th className="py-2 px-3 text-right">Total Qty</th>
                                    <th className="py-2 px-3">Reference Doc</th>
                                    <th className="py-2 px-3">Person in Charge</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-body">
                                  {group.txns.map((txn) => {
                                    const isInbound = txn.movementType === "receive" || txn.movementType === "putaway";
                                    const isOutbound = txn.movementType === "pick" || txn.movementType === "dispatch";
                                    const calculatedTotalQty = txn.qty * effectiveSpq;

                                    return (
                                      <tr key={txn.id} className="hover:bg-slate-50/70 transition-colors">
                                        {/* Time */}
                                        <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                                          {new Date(txn.createdAt).toLocaleTimeString(undefined, {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </td>

                                        {/* Txn Number & Lot */}
                                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                          <div>{txn.transactionNumber}</div>
                                          {txn.lotNumber && (
                                            <span className="text-[10px] font-normal text-text-grey">
                                              Lot: {txn.lotNumber}
                                            </span>
                                          )}
                                        </td>

                                        {/* Movement Type Badge */}
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                          <span
                                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                              isInbound
                                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                : isOutbound
                                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                                : "bg-blue-50 text-blue-700 border border-blue-200"
                                            }`}
                                          >
                                            {isInbound ? (
                                              <ArrowDownRight size={11} />
                                            ) : isOutbound ? (
                                              <ArrowUpRight size={11} />
                                            ) : (
                                              <RefreshCw size={10} />
                                            )}
                                            {txn.movementType}
                                          </span>
                                        </td>

                                        {/* From → To */}
                                        <td className="py-2.5 px-3 font-mono text-slate-800 whitespace-nowrap">
                                          <div className="flex items-center gap-1">
                                            {txn.fromLocationLabel ? (
                                              <>
                                                <span>{txn.fromLocationLabel}</span>
                                                <ArrowRight size={11} className="text-slate-400 shrink-0" />
                                                <span>{txn.toLocationLabel || "—"}</span>
                                              </>
                                            ) : (
                                              <>
                                                <ArrowRight size={11} className="text-slate-400 shrink-0" />
                                                <span>{txn.toLocationLabel || "Staging"}</span>
                                              </>
                                            )}
                                          </div>
                                        </td>

                                        {/* SPQ */}
                                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                                          {effectiveSpq.toLocaleString()}
                                        </td>

                                        {/* Boxes */}
                                        <td
                                          className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                                            isInbound
                                              ? "text-emerald-700"
                                              : isOutbound
                                              ? "text-rose-700"
                                              : "text-slate-900"
                                          }`}
                                        >
                                          {isInbound ? "+" : isOutbound ? "-" : ""}
                                          {txn.qty.toLocaleString()} bx
                                        </td>

                                        {/* Total Qty */}
                                        <td
                                          className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                                            isInbound
                                              ? "text-emerald-700"
                                              : isOutbound
                                              ? "text-rose-700"
                                              : "text-slate-900"
                                          }`}
                                        >
                                          {isInbound ? "+" : isOutbound ? "-" : ""}
                                          {calculatedTotalQty.toLocaleString()} {uom}
                                        </td>

                                        {/* Reference Document */}
                                        <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                                          {txn.wrrNumber ? (
                                            <span className="font-bold text-brand-navy">
                                              WRR: {txn.wrrNumber}
                                              {txn.commercialInvoiceNo && ` (${txn.commercialInvoiceNo})`}
                                            </span>
                                          ) : txn.pickListNumber ? (
                                            <span className="font-bold text-blue-700">
                                              Pick: {txn.pickListNumber}
                                              {txn.arReferenceNo && ` (${txn.arReferenceNo})`}
                                            </span>
                                          ) : (
                                            txn.arReferenceNo || txn.commercialInvoiceNo || "—"
                                          )}
                                        </td>

                                        {/* Person in Charge */}
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                              <User size={10} />
                                            </div>
                                            <div className="truncate">
                                              <p className="font-bold text-slate-800 text-[11px] truncate">
                                                {txn.performedByUserName || "System / Operator"}
                                              </p>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Flat Table View */
                    <div className="rounded-2xl border border-slate-200/90 bg-surface-white overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-bold uppercase">
                              <th className="py-2.5 px-3">Date / Time</th>
                              <th className="py-2.5 px-3">Txn Number</th>
                              <th className="py-2.5 px-3">Movement Type</th>
                              <th className="py-2.5 px-3">From → To</th>
                              <th className="py-2.5 px-3 text-right">SPQ</th>
                              <th className="py-2.5 px-3 text-right">Boxes</th>
                              <th className="py-2.5 px-3 text-right">Total Qty</th>
                              <th className="py-2.5 px-3">Reference Doc</th>
                              <th className="py-2.5 px-3">Person in Charge</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-body">
                            {filteredMovements.map((txn) => {
                              const isInbound = txn.movementType === "receive" || txn.movementType === "putaway";
                              const isOutbound = txn.movementType === "pick" || txn.movementType === "dispatch";
                              const calculatedTotalQty = txn.qty * effectiveSpq;

                              return (
                                <tr key={txn.id} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                                    {new Date(txn.createdAt).toLocaleString(undefined, {
                                      month: "short",
                                      day: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </td>
                                  <td className="py-3 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                    <div>{txn.transactionNumber}</div>
                                    {txn.lotNumber && (
                                      <span className="text-[10px] font-normal text-text-grey">
                                        Lot: {txn.lotNumber}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                                        isInbound
                                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : isOutbound
                                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                                          : "bg-blue-50 text-blue-700 border border-blue-200"
                                      }`}
                                    >
                                      {isInbound ? (
                                        <ArrowDownRight size={12} />
                                      ) : isOutbound ? (
                                        <ArrowUpRight size={12} />
                                      ) : (
                                        <RefreshCw size={11} />
                                      )}
                                      {txn.movementType}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 font-mono text-slate-800 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      {txn.fromLocationLabel ? (
                                        <>
                                          <span>{txn.fromLocationLabel}</span>
                                          <ArrowRight size={12} className="text-slate-400 shrink-0" />
                                          <span>{txn.toLocationLabel || "—"}</span>
                                        </>
                                      ) : (
                                        <>
                                          <ArrowRight size={12} className="text-slate-400 shrink-0" />
                                          <span>{txn.toLocationLabel || "Staging"}</span>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                                    {effectiveSpq.toLocaleString()}
                                  </td>
                                  <td
                                    className={`py-3 px-3 text-right font-mono font-bold whitespace-nowrap ${
                                      isInbound
                                        ? "text-emerald-700"
                                        : isOutbound
                                        ? "text-rose-700"
                                        : "text-slate-900"
                                    }`}
                                  >
                                    {isInbound ? "+" : isOutbound ? "-" : ""}
                                    {txn.qty.toLocaleString()} bx
                                  </td>
                                  <td
                                    className={`py-3 px-3 text-right font-mono font-bold whitespace-nowrap ${
                                      isInbound
                                        ? "text-emerald-700"
                                        : isOutbound
                                        ? "text-rose-700"
                                        : "text-slate-900"
                                    }`}
                                  >
                                    {isInbound ? "+" : isOutbound ? "-" : ""}
                                    {calculatedTotalQty.toLocaleString()} {uom}
                                  </td>
                                  <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                                    {txn.wrrNumber ? (
                                      <span className="font-bold text-brand-navy">
                                        WRR: {txn.wrrNumber}
                                        {txn.commercialInvoiceNo && ` (${txn.commercialInvoiceNo})`}
                                      </span>
                                    ) : txn.pickListNumber ? (
                                      <span className="font-bold text-blue-700">
                                        Pick: {txn.pickListNumber}
                                        {txn.arReferenceNo && ` (${txn.arReferenceNo})`}
                                      </span>
                                    ) : (
                                      txn.arReferenceNo || txn.commercialInvoiceNo || "—"
                                    )}
                                  </td>
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                        <User size={12} />
                                      </div>
                                      <div className="truncate">
                                        <p className="font-bold text-slate-800 truncate">
                                          {txn.performedByUserName || "System / Operator"}
                                        </p>
                                        <p className="text-[10px] font-mono text-text-grey truncate">
                                          ID: {txn.performedByUserId.slice(0, 8)}…
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-surface-white px-6 py-3.5">
          <span className="text-xs text-text-grey">
            Item ID: <span className="font-mono">{groupedItem.itemId}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-brand-navy px-5 py-2 text-xs font-bold text-surface-white hover:bg-brand-navy/90 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
