"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, CheckSquare, Square, MapPin, ShieldAlert, ArrowRight } from "lucide-react";
import type { WrrPutawayAllocationRow } from "@/lib/db/queries/receiving";

interface PutawayRoutingChecklistProps {
  wrrId: string;
  wrrNumber: string;
  allocations: WrrPutawayAllocationRow[];
}

export function PutawayRoutingChecklist({
  wrrId,
  wrrNumber,
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
    <section aria-label="Putaway Routing Checklist" className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
      {/* Header & Progress */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-brand-navy" />
            <h3 className="font-heading text-title-md font-bold text-on-surface">
              Digital Putaway Routing Checklist
            </h3>
          </div>
          <p className="mt-0.5 font-body text-body-sm text-text-grey">
            Online floor routing for {wrrNumber}. Check off each storage rack or holding bay as items are physically shelved.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-body-sm font-bold text-brand-navy">
            {completedTasks} / {totalTasks} Shelved ({percent}%)
          </span>
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
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-light-grey">
        <div
          className={`h-full transition-all duration-300 ${
            isAllComplete ? "bg-status-available" : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* 100% complete celebratory banner */}
      {isAllComplete && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-status-available/40 bg-status-available/10 p-3 text-status-available">
          <CheckCircle2 size={20} className="shrink-0" />
          <p className="font-label text-body-sm font-bold">
            100% Physical Putaway Complete! All boxes are securely stored in their designated racks.
          </p>
        </div>
      )}

      {/* Task List Cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {allocations.map((alloc) => {
          const isChecked = Boolean(checkedIds[alloc.id]);
          const isInspection = alloc.locationType === "inspection";
          const spq = Number(alloc.spq) || 1;
          const totalPcs = alloc.qty * spq;

          return (
            <div
              key={alloc.id}
              onClick={() => toggleCheck(alloc.id)}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all active:scale-[0.99] ${
                isChecked
                  ? "border-status-available/40 bg-status-available/5"
                  : isInspection
                  ? "border-amber-300 bg-amber-50/40 hover:bg-amber-50/70"
                  : "border-outline-variant/30 bg-surface-white hover:bg-surface-light-grey/40"
              }`}
            >
              {/* Checkbox button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCheck(alloc.id);
                }}
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                aria-label={`Mark ${alloc.locationLabel} as shelved`}
              >
                {isChecked ? (
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-status-available text-surface-white shadow-sm">
                    <CheckSquare size={18} className="stroke-[2.5]" />
                  </div>
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded border-2 border-outline-variant/80 bg-surface-white hover:border-brand-navy">
                    <Square size={16} className="text-text-grey/40" />
                  </div>
                )}
              </button>

              {/* Task Details */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-title-md font-bold text-brand-navy">
                    {alloc.locationLabel}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-label text-label-xs font-bold uppercase ${
                      isInspection
                        ? "bg-amber-100 text-amber-900"
                        : "bg-brand-royal-blue/10 text-brand-royal-blue"
                    }`}
                  >
                    {isInspection ? "QA Hold" : "Storage"}
                  </span>
                </div>

                <p className="mt-1 font-mono text-body-sm font-bold text-on-surface">
                  {alloc.itemCode ?? "Item"} · Lot: {alloc.lotNumber}
                </p>

                <div className="mt-2 flex items-center justify-between font-body text-body-xs text-text-grey">
                  <span>
                    <strong>{alloc.qty} Box{alloc.qty === 1 ? "" : "es"}</strong> ({totalPcs.toLocaleString()} {alloc.uom || "PCS"})
                  </span>
                  <span className="font-label font-bold text-primary flex items-center gap-1">
                    {isChecked ? "✅ Shelved" : "To Shelve"} <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
