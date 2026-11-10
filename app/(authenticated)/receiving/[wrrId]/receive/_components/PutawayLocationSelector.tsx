"use client";

import { useMemo, useState } from "react";
import type { LocationStoredItem, PutawayCandidate } from "@/lib/db/queries/locations";
import { LocationCombobox } from "./LocationCombobox";
import { evaluateExpiry, expiryReviewKey, type ExpiryReviewLine } from "@/lib/inventory/expiry-policy";

interface PutawayLocationSelectorProps {
  candidates: PutawayCandidate[];
  inspectionCandidates?: Array<{ id: string; label: string }>;
  contents: Record<string, LocationStoredItem[]>;
  quantity: number;
  scannedQuantity?: number;
  unitCbm: number;
  spq?: number;
  uom?: string;
  lotNumber?: string;
  expiryReview?: { itemId: string; wrrItemId: string; expiryDate: string | null; expiryPolicy?: "block_release" | "allow_with_acknowledgement"; expiryPolicyVersion: number; isPerishable?: boolean };
}

type SplitLocationRow = {
  locationId: string;
  qty: string;
};

function maxBoxesFor(candidate: PutawayCandidate | undefined, unitCbm: number, quantity: number): number {
  if (!candidate) return 0;
  const safeUnitCbm = Number(unitCbm) || 0;
  const safeRemaining = Number(candidate.remainingCbm) || 0;
  const safeQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  if (safeUnitCbm <= 0) return safeQuantity;
  return Math.max(0, Math.floor(safeRemaining / safeUnitCbm));
}

