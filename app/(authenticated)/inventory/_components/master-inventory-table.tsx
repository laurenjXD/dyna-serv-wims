"use client";

import React, { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Package, MapPin, Layers, Scale } from "lucide-react";
import type { StockViewRow } from "@/lib/db/queries/inventory";

interface MasterInventoryTableProps {
  rows: StockViewRow[];
}

interface GroupedItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  isPerishable: boolean;
  minReorderLevel: number;
  spq: number;
  volumeCbm: number;
  totalAvailable: number;
  lots: StockViewRow[];
}

export function MasterInventoryTable({ rows }: MasterInventoryTableProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const groupedItems = useMemo(() => {
    const map = new Map<string, GroupedItem>();
    
    for (const row of rows) {
      if (!map.has(row.itemId)) {
        map.set(row.itemId, {
          itemId: row.itemId,
          itemCode: row.itemCode,
          itemName: row.itemName,
          uom: row.uom,
          isPerishable: row.isPerishable,
          minReorderLevel: row.minReorderLevel,
          spq: row.spq,
          volumeCbm: Number(row.volumeCbm),
          totalAvailable: 0,
          lots: [],
        });
      }
      const group = map.get(row.itemId)!;
      group.totalAvailable += (row.qtyRemaining - row.qtyCommitted);
      group.lots.push(row);
    }

    const result = Array.from(map.values());
    // Sort items by Item Code
    result.sort((a, b) => a.itemCode.localeCompare(b.itemCode));

    // Sort lots within each item (FEFO if perishable, else FIFO)
    for (const group of result) {
      group.lots.sort((a, b) => {
        if (group.isPerishable) {
          const dateA = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
          const dateB = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
          return dateA - dateB;
        }
        return new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
      });
    }

    return result;
  }, [rows]);

  const toggleRow = (itemId: string) => {
    setExpandedRowId((prev) => (prev === itemId ? null : itemId));
  };

  if (groupedItems.length === 0) {
    return (
      <div className="mt-6 rounded-md bg-white shadow-elevation-1 px-6 py-12 text-center border border-outline-variant/30">
        <Package size={48} strokeWidth={1.5} className="mx-auto text-on-surface-variant/50 mb-4" aria-hidden="true" />
        <p className="font-heading text-title-md font-semibold text-on-surface">
          No items found in master inventory
        </p>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">
          Receive items to populate the active stock view.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-md bg-white shadow-elevation-1 border border-outline-variant/30 animate-in fade-in duration-300">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/50 bg-surface-dim">
              <th className="w-12 px-4 py-3"></th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Item Code
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Item Name
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                UOM
              </th>
              <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Stock Level
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Status
              </th>
              <th className="sr-only px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {groupedItems.map((group) => {
              const isExpanded = expandedRowId === group.itemId;
              
              // Status derivation
              let statusLabel = "IN STOCK";
              let statusClass = "bg-primary-container text-on-primary-container";
              
              if (group.totalAvailable <= 0) {
                statusLabel = "OUT OF STOCK";
                statusClass = "bg-error-container text-error";
              } else if (group.totalAvailable <= group.minReorderLevel) {
                statusLabel = "LOW STOCK";
                statusClass = "bg-tertiary-container text-on-tertiary-container";
              }

              return (
                <React.Fragment key={group.itemId}>
                  {/* Collapsed Parent Row */}
                  <tr
                    onClick={() => toggleRow(group.itemId)}
                    className="hover:bg-surface-dim/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3 text-on-surface-variant">
                      {isExpanded ? (
                        <ChevronDown size={20} className="text-primary transition-transform" />
                      ) : (
                        <ChevronRight size={20} className="group-hover:text-primary transition-transform" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {group.itemCode}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface font-medium">
                      {group.itemName}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface uppercase">
                      {group.uom}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-mono-lg text-on-surface font-semibold">
                      {group.totalAvailable}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Action buttons reserved for future direct flows */}
                    </td>
                  </tr>

                  {/* Expanded Drill-down Details */}
                  {isExpanded && (
                    <tr className="bg-surface-container-highest">
                      <td colSpan={7} className="p-6 border-b border-outline-variant/30 shadow-inner">
                        <div className="flex flex-col gap-6 max-w-6xl mx-auto">
                          
                          {/* Top Info Cards */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-lg p-4 shadow-sm">
                              <p className="font-label text-label-sm uppercase text-on-surface-variant flex items-center gap-2 mb-2">
                                <Layers size={16} /> Packaging Metrics
                              </p>
                              <div className="grid grid-cols-2 gap-2 mt-3">
                                <div>
                                  <p className="font-label text-label-sm text-on-surface-variant">SPQ</p>
                                  <p className="font-mono text-body-md text-on-surface mt-1">{group.spq} {group.uom}/box</p>
                                </div>
                                <div>
                                  <p className="font-label text-label-sm text-on-surface-variant">Vol (CBM)</p>
                                  <p className="font-mono text-body-md text-on-surface mt-1">{group.volumeCbm.toFixed(4)}</p>
                                </div>
                              </div>
                            </div>

                            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-lg p-4 shadow-sm">
                              <p className="font-label text-label-sm uppercase text-on-surface-variant flex items-center gap-2 mb-2">
                                <Scale size={16} /> Valuation Preview
                              </p>
                              <div className="grid grid-cols-2 gap-2 mt-3">
                                <div>
                                  <p className="font-label text-label-sm text-on-surface-variant">Avg Unit Cost</p>
                                  {/* Using the first lot's cost as a naive preview for demo */}
                                  <p className="font-mono text-body-md text-on-surface mt-1">
                                    {group.lots[0]?.unitCost ? `$${Number(group.lots[0].unitCost).toFixed(2)}` : 'N/A'}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-label text-label-sm text-on-surface-variant">Reorder Lvl</p>
                                  <p className="font-mono text-body-md text-on-surface mt-1">{group.minReorderLevel}</p>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 justify-center">
                              <button type="button" className="flex h-11 items-center justify-center rounded bg-primary px-4 font-label text-label-md text-on-primary shadow-sm hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                                Generate Pick List
                              </button>
                              <button type="button" className="flex h-11 items-center justify-center rounded border border-outline-variant/50 bg-surface-container-lowest px-4 font-label text-label-md text-on-surface shadow-sm hover:bg-surface-dim active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                                Preview Allocation
                              </button>
                            </div>
                          </div>

                          {/* Stacked Location & Active Lots Breakdown Table */}
                          <div>
                            <h3 className="font-heading text-title-md font-semibold text-on-surface mb-3 flex items-center gap-2">
                              Stacked Location & Active Lots Breakdown
                              <span className="font-label text-label-sm uppercase bg-surface-dim text-on-surface-variant px-2 py-0.5 rounded-full">
                                {group.isPerishable ? "FEFO ORDER" : "FIFO ORDER"}
                              </span>
                            </h3>
                            <div className="overflow-x-auto rounded-lg bg-surface-container-lowest border border-outline-variant/50 shadow-sm">
                              <table className="w-full border-collapse">
                                <thead>
                                  <tr className="border-b border-outline-variant/30 bg-surface-dim">
                                    <th className="px-3 py-2 text-left font-label text-label-sm uppercase text-on-surface-variant whitespace-nowrap">Lot #</th>
                                    <th className="px-3 py-2 text-left font-label text-label-sm uppercase text-on-surface-variant whitespace-nowrap">Partition</th>
                                    <th className="px-3 py-2 text-left font-label text-label-sm uppercase text-on-surface-variant whitespace-nowrap">Location</th>
                                    <th className="px-3 py-2 text-left font-label text-label-sm uppercase text-on-surface-variant whitespace-nowrap">Expiry</th>
                                    <th className="px-3 py-2 text-right font-label text-label-sm uppercase text-on-surface-variant whitespace-nowrap">Pcs</th>
                                    <th className="px-3 py-2 text-right font-label text-label-sm uppercase text-on-surface-variant whitespace-nowrap">Boxes</th>
                                    <th className="px-3 py-2 text-right font-label text-label-sm uppercase text-on-surface-variant whitespace-nowrap">Total CBM</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-outline-variant/30">
                                  {group.lots.map((lot, idx) => {
                                    const available = lot.qtyRemaining - lot.qtyCommitted;
                                    // Pcs, Boxes, CBM derivation
                                    const boxes = group.spq > 0 ? Math.floor(available / group.spq) : 0;
                                    const remainder = group.spq > 0 ? available % group.spq : available;
                                    const volPerPc = group.spq > 0 ? group.volumeCbm / group.spq : group.volumeCbm;
                                    const totalCbm = (boxes * group.volumeCbm) + (remainder * volPerPc);
                                    
                                    return (
                                      <tr key={`${lot.lotId}-${lot.locationId}-${idx}`} className="hover:bg-surface-dim/30">
                                        <td className="px-3 py-2 font-mono text-body-sm text-on-surface">
                                          {lot.lotNumber}
                                        </td>
                                        <td className="px-3 py-2 font-body text-body-sm text-on-surface capitalize">
                                          {lot.flowType}
                                        </td>
                                        <td className="px-3 py-2">
                                          <div className="flex items-center gap-1 font-mono text-body-sm text-primary">
                                            <MapPin size={14} />
                                            {lot.locationLabel}
                                          </div>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-body-sm text-on-surface-variant">
                                          {lot.expiryDate ?? "-"}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-body-sm text-on-surface font-semibold">
                                          {available}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-body-sm text-on-surface-variant">
                                          {boxes}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-body-sm text-on-surface-variant">
                                          {totalCbm.toFixed(4)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>

                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
