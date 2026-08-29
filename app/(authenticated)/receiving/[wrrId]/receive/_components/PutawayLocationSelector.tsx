"use client";

import { useMemo, useState } from "react";
import type { LocationStoredItem, PutawayCandidate } from "@/lib/db/queries/locations";
import { LocationCombobox } from "./LocationCombobox";

interface PutawayLocationSelectorProps {
  candidates: PutawayCandidate[];
  contents: Record<string, LocationStoredItem[]>;
  quantity: number;
  unitCbm: number;
}

function maxBoxesFor(candidate: PutawayCandidate, unitCbm: number, quantity: number) {
  return unitCbm > 0
    ? Math.max(0, Math.floor(candidate.remainingCbm / unitCbm))
    : quantity;
}

function buildInitialAssignment(
  candidates: PutawayCandidate[],
  quantity: number,
  unitCbm: number,
) {
  const assignment: string[] = [];

  for (const candidate of candidates) {
    const availableBoxes = maxBoxesFor(candidate, unitCbm, quantity);
    const boxesToAssign = Math.min(availableBoxes, quantity - assignment.length);
    assignment.push(...Array.from({ length: boxesToAssign }, () => candidate.id));
    if (assignment.length === quantity) break;
  }

  while (assignment.length < quantity) assignment.push("");
  return assignment;
}

export function PutawayLocationSelector({
  candidates,
  contents,
  quantity,
  unitCbm,
}: PutawayLocationSelectorProps) {
  const [locationsBySlot, setLocationsBySlot] = useState<string[]>(() =>
    buildInitialAssignment(candidates, quantity, unitCbm),
  );
  const [attested, setAttested] = useState(false);
  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })),
    [candidates],
  );

  const allocations = useMemo(
    () =>
      Object.entries(
        locationsBySlot.reduce<Record<string, number>>((grouped, locationId) => {
          if (locationId) grouped[locationId] = (grouped[locationId] ?? 0) + 1;
          return grouped;
        }, {}),
      ).map(([locationId, qty]) => ({ locationId, qty })),
    [locationsBySlot],
  );

  const selectedIds = allocations.map((allocation) => allocation.locationId);
  const singleLocationId =
    selectedIds.length === 1 && allocations[0]?.qty === quantity
      ? selectedIds[0]
      : "";

  function assignAll(locationId: string) {
    if (!locationId) return;
    setLocationsBySlot(Array.from({ length: quantity }, () => locationId));
  }

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="allocations" value={JSON.stringify(allocations)} />
      <input type="hidden" name="unitLocationIds" value={JSON.stringify(locationsBySlot)} />

      <section className="rounded-2xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-label text-label font-bold uppercase tracking-[0.1em] text-primary">Step 1 · Primary location</p>
            <label htmlFor="all-boxes-location" className="mt-1 block font-heading text-title-md font-bold text-on-surface">
              Put all {quantity} boxes in
            </label>
          </div>
          <span className="rounded-full bg-[#EEF3FF] px-3 py-1 font-mono text-mono-sm font-bold text-brand-navy">{quantity} boxes</span>
        </div>
        <div className="mt-2">
          <LocationCombobox
            id="all-boxes-location"
                options={sortedCandidates.map((candidate) => ({ id: candidate.id, label: candidate.label, disabled: maxBoxesFor(candidate, unitCbm, quantity) < quantity, capacity: { occupied: candidate.occupiedCbm, maximum: candidate.maxCbmCapacity } }))}
            value={singleLocationId}
            onChange={assignAll}
            placeholder={selectedIds.length > 1 ? "Multiple locations selected" : "Search or choose a location"}
          />
        </div>
        <p className="mt-3 font-body text-body-md text-text-grey">
          Choose one location for the full pallet. Split only when it must occupy multiple locations.
        </p>
      </section>

      <details className="rounded-2xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 sm:p-5">
        <summary className="cursor-pointer list-none font-label text-body-md font-bold text-on-surface marker:hidden">
          <span className="flex items-center justify-between gap-3"><span><span className="mr-2 text-primary">Step 2</span>Split or adjust individual boxes</span><span aria-hidden="true" className="text-title-md text-text-grey">⌄</span></span>
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {locationsBySlot.map((locationId, index) => (
            <label
              key={index}
              className="grid grid-cols-[4.5rem_1fr] items-center gap-2 rounded-lg bg-surface-light-grey p-2"
            >
              <span className="font-label text-body-md text-on-surface">Box {index + 1}</span>
              <LocationCombobox
                id={`box-location-${index + 1}`}
                required
                options={sortedCandidates.map((candidate) => {
                  const assignedElsewhere = locationsBySlot.filter(
                    (value, slot) => slot !== index && value === candidate.id,
                  ).length;
                  const assignedHere = locationsBySlot.filter((value) => value === candidate.id).length;
                  return {
                    id: candidate.id,
                    label: candidate.label,
                    disabled: assignedElsewhere >= maxBoxesFor(candidate, unitCbm, quantity),
                    capacity: {
                      occupied: candidate.occupiedCbm + assignedHere * unitCbm,
                      maximum: candidate.maxCbmCapacity,
                    },
                  };
                })}
                value={locationId}
                onChange={(nextValue) => setLocationsBySlot((previous) => previous.map((value, slot) => slot === index ? nextValue : value))}
                placeholder="Search location"
              />
            </label>
          ))}
        </div>
      </details>

      <section className="rounded-2xl border border-primary/10 bg-[#EEF3FF] p-4 sm:p-5" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-label text-label font-bold uppercase tracking-[0.1em] text-primary">Step 3 · Review</p>
            <p className="mt-1 font-heading text-title-md font-bold text-on-surface">Placement summary</p>
          </div>
          <span className="font-mono text-mono-sm font-bold text-text-grey">{allocations.reduce((total, allocation) => total + allocation.qty, 0)}/{quantity} assigned</span>
        </div>
        <div className="mt-2 space-y-2">
          {allocations.map((allocation) => {
            const location = candidates.find(
              (candidate) => candidate.id === allocation.locationId,
            );
            if (!location) return null;
            const storedItems = contents[location.id] ?? [];

            return (
              <details key={location.id} className="rounded-xl border border-outline-variant/20 bg-surface-white px-4 py-3">
                <summary className="cursor-pointer font-body text-body-md text-on-surface">
                  <span className="font-label">{location.label}</span>
                  {" · "}{allocation.qty} box{allocation.qty === 1 ? "" : "es"}
                </summary>
                <div className="mt-2 border-t border-outline-variant/30 pt-2">
                  <p className="font-body text-body-md text-text-grey">
                    Currently used: {location.occupiedCbm.toFixed(2)} of {location.maxCbmCapacity.toFixed(2)} CBM
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
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <label className="flex items-start gap-3 rounded-2xl border-2 border-status-available/30 bg-[#F0FDF8] p-4 font-body text-body-md text-on-surface">
        <input
          required
          type="checkbox"
          name="presenceAttested"
          value="true"
          checked={attested}
          onChange={(event) => setAttested(event.target.checked)}
          className="mt-0.5 h-6 w-6 shrink-0"
        />
        <span><span className="block font-label text-label font-bold uppercase tracking-[0.1em] text-status-available">Step 4 · Confirm</span><span className="mt-1 block">All {quantity} boxes are physically present and assigned.</span></span>
      </label>
    </div>
  );
}
