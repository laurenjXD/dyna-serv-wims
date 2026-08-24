"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, MapPin, PackageCheck, ShieldCheck } from "lucide-react";

type Pallet = {
  balanceId: string;
  lotId: string;
  lotNumber: string;
  locationId: string;
  locationLabel: string;
  availableQty: number;
  receivedAt: string;
  expiryDate: string | null;
  priority: number;
};

type Props = {
  itemId: string;
  flowType: "vmi" | "trading" | "supplies";
  organizationId: string | null;
  strategy: "FIFO" | "FEFO";
  uom: string;
  pallets: Pallet[];
  createAction: (formData: FormData) => void;
  overrideAction: (formData: FormData) => void;
};

export function PickListGenerator({ itemId, flowType, organizationId, strategy, uom, pallets, createAction, overrideAction }: Props) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [selectedBalanceId, setSelectedBalanceId] = useState("");
  const [reason, setReason] = useState("");
  const requestedQty = Number(qty);
  const totalAvailable = pallets.reduce((sum, pallet) => sum + pallet.availableQty, 0);
  const selected = pallets.find((pallet) => pallet.balanceId === selectedBalanceId) ?? null;
  const requiresOverride = Boolean(selected && selected.priority > 1);

  const request = useMemo(() => {
    if (!organizationId || !Number.isInteger(requestedQty) || requestedQty <= 0) return "";
    if (!selected || requestedQty > selected.availableQty) return "";
    return JSON.stringify({ partyId: organizationId, flowType, lines: [{ itemId, lotId: selected.lotId, locationId: selected.locationId, qty: requestedQty }], idempotencyKey: crypto.randomUUID() });
  }, [flowType, itemId, organizationId, requestedQty, selected]);

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded bg-brand-navy px-4 font-label text-label font-bold text-surface-white shadow-elevation-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"><PackageCheck size={18} aria-hidden="true" />Create Pick List</button>;
  }

  const isOverrideReady = Boolean(request && reason.trim().length >= 10);

  return (
    <div className="basis-full rounded border border-outline-variant bg-surface-white p-4 shadow-elevation-1 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="font-heading text-title-lg font-bold text-on-surface">Create pick list</h3><p className="mt-1 font-body text-body-sm text-text-grey">Choose the number of boxes and their source location. The recommended {strategy} location can be reserved directly.</p></div>
        <button type="button" onClick={() => setOpen(false)} className="h-10 rounded border border-outline-variant px-3 font-label text-label font-bold text-on-surface">Close</button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <label className="grid content-start gap-2 font-label text-label font-bold text-on-surface">Boxes to pick
          <div className="flex h-12 items-center rounded border border-outline-variant bg-surface-white px-3 focus-within:ring-2 focus-within:ring-primary">
            <input value={qty} onChange={(event) => setQty(event.target.value)} inputMode="numeric" min="1" max={totalAvailable} type="number" className="min-w-0 flex-1 bg-transparent font-mono text-mono-md text-on-surface outline-none" placeholder={`Max ${totalAvailable}`} />
            <span className="font-body text-body-sm text-text-grey">boxes</span>
          </div>
        </label>

        <label className="grid content-start gap-2 font-label text-label font-bold text-on-surface">Source location
          <select value={selectedBalanceId} onChange={(event) => setSelectedBalanceId(event.target.value)} className="h-12 w-full rounded border border-outline-variant bg-surface-white px-3 font-body text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary">
            <option value="">Select a location…</option>
            {pallets.map((pallet) => <option key={pallet.balanceId} value={pallet.balanceId}>{pallet.locationLabel} · Lot {pallet.lotNumber} · {pallet.availableQty} {uom}{pallet.priority === 1 ? ` · Recommended ${strategy}` : ""}</option>)}
          </select>
          {selected && <span className="flex items-center gap-2 font-body text-body-sm font-normal text-text-grey"><MapPin size={16} aria-hidden="true" />{selected.locationLabel} has {selected.availableQty.toLocaleString()} {uom} available.</span>}
        </label>
      </div>

      {requiresOverride && <div className="mt-5 rounded border border-status-pending/40 bg-status-pending/5 p-4">
        <div className="flex items-start gap-3"><AlertTriangle size={22} className="mt-0.5 shrink-0 text-status-pending" aria-hidden="true" /><div><p className="font-heading text-body-md font-bold text-on-surface">FIFO/FEFO override</p><p className="mt-1 font-body text-body-sm text-text-grey">This location is not the recommended {strategy} source. Approval is locked to this lot, location, quantity, and stock version.</p></div></div>
        <label className="mt-4 grid gap-2 font-label text-label font-bold text-on-surface">Reason for choosing another pallet
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} rows={3} placeholder="Example: Assigned aisle is temporarily inaccessible." className="rounded border border-outline-variant bg-surface-white px-3 py-3 font-body text-body-md font-normal text-on-surface outline-none focus:ring-2 focus:ring-primary" />
          <span className="font-body text-body-sm font-normal text-text-grey">Minimum 10 characters. The requester cannot approve their own request.</span>
        </label>
      </div>}

      {!organizationId && <p className="mt-4 font-body text-body-md text-status-held">This item needs an enrolled organization before a pick list can be created.</p>}
      <form action={requiresOverride ? overrideAction : createAction} className="mt-5 flex justify-end">
        <input type="hidden" name="request" value={request} />
        {requiresOverride && <input type="hidden" name="reason" value={reason} />}
        <button type="submit" disabled={requiresOverride ? !isOverrideReady : !request} className="inline-flex h-12 items-center gap-2 rounded bg-primary px-5 font-label text-body-md font-bold text-surface-white disabled:cursor-not-allowed disabled:opacity-45">{requiresOverride ? "Send for Approval" : "Generate Pick List"}<ChevronRight size={18} aria-hidden="true" /></button>
      </form>
    </div>
  );
}