export function PutawayLocationSelector({
  candidates = [],
  inspectionCandidates = [],
  contents = {},
  quantity = 0,
  scannedQuantity = quantity,
  unitCbm = 0,
  spq = 1,
  uom = "PCS",
  lotNumber,
  expiryReview,
}: PutawayLocationSelectorProps) {
  const safeQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  const safeScannedQuantity = Math.min(
    safeQuantity,
    Math.max(0, Math.floor(Number(scannedQuantity) || 0)),
  );
  const safeUnitCbm = Number(unitCbm) || 0;
  const safeSpq = Math.max(1, Number(spq) || 1);
  const safeUom = (!uom || uom.toLowerCase() === "pallet" || uom.toLowerCase() === "plt") ? "PCS" : uom.toUpperCase();

  const [locationsBySlot, setLocationsBySlot] = useState<string[]>(() =>
    Array.from({ length: safeQuantity }, () => ""),
  );
  const [splitRows, setSplitRows] = useState<SplitLocationRow[]>([
    { locationId: "", qty: "" },
  ]);
  const [attested, setAttested] = useState(true);

  function expandedLocations(rows: SplitLocationRow[]): string[] {
    const assigned = rows.flatMap((row) => {
      const qty = Math.max(0, Math.floor(Number(row.qty) || 0));
      return row.locationId ? Array.from({ length: qty }, () => row.locationId) : [];
    });
    return [
      ...assigned.slice(0, safeQuantity),
      ...Array.from({ length: Math.max(0, safeQuantity - assigned.length) }, () => ""),
    ];
  }

  function updateSplitRows(rows: SplitLocationRow[]) {
    setSplitRows(rows);
    setLocationsBySlot(expandedLocations(rows));
  }

  // Combined options: storage candidates (with capacity) + inspection candidates.
  // The selected destination type is authoritative for each carton.
  const allLocationOptions = useMemo(() => {
    const storageOpts = [...candidates]
      .sort((a, b) =>
        (a.label ?? "").localeCompare(b.label ?? "", undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      )
      .map((c) => ({
        id: c.id,
        label: `${c.label} (Storage)`,
        locationType: "storage",
        raw: c,
        capacity: {
          occupied: Number(c.occupiedCbm) || 0,
          maximum: Number(c.maxCbmCapacity) || 0,
        },
      }));

    const inspectOpts = [...inspectionCandidates]
      .sort((a, b) =>
        (a.label ?? "").localeCompare(b.label ?? "", undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      )
      .map((c) => ({
        id: c.id,
        label: `${c.label} (Inspection)`,
        locationType: "inspection",
        raw: undefined,
        capacity: undefined,
      }));

    return [...storageOpts, ...inspectOpts];
  }, [candidates, inspectionCandidates]);

  const allocations = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const locationId of locationsBySlot) {
      if (locationId) {
        counts[locationId] = (counts[locationId] ?? 0) + 1;
      }
    }
    return Object.entries(counts).map(([locationId, qty]) => ({
      locationId,
      qty,
    }));
  }, [locationsBySlot]);

  const assignedBoxesCount = allocations.reduce((sum, a) => sum + a.qty, 0);
  const missingBoxesCount = Math.max(0, safeQuantity - assignedBoxesCount);
  const readyToCommit = attested && (assignedBoxesCount > 0 || missingBoxesCount === safeQuantity);

  const selectedIds = allocations.map((allocation) => allocation.locationId);
  const singleLocationId =
    selectedIds.length === 1 &&
    allocations[0]?.qty === safeQuantity
      ? selectedIds[0]
      : "";

  function assignAll(locationId: string) {
    if (!locationId) return;
    const rows = [{ locationId, qty: String(safeQuantity) }];
    setSplitRows(rows);
    setLocationsBySlot(expandedLocations(rows));
  }

  const assignedCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const locId of locationsBySlot) {
      if (locId) {
        map.set(locId, (map.get(locId) ?? 0) + 1);
      }
    }
    return map;
  }, [locationsBySlot]);

  const MAX_PER_BOX_CONTROLS = 50;
  const showIndividualSlots = safeQuantity <= MAX_PER_BOX_CONTROLS;
  const expiryState = expiryReview ? evaluateExpiry({
    expiryDate: expiryReview.expiryDate, expiryPolicy: expiryReview.expiryPolicy,
    isPerishable: expiryReview.isPerishable,
  }) : null;
  const expiryLines: ExpiryReviewLine[] = expiryState?.requiresAcknowledgement
    ? allocations.filter((allocation) => allLocationOptions.find((option) => option.id === allocation.locationId)?.locationType === "storage")
    .map((allocation) => ({ itemId: expiryReview!.itemId, lotId: expiryReview!.wrrItemId,
        lotNumber, locationId: allocation.locationId, qty: allocation.qty * safeSpq,
        expiryDate: expiryReview!.expiryDate, expiryPolicy: expiryReview!.expiryPolicy!,
        expiryPolicyVersion: expiryReview!.expiryPolicyVersion }))
    : [];
  const reviewKey = expiryLines.length ? expiryReviewKey(expiryLines) : "";

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="allocations" value={JSON.stringify(allocations)} />
      <input type="hidden" name="unitLocationIds" value={JSON.stringify(locationsBySlot)} />
      {expiryLines.length > 0 && <section role="group" aria-label="Past expiry receiving review" className="rounded-xl border border-status-held/40 bg-status-held/5 p-4">
        <h2 className="font-label text-body-md font-bold text-on-surface">Past expiry — acknowledgement required</h2>
        <p className="mt-1 font-body text-body-md text-on-surface">Storage placement is allowed by this item’s policy after review. Inspection placements remain quarantined.</p>
        <ul className="mt-2 space-y-1 font-body text-body-md text-on-surface">{expiryLines.map((line) => <li key={`${line.locationId}:${line.qty}`}>Lot {line.lotNumber}: {line.qty.toLocaleString()} units to {allLocationOptions.find((option) => option.id === line.locationId)?.label}; expiry {line.expiryDate}, {expiryState?.daysPastExpiry} days past expiry.</li>)}</ul>
        <input type="hidden" name="expiryReviewKey" value={reviewKey} />
        <label className="mt-3 flex min-h-11 items-center gap-3 font-body text-body-md text-on-surface"><input type="checkbox" name="expiryAcknowledged" value="yes" required className="h-5 w-5" />I acknowledge the Storage placements listed above.</label>
        <label className="mt-2 block font-body text-body-md text-on-surface">Reason for accepting past-expiry material<textarea name="expiryReason" required maxLength={1000} rows={2} className="mt-1 block w-full rounded-lg border border-outline-variant bg-surface-white p-3" /></label>
      </section>}

      <section className="rounded-2xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-label text-label font-bold uppercase tracking-[0.1em] text-primary">Step 1 · Location assignment</p>
            <label htmlFor="all-boxes-location" className="mt-1 block font-heading text-title-md font-bold text-on-surface">
              Assign all {safeQuantity} declared boxes to
            </label>
            <p className="mt-0.5 font-body text-body-sm text-text-grey">
              One valid QR scan identified this line. Assign each declared carton to Storage, Inspection, or Missing{safeSpq > 1 ? ` (${(safeQuantity * safeSpq).toLocaleString()} ${safeUom})` : ""}. Scan confirmations: <strong>{safeScannedQuantity}</strong>.
            </p>
          </div>
          <span className="rounded-full bg-[#EEF3FF] px-3 py-1 font-mono text-mono-sm font-bold text-brand-navy">
            {safeQuantity} boxes{safeSpq > 1 ? ` (${(safeQuantity * safeSpq).toLocaleString()} ${safeUom})` : ""}
          </span>
        </div>
        <div className="mt-3">
          <LocationCombobox
            id="all-boxes-location"
            options={allLocationOptions.map((opt) => ({
              id: opt.id,
              label: opt.label,
              disabled: opt.raw ? maxBoxesFor(opt.raw, safeUnitCbm, safeQuantity) < safeQuantity : false,
              capacity: opt.capacity,
            }))}
            value={singleLocationId}
            onChange={assignAll}
            placeholder={selectedIds.length > 1 ? "Multiple destinations selected" : "Search or choose a storage or inspection bay"}
          />
        </div>
        <p className="mt-2.5 font-body text-body-md text-text-grey">
          Use Step 2 to assign individual cartons to Storage, Inspection, or Missing.
        </p>
      </section>

      <details className="rounded-2xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 sm:p-5">
        <summary className="cursor-pointer list-none font-label text-body-md font-bold text-on-surface marker:hidden">
          <span className="flex items-center justify-between gap-3">
          <span><span className="mr-2 text-primary">Step 2</span>{showIndividualSlots ? "Assign Storage / Inspection / Missing per box" : "Assign Storage / Inspection / Missing by quantity"}</span>
            <span aria-hidden="true" className="text-title-md text-text-grey">⌄</span>
          </span>
        </summary>
        {showIndividualSlots ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {locationsBySlot.map((locationId, index) => (
              <label
                key={index}
                className="grid grid-cols-[7.5rem_1fr] items-center gap-2 rounded-lg bg-surface-light-grey p-2.5"
              >
                <span className="font-mono text-body-sm font-bold text-on-surface leading-tight">
                  {lotNumber ? `${lotNumber} · ` : ""}CTN-{String(index + 1).padStart(2, "0")}
                  <span className="block text-text-grey font-label text-[11px] font-normal">Box {index + 1} of {safeQuantity}</span>
                </span>
                <LocationCombobox
                  id={`box-location-${index + 1}`}
                  options={[
                    { id: "", label: "— Missing / Shortage —" },
                    ...allLocationOptions.map((opt) => {
                      const totalAssignedHere = assignedCounts.get(opt.id) ?? 0;
                      const assignedHereSlot = locationId === opt.id ? 1 : 0;
                      const assignedElsewhere = totalAssignedHere - assignedHereSlot;
                      return {
                        id: opt.id,
                        label: opt.label,
                        disabled: opt.raw ? assignedElsewhere >= maxBoxesFor(opt.raw, safeUnitCbm, safeQuantity) : false,
                        capacity: opt.capacity
                          ? {
                              occupied: (opt.capacity.occupied || 0) + totalAssignedHere * safeUnitCbm,
                              maximum: opt.capacity.maximum || 0,
                            }
                          : undefined,
                      };
                    }),
                  ]}
                  value={locationId}
                  onChange={(nextValue) =>
                    setLocationsBySlot((previous) =>
                      previous.map((value, slot) => (slot === index ? nextValue : value)),
                    )
                  }
                  placeholder="Select Storage, Inspection, or Missing"
                />
              </label>
            ))}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="rounded-lg bg-surface-light-grey p-3 font-body text-body-md text-text-grey">
              Assign the {safeQuantity} declared boxes by location. Leave boxes unassigned only when recording a shortage.
            </p>
            {splitRows.map((row, index) => {
              const rowQty = Math.max(0, Math.floor(Number(row.qty) || 0));
              const assignedElsewhere = splitRows.reduce(
                (sum, candidate, candidateIndex) =>
                  candidateIndex === index || candidate.locationId !== row.locationId
                    ? sum
                    : sum + Math.max(0, Math.floor(Number(candidate.qty) || 0)),
                0,
              );

              return (
                <div key={index} className="grid gap-2 rounded-lg bg-surface-light-grey p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
                  <div>
                    <label htmlFor={`split-location-${index}`} className="mb-1 block font-label text-label font-bold text-on-surface">
                      Location {index + 1}
                    </label>
                    <LocationCombobox
                      id={`split-location-${index}`}
                      options={allLocationOptions.map((opt) => ({
                        id: opt.id,
                        label: opt.label,
                        disabled: opt.raw
                          ? assignedElsewhere >= maxBoxesFor(opt.raw, safeUnitCbm, safeQuantity)
                          : false,
                        capacity: opt.capacity
                          ? {
                              occupied: (opt.capacity.occupied || 0) + rowQty * safeUnitCbm,
                              maximum: opt.capacity.maximum || 0,
                            }
                          : undefined,
                      }))}
                      value={row.locationId}
                      onChange={(nextValue) => {
                        const rows = splitRows.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...candidate, locationId: nextValue } : candidate,
                        );
                        updateSplitRows(rows);
                      }}
                      placeholder="Choose Storage or Inspection"
                    />
                  </div>
                  <div>
                    <label htmlFor={`split-quantity-${index}`} className="mb-1 block font-label text-label font-bold text-on-surface">
                      Boxes
                    </label>
                    <input
                      id={`split-quantity-${index}`}
                      type="number"
                      min="0"
                      max={safeQuantity}
                      step="1"
                      value={row.qty}
                      onChange={(event) => {
                        const rows = splitRows.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...candidate, qty: event.target.value } : candidate,
                        );
                        updateSplitRows(rows);
                      }}
                      className="h-14 w-full rounded-lg border-2 border-outline-variant bg-surface-white px-3 font-mono text-mono-md text-on-surface focus:outline-none focus:ring-4 focus:ring-brand-navy"
                    />
                  </div>
                  {splitRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => updateSplitRows(splitRows.filter((_, candidateIndex) => candidateIndex !== index))}
                      className="h-14 rounded-lg border border-status-held/40 px-3 font-label text-label font-bold text-status-held hover:bg-status-held/5"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setSplitRows((rows) => [...rows, { locationId: "", qty: "" }])}
              className="min-h-11 rounded-lg border border-primary/30 bg-surface-white px-4 font-label text-label font-bold text-primary hover:bg-[#EEF3FF]"
            >
              + Add another location
            </button>
            <p className="font-body text-body-md text-text-grey">
              {assignedBoxesCount} of {safeQuantity} boxes assigned. {missingBoxesCount > 0 ? `${missingBoxesCount} will be recorded as Missing.` : "All boxes have a destination."}
            </p>
          </div>
        )}
      </details>

      <section className="rounded-2xl border border-primary/10 bg-[#EEF3FF] p-4 sm:p-5" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-label text-label font-bold uppercase tracking-[0.1em] text-primary">Step 3 · Review</p>
          <p className="mt-1 font-heading text-title-md font-bold text-on-surface">Location assignment summary</p>
          </div>
          <span className="font-mono text-mono-sm font-bold text-brand-navy">
            {assignedBoxesCount}/{safeQuantity} Boxes Assigned{safeSpq > 1 ? ` (${(assignedBoxesCount * safeSpq).toLocaleString()}/${(safeQuantity * safeSpq).toLocaleString()} ${safeUom})` : ""}
          </span>
        </div>

        {missingBoxesCount > 0 && (
          <div className="mt-3 rounded-xl border border-status-pending/40 bg-[#FFF9EB] p-3">
            <p className="font-label text-body-sm font-bold text-amber-900">
              OS&amp;D shortage: {missingBoxesCount} declared box{missingBoxesCount === 1 ? "" : "es"} marked Missing{safeSpq > 1 ? ` (${(missingBoxesCount * safeSpq).toLocaleString()} ${safeUom})` : ""}
            </p>
            <p className="mt-0.5 font-body text-body-xs text-amber-800">
              Only the {assignedBoxesCount} assigned boxes will be posted to inventory.
            </p>
          </div>
        )}

        {assignedBoxesCount === 0 && missingBoxesCount !== safeQuantity ? (
          <div className="mt-3 rounded-xl border border-dashed border-outline-variant/60 bg-surface-white p-4 text-center">
            <p className="font-body text-body-md text-text-grey">
              No location selected yet. Choose a primary storage or inspection bay in Step 1, or allocate individual boxes in Step 2.
            </p>
          </div>
        ) : assignedBoxesCount === 0 ? (
          <div className="mt-3 rounded-xl border border-status-pending/40 bg-[#FFF9EB] p-4 text-center">
            <p className="font-body text-body-md text-amber-900">
              All declared boxes are marked Missing. Confirm to record the OS&amp;D shortage.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {allocations.map((allocation) => {
              const opt = allLocationOptions.find((o) => o.id === allocation.locationId);
              if (!opt) return null;
              const location = candidates.find((c) => c.id === allocation.locationId);
              const storedItems = location ? (contents[location.id] ?? []) : [];
              const occupied = location ? (Number(location.occupiedCbm) || 0) : 0;
              const maxCapacity = location ? (Number(location.maxCbmCapacity) || 0) : 0;
              const isInspection = opt.locationType === "inspection";

              return (
                <details key={allocation.locationId} className="rounded-xl border border-outline-variant/20 bg-surface-white px-4 py-3">
                  <summary className="cursor-pointer font-body text-body-md text-on-surface">
                    <span className="font-label font-bold">{opt.label}</span>
                    {" · "}{allocation.qty} box{allocation.qty === 1 ? "" : "es"}{safeSpq > 1 ? ` (${(allocation.qty * safeSpq).toLocaleString()} ${safeUom})` : ""}
                    {isInspection && (
                      <span className="ml-2 rounded bg-status-pending/10 px-1.5 py-0.5 font-label text-label-xs font-bold uppercase text-status-pending">
                        Quarantine / Inspection
                      </span>
                    )}
                  </summary>
                  <div className="mt-2 border-t border-outline-variant/30 pt-2">
                    {location ? (
                      <>
                        <p className="font-body text-body-md text-text-grey">
                          Currently used: {occupied.toFixed(2)} of {maxCapacity.toFixed(2)} CBM
                        </p>
                        {storedItems.length > 0 ? (
                          <ul className="mt-2 space-y-1">
                            {storedItems.map((item) => (
                              <li
                                key={`${item.itemCode}-${item.lotNumber}`}
                                className="font-body text-body-md text-text-grey"
                              >
                                {item.itemCode} · {item.lotNumber} · {item.qtyRemaining.toLocaleString()} pcs ({item.boxesRemaining.toLocaleString()} boxes) remaining
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 font-body text-body-md text-text-grey">Location is empty.</p>
                        )}
                      </>
                    ) : (
                      <p className="font-body text-body-md text-text-grey">Inbound Inspection Holding Bay. Stock placed here will be quarantined for QA review.</p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <label className={`flex items-start gap-3 rounded-2xl border-2 p-4 font-body text-body-md text-on-surface cursor-pointer transition-colors ${assignedBoxesCount > 0 || missingBoxesCount === safeQuantity ? (attested ? "border-status-available/40 bg-[#F0FDF8]" : "border-amber-400 bg-amber-50/50") : "border-outline-variant/40 bg-surface-light-grey/40 opacity-70"}`}>
        <input
          type="checkbox"
          name="presenceAttested"
          value="true"
          disabled={assignedBoxesCount === 0 && missingBoxesCount !== safeQuantity}
          checked={attested && (assignedBoxesCount > 0 || missingBoxesCount === safeQuantity)}
          onChange={(event) => setAttested(event.target.checked)}
          className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer disabled:cursor-not-allowed accent-primary"
        />
        <span>
          <span className="block font-label text-label font-bold uppercase tracking-[0.1em] text-status-available">
            Step 4 · Confirm location assignment
          </span>
          <span className="mt-1 block">
            {assignedBoxesCount > 0 || missingBoxesCount === safeQuantity ? (
              <>
                I confirm that the carton destinations above are accurate.
                {missingBoxesCount > 0 && ` ${missingBoxesCount} declared box${missingBoxesCount === 1 ? " is" : "es are"} not present; OS&D will record the shortage.`}
              </>
            ) : (
                <span className="text-text-grey">
                Assign a carton to Storage or Inspection, or mark it Missing, before confirming placement.
              </span>
            )}
          </span>
        </span>
      </label>

      {!readyToCommit && (
        <p role="alert" className="rounded-xl border border-status-pending/40 bg-[#FFF9EB] px-4 py-3 font-body text-body-md text-amber-900">
          {assignedBoxesCount === 0 && missingBoxesCount !== safeQuantity
            ? "Assign each carton to Storage or Inspection, or mark it Missing."
            : missingBoxesCount > 0
              ? `${missingBoxesCount} declared carton${missingBoxesCount === 1 ? " is" : "s are"} marked Missing. Only the ${assignedBoxesCount} assigned carton${assignedBoxesCount === 1 ? " will" : "s will"} be posted.`
              : "Confirm the carton destinations before saving placement."}
        </p>
      )}
    </div>
  );
}
