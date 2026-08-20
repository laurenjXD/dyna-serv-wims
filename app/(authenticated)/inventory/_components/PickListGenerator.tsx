"use client";

import { useMemo, useState } from "react";

type Lot = { lotId: string; locationId: string; availableQty: number };

export function PickListGenerator({ itemId, flowType, organizationId, lots, action }: {
  itemId: string; flowType: "vmi" | "trading" | "supplies"; lots: Lot[];
  organizationId: string | null;
  action: (formData: FormData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const request = useMemo(() => {
    const required = Number(qty);
    if (!organizationId || !Number.isInteger(required) || required <= 0) return "";
    let remaining = required;
    const lines = lots.flatMap((lot) => {
      const take = Math.min(lot.availableQty, remaining); remaining -= take;
      return take > 0 ? [{ itemId, lotId: lot.lotId, locationId: lot.locationId, qty: take }] : [];
    });
    if (remaining > 0) return "";
    return JSON.stringify({ partyId: organizationId, flowType, lines, idempotencyKey: crypto.randomUUID() });
  }, [organizationId, qty, lots, itemId, flowType]);
  return <div>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded bg-primary px-4 font-label text-label text-surface-white">Generate Pick List</button>
    {open && <form action={action} className="mt-3 grid gap-3 rounded-lg border border-outline-variant/30 bg-surface-white p-4">
      <label className="font-label text-label text-on-surface">Quantity<input required min="1" step="1" type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1 block h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" /></label>
      {!organizationId && <p className="font-body text-body-md text-status-held">This item has no enrolled organization, so a pick list cannot be created.</p>}
      <input type="hidden" name="request" value={request} />
      <p className="font-body text-body-sm text-text-grey">Stock is allocated in {flowType === "vmi" ? "FIFO" : "FIFO"} order across available locations.</p>
      <div className="flex gap-2"><button type="submit" disabled={!request} className="h-11 rounded bg-primary px-4 font-label text-label text-surface-white disabled:opacity-50">Create Pick List</button><button type="button" onClick={() => setOpen(false)} className="h-11 rounded border px-4 font-label text-label">Cancel</button></div>
    </form>}
  </div>;
}
