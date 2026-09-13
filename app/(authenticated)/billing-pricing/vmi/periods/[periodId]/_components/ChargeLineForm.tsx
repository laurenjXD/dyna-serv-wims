"use client";

import { useActionState } from "react";
import { createVmiChargeLineAction, type VmiChargeLineState } from "../../_actions";

type ReceiptOption = { id: string; documentNumber: string };
type ChargeLine = {
  id: string;
  chargeType: string;
  amount: string;
  currency: string;
  chargeDate: string;
  receiptNumber: string;
  notes: string | null;
};

interface Props {
  partyId: string;
  periodId: string;
  periodStartDate: string;
  periodEndDate: string;
  receipts: ReceiptOption[];
  lines: ChargeLine[];
  editable: boolean;
}

const initialState: VmiChargeLineState = {};

export function ChargeLineForm({
  partyId,
  periodId,
  periodStartDate,
  periodEndDate,
  receipts,
  lines,
  editable,
}: Props) {
  const [state, formAction, isPending] = useActionState(createVmiChargeLineAction, initialState);

  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
      <div>
        <h2 className="font-heading text-title-md font-bold text-on-surface">Charge lines</h2>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          Documentation, delivery, and approved ad-hoc charges for this period. Charge lines lock when the period is issued.
        </p>
      </div>

      {state.error && <p className="rounded-lg bg-status-held/10 p-3 font-body text-body-sm text-status-held">Charge line not saved: {state.error}</p>}
      {state.ok && <p className="rounded-lg bg-status-available/10 p-3 font-body text-body-sm text-status-available">Charge line saved.</p>}

      {lines.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-outline-variant/20">
          <table className="min-w-full text-left font-body text-body-sm">
            <thead className="bg-surface-light-grey/60 font-label text-label font-bold text-text-grey">
              <tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">AR</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Amount</th></tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-t border-outline-variant/20">
                  <td className="px-3 py-2 font-medium">{line.chargeType}</td>
                  <td className="px-3 py-2">{line.receiptNumber}</td>
                  <td className="px-3 py-2">{line.chargeDate}</td>
                  <td className="px-3 py-2 text-right font-mono">{line.currency} {Number(line.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="rounded-lg bg-surface-light-grey/50 p-3 font-body text-body-sm text-text-grey">No charge lines recorded for this period.</p>}

      {editable && (
        receipts.length > 0 ? (
          <form action={formAction} className="grid grid-cols-1 gap-3 border-t border-outline-variant/20 pt-4 sm:grid-cols-2">
            <input type="hidden" name="partyId" value={partyId} />
            <input type="hidden" name="periodId" value={periodId} />
            <div>
              <label htmlFor="charge-type" className="block font-label text-label font-bold text-on-surface">Charge type</label>
              <select id="charge-type" name="chargeType" defaultValue="documentation" className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-sm">
                <option value="documentation">Documentation</option><option value="delivery">Delivery</option><option value="cargo_transfer_fee">Cargo transfer fee</option><option value="rtv">RTV</option><option value="admin_fee">Admin fee</option><option value="insurance">Insurance</option><option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="charge-receipt" className="block font-label text-label font-bold text-on-surface">Acknowledgement receipt</label>
              <select id="charge-receipt" name="acknowledgementReceiptId" required className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-sm">
                {receipts.map((receipt) => <option key={receipt.id} value={receipt.id}>{receipt.documentNumber}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="charge-date" className="block font-label text-label font-bold text-on-surface">Charge date</label>
              <input id="charge-date" name="chargeDate" type="date" min={periodStartDate} max={periodEndDate} defaultValue={periodStartDate} required className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-sm" />
            </div>
            <div>
              <label htmlFor="charge-amount" className="block font-label text-label font-bold text-on-surface">Amount</label>
              <input id="charge-amount" name="amount" inputMode="decimal" placeholder="Blank uses documentation default" className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-sm" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="charge-notes" className="block font-label text-label font-bold text-on-surface">Notes</label>
              <input id="charge-notes" name="notes" className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-sm" />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button type="submit" disabled={isPending} className="h-11 rounded bg-brand-navy px-5 font-label text-label font-bold text-surface-white disabled:opacity-50">{isPending ? "Saving..." : "Add charge line"}</button>
            </div>
          </form>
        ) : <p className="border-t border-outline-variant/20 pt-4 font-body text-body-sm text-status-held">No acknowledgement receipts are available for this organization, so a charge line cannot be added yet.</p>
      )}
    </section>
  );
}
