"use client";

import { useMemo, useState } from "react";
import type { LocationStoredItem, PutawayCandidate } from "@/lib/db/queries/locations";

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
    <div className="flex flex-col gap-3">
      <input type="hidden" name="allocations" value={JSON.stringify(allocations)} />
      <input type="hidden" name="unitLocationIds" value={JSON.stringify(locationsBySlot)} />

      <section className="rounded-xl border border-outline-variant/40 bg-surface-white p-4">
        <label htmlFor="all-boxes-location" className="font-label text-body-md text-on-surface">
          Put all {quantity} boxes in
        </label>
        <select
          id="all-boxes-location"
          value={singleLocationId}
          onChange={(event) => assignAll(event.target.value)}
          className="mt-2 h-14 w-full rounded-lg border-2 border-outline-variant bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-4 focus:ring-brand-navy"
        >
          <option value="" disabled>
            {selectedIds.length > 1 ? "Multiple locations selected" : "Choose a location"}
          </option>
          {candidates.map((candidate) => {
            const canFitAll = maxBoxesFor(candidate, unitCbm, quantity) >= quantity;
            return (
              <option key={candidate.id} value={candidate.id} disabled={!canFitAll}>
                {candidate.label} · {candidate.remainingCbm.toFixed(2)} CBM free
              </option>
            );
          })}
        </select>
        <p className="mt-2 font-body text-body-md text-text-grey">
          Choose one location here. Use the split option below only when the pallet will occupy multiple locations.
        </p>
      </section>

      <details className="rounded-xl border border-outline-variant/40 bg-surface-white p-4">
        <summary className="cursor-pointer font-label text-body-md text-on-surface">
          Split or adjust individual boxes
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {locationsBySlot.map((locationId, index) => (
            <label
              key={index}
              className="grid grid-cols-[4.5rem_1fr] items-center gap-2 rounded-lg bg-surface-light-grey p-2"
            >
              <span className="font-label text-body-md text-on-surface">Box {index + 1}</span>
              <select
                required
                value={locationId}
                onChange={(event) =>
                  setLocationsBySlot((previous) =>
                    previous.map((value, slot) =>
                      slot === index ? event.target.value : value,
                    ),
                  )
                }
                className="h-12 min-w-0 rounded border border-outline-variant bg-surface-white px-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <option value="">Choose location</option>
                {candidates.map((candidate) => {
                  const assignedElsewhere = locationsBySlot.filter(
                    (value, slot) => slot !== index && value === candidate.id,
                  ).length;
                  const maxBoxes = maxBoxesFor(candidate, unitCbm, quantity);
                  return (
                    <option
                      key={candidate.id}
                      value={candidate.id}
                      disabled={assignedElsewhere >= maxBoxes}
                    >
                      {candidate.label} · {candidate.remainingCbm.toFixed(2)} CBM free
                    </option>
                  );
                })}
              </select>
            </label>
          ))}
        </div>
      </details>

      <section className="rounded-xl border border-outline-variant/40 bg-surface-light-grey p-4" aria-live="polite">
        <p className="font-label text-body-md text-on-surface">Placement summary</p>
        <div className="mt-2 space-y-2">
          {allocations.map((allocation) => {
            const location = candidates.find(
              (candidate) => candidate.id === allocation.locationId,
            );
            if (!location) return null;
            const afterStorage = location.remainingCbm - allocation.qty * unitCbm;
            const storedItems = contents[location.id] ?? [];

            return (
              <details key={location.id} className="rounded-lg bg-surface-white px-3 py-2">
                <summary className="cursor-pointer font-body text-body-md text-on-surface">
                  <span className="font-label">{location.label}</span>
                  {" · "}{allocation.qty} box{allocation.qty === 1 ? "" : "es"}
                  {" · "}{afterStorage.toFixed(2)} CBM free after
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

      <label className="flex items-start gap-3 rounded-xl border-2 border-outline-variant bg-surface-white p-4 font-body text-body-md text-on-surface">
        <input
          required
          type="checkbox"
          name="presenceAttested"
          value="true"
          checked={attested}
          onChange={(event) => setAttested(event.target.checked)}
          className="mt-0.5 h-6 w-6 shrink-0"
        />
        <span>All {quantity} boxes are physically present and assigned.</span>
      </label>
    </div>
  );
}
