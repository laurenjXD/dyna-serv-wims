"use client";

import { useActionState } from "react";
import { recordVmiPaymentAction, type VmiPaymentState } from "../../_actions";

interface Props {
  partyId: string;
  periodId: string;
}

const initialState: VmiPaymentState = {};

export function PaymentForm({ partyId, periodId }: Props) {
  const [state, formAction, isPending] = useActionState(recordVmiPaymentAction, initialState);

  return (
    <div className="space-y-3 rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
      <div>
        <h2 className="font-heading text-title-md font-bold text-on-surface">Record Payment or Adjustment</h2>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          Administrator-only. Issued periods remain immutable.
        </p>
      </div>
      {state.error && (
        <div className="rounded-lg bg-status-held/10 p-3 font-body text-body-sm text-status-held">
          What happened: Payment was not recorded. Why it failed: {state.error}. Next action: Correct the fields and try again.
        </div>
      )}
      {state.ok && (
        <div className="rounded-lg bg-status-available/10 p-3 font-body text-body-sm text-status-available">
          Payment recorded successfully.
        </div>
      )}
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="hidden" name="partyId" value={partyId} />
        <input type="hidden" name="periodId" value={periodId} />
        <div>
          <label htmlFor="period-payment-amount" className="block font-label text-label font-bold text-on-surface">Amount (USD)</label>
          <input id="period-payment-amount" name="amountUsd" required inputMode="decimal" placeholder="0.00" className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" />
        </div>
        <div>
          <label htmlFor="period-payment-date" className="block font-label text-label font-bold text-on-surface">Date</label>
          <input id="period-payment-date" name="paymentDate" required type="date" className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" />
        </div>
        <div>
          <label htmlFor="period-payment-type" className="block font-label text-label font-bold text-on-surface">Type</label>
          <select id="period-payment-type" name="type" defaultValue="payment" className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md">
            <option value="payment">Payment</option>
            <option value="credit_memo">Credit memo</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>
        <div>
          <label htmlFor="period-payment-notes" className="block font-label text-label font-bold text-on-surface">Notes</label>
          <input id="period-payment-notes" name="notes" placeholder="Reference or explanation" className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <button type="submit" disabled={isPending} className="h-11 rounded bg-brand-navy px-5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 disabled:opacity-50">
            {isPending ? "Recording..." : "Record Payment"}
          </button>
        </div>
      </form>
    </div>
  );
}
