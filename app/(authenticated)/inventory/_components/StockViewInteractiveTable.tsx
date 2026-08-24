"use client";

import { useState } from "react";
import { ChevronRight, PlusCircle, Check } from "lucide-react";
import {
  MultiPickListBuilder,
  type CustomerOption,
  type PickListDraftLine,
} from "./MultiPickListBuilder";
import { LotQrViewer } from "./LotQrViewer";
import type { StockViewRow } from "@/lib/db/queries/inventory";

type AggregatedLot = {
  lotId: string;
  lotNumber: string;
  lotStatus: string;
  manufactureDate?: string | null;
  expiryDate: string | null;
  receivedAt: Date;
  locationLabels: string[];
  locationId: string;
  locationLabel: string;
  availableQty: number;
  priority: number;
  balanceId: string;
};

type GroupedItem = {
  itemId: string;
  itemCode: string;
  customerItemCode?: string | null;
  itemName: string;
  uom: string;
  spq: number;
  spqMeter?: string | number | null;
  isPerishable: boolean;
  flowType: "vmi" | "trading" | "supplies";
  organizationId: string | null;
  availableQty: number;
  lots: AggregatedLot[];
};

interface Props {
  rows: StockViewRow[];
  customers: CustomerOption[];
  createAction: (formData: FormData) => void;
  overrideAction: (formData: FormData) => void;
}

