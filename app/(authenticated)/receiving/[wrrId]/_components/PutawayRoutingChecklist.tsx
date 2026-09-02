"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, CheckSquare, Square, MapPin } from "lucide-react";
import type { WrrPutawayAllocationRow } from "@/lib/db/queries/receiving";

interface PutawayRoutingChecklistProps {
  wrrId: string;
  wrrNumber: string;
  allocations: WrrPutawayAllocationRow[];
}

export function PutawayRoutingChecklist({
  wrrId,
  allocations,
}: PutawayRoutingChecklistProps) {
  const storageKey = `putaway_checklist_${wrrId}`;

  // Local state initialized from localStorage if available
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setCheckedIds(JSON.parse(saved));
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, [storageKey]);

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore localStorage write errors
      }
      return next;
    });
  };

  const markAllChecked = () => {
    const all: Record<string, boolean> = {};
    allocations.forEach((alloc) => {
      all[alloc.id] = true;
    });
    setCheckedIds(all);
    try {
      localStorage.setItem(storageKey, JSON.stringify(all));
    } catch {
      // Ignore
    }
  };

  if (allocations.length === 0) {
    return null;
  }

  const totalTasks = allocations.length;
  const completedTasks = allocations.filter((a) => checkedIds[a.id]).length;
  const isAllComplete = totalTasks > 0 && completedTasks === totalTasks;
  const percent = Math.round((completedTasks / totalTasks) * 100);

  return (
    <div className="space-y-4">
      {/* Progress & Quick Actions Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-light-grey/60 p-4">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-brand-navy" />
            <span className="font-heading text-body-md font-bold text-on-surface">
              Putaway Progress: {completedTasks} of {totalTasks} Shelved ({percent}%)
            </span>
          </div>
          <p className="mt-0.5 font-body text-body-xs text-text-grey">
            Check off each rack location as boxes are physically placed onto the shelves.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isAllComplete && (
            <button
              type="button"
              onClick={markAllChecked}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-navy/30 bg-surface-white px-3 py-1.5 font-label text-label-xs font-bold text-brand-navy hover:bg-brand-navy/5 active:scale-[0.98]"
            >
              <CheckSquare size={14} />
              Mark All Shelved
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-light-grey">
        <div
          className={`h-full transition-all duration-300 ${
            isAllComplete ? "bg-status-available" : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* 100% complete banner */}
      {isAllComplete && (
        <div className="flex items-center gap-2.5 rounded-xl border border-status-available/40 bg-status-available/10 p-3 text-status-available">
          <CheckCircle2 size={20} className="shrink-0" />
          <p className="font-label text-body-sm font-bold">
            100% Putaway Complete! All boxes are physically stored in their assigned racks.
          </p>
        </div>
      )}

      {/* Tabular List Table (Dense & Clean) */}
      <div className="overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface-white">
        <table className="w-full border-collapse text-left font-body text-body-sm">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
              <th className="w-12 px-4 py-3 text-center font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Shelved
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Target Location
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Item Code
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Lot Number
              </th>
              <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Quantity
              </th>
              <th className="px-4 py-3 text-center font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {allocations.map((alloc) => {
              const isChecked = Boolean(checkedIds[alloc.id]);
              const isInspection = alloc.locationType === "inspection";
              const spq = Number(alloc.spq) || 1;
              const isPalletUom = (alloc.uom || "").toLowerCase() === "pallet";
              const uomLabel = isPalletUom ? "PCS" : alloc.uom || "PCS";
              const totalPcs = alloc.qty * spq;

              return (
                <tr
                  key={alloc.id}
                  onClick={() => toggleCheck(alloc.id)}
                  className={`cursor-pointer transition-colors ${
                    isChecked
                      ? "bg-status-available/5 hover:bg-status-available/10"
                      : "hover:bg-surface-light-grey/50"
                  }`}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3 text-center align-middle">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCheck(alloc.id);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                      aria-label={`Mark ${alloc.locationLabel} as shelved`}
                    >
                      {isChecked ? (
                        <div className="flex h-6 w-6 items-center justify-center rounded bg-status-available text-surface-white">
                          <CheckSquare size={16} className="stroke-[2.5]" />
                        </div>
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded border-2 border-outline-variant/80 bg-surface-white hover:border-brand-navy">
                          <Square size={14} className="text-text-grey/40" />
                        </div>
                      )}
                    </button>
                  </td>

                  {/* Target Location */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-mono-md font-bold text-brand-navy">
                        {alloc.locationLabel}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-label text-label-xs font-bold uppercase ${
                          isInspection
                            ? "bg-amber-100 text-amber-900"
                            : "bg-brand-royal-blue/10 text-brand-royal-blue"
                        }`}
                      >
                        {isInspection ? "QA Hold" : "Storage"}
                      </span>
                    </div>
                  </td>

                  {/* Item Code */}
                  <td className="px-4 py-3 font-mono font-bold text-on-surface">
                    {alloc.itemCode ?? "Item"}
                  </td>

                  {/* Lot Number */}
                  <td className="px-4 py-3 font-mono text-on-surface">
                    {alloc.lotNumber}
                  </td>

                  {/* Stored Quantity */}
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono font-bold block text-on-surface">
                      {alloc.qty} Box{alloc.qty === 1 ? "" : "es"}
                    </span>
                    {spq > 1 && !isPalletUom && (
                      <span className="font-mono text-body-xs text-text-grey">
                        ({totalPcs.toLocaleString()} {uomLabel})
                      </span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-label text-label-xs font-bold uppercase ${
                        isChecked
                          ? "bg-status-available/15 text-status-available"
                          : "bg-status-pending/15 text-status-pending"
                      }`}
                    >
                      {isChecked ? "✅ Shelved" : "To Shelve"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
