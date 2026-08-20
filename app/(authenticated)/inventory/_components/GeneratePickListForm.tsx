"use client";

import { useActionState, useMemo, useState } from "react";
import { generatePickList, type GeneratePickListState } from "../_actions";

type StockLine = {
  itemId: string;
  lotId: string;
  locationId: string;
  qtyRemaining: number;
  qtyCommitted: number;
  flowType: "vmi" | "trading" | "supplies";
};

type Props = {
  itemCode: string;
  itemId: string;
  defaultSupplierPartyId: string | null;
  lines: StockLine[];
};

const initialState: GeneratePickListState | null = null;

/** A compact FIFO/FEFO builder. It does not let the user choose an organization:
 * the item enrollment default is used, then the server validates the final plan. */
export function GeneratePickListForm({ itemCode, itemId, defaultSupplierPartyId, lines }: Props) {
  const [qtyText, setQtyText] = useState("");
  const [state, formAction, pending] = useActionState(generatePickList, initialState);
  const qty = Number(qtyText);
  const available = lines.reduce((total, line) => total + line.qtyRemaining - line.qtyCommitted, 0);

  const payload = useMemo(() => {
    if (!Number.isInteger(qty) || qty <= 0 || !defaultSupplierPartyId || lines.length === 0) return null;
    let remaining = qty;
    const allocated = lines.flatMap((line) => {
      const take = Math.min(Math.max(line.qtyRemaining - line.qtyCommitted, 0), remaining);
      remaining -= take;
      return take > 0 ? [{
        itemId,
        lotId: line.lotId,
        locationId: line.locationId,
        qty: take,
        itemCodeIsProvisional: false,
      }] : [];
    });
    if (remaining > 0) return null;
    return JSON.stringify({
      partyId: defaultSupplierPartyId,
      flowType: lines[0].flowType,
      lines: allocated,
      idempotencyKey: crypto.randomUUID(),
    });
  }, [defaultSupplierPartyId, itemId, lines, qty]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="payload" value={payload ?? ""} />
      <label className="grid gap-1 font-label text-label text-text-grey">
        Quantity to pick
        <input
          value={qtyText}
          onChange={(event) => setQtyText(event.target.value)}
          inputMode="numeric"
          min="1"
          max={available}
          type="number"
          className="h-11 w-36 rounded border border-outline-variant/50 bg-surface-white px-3 font-mono text-on-surface"
          placeholder={`Max ${available}`}
        />
      </label>
      <button
        type="submit"
        disabled={!payload || pending}
        className="inline-flex h-11 items-center gap-2 rounded bg-brand-red px-4 font-label text-label text-surface-white enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
      >
        {pending ? "Creating…" : "Generate Pick List"}
      </button>
      {!defaultSupplierPartyId && (
        <p className="basis-full font-body text-body-sm text-status-alert">
          {itemCode} needs an organization in Item Enrollment before it can be picked.
        </p>
      )}
      {state?.ok === false && <p role="alert" className="basis-full font-body text-body-sm text-status-alert">{state.error}</p>}
    </form>
  );
}
