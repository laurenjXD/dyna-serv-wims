"use client";

import { useActionState, useState, useEffect } from "react";
import { X, Save, AlertCircle } from "lucide-react";
import { createVmiContractTermsAction } from "../_actions";

type Option = { id: string; name: string; code: string };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  parties: Option[];
}

export function VmiContractTermsModal({ isOpen, onClose, parties }: Props) {
  const [state, formAction, isPending] = useActionState(
    createVmiContractTermsAction,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      onClose();
    }
  }, [state.ok, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
          <div>
            <h3 className="font-heading text-title-md font-bold text-on-surface">
              Configure VMI Contract Terms
            </h3>
            <p className="font-body text-body-sm text-text-grey">
              Set storage rate per CBM/day, handling rates, and billing currency for an Organization.
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

        <form action={formAction} className="mt-4 space-y-4">
          <div>
            <label htmlFor="partyId" className="block font-label text-label font-bold text-on-surface">
              VMI Organization <span className="text-brand-red">*</span>
            </label>
            <select
              id="partyId"
              name="partyId"
              required
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:border-brand-navy focus:outline-none"
            >
              <option value="">Select VMI Organization...</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="storageRatePerCbmDay" className="block font-label text-label font-bold text-on-surface">
                Storage Rate ($/CBM/day) <span className="text-brand-red">*</span>
              </label>
              <input
                id="storageRatePerCbmDay"
                name="storageRatePerCbmDay"
                type="number"
                step="0.0001"
                required
                defaultValue="0.0500"
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-mono text-mono-md text-on-surface font-bold"
              />
            </div>
            <div>
              <label htmlFor="billingCurrency" className="block font-label text-label font-bold text-on-surface">
                Billing Currency
              </label>
              <select
                id="billingCurrency"
                name="billingCurrency"
                defaultValue="USD"
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface"
              >
                <option value="USD">USD ($)</option>
                <option value="PHP">PHP (₱)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="handlingInRatePerCbm" className="block font-label text-label font-bold text-on-surface">
                Handling IN Rate ($/CBM) <span className="text-brand-red">*</span>
              </label>
              <input
                id="handlingInRatePerCbm"
                name="handlingInRatePerCbm"
                type="number"
                step="0.01"
                required
                defaultValue="1.40"
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-mono text-mono-md text-on-surface"
              />
            </div>
            <div>
              <label htmlFor="handlingOutRatePerCbm" className="block font-label text-label font-bold text-on-surface">
                Handling OUT Rate ($/CBM) <span className="text-brand-red">*</span>
              </label>
              <input
                id="handlingOutRatePerCbm"
                name="handlingOutRatePerCbm"
                type="number"
                step="0.01"
                required
                defaultValue="1.40"
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-mono text-mono-md text-on-surface"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="documentationDefaultRateUsd" className="block font-label text-label font-bold text-on-surface">
                Doc Fee ($/AR line) <span className="text-brand-red">*</span>
              </label>
              <input
                id="documentationDefaultRateUsd"
                name="documentationDefaultRateUsd"
                type="number"
                step="0.01"
                required
                defaultValue="15.00"
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-mono text-mono-md text-on-surface"
              />
            </div>
            <div>
              <label htmlFor="billingTiming" className="block font-label text-label font-bold text-on-surface">
                Billing Timing
              </label>
              <select
                id="billingTiming"
                name="billingTiming"
                defaultValue="beginning_of_day"
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface"
              >
                <option value="beginning_of_day">Beginning of Day</option>
                <option value="end_of_day">End of Day</option>
              </select>
            </div>
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
              <Save size={18} />
              {isPending ? "Saving..." : "Save VMI Contract"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
