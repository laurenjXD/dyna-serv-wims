"use client";

import React, { useState } from "react";
import {
  FileCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
  MapPin,
  Send,
  Loader2,
  Sparkles,
} from "lucide-react";

export interface DispositionOption {
  value: "store_as_is" | "inspect_further" | "flag_for_review";
  label: string;
  badge: string;
  description: string;
  icon: typeof CheckCircle2;
  accentColor: string;
  selectedClasses: string;
}

const DISPOSITION_OPTIONS: DispositionOption[] = [
  {
    value: "store_as_is",
    label: "Store As-Is (Pass)",
    badge: "Recommended",
    description:
      "Articles verified sound and conforming. Releases lot immediately to primary storage location.",
    icon: CheckCircle2,
    accentColor: "text-emerald-600 bg-emerald-50 border-emerald-200",
    selectedClasses: "border-emerald-600 bg-emerald-50/50 shadow-sm ring-2 ring-emerald-600/20",
  },
  {
    value: "inspect_further",
    label: "Inspect Further (Hold)",
    badge: "Secondary Review",
    description:
      "Requires in-depth technical inspection or supervisor test. Retains lot in quarantine holding bay.",
    icon: Clock,
    accentColor: "text-amber-600 bg-amber-50 border-amber-200",
    selectedClasses: "border-amber-600 bg-amber-50/50 shadow-sm ring-2 ring-amber-600/20",
  },
  {
    value: "flag_for_review",
    label: "Flag for Review / Quarantine",
    badge: "Non-Conformance",
    description:
      "Defect or damage detected. Escalate to supervisor and vendor for disposition or RMA return.",
    icon: AlertTriangle,
    accentColor: "text-rose-600 bg-rose-50 border-rose-200",
    selectedClasses: "border-rose-600 bg-rose-50/50 shadow-sm ring-2 ring-rose-600/20",
  },
];

interface InspectionResolutionFormProps {
  inspectionId: string;
  qtyToInspect: number;
  itemUom: string;
  storageLocations: Array<{ id: string; label: string }>;
  onSubmitAction: (formData: FormData) => Promise<void>;
}

