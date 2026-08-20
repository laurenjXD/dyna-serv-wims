"use client";

import { useState } from "react";
import type { LocationStoredItem, PutawayCandidate } from "@/lib/db/queries/locations";

interface PutawayLocationSelectorProps {
  candidates: PutawayCandidate[];
  contents: Record<string, LocationStoredItem[]>;
  requestedCbm: number;
}

export function PutawayLocationSelector({
  candidates,
  contents,
  requestedCbm,
}: PutawayLocationSelectorProps) {
  const [locationId, setLocationId] = useState(candidates[0]?.id ?? "");
  const selected = candidates.find((candidate) => candidate.id === locationId);
  const storedItems = selected ? contents[selected.id] ?? [] : [];
  const utilization = selected && selected.maxCbmCapacity > 0
    ? (selected.occupiedCbm / selected.maxCbmCapacity) * 100
    : 0;

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="location-primary" className="text-body-md font-body text-on-surface">
        Putaway location
      </label>
      <select
        id="location-primary"
        name="locationId"
        value={locationId}
        onChange={(event) => setLocationId(event.target.value)}
        className="h-16 w-full rounded border-2 border-outline-variant bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-4 focus:ring-brand-navy"
      >
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label} — {candidate.remainingCbm.toFixed(2)} CBM remaining
          </option>
        ))}
      </select>

      {selected && (
        <section className="rounded-xl border border-outline-variant/40 bg-surface-light-grey p-3" aria-live="polite">
          <p className="font-label text-body-md text-on-surface">{selected.label} capacity</p>
          <div className="mt-2 grid grid-cols-2 gap-2 font-body text-body-sm text-text-grey">
            <p>Used: {selected.occupiedCbm.toFixed(2)} / {selected.maxCbmCapacity.toFixed(2)} CBM ({utilization.toFixed(0)}%)</p>
            <p>Remaining: {selected.remainingCbm.toFixed(2)} CBM</p>
            <p className="col-span-2 font-semibold text-on-surface">After storing: {(selected.remainingCbm - requestedCbm).toFixed(2)} CBM remaining</p>
          </div>
          <div className="mt-3 border-t border-outline-variant/30 pt-3">
            <p className="font-label text-body-sm text-on-surface">Items currently stored here</p>
            {storedItems.length === 0 ? (
              <p className="mt-1 font-body text-body-sm text-text-grey">No stored items. This location is empty.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {storedItems.map((item) => (
                  <li key={`${item.itemCode}-${item.lotNumber}`} className="font-body text-body-sm text-text-grey">
                    <span className="font-mono text-on-surface">{item.itemCode}</span> · {item.lotNumber} · {item.qtyRemaining} remaining
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
