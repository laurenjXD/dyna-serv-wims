"use client";

import { useActionState, useState, useEffect } from "react";
import { X, CheckCircle, Calculator, FileCheck, AlertCircle } from "lucide-react";
import { closeVmiPeriodAction } from "../_actions";

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
          <div>
            <h3 className="font-heading text-title-md font-bold text-on-surface flex items-center gap-2">
              <Calculator className="text-brand-navy" size={20} />
              Generate VMI Billing Period &amp; SOA
            </h3>
            <p className="font-body text-body-sm text-text-grey">
              Calculate Storage, Handling, Fees, FX Rate, and Statement of Account (SOA) running balance.
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
                Period Statement &amp; SOA Generated Successfully!
              </div>
              <p className="mt-1 font-body text-body-sm">
                Period Number: <span className="font-mono font-bold">{state.result.periodNumber}</span>
              </p>
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

            <div className="flex justify-end pt-2">
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
              <p className="font-bold text-on-surface">Four-Document Generation Package:</p>
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
                {isPending ? "Generating Period Statement & SOA..." : "Generate Billing Period & SOA"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