export function StockViewInteractiveTable({
  rows,
  customers,
  createAction,
}: Props) {
  const [draftLines, setDraftLines] = useState<PickListDraftLine[]>([]);

  const items = groupStockByItem(rows);

  function handleAddLotToDraft(item: GroupedItem, lot: AggregatedLot) {
    setDraftLines((prev) => {
      const existing = prev.find((l) => l.balanceId === lot.balanceId);
      if (existing) {
        // Increment by SPQ or 1
        const addStep = item.spq || 1;
        const newQty = Math.min(lot.availableQty, existing.qty + addStep);
        return prev.map((l) =>
          l.balanceId === lot.balanceId ? { ...l, qty: newQty } : l
        );
      }
      return [
        ...prev,
        {
          balanceId: lot.balanceId,
          itemId: item.itemId,
          itemCode: item.itemCode,
          customerItemCode: item.customerItemCode,
          itemDescription: item.itemName,
          lotId: lot.lotId,
          lotNumber: lot.lotNumber,
          locationId: lot.locationId,
          locationLabel: lot.locationLabel,
          qty: Math.min(lot.availableQty, item.spq || 1),
          spq: item.spq || 1,
          spqMeter: item.spqMeter,
          manufactureDate: lot.manufactureDate,
          uom: item.uom,
          flowType: item.flowType,
          availableQty: lot.availableQty,
        },
      ];
    });
  }

  function handleRemoveLine(balanceId: string) {
    setDraftLines((prev) => prev.filter((l) => l.balanceId !== balanceId));
  }

  function handleUpdateQty(balanceId: string, qty: number) {
    setDraftLines((prev) =>
      prev.map((l) => (l.balanceId === balanceId ? { ...l, qty } : l))
    );
  }

  function handleClearDraft() {
    setDraftLines([]);
  }

  return (
    <div className="space-y-6">
      {/* Top Multi-Item Pick List Builder Cart */}
      <MultiPickListBuilder
        customers={customers}
        createAction={createAction}
        draftLines={draftLines}
        onRemoveLine={handleRemoveLine}
        onUpdateQty={handleUpdateQty}
        onClearDraft={handleClearDraft}
      />

      {/* Main Stock View Table */}
      <div className="min-h-[500px] overflow-x-auto rounded border border-outline-variant bg-surface-white shadow-elevation-1">
        {items.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              No available stock is ready for allocation.
            </p>
            <p className="mt-2 font-body text-body-sm text-text-grey">
              Confirmed receipts appear here when their lots are available for picking.
            </p>
          </div>
        ) : (
          <div className="min-w-[760px] divide-y divide-outline-variant/30">
            <div className="grid grid-cols-[40px_210px_minmax(220px,1fr)_120px_150px_170px] items-center gap-x-3 bg-accent-indigo-50 px-5 py-3 font-label text-label font-semibold tracking-[0.04em] text-text-grey">
              <span aria-hidden="true" />
              <span>Item Code</span>
              <span>Name</span>
              <span>UOM</span>
              <span className="text-right">Stock Level</span>
              <span className="pl-6">Status</span>
            </div>
            {items.map((item) => (
              <details key={item.itemId} className="group" open>
                <summary className="grid cursor-pointer list-none grid-cols-[40px_210px_minmax(220px,1fr)_120px_150px_170px] items-center gap-x-3 px-5 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy hover:bg-surface-light-grey/40">
                  <ChevronRight
                    size={22}
                    aria-hidden="true"
                    className="text-text-grey transition-transform group-open:rotate-90"
                  />
                  <p className="font-mono text-mono-md font-bold text-on-surface">
                    {item.itemCode}
                  </p>
                  <p className="font-body text-body-md text-on-surface">
                    {item.itemName}
                  </p>
                  <p className="font-body text-body-md text-text-grey">
                    {item.uom}
                  </p>
                  <p className="text-right font-mono text-mono-lg font-bold text-on-surface">
                    {item.availableQty.toLocaleString()}
                  </p>
                  <span className="ml-6 inline-flex w-fit items-center rounded-full bg-on-surface px-3 py-1 font-label text-label tracking-[0.06em] text-surface-white">
                    ON HAND
                  </span>
                </summary>
                <div className="border-t border-outline-variant/30 bg-surface-light-grey/45 px-4 py-4 md:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <p className="font-body text-body-md text-text-grey">
                      Lots are shown in {item.isPerishable ? "FEFO" : "FIFO"} order. Click <strong>"+ Add to Pick List"</strong> to add this item code to your draft pick list.
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded border border-outline-variant/40 bg-surface-white">
                    <table className="w-full min-w-[1050px] border-collapse text-left font-body text-body-md">
                      <thead>
                        <tr className="border-b border-outline-variant bg-accent-indigo-50/60 font-label text-label font-bold text-text-grey uppercase">
                          <th className="px-3 py-2.5 text-right">Qty</th>
                          <th className="px-3 py-2.5 text-right">SPQ</th>
                          <th className="px-3 py-2.5 text-right">No. of Pckgs</th>
                          <th className="px-3 py-2.5 font-mono">ITEM CODE</th>
                          <th className="px-3 py-2.5 font-mono">CUST PN</th>
                          <th className="px-3 py-2.5">ITEM DESCRIPTION</th>
                          <th className="px-3 py-2.5 text-right">METERAGE</th>
                          <th className="px-3 py-2.5 font-mono">LOT NUMBER</th>
                          <th className="px-3 py-2.5 font-mono">MFG DATE</th>
                          <th className="px-3 py-2.5">LOCATION</th>
                          <th className="px-3 py-2.5 text-center">ADD TO PICK LIST</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/30 font-body text-body-sm">
                        {item.lots.map((lot) => {
                          const spq = item.spq || 1;
                          const numPckgs = Math.ceil(lot.availableQty / spq);
                          const isAdded = draftLines.some(
                            (l) => l.balanceId === lot.balanceId
                          );
                          return (
                            <tr
                              key={lot.lotId}
                              className="hover:bg-surface-light-grey/30"
                            >
                              <td className="px-3 py-2.5 text-right font-mono font-bold text-on-surface">
                                {lot.availableQty.toLocaleString()}{" "}
                                <span className="font-sans text-text-grey font-normal">
                                  {item.uom}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-on-surface">
                                {spq}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-on-surface">
                                {numPckgs}
                              </td>
                              <td className="px-3 py-2.5 font-mono font-bold text-on-surface">
                                {item.itemCode}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-text-grey">
                                {item.customerItemCode ?? "—"}
                              </td>
                              <td className="px-3 py-2.5 text-on-surface">
                                {item.itemName}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-text-grey">
                                {item.spqMeter ? `${item.spqMeter}m` : "—"}
                              </td>
                              <td className="px-3 py-2.5 font-mono font-bold text-on-surface">
                                {lot.lotNumber}
                                <span className="ml-2 inline-flex items-center rounded bg-on-surface px-1.5 py-0.5 font-label text-[10px] text-surface-white">
                                  {item.isPerishable ? "FEFO" : "FIFO"} #{lot.priority}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-text-grey">
                                {lot.manufactureDate
                                  ? new Date(lot.manufactureDate).toLocaleDateString()
                                  : "—"}
                              </td>
                              <td className="px-3 py-2.5 font-body text-on-surface">
                                {lot.locationLabels.join(", ")}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleAddLotToDraft(item, lot)}
                                  className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-label text-label font-bold transition-colors ${
                                    isAdded
                                      ? "bg-status-available/15 text-status-available"
                                      : "bg-brand-navy text-surface-white hover:bg-brand-navy/90"
                                  }`}
                                >
                                  {isAdded ? (
                                    <>
                                      <Check size={14} /> Added
                                    </>
                                  ) : (
                                    <>
                                      <PlusCircle size={14} /> + Add to Pick List
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function groupStockByItem(rows: StockViewRow[]): GroupedItem[] {
  const itemMap = new Map<
    string,
    {
      itemId: string;
      itemCode: string;
      customerItemCode?: string | null;
      itemName: string;
      uom: string;
      spq: number;
      spqMeter?: string | number | null;
      isPerishable: boolean;
      flowType: "vmi" | "trading" | "supplies";
      organizationId: string | null;
      lotMap: Map<string, { lot: AggregatedLot }>;
      insertionOrder: string[];
    }
  >();

  for (const row of rows) {
    const availableQty = row.qtyRemaining - row.qtyCommitted;

    let itemEntry = itemMap.get(row.itemId);
    if (!itemEntry) {
      itemEntry = {
        itemId: row.itemId,
        itemCode: row.itemCode,
        customerItemCode: row.customerItemCode ?? null,
        itemName: row.itemName,
        uom: row.uom,
        spq: row.spq || 1,
        spqMeter: row.spqMeter ?? null,
        isPerishable: row.isPerishable,
        flowType: row.flowType ?? "trading",
        organizationId: row.organizationId ?? null,
        lotMap: new Map(),
        insertionOrder: [],
      };
      itemMap.set(row.itemId, itemEntry);
    }

    let lotEntry = itemEntry.lotMap.get(row.lotId);
    if (!lotEntry) {
      itemEntry.insertionOrder.push(row.lotId);
      lotEntry = {
        lot: {
          balanceId: row.balanceId ?? `${row.lotId}:${row.locationId}`,
          lotId: row.lotId,
          lotNumber: row.lotNumber,
          lotStatus: row.lotStatus,
          manufactureDate: row.manufactureDate ?? null,
          expiryDate: row.expiryDate,
          receivedAt: row.receivedAt,
          locationId: row.locationId,
          locationLabel: row.locationLabel,
          locationLabels: [],
          availableQty: 0,
          priority: 0,
        },
      };
      itemEntry.lotMap.set(row.lotId, lotEntry);
    }

    lotEntry.lot.locationLabels.push(row.locationLabel);
    lotEntry.lot.availableQty += availableQty;
  }

  return [...itemMap.values()].map((entry) => {
    const lots = entry.insertionOrder.map((lotId, idx) => {
      const lot = entry.lotMap.get(lotId)!.lot;
      return { ...lot, priority: idx + 1 };
    });
    return {
      itemId: entry.itemId,
      itemCode: entry.itemCode,
      customerItemCode: entry.customerItemCode,
      itemName: entry.itemName,
      uom: entry.uom,
      spq: entry.spq,
      spqMeter: entry.spqMeter,
      isPerishable: entry.isPerishable,
      flowType: entry.flowType,
      organizationId: entry.organizationId,
      availableQty: lots.reduce((sum, l) => sum + l.availableQty, 0),
      lots,
    };
  });
}
