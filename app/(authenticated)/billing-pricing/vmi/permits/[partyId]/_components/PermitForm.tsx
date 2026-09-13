"use client";

import { useActionState } from "react";
import { createVmiPermitAction, type VmiFormState } from "../../../contracts/_actions";

const initialState: VmiFormState = {};

export function PermitForm({ partyId }: { partyId: string }) {
  const [state, formAction, isPending] = useActionState(createVmiPermitAction, initialState);

  return (
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
      <h2 className="font-heading text-title-md font-bold text-on-surface">Add permit</h2>
      <p className="mt-1 font-body text-body-sm text-text-grey">The permit remains part of the organization record and is used when the Letter of Authority is generated.</p>
      {state.error && <p className="mt-3 rounded-lg bg-status-held/10 p-3 font-body text-body-sm text-status-held">What happened: Permit was not saved. Why it failed: {state.error}. Next action: Correct the fields and try again.</p>}
      {state.ok && <p className="mt-3 rounded-lg bg-status-available/10 p-3 font-body text-body-sm text-status-available">Permit saved.</p>}
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="hidden" name="partyId" value={partyId} />
        <div><label htmlFor="permit-number" className="block font-label text-label font-bold text-on-surface">Permit number</label><input id="permit-number" name="permitNumber" required className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-sm" /></div>
        <div><label htmlFor="permit-fee" className="block font-label text-label font-bold text-on-surface">Monthly fee (USD)</label><input id="permit-fee" name="monthlyFeeUsd" required inputMode="decimal" defaultValue="0.00" className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-sm" /></div>
        <div className="sm:col-span-2"><label htmlFor="permit-scope" className="block font-label text-label font-bold text-on-surface">Item scope</label><input id="permit-scope" name="itemScope" required defaultValue="All Items" className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-sm" /></div>
        <div><label htmlFor="permit-from" className="block font-label text-label font-bold text-on-surface">Valid from</label><input id="permit-from" name="validFrom" type="date" required className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-sm" /></div>
        <div><label htmlFor="permit-to" className="block font-label text-label font-bold text-on-surface">Valid to</label><input id="permit-to" name="validTo" type="date" required className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-sm" /></div>
        <div className="sm:col-span-2 flex justify-end"><button type="submit" disabled={isPending} className="h-11 rounded bg-brand-navy px-5 font-label text-label font-bold text-surface-white disabled:opacity-50">{isPending ? "Saving..." : "Save permit"}</button></div>
      </form>
    </section>
  );
}
