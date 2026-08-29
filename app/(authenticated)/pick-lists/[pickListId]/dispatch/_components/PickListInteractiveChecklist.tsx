"use client";

import React, { useState } from "react";
import { CheckCircle2, CheckSquare, Square, Box, Check, ArrowRight } from "lucide-react";
import type { PickListItemRow } from "@/lib/db/queries/withdrawals";

interface PickListInteractiveChecklistProps {
  items: PickListItemRow[];
  selectionCountByLine: Record<string, number>;
  alreadyDispatched: boolean;
  onQuickPickLine?: (itemId: string, requiredBoxes: number) => void;
  reportShortageForm?: (item: PickListItemRow, scannedCount: number) => React.ReactNode;
}

export function PickListInteractiveChecklist({
  items,
  selectionCountByLine,
  alreadyDispatched,
  reportShortageForm,
}: PickListInteractiveChecklistProps) {
  // Local floor checklist state for physical picking
  const [checkedLines, setCheckedLines] = useState<Record<string, boolean>>({});

  const toggleCheck = (id: string) => {
    setCheckedLines((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const markAllChecked = () => {
    const allChecked: Record<string, boolean> = {};
    items.forEach((item) => {
      allChecked[item.id] = true;
    });
    setCheckedLines(allChecked);
  };

  const totalLines = items.length;
  const physicallyCheckedCount = items.filter(
    (item) => checkedLines[item.id] || (selectionCountByLine[item.id] ?? 0) >= item.numberOfBoxes
  ).length;

  return (
    <div className="space-y-4">
      {/* Floor Checklist Progress Header */}
      {!alreadyDispatched && totalLines > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#EDF2FF] p-3">
          <div className="flex items-center gap-2">
            <span className="font-label text-label-xs font-bold uppercase text-brand-navy">
              Floor Picking Checklist:
            </span>
            <span className="font-mono text-body-sm font-bold text-on-surface">
              {physicallyCheckedCount} of {totalLines} items picked
            </span>
          </div>
          <button
            type="button"
            onClick={markAllChecked}
            className="inline-flex items-center gap-1 rounded-lg border border-brand-navy/30 bg-surface-white px-3 py-1 font-label text-label-xs font-bold text-brand-navy hover:bg-brand-navy/5 focus:outline-none"
          >
            <CheckSquare size={14} />
            Check All Items
          </button>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-3">
        {items.map((item) => {
          const scannedCount = selectionCountByLine[item.id] ?? 0;
          const scanComplete = scannedCount === item.numberOfBoxes;
          const isPhysicallyChecked = Boolean(checkedLines[item.id] || scanComplete);

          return (
            <div
              key={item.id}
              className={`flex items-start gap-3.5 rounded-xl border p-4 transition-colors ${
                isPhysicallyChecked
                  ? "border-status-available/40 bg-status-available/5"
                  : "border-outline-variant/30 bg-surface-white hover:bg-surface-light-grey/40"
              }`}
            >
              {/* Interactive Checkbox for floor operators */}
              {!alreadyDispatched ? (
                <button
                  type="button"
                  onClick={() => toggleCheck(item.id)}
                  className="mt-0.5 shrink-0 rounded text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  aria-label={`Mark ${item.itemCode} as picked`}
                >
                  {isPhysicallyChecked ? (
                    <CheckSquare size={26} className="text-status-available font-bold" />
                  ) : (
                    <Square size={26} className="text-text-grey hover:text-on-surface" />
                  )}
                </button>
              ) : (
                <div className="mt-0.5 shrink-0">
                  <CheckCircle2 size={24} className="text-status-available" />
                </div>
              )}

              {/* Line Details */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-title-md font-bold text-on-surface">
                      {item.itemCode}
                    </span>
                    {item.customerItemCode && (
                      <span className="font-mono text-body-sm text-text-grey">
                        (Cust: {item.customerItemCode})
                      </span>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-label text-label-xs font-bold uppercase ${
                      scanComplete
                        ? "bg-status-available/15 text-status-available"
                        : isPhysicallyChecked
                        ? "bg-brand-royal-blue/15 text-brand-royal-blue"
                        : "bg-status-pending/15 text-status-pending"
                    }`}
                  >
                    {scanComplete ? "Scanned & Verified" : isPhysicallyChecked ? "Marked Picked" : "To Pick"}
                  </span>
                </div>

                <p className="mt-1 font-body text-body-md text-on-surface">
                  {item.itemDescription ?? item.itemCode}
                </p>

                {/* Lot, Qty & Location Grid */}
                <div className="mt-2.5 grid grid-cols-2 gap-2 font-mono text-body-sm sm:grid-cols-4">
                  <div className="rounded-lg bg-surface-light-grey/60 px-2.5 py-1.5">
                    <span className="text-text-grey block font-label text-mono-xs uppercase">Lot Number</span>
                    <span className="font-bold text-on-surface">{item.lotNumber}</span>
                  </div>
                  <div className="rounded-lg bg-surface-light-grey/60 px-2.5 py-1.5">
                    <span className="text-text-grey block font-label text-mono-xs uppercase">Location</span>
                    <span className="font-bold text-brand-navy">{item.locationLabel}</span>
                  </div>
                  <div className="rounded-lg bg-surface-light-grey/60 px-2.5 py-1.5">
                    <span className="text-text-grey block font-label text-mono-xs uppercase">Pick Qty</span>
                    <span className="font-bold text-on-surface">{item.qty.toLocaleString()} PCS</span>
                  </div>
                  <div className="rounded-lg bg-surface-light-grey/60 px-2.5 py-1.5">
                    <span className="text-text-grey block font-label text-mono-xs uppercase">Boxes</span>
                    <span className="font-bold text-on-surface">{scannedCount} / {item.numberOfBoxes} scanned</span>
                  </div>
                </div>

                {/* Shortage Reporting Form if passed */}
                {reportShortageForm && reportShortageForm(item, scannedCount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
