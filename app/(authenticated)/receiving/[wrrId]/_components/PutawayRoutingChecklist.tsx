"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2,
  CheckSquare,
  Square,
  MapPin,
  RotateCcw,
  Layers,
  Filter,
} from "lucide-react";
import type { WrrPutawayAllocationRow } from "@/lib/db/queries/receiving";

interface PutawayRoutingChecklistProps {
  wrrId: string;
  wrrNumber: string;
  allocations: WrrPutawayAllocationRow[];
}

type FilterStatus = "all" | "pending" | "shelved";

/**
 * Extracts an aisle or zone name from a location label or allocation row.
 * E.g. "A-01-02" -> "Aisle A", "B1-02" -> "Aisle B", "QA-BAY-1" -> "QA / Inspection Area"
 */
function getAisleGroup(alloc: WrrPutawayAllocationRow): string {
  const isInspection =
    alloc.locationType === "inspection" ||
    alloc.locationType === "hold" ||
    alloc.locationLabel.toLowerCase().includes("inspection") ||
    alloc.locationLabel.toLowerCase().includes("qa") ||
    alloc.locationLabel.toLowerCase().includes("hold");

  if (isInspection) {
    return "🔬 QA Hold / Inspection Area";
  }

  const label = alloc.locationLabel.trim();
  const aisleMatch = label.match(/^([A-Za-z]+)[-_0-9]/);
  if (aisleMatch && aisleMatch[1]) {
    return `📍 Aisle ${aisleMatch[1].toUpperCase()}`;
  }

  const part = label.split("-")[0];
  if (part && part.length <= 4) {
    return `📍 Zone ${part.toUpperCase()}`;
  }

  return "📍 General Storage Area";
}

