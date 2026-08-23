"use client";

import { useMemo, useState } from "react";
import type { LocationStoredItem, PutawayCandidate } from "@/lib/db/queries/locations";

interface PutawayLocationSelectorProps {
  candidates: PutawayCandidate[];
  contents: Record<string, LocationStoredItem[]>;
  quantity: number;
  unitCbm: number;
}

export function PutawayLocationSelector({
  candidates,
  contents,
  quantity,
  unitCbm,
}: PutawayLocationSelectorProps) {
  const [locationsBySlot, setLocationsBySlot] = useState<string[]>(() => Array.from({ length: quantity }, () => candidates[0]?.id ?? ""));
  const [attested, setAttested] = useState(false);
  const allocations = useMemo(() => Object.entries(locationsBySlot.reduce<Record<string, number>>((grouped, locationId) => {
    if (locationId) grouped[locationId] = (grouped[locationId] ?? 0) + 1;
    return grouped;
  }, {})).map(([locationId, qty]) => ({ locationId, qty })), [locationsBySlot]);
  const selectedIds = [...new Set(locationsBySlot.filter(Boolean))];

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="allocations" value={JSON.stringify(allocations)} />
      <p className="rounded border border-outline-variant/30 bg-surface-light-grey px-3 py-2 font-body text-body-md text-on-surface">The pallet QR has matched. Confirm every one of the {quantity} declared cartons/pallets is physically present, then assign each box. Printed QR labels may be in any order.</p>
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {locationsBySlot.map((locationId, index) => (
          <label key={index} className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border border-outline-variant/30 bg-surface-white p-3">
            <span className="font-label text-body-sm text-on-surface">Box {index + 1}</span>
            <select value={locationId} onChange={(event) => setLocationsBySlot((previous) => previous.map((value, slot) => slot === index ? event.target.value : value))} className="h-12 min-w-0 rounded border border-outline-variant bg-surface-white px-2 font-body text-body-md text-on-surface">
              <option value="">Choose location…</option>
              {candidates.map((candidate) => {
                const assignedElsewhere = locationsBySlot.filter((value, slot) => slot !== index && value === candidate.id).length;
                const maxBoxes = unitCbm > 0 ? Math.floor(candidate.remainingCbm / unitCbm) : quantity;
                return <option key={candidate.id} value={candidate.id} disabled={assignedElsewhere >= maxBoxes}>{candidate.label} — {candidate.remainingCbm.toFixed(2)} CBM free</option>;
              })}
            </select>
          </label>
        ))}
      </div>
      {selectedIds.map((id) => {
        const location = candidates.find((candidate) => candidate.id === id);
        if (!location) return null;
        const allocatedQty = allocations.find((allocation) => allocation.locationId === id)?.qty ?? 0;
        const storedItems = contents[id] ?? [];
        return <section key={id} className="rounded-xl border border-outline-variant/40 bg-surface-light-grey p-3" aria-live="polite">
          <p className="font-label text-body-md text-on-surface">{location.label} · {allocatedQty} box{allocatedQty === 1 ? "" : "es"}</p>
          <p className="mt-1 font-body text-body-sm text-text-grey">Used {location.occupiedCbm.toFixed(2)} / {location.maxCbmCapacity.toFixed(2)} CBM · {location.remainingCbm.toFixed(2)} CBM free · after storage {(location.remainingCbm - allocatedQty * unitCbm).toFixed(2)} CBM</p>
          <p className="mt-2 font-label text-body-sm text-on-surface">Items currently stored here</p>
          {storedItems.length ? <ul className="mt-1 space-y-1">{storedItems.map((item) => <li key={`${item.itemCode}-${item.lotNumber}`} className="font-body text-body-sm text-text-grey">{item.itemCode} · {item.lotNumber} · {item.qtyRemaining} remaining</li>)}</ul> : <p className="mt-1 font-body text-body-sm text-text-grey">No stored items. This location is empty.</p>}
        </section>;
      })}
      <label className="flex items-start gap-3 rounded-lg border border-outline-variant/30 bg-surface-white p-3 font-body text-body-sm text-on-surface"><input required type="checkbox" name="presenceAttested" value="true" checked={attested} onChange={(event) => setAttested(event.target.checked)} className="mt-1 h-5 w-5" />I confirm that all {quantity} declared cartons/pallets are physically present and assigned above.</label>
    </div>
  );
}
