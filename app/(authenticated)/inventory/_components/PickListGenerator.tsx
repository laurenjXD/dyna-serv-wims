"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, PackageCheck, ShieldCheck } from "lucide-react";

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
  const [sourceMode, setSourceMode] = useState<"recommended" | "alternate">("recommended");
  const [selectedBalanceId, setSelectedBalanceId] = useState("");
  const [reason, setReason] = useState("");
  const requestedQty = Number(qty);
  const totalAvailable = pallets.reduce((sum, pallet) => sum + pallet.availableQty, 0);
  const selected = pallets.find((pallet) => pallet.balanceId === selectedBalanceId) ?? null;

  const request = useMemo(() => {
    if (!organizationId || !Number.isInteger(requestedQty) || requestedQty <= 0) return "";
    if (sourceMode === "alternate") {
      if (!selected || requestedQty > selected.availableQty) return "";
      return JSON.stringify({ partyId: organizationId, flowType, lines: [{ itemId, lotId: selected.lotId, locationId: selected.locationId, qty: requestedQty }], idempotencyKey: crypto.randomUUID() });
    }
    let remaining = requestedQty;
    const lines = pallets.flatMap((pallet) => {
      const take = Math.min(pallet.availableQty, remaining);
      remaining -= take;
      return take > 0 ? [{ itemId, lotId: pallet.lotId, locationId: pallet.locationId, qty: take }] : [];
    });
    if (remaining > 0) return "";
    return JSON.stringify({ partyId: organizationId, flowType, lines, idempotencyKey: crypto.randomUUID() });
  }, [flowType, itemId, organizationId, pallets, requestedQty, selected, sourceMode]);

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded bg-brand-navy px-4 font-label text-label font-bold text-surface-white shadow-elevation-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"><PackageCheck size={18} aria-hidden="true" />Create Pick List</button>;
  }

  const isAlternateReady = Boolean(request && reason.trim().length >= 10);

  return (
    <div className="basis-full rounded border border-outline-variant bg-surface-white p-4 shadow-elevation-1 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="font-heading text-title-lg font-bold text-on-surface">Create pick list</h3><p className="mt-1 font-body text-body-sm text-text-grey">Enter a quantity, then accept the safe {strategy} plan or request another pallet.</p></div>
        <button type="button" onClick={() => setOpen(false)} className="h-10 rounded border border-outline-variant px-3 font-label text-label font-bold text-on-surface">Close</button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <label className="grid content-start gap-2 font-label text-label font-bold text-on-surface">Quantity to pick
          <div className="flex h-12 items-center rounded border border-outline-variant bg-surface-white px-3 focus-within:ring-2 focus-within:ring-primary">
            <input value={qty} onChange={(event) => setQty(event.target.value)} inputMode="numeric" min="1" max={totalAvailable} type="number" className="min-w-0 flex-1 bg-transparent font-mono text-mono-md text-on-surface outline-none" placeholder={`Max ${totalAvailable}`} />
            <span className="font-body text-body-sm text-text-grey">{uom}</span>
          </div>
        </label>

        <fieldset>
          <legend className="font-label text-label font-bold text-on-surface">Source pallet</legend>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <label className={`cursor-pointer rounded border p-4 ${sourceMode === "recommended" ? "border-primary bg-[#EEF3FF] ring-1 ring-primary" : "border-outline-variant bg-surface-white"}`}>
              <input className="sr-only" type="radio" name="sourceMode" checked={sourceMode === "recommended"} onChange={() => setSourceMode("recommended")} />
              <span className="flex items-center gap-2 font-heading text-body-md font-bold text-on-surface"><CheckCircle2 size={20} className="text-status-available" aria-hidden="true" />Recommended {strategy}</span>
              <span className="mt-2 block font-body text-body-sm text-text-grey">Uses the oldest eligible stock in sequence. No approval required.</span>
            </label>
            <label className={`cursor-pointer rounded border p-4 ${sourceMode === "alternate" ? "border-status-pending bg-status-pending/10 ring-1 ring-status-pending" : "border-outline-variant bg-surface-white"}`}>
              <input className="sr-only" type="radio" name="sourceMode" checked={sourceMode === "alternate"} onChange={() => setSourceMode("alternate")} />
              <span className="flex items-center gap-2 font-heading text-body-md font-bold text-on-surface"><ShieldCheck size={20} className="text-status-pending" aria-hidden="true" />Choose another pallet</span>
              <span className="mt-2 block font-body text-body-sm text-text-grey">Requires a reason and approval before stock is reserved.</span>
            </label>
          </div>
        </fieldset>
      </div>

      {sourceMode === "alternate" && <div className="mt-5 rounded border border-status-pending/40 bg-status-pending/5 p-4">
        <div className="flex items-start gap-3"><AlertTriangle size={22} className="mt-0.5 shrink-0 text-status-pending" aria-hidden="true" /><div><p className="font-heading text-body-md font-bold text-on-surface">FIFO/FEFO override</p><p className="mt-1 font-body text-body-sm text-text-grey">Select one pallet that can satisfy the full quantity. Approval is locked to this lot, location, quantity, and stock version.</p></div></div>
        <div className="mt-4 grid gap-2">
          {pallets.filter((pallet) => pallet.priority > 1).map((pallet) => <label key={pallet.balanceId} className={`grid cursor-pointer gap-3 rounded border bg-surface-white p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${selectedBalanceId === pallet.balanceId ? "border-brand-navy ring-1 ring-brand-navy" : "border-outline-variant"}`}>
            <input type="radio" name="selectedPallet" value={pallet.balanceId} checked={selectedBalanceId === pallet.balanceId} onChange={() => setSelectedBalanceId(pallet.balanceId)} />
            <span className="min-w-0"><span className="block font-mono text-mono-md font-bold text-on-surface">{pallet.lotNumber}</span><span className="mt-1 block font-body text-body-sm text-text-grey">{pallet.locationLabel} · Received {new Date(pallet.receivedAt).toLocaleDateString()} · {pallet.expiryDate ? `Expires ${pallet.expiryDate}` : "No expiry"}</span></span>
            <span className="font-mono text-mono-md font-bold text-on-surface">{pallet.availableQty.toLocaleString()} {uom}</span>
          </label>)}
          {pallets.length <= 1 && <p className="rounded border border-outline-variant bg-surface-white p-3 font-body text-body-sm text-text-grey">No alternate pallet is currently available for this item.</p>}
        </div>
        <label className="mt-4 grid gap-2 font-label text-label font-bold text-on-surface">Reason for choosing another pallet
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} rows={3} placeholder="Example: Assigned aisle is temporarily inaccessible." className="rounded border border-outline-variant bg-surface-white px-3 py-3 font-body text-body-md font-normal text-on-surface outline-none focus:ring-2 focus:ring-primary" />
          <span className="font-body text-body-sm font-normal text-text-grey">Minimum 10 characters. The requester cannot approve their own request.</span>
        </label>
      </div>}

      {!organizationId && <p className="mt-4 font-body text-body-md text-status-held">This item needs an enrolled organization before a pick list can be created.</p>}
      <form action={sourceMode === "recommended" ? createAction : overrideAction} className="mt-5 flex justify-end">
        <input type="hidden" name="request" value={request} />
        {sourceMode === "alternate" && <input type="hidden" name="reason" value={reason} />}
        <button type="submit" disabled={sourceMode === "recommended" ? !request : !isAlternateReady} className="inline-flex h-12 items-center gap-2 rounded bg-primary px-5 font-label text-body-md font-bold text-surface-white disabled:cursor-not-allowed disabled:opacity-45">{sourceMode === "recommended" ? "Generate Pick List" : "Send for Approval"}<ChevronRight size={18} aria-hidden="true" /></button>
      </form>
    </div>
  );
}