export function PutawayRoutingChecklist({
  wrrId,
  allocations,
}: PutawayRoutingChecklistProps) {
  const storageKey = `putaway_checklist_${wrrId}`;

  // Local state initialized from localStorage if available
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [groupByAisle, setGroupByAisle] = useState<boolean>(true);

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

  const resetAllChecked = () => {
    setCheckedIds({});
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
  };

  const totalTasks = allocations.length;
  const completedTasks = allocations.filter((a) => checkedIds[a.id]).length;
  const pendingTasks = totalTasks - completedTasks;
  const isAllComplete = totalTasks > 0 && completedTasks === totalTasks;
  const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Filtered allocations
  const filteredAllocations = useMemo(() => {
    return allocations.filter((alloc) => {
      const isChecked = Boolean(checkedIds[alloc.id]);
      if (filter === "pending") return !isChecked;
      if (filter === "shelved") return isChecked;
      return true;
    });
  }, [allocations, checkedIds, filter]);

  // Group allocations by aisle / zone
  const groupedAllocations = useMemo(() => {
    if (!groupByAisle) {
      return { "All Locations": filteredAllocations };
    }

    const groups: Record<string, WrrPutawayAllocationRow[]> = {};
    for (const alloc of filteredAllocations) {
      const group = getAisleGroup(alloc);
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(alloc);
    }
    return groups;
  }, [filteredAllocations, groupByAisle]);

  if (allocations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Floor Checklist Progress Header (Unified Brand Style) */}
      <div className="rounded-xl bg-[#EDF2FF] p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-label text-label-xs font-bold uppercase text-brand-navy">
              Floor Putaway Checklist:
            </span>
            <span className="font-mono text-body-sm font-bold text-on-surface">
              {completedTasks} of {totalTasks} racks shelved ({percent}%)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!isAllComplete && (
              <button
                type="button"
                onClick={markAllChecked}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-navy/30 bg-surface-white px-3 py-1.5 font-label text-label-xs font-bold text-brand-navy hover:bg-brand-navy/5 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <CheckSquare size={14} />
                Mark All Shelved
              </button>
            )}
            {completedTasks > 0 && (
              <button
                type="button"
                onClick={resetAllChecked}
                className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/60 bg-surface-white px-2.5 py-1.5 font-label text-label-xs font-semibold text-text-grey hover:text-on-surface active:scale-[0.98] focus:outline-none"
                title="Reset local checklist progress"
              >
                <RotateCcw size={13} />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-brand-navy/15">
          <div
            className={`h-full transition-all duration-300 ${
              isAllComplete ? "bg-status-available" : "bg-brand-royal-blue"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* 100% Completion Celebration Banner */}
      {isAllComplete && (
        <div className="flex items-center gap-2.5 rounded-xl border border-status-available/40 bg-status-available/10 p-3.5 text-status-available">
          <CheckCircle2 size={22} className="shrink-0" />
          <p className="font-label text-body-sm font-bold">
            100% Putaway Complete! All received boxes have been physically placed into their assigned rack locations.
          </p>
        </div>
      )}

      {/* Filters & Route Grouping Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30 pb-3">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5">
          <Filter size={15} className="mr-1 text-text-grey" />
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-2.5 py-1 font-label text-label-xs font-bold transition-colors ${
              filter === "all"
                ? "bg-brand-navy text-surface-white"
                : "bg-surface-light-grey/70 text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
            }`}
          >
            All ({totalTasks})
          </button>
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`rounded-lg px-2.5 py-1 font-label text-label-xs font-bold transition-colors ${
              filter === "pending"
                ? "bg-status-pending text-surface-white"
                : "bg-surface-light-grey/70 text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
            }`}
          >
            To Shelve ({pendingTasks})
          </button>
          <button
            type="button"
            onClick={() => setFilter("shelved")}
            className={`rounded-lg px-2.5 py-1 font-label text-label-xs font-bold transition-colors ${
              filter === "shelved"
                ? "bg-status-available text-surface-white"
                : "bg-surface-light-grey/70 text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
            }`}
          >
            Shelved ({completedTasks})
          </button>
        </div>

        {/* Grouping Toggle */}
        <button
          type="button"
          onClick={() => setGroupByAisle((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-label text-label-xs font-bold transition-colors ${
            groupByAisle
              ? "border-brand-navy/40 bg-brand-navy/5 text-brand-navy"
              : "border-outline-variant/40 bg-surface-white text-text-grey hover:text-on-surface"
          }`}
        >
          <Layers size={14} />
          <span>{groupByAisle ? "Aisle Route Grouping: On" : "Flat List"}</span>
        </button>
      </div>

      {/* Empty State when filter matches 0 */}
      {filteredAllocations.length === 0 && (
        <div className="rounded-xl border border-dashed border-outline-variant/50 bg-surface-white p-8 text-center">
          <p className="font-body text-body-md text-text-grey">
            {filter === "shelved"
              ? "No items have been marked as shelved yet."
              : filter === "pending"
              ? "All items have been shelved! Great job."
              : "No putaway routing allocations found."}
          </p>
        </div>
      )}

      {/* Floor-First Card Layout (Grouped by Physical Route / Aisle) */}
      <div className="space-y-6">
        {Object.entries(groupedAllocations).map(([groupTitle, items]) => {
          if (items.length === 0) return null;

          const groupCompleted = items.filter((a) => checkedIds[a.id]).length;
          const groupTotal = items.length;

          return (
            <div key={groupTitle} className="space-y-3">
              {groupByAisle && (
                <div className="flex items-center justify-between border-b border-outline-variant/20 pb-1.5 pt-1">
                  <h3 className="font-heading text-body-md font-bold text-on-surface">
                    {groupTitle}
                  </h3>
                  <span className="font-mono text-body-xs font-semibold text-text-grey">
                    {groupCompleted} of {groupTotal} shelved
                  </span>
                </div>
              )}

              <div className="space-y-3">
                {items.map((alloc) => {
                  const isChecked = Boolean(checkedIds[alloc.id]);
                  const isInspection =
                    alloc.locationType === "inspection" ||
                    alloc.locationType === "hold" ||
                    alloc.locationLabel.toLowerCase().includes("inspection") ||
                    alloc.locationLabel.toLowerCase().includes("qa") ||
                    alloc.locationLabel.toLowerCase().includes("hold");

                  const spq = Number(alloc.spq) || 1;
                  const isPalletUom = (alloc.uom || "").toLowerCase() === "pallet";
                  const uomLabel = isPalletUom ? "PCS" : alloc.uom || "PCS";
                  const totalPcs = alloc.qty * spq;

                  return (
                    <div
                      key={alloc.id}
                      className={`flex items-start gap-3.5 rounded-xl border p-4 transition-all ${
                        isChecked
                          ? "border-status-available bg-status-available/10 shadow-sm"
                          : "border-outline-variant/30 bg-surface-white hover:bg-surface-light-grey/40"
                      }`}
                    >
                      {/* Interactive 48px Glove-Friendly Touch Target Button */}
                      <button
                        type="button"
                        onClick={() => toggleCheck(alloc.id)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                        aria-label={`Mark ${alloc.locationLabel} as shelved`}
                      >
                        {isChecked ? (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-available text-surface-white shadow-sm">
                            <CheckCircle2 size={22} className="stroke-[2.5]" />
                          </div>
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-outline-variant/80 bg-surface-white hover:border-brand-navy/60">
                            <Square size={20} className="text-text-grey/40" />
                          </div>
                        )}
                      </button>

                      {/* Card Content & Details */}
                      <div className="min-w-0 flex-1">
                        {/* Header Row: Destination Location, Badges & Status */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Destination Location Badge */}
                            <div className="flex items-center gap-1 rounded-lg bg-brand-navy/10 px-2.5 py-1 text-brand-navy">
                              <MapPin size={16} className="shrink-0 text-brand-navy" />
                              <span className="font-mono text-body-md font-bold">
                                {alloc.locationLabel}
                              </span>
                            </div>

                            {/* Disposition Pill */}
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label-xs font-bold uppercase tracking-wide ${
                                isInspection
                                  ? "border border-amber-300 bg-amber-100 text-amber-900"
                                  : "bg-brand-royal-blue/15 text-brand-royal-blue"
                              }`}
                            >
                              {isInspection ? "QA Hold / Inspection" : "Storage"}
                            </span>

                            {/* Item Code */}
                            <span className="font-mono text-body-md font-bold text-on-surface">
                              {alloc.itemCode ?? "Item"}
                            </span>
                          </div>

                          {/* Status Pill */}
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-label text-label-xs font-bold uppercase tracking-wide ${
                              isChecked
                                ? "bg-status-available/15 text-status-available"
                                : "bg-status-pending/15 text-status-pending"
                            }`}
                          >
                            {isChecked ? (
                              <>
                                <CheckCircle2 size={12} />
                                Shelved
                              </>
                            ) : (
                              "To Shelve"
                            )}
                          </span>
                        </div>

                        {/* Item Description if available */}
                        {alloc.itemName && (
                          <p className="mt-1 font-body text-body-md text-on-surface">
                            {alloc.itemName}
                          </p>
                        )}

                        {/* Structured 4-Metric Grid (2x2 on Mobile, 4-col on Desktop) */}
                        <div className="mt-2.5 grid grid-cols-2 gap-2 font-mono text-body-sm sm:grid-cols-4">
                          <div className="rounded-lg bg-surface-light-grey/60 px-2.5 py-1.5">
                            <span className="block font-label text-mono-xs uppercase text-text-grey">
                              Target Rack
                            </span>
                            <span className="font-bold text-brand-navy">
                              {alloc.locationLabel}
                            </span>
                          </div>

                          <div className="rounded-lg bg-surface-light-grey/60 px-2.5 py-1.5">
                            <span className="block font-label text-mono-xs uppercase text-text-grey">
                              Lot Number
                            </span>
                            <span className="font-bold text-on-surface">
                              {alloc.lotNumber}
                            </span>
                          </div>

                          <div className="rounded-lg bg-surface-light-grey/60 px-2.5 py-1.5">
                            <span className="block font-label text-mono-xs uppercase text-text-grey">
                              Allocated Boxes
                            </span>
                            <span className="font-bold text-on-surface">
                              {alloc.qty} Box{alloc.qty === 1 ? "" : "es"}
                            </span>
                          </div>

                          <div className="rounded-lg bg-surface-light-grey/60 px-2.5 py-1.5">
                            <span className="block font-label text-mono-xs uppercase text-text-grey">
                              Total Quantity
                            </span>
                            <span className="font-bold text-on-surface">
                              {totalPcs.toLocaleString()} {uomLabel}
                              {spq > 1 && !isPalletUom && (
                                <span className="ml-1 text-mono-xs font-normal text-text-grey">
                                  ({spq}/bx)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