export function InspectionResolutionForm({
  inspectionId,
  qtyToInspect,
  itemUom,
  storageLocations,
  onSubmitAction,
}: InspectionResolutionFormProps) {
  const [selectedDisposition, setSelectedDisposition] = useState<
    "store_as_is" | "inspect_further" | "flag_for_review"
  >("store_as_is");

  const [inspectedQty, setInspectedQty] = useState(qtyToInspect);
  const [passedQty, setPassedQty] = useState(qtyToInspect);
  const [failedQty, setFailedQty] = useState(0);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allocations, setAllocations] = useState<Array<{ locationId: string; qty: number }>>([
    { locationId: "", qty: qtyToInspect },
  ]);

  // Auto-adjust quantities when disposition changes
  const handleDispositionSelect = (
    value: "store_as_is" | "inspect_further" | "flag_for_review",
  ) => {
    setSelectedDisposition(value);
    if (value === "store_as_is") {
      setPassedQty(inspectedQty);
      setFailedQty(0);
    } else if (value === "flag_for_review") {
      setPassedQty(0);
      setFailedQty(inspectedQty);
    }
  };

  const handleInspectedQtyChange = (val: number) => {
    const safeVal = Math.max(0, val);
    setInspectedQty(safeVal);
    if (selectedDisposition === "store_as_is") {
      setPassedQty(safeVal);
      setFailedQty(0);
    } else if (selectedDisposition === "flag_for_review") {
      setPassedQty(0);
      setFailedQty(safeVal);
    } else {
      setPassedQty(Math.min(passedQty, safeVal));
      setFailedQty(Math.max(0, safeVal - passedQty));
    }
  };

  const handlePassedQtyChange = (val: number) => {
    const safePassed = Math.max(0, val);
    setPassedQty(safePassed);
    setFailedQty(Math.max(0, inspectedQty - safePassed));
  };

  const handleFailedQtyChange = (val: number) => {
    const safeFailed = Math.max(0, val);
    setFailedQty(safeFailed);
    setPassedQty(Math.max(0, inspectedQty - safeFailed));
  };

  const allocationTotal = allocations.reduce((sum, allocation) => sum + (Number(allocation.qty) || 0), 0);
  const allocationsComplete =
    selectedDisposition !== "store_as_is" ||
    (allocationTotal === passedQty && passedQty > 0 && allocations.every((allocation) => allocation.locationId && allocation.qty > 0));

  const updateAllocation = (index: number, patch: Partial<{ locationId: string; qty: number }>) => {
    setAllocations((current) => current.map((allocation, allocationIndex) =>
      allocationIndex === index ? { ...allocation, ...patch } : allocation,
    ));
  };

  return (
    <form
      action={async (formData: FormData) => {
        setIsSubmitting(true);
        try {
          await onSubmitAction(formData);
        } finally {
          setIsSubmitting(false);
        }
      }}
      className="space-y-6"
    >
      {/* 1. Disposition Radio Cards */}
      <section
        aria-labelledby="disposition-heading"
        className="rounded-2xl border border-border bg-surface p-6 shadow-elevation-1"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck size={18} className="text-primary" />
            <h3
              id="disposition-heading"
              className="font-heading text-body-md font-bold text-text-primary"
            >
              1. Select Inspection Outcome &amp; Disposition
            </h3>
          </div>
          <span className="text-xs font-semibold text-text-secondary">
            Click to choose outcome
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {DISPOSITION_OPTIONS.map((option) => {
            const isSelected = selectedDisposition === option.value;
            const Icon = option.icon;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleDispositionSelect(option.value)}
                className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 text-left transition-all duration-200 hover:border-primary/40 active:scale-[0.99] ${
                  isSelected
                    ? option.selectedClasses
                    : "border-border bg-surface hover:bg-surface-light-grey/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${option.accentColor}`}
                    >
                      <Icon size={16} />
                    </span>
                    {isSelected ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-navy text-white">
                        <CheckCircle2 size={13} />
                      </span>
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-border" />
                    )}
                  </div>
                  <p className="mt-3 font-heading text-body-md font-bold text-text-primary">
                    {option.label}
                  </p>
                  <p className="mt-1 font-body text-xs text-text-secondary leading-relaxed">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Hidden input to pass value into server action */}
        <input type="hidden" name="disposition" value={selectedDisposition} />
      </section>

      {/* 2. Quantity Breakdown Matrix */}
      <section
        aria-labelledby="quantities-heading"
        className="rounded-2xl border border-border bg-surface p-6 shadow-elevation-1"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-primary" />
            <h3
              id="quantities-heading"
              className="font-heading text-body-md font-bold text-text-primary"
            >
              2. Inspection Quantities Breakdown
            </h3>
          </div>
          <span className="font-mono text-xs text-text-secondary">
            Lot Size: {qtyToInspect} {itemUom}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="inspectedQty"
              className="block font-label text-xs font-bold text-text-secondary uppercase tracking-wider"
            >
              Total Inspected
            </label>
            <input
              id="inspectedQty"
              name="inspectedQty"
              type="number"
              inputMode="numeric"
              min={0}
              max={qtyToInspect}
              value={inspectedQty}
              onChange={(e) => handleInspectedQtyChange(parseInt(e.target.value, 10) || 0)}
              className="mt-1.5 h-12 w-full rounded-xl border border-border bg-surface px-3.5 font-mono text-body-md font-bold text-text-primary shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label
              htmlFor="passedQty"
              className="block font-label text-xs font-bold text-emerald-700 uppercase tracking-wider"
            >
              Passed Quantity
            </label>
            <input
              id="passedQty"
              name="passedQty"
              type="number"
              inputMode="numeric"
              min={0}
              value={passedQty}
              onChange={(e) => handlePassedQtyChange(parseInt(e.target.value, 10) || 0)}
              className="mt-1.5 h-12 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3.5 font-mono text-body-md font-bold text-emerald-950 shadow-sm transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="failedQty"
              className="block font-label text-xs font-bold text-rose-700 uppercase tracking-wider"
            >
              Failed / Defective
            </label>
            <input
              id="failedQty"
              name="failedQty"
              type="number"
              inputMode="numeric"
              min={0}
              value={failedQty}
              onChange={(e) => handleFailedQtyChange(parseInt(e.target.value, 10) || 0)}
              className="mt-1.5 h-12 w-full rounded-xl border border-rose-200 bg-rose-50/40 px-3.5 font-mono text-body-md font-bold text-rose-950 shadow-sm transition-all focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>
        </div>

        {/* Real-time Validation Helper */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-light-grey/60 px-4 py-2.5 font-mono text-xs">
          <span className="text-text-secondary">
            Math Check: {passedQty} Passed + {failedQty} Failed ={" "}
            <strong className="text-text-primary">{passedQty + failedQty}</strong>
          </span>
          {passedQty + failedQty === inspectedQty ? (
            <span className="font-bold text-emerald-700">✓ Balanced</span>
          ) : (
            <span className="font-bold text-amber-700">
              ⚠️ Breakdown does not match inspected total ({inspectedQty})
            </span>
          )}
        </div>
      </section>

      {selectedDisposition === "store_as_is" && (
        <section
          aria-labelledby="putaway-heading"
          className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-6 shadow-elevation-1"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-primary" />
              <div>
                <h3 id="putaway-heading" className="font-heading text-body-md font-bold text-text-primary">
                  3. Choose Storage Location{allocations.length > 1 ? "s" : ""}
                </h3>
                <p className="mt-1 font-body text-body-sm text-text-secondary">
                  Select where the passed boxes will be stored. You can split them across multiple locations.
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-bold text-primary">
              {allocationTotal}/{passedQty} {itemUom}
            </span>
          </div>

          <div className="space-y-3">
            {allocations.map((allocation, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
                <div>
                  <label htmlFor={`storage-location-${index}`} className="block font-label text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Location {index + 1}
                  </label>
                  <select
                    id={`storage-location-${index}`}
                    value={allocation.locationId}
                    required
                    onChange={(event) => updateAllocation(index, { locationId: event.target.value })}
                    className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3 font-body text-body-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Choose a storage location...</option>
                    {storageLocations.map((location) => (
                      <option key={location.id} value={location.id}>{location.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`storage-qty-${index}`} className="block font-label text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Boxes / Qty
                  </label>
                  <input
                    id={`storage-qty-${index}`}
                    type="number"
                    min={1}
                    max={passedQty}
                    value={allocation.qty}
                    onChange={(event) => updateAllocation(index, { qty: Math.max(0, parseInt(event.target.value, 10) || 0) })}
                    className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3 font-mono text-body-md font-bold text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remove location ${index + 1}`}
                  disabled={allocations.length === 1}
                  onClick={() => setAllocations((current) => current.filter((_, allocationIndex) => allocationIndex !== index))}
                  className="h-11 rounded-xl px-3 font-label text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAllocations((current) => [...current, { locationId: "", qty: 0 }])}
            className="mt-3 rounded-xl border border-primary/30 bg-surface px-4 py-2.5 font-label text-sm font-bold text-primary transition-colors hover:bg-primary/[0.06]"
          >
            + Add another location
          </button>

          {!allocationsComplete && (
            <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 font-body text-body-sm font-semibold text-amber-800">
              Assign every passed box to an active storage location. The location quantities must total exactly {passedQty} {itemUom}.
            </p>
          )}
          <input type="hidden" name="putawayAllocations" value={JSON.stringify(allocations)} />
        </section>
      )}

      {/* 3. Remarks & Quality Observations */}
      <section
        aria-labelledby="observations-heading"
        className="rounded-2xl border border-border bg-surface p-6 shadow-elevation-1"
      >
        <div className="mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <h3
            id="observations-heading"
            className="font-heading text-body-md font-bold text-text-primary"
          >
            3. Quality Observations &amp; Remarks
          </h3>
        </div>

        <div>
          <label htmlFor="notes" className="sr-only">
            Inspection Remarks
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Document visual check findings, package seal condition, test results, or RMA escalation notes..."
            className="w-full rounded-xl border border-border bg-surface p-4 font-body text-body-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </section>

      {/* 5. Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !allocationsComplete}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-navy px-8 font-label text-body-md font-bold text-white shadow-elevation-1 transition-all hover:bg-brand-navy/90 active:scale-[0.98] disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Recording Resolution...</span>
            </>
          ) : (
            <>
              <Send size={18} />
              <span>Submit Inspection Resolution</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
