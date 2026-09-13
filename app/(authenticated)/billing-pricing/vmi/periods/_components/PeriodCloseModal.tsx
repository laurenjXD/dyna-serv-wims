"use client";

import Link from "next/link";
import { useActionState } from "react";
import { X, CheckCircle, Calculator, FileCheck, AlertCircle } from "lucide-react";
import { closeVmiPeriodAction, recordVmiPaymentAction } from "../_actions";

type Option = { id: string; name: string; code: string };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  parties: Option[];
  selectedPartyId: string;
  selectedMonth: number;
  selectedYear: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function PeriodCloseModal({
  isOpen,
  onClose,
  parties,
  selectedPartyId,
  selectedMonth,
  selectedYear,
}: Props) {
  const [state, formAction, isPending] = useActionState(closeVmiPeriodAction, {});
  const [paymentState, paymentFormAction, isPaymentPending] = useActionState(
    recordVmiPaymentAction,
    {},
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
          <div>
            <h3 className="font-heading text-title-md font-bold text-on-surface flex items-center gap-2">
              <Calculator className="text-brand-navy" size={20} />
              Create VMI Billing Draft
            </h3>
            <p className="font-body text-body-sm text-text-grey">
              Calculate and save a draft with Storage, Handling, Fees, locked FX, and the SOA running balance. Documents are not issued from this step.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
          >
            <X size={20} />
          </button>
        </div>

        {state.error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-status-held/10 p-3 text-status-held font-body text-body-sm">
            <AlertCircle size={18} />
            <span>{state.error}</span>
          </div>
        )}

        {state.ok && state.result ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg bg-status-available/10 p-4 text-status-available">
              <div className="flex items-center gap-2 font-bold text-title-sm">
                <CheckCircle size={20} />
                Billing Draft Created Successfully
              </div>
              <p className="mt-1 font-body text-body-sm">
                Period Number: <span className="font-mono font-bold">{state.result.periodNumber}</span>
              </p>
              <p className="mt-1 font-body text-body-sm">
                Status: <span className="font-bold">Draft</span>. Review charge lines and totals before document generation and issue.
              </p>
              {state.documentWarning && <p className="mt-2 rounded bg-status-held/10 p-2 font-body text-body-sm text-status-held">{state.documentWarning}</p>}
            </div>

            {/* Generated Statement Breakdown */}
            <div className="space-y-3 rounded-lg border border-outline-variant/30 bg-surface-light-grey/40 p-4">
              <h4 className="font-heading text-body-md font-bold text-on-surface">
                Statement Component Breakdown
              </h4>

              <div className="grid grid-cols-2 gap-2 text-body-sm">
                <span className="text-text-grey">Storage Charge:</span>
                <span className="font-mono font-bold text-right">${state.result.storageChargeUsd.toFixed(2)}</span>

                <span className="text-text-grey">Handling (IN + OUT):</span>
                <span className="font-mono font-bold text-right">${(state.result.handlingInUsd + state.result.handlingOutUsd).toFixed(2)}</span>

                <span className="text-text-grey">Documentation Fees:</span>
                <span className="font-mono font-bold text-right">${state.result.documentationUsd.toFixed(2)}</span>

                <span className="text-text-grey">Delivery Charges:</span>
                <span className="font-mono font-bold text-right">${state.result.deliveryUsd.toFixed(2)}</span>

                <span className="text-text-grey">Recurring Fees:</span>
                <span className="font-mono font-bold text-right">${state.result.recurringFeesUsd.toFixed(2)}</span>
              </div>

              <div className="border-t border-outline-variant/30 pt-2 flex justify-between font-bold text-body-md text-on-surface">
                <span>Billing Statement Total:</span>
                <span className="font-mono text-brand-navy">${state.result.billingStatementTotalUsd.toFixed(2)} USD</span>
              </div>
            </div>

            {/* Statement of Account (SOA) Running Balance */}
            <div className="space-y-2 rounded-lg border border-brand-navy/30 bg-brand-navy/5 p-4">
              <h4 className="font-heading text-body-md font-bold text-brand-navy flex items-center gap-1.5">
                <FileCheck size={18} />
                Statement of Account (SOA) Running Balance
              </h4>

              <div className="grid grid-cols-2 gap-2 text-body-sm">
                <span className="text-text-grey">SOA Opening Balance:</span>
                <span className="font-mono font-bold text-right">${state.result.soaOpeningBalanceUsd.toFixed(2)}</span>

                <span className="text-text-grey">+ Current Statement Total:</span>
                <span className="font-mono font-bold text-right">${state.result.billingStatementTotalUsd.toFixed(2)}</span>

                <span className="text-text-grey">- Payments / Credits Applied:</span>
                <span className="font-mono font-bold text-right text-status-available">-${state.result.soaPaymentsAppliedUsd.toFixed(2)}</span>
              </div>

              <div className="border-t border-brand-navy/20 pt-2 flex justify-between font-bold text-body-md text-on-surface">
                <span>SOA Closing Balance:</span>
                <span className="font-mono text-title-sm font-extrabold text-on-surface">
                  ${state.result.soaClosingBalanceUsd.toFixed(2)} USD
                </span>
              </div>

              <div className="mt-2 text-xs text-text-grey">
                Locked FX Rate: <span className="font-mono font-bold">1 USD = ₱{state.result.lockedExchangeRatePhp} PHP</span> ({state.result.lockedExchangeRateDate})
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-outline-variant/30 bg-surface-white p-4">
              <div>
                <h4 className="font-heading text-body-md font-bold text-on-surface">
                  Record Payment or Adjustment
                </h4>
                <p className="mt-1 font-body text-body-sm text-text-grey">
                  Administrator-only. Issued periods remain immutable; payments recorded after issue are carried into the next period&apos;s balance.
                </p>
              </div>

              {paymentState.error && (
                <div className="rounded-lg bg-status-held/10 p-3 font-body text-body-sm text-status-held">
                  What happened: Payment was not recorded. Why it failed: {paymentState.error}. Next action: Correct the fields and try again.
                </div>
              )}

              {paymentState.ok && (
                <div className="rounded-lg bg-status-available/10 p-3 font-body text-body-sm text-status-available">
                  Payment recorded successfully. The SOA balance will refresh when this period is reopened.
                </div>
              )}

              <form action={paymentFormAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input type="hidden" name="partyId" value={selectedPartyId} />
                <input type="hidden" name="periodId" value={state.result.id} />
                <div>
                  <label htmlFor="payment-amount" className="block font-label text-label font-bold text-on-surface">Amount (USD)</label>
                  <input id="payment-amount" name="amountUsd" required inputMode="decimal" placeholder="0.00" className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" />
                </div>
                <div>
                  <label htmlFor="payment-date" className="block font-label text-label font-bold text-on-surface">Date</label>
                  <input id="payment-date" name="paymentDate" required type="date" className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" />
                </div>
                <div>
                  <label htmlFor="payment-type" className="block font-label text-label font-bold text-on-surface">Type</label>
                  <select id="payment-type" name="type" defaultValue="payment" className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md">
                    <option value="payment">Payment</option>
                    <option value="credit_memo">Credit memo</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="payment-notes" className="block font-label text-label font-bold text-on-surface">Notes</label>
                  <input id="payment-notes" name="notes" placeholder="Reference or explanation" className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button type="submit" disabled={isPaymentPending} className="h-11 rounded bg-brand-navy px-5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 disabled:opacity-50">
                    {isPaymentPending ? "Recording..." : "Record Payment"}
                  </button>
                </div>
              </form>
            </div>

            <div className="flex justify-end pt-2">
              <Link
                href={`/billing-pricing/vmi/periods/${state.result.id}`}
                className="mr-3 inline-flex h-11 items-center rounded border border-brand-navy px-5 font-label text-label font-bold text-brand-navy hover:bg-brand-navy/5"
              >
                Review Draft
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded bg-brand-navy px-5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="mt-4 space-y-4">
            <div>
              <label htmlFor="partyId" className="block font-label text-label font-bold text-on-surface">
                VMI Organization <span className="text-brand-red">*</span>
              </label>
              <select
                id="partyId"
                name="partyId"
                required
                defaultValue={selectedPartyId}
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:border-brand-navy focus:outline-none"
              >
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="month" className="block font-label text-label font-bold text-on-surface">
                  Month
                </label>
                <select
                  id="month"
                  name="month"
                  defaultValue={selectedMonth}
                  className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="year" className="block font-label text-label font-bold text-on-surface">
                  Year
                </label>
                <select
                  id="year"
                  name="year"
                  defaultValue={selectedYear}
                  className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface"
                >
                  {[selectedYear - 1, selectedYear, selectedYear + 1].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg bg-surface-light-grey/60 p-4 font-body text-body-sm text-text-grey space-y-1">
              <p className="font-bold text-on-surface">Documents planned after review:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Billing Statement (Charge components + Grand Total)</li>
                <li>Warehousing Charges (Daily balance CBM ledger)</li>
                <li>Statement of Account (SOA running balance)</li>
                <li>Letter of Authority (LOA permit details)</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3 border-t border-outline-variant/30 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded border border-outline-variant bg-surface-white px-4 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-11 items-center gap-2 rounded bg-primary px-5 font-label text-label font-bold text-surface-white hover:bg-primary-hover disabled:opacity-50"
              >
                <Calculator size={18} />
                {isPending ? "Creating Billing Draft..." : "Create Billing Draft"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
