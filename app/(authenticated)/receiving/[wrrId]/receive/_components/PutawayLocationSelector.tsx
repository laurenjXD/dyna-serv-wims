"use client";

import { useMemo, useState } from "react";
import type { LocationStoredItem, PutawayCandidate } from "@/lib/db/queries/locations";
import { LocationCombobox } from "./LocationCombobox";

interface PutawayLocationSelectorProps {
  candidates: PutawayCandidate[];
  inspectionCandidates?: Array<{ id: string; label: string }>;
  contents: Record<string, LocationStoredItem[]>;
  quantity: number;
  unitCbm: number;
  spq?: number;
  uom?: string;
}

function maxBoxesFor(candidate: PutawayCandidate | undefined, unitCbm: number, quantity: number): number {
  if (!candidate) return 0;
  const safeUnitCbm = Number(unitCbm) || 0;
  const safeRemaining = Number(candidate.remainingCbm) || 0;
  const safeQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  if (safeUnitCbm <= 0) return safeQuantity;
  return Math.max(0, Math.floor(safeRemaining / safeUnitCbm));
}

function buildInitialAssignment(
  candidates: PutawayCandidate[],
  quantity: number,
  unitCbm: number,
): string[] {
  const safeQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  if (safeQuantity === 0) return [];

  const assignments: string[] = [];
  const orderedCandidates = [...candidates].sort((a, b) =>
    (a.label ?? "").localeCompare(b.label ?? "", undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  for (const candidate of orderedCandidates) {
    const availableBoxes = maxBoxesFor(candidate, unitCbm, safeQuantity - assignments.length);
    assignments.push(...Array.from({ length: Math.min(availableBoxes, safeQuantity - assignments.length) }, () => candidate.id));
    if (assignments.length === safeQuantity) break;
  }

  return assignments.concat(Array.from({ length: safeQuantity - assignments.length }, () => ""));
}

export function PutawayLocationSelector({
  candidates = [],
  inspectionCandidates = [],
  contents = {},
  quantity = 0,
  unitCbm = 0,
  spq = 1,
  uom = "PCS",
}: PutawayLocationSelectorProps) {
  const safeQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  const safeUnitCbm = Number(unitCbm) || 0;
  const safeSpq = Math.max(1, Number(spq) || 1);

  const [locationsBySlot, setLocationsBySlot] = useState<string[]>(() =>
    buildInitialAssignment(candidates, safeQuantity, safeUnitCbm),
  );
  const [attested, setAttested] = useState(false);

  // Combined options: storage candidates (with capacity) + inspection candidates
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
        label: `${c.label} (Inspection Bay / Hold)`,
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
  const shortageBoxesCount = Math.max(0, safeQuantity - assignedBoxesCount);

  const selectedIds = allocations.map((allocation) => allocation.locationId);
  const singleLocationId =
    selectedIds.length === 1 && allocations[0]?.qty === safeQuantity
      ? selectedIds[0]
      : "";

  function assignAll(locationId: string) {
    if (!locationId) return;
    setLocationsBySlot(Array.from({ length: safeQuantity }, () => locationId));
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

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="allocations" value={JSON.stringify(allocations)} />
      <input type="hidden" name="unitLocationIds" value={JSON.stringify(locationsBySlot)} />

      <section className="rounded-2xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-label text-label font-bold uppercase tracking-[0.1em] text-primary">Step 1 · Primary location</p>
            <label htmlFor="all-boxes-location" className="mt-1 block font-heading text-title-md font-bold text-on-surface">
              Put all {safeQuantity} boxes in
            </label>
            <p className="mt-0.5 font-body text-body-sm text-text-grey">
              Expected: <strong>{safeQuantity} Boxes</strong> ({(safeQuantity * safeSpq).toLocaleString()} {uom}) · SPQ: <strong>{safeSpq} {uom}/Box</strong>
            </p>
          </div>
          <span className="rounded-full bg-[#EEF3FF] px-3 py-1 font-mono text-mono-sm font-bold text-brand-navy">
            {safeQuantity} boxes ({(safeQuantity * safeSpq).toLocaleString()} {uom})
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
            placeholder={selectedIds.length > 1 ? "Multiple locations selected" : "Search or choose a storage or inspection bay"}
          />
        </div>
        <p className="mt-2.5 font-body text-body-md text-text-grey">
          Choose a primary storage rack or inspection bay. Use Step 2 below if some cartons are damaged (Hold) or missing (Shortage).
        </p>
      </section>

      <details className="rounded-2xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 sm:p-5">
        <summary className="cursor-pointer list-none font-label text-body-md font-bold text-on-surface marker:hidden">
          <span className="flex items-center justify-between gap-3">
            <span><span className="mr-2 text-primary">Step 2</span>Split Storage / Hold / Shortage per box</span>
            <span aria-hidden="true" className="text-title-md text-text-grey">⌄</span>
          </span>
        </summary>
        {showIndividualSlots ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {locationsBySlot.map((locationId, index) => (
              <label
                key={index}
                className="grid grid-cols-[5rem_1fr] items-center gap-2 rounded-lg bg-surface-light-grey p-2"
              >
                <span className="font-label text-body-sm text-on-surface">Box {index + 1}</span>
                <LocationCombobox
                  id={`box-location-${index + 1}`}
                  options={[
                    { id: "", label: "— Unassigned / Shortage —" },
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
                  placeholder="Select location or Shortage"
                />
              </label>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-lg bg-surface-light-grey p-3 font-body text-body-sm text-text-grey">
            This shipment contains {safeQuantity} boxes ({(safeQuantity * safeSpq).toLocaleString()} {uom}). Assign a primary location above.
          </div>
        )}
      </details>

      <section className="rounded-2xl border border-primary/10 bg-[#EEF3FF] p-4 sm:p-5" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-label text-label font-bold uppercase tracking-[0.1em] text-primary">Step 3 · Review</p>
            <p className="mt-1 font-heading text-title-md font-bold text-on-surface">Placement summary</p>
          </div>
          <span className="font-mono text-mono-sm font-bold text-brand-navy">
            {assignedBoxesCount}/{safeQuantity} Boxes Assigned ({ (assignedBoxesCount * safeSpq).toLocaleString() }/{ (safeQuantity * safeSpq).toLocaleString() } {uom})
          </span>
        </div>

        {shortageBoxesCount > 0 && (
          <div className="mt-3 rounded-xl border border-status-pending/40 bg-[#FFF9EB] p-3">
            <p className="font-label text-body-sm font-bold text-amber-900">
              ⚠️ Delivery Shortage Detected: {shortageBoxesCount} Box{shortageBoxesCount === 1 ? "" : "es"} Missing ({(shortageBoxesCount * safeSpq).toLocaleString()} {uom})
            </p>
            <p className="mt-0.5 font-body text-body-xs text-amber-800">
              Only {assignedBoxesCount} physically arrived boxes will be posted to stock. The {shortageBoxesCount} missing boxes will be logged on the OS&D variance report.
            </p>
          </div>
        )}

        {assignedBoxesCount === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-outline-variant/60 bg-surface-white p-4 text-center">
            <p className="font-body text-body-md text-text-grey">
              No location selected yet. Choose a primary storage or inspection bay in Step 1, or allocate individual boxes in Step 2.
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
                    {" · "}{allocation.qty} box{allocation.qty === 1 ? "" : "es"} ({(allocation.qty * safeSpq).toLocaleString()} {uom})
                    {isInspection && (
                      <span className="ml-2 rounded bg-status-pending/10 px-1.5 py-0.5 font-label text-label-xs font-bold uppercase text-status-pending">
                        Quarantine / On Hold
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
                                {item.itemCode} · {item.lotNumber} · {item.qtyRemaining} remaining
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

      <label className={`flex items-start gap-3 rounded-2xl border-2 p-4 font-body text-body-md text-on-surface ${assignedBoxesCount > 0 ? "border-status-available/30 bg-[#F0FDF8]" : "border-outline-variant/40 bg-surface-light-grey/40 opacity-70"}`}>
        <input
          required
          type="checkbox"
          name="presenceAttested"
          value="true"
          disabled={assignedBoxesCount === 0}
          checked={attested && assignedBoxesCount > 0}
          onChange={(event) => setAttested(event.target.checked)}
          className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer disabled:cursor-not-allowed"
        />
        <span>
          <span className="block font-label text-label font-bold uppercase tracking-[0.1em] text-status-available">
            Step 4 · Confirm
          </span>
          <span className="mt-1 block">
            {assignedBoxesCount > 0 ? (
              <>
                I confirm that {assignedBoxesCount} of {safeQuantity} declared boxes ({(assignedBoxesCount * safeSpq).toLocaleString()} {uom}) are physically present and assigned.
                {shortageBoxesCount > 0 && ` (${shortageBoxesCount} box shortage will be logged).`}
              </>
            ) : (
              <span className="text-text-grey">
                Select a target location above before attesting and confirming placement.
              </span>
            )}
          </span>
        </span>
      </label>
    </div>
  );
}
