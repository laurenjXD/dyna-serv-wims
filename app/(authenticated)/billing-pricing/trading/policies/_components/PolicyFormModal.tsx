"use client";

import { useActionState, useState, useEffect } from "react";
import { X, Save, AlertCircle } from "lucide-react";
import { createTradingPolicyAction } from "../_actions";

type Option = { id: string; name: string; code: string };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  parties: Option[];
  items: Option[];
}

export function PolicyFormModal({ isOpen, onClose, parties, items }: Props) {
  const [state, formAction, isPending] = useActionState(
    createTradingPolicyAction,
    {},
  );

  const [buyCost, setBuyCost] = useState("100.00");
  const [marginType, setMarginType] = useState<"percentage" | "fixed_amount">("percentage");
  const [marginValue, setMarginValue] = useState("15.00");
  const [sellPrice, setSellPrice] = useState("115.00");
  const [isOverride, setIsOverride] = useState(false);

  useEffect(() => {
    if (!isOverride) {
      const cost = parseFloat(buyCost);
      const val = parseFloat(marginValue);
      if (!isNaN(cost) && !isNaN(val)) {
        let calc = cost;
        if (marginType === "percentage") {
          calc = cost * (1 + val / 100);
        } else {
          calc = cost + val;
        }
        setSellPrice((Math.round(calc * 10000) / 10000).toFixed(4));
      }
    }
  }, [buyCost, marginType, marginValue, isOverride]);

  useEffect(() => {
    if (state.ok) {
      onClose();
    }
  }, [state.ok, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-3">
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
          <div>
            <h3 className="font-heading text-title-md font-bold text-on-surface">
              Configure Rate Card
            </h3>
            <p className="font-body text-body-sm text-text-grey">
              Set default Trading buy cost and sell price per Customer &amp; Item.
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
              Customer Organization <span className="text-brand-red">*</span>
            </label>
            <select
              id="partyId"
              name="partyId"
              required
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:border-brand-navy focus:outline-none"
            >
              <option value="">Select Organization...</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="itemId" className="block font-label text-label font-bold text-on-surface">
              Item <span className="text-brand-red">*</span>
            </label>
            <select
              id="itemId"
              name="itemId"
              required
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:border-brand-navy focus:outline-none"
            >
              <option value="">Select Item...</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.code} - {i.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="buyCost" className="block font-label text-label font-bold text-on-surface">
                Buy Cost <span className="text-brand-red">*</span>
              </label>
              <input
                id="buyCost"
                name="buyCost"
                type="number"
                step="0.0001"
                required
                value={buyCost}
                onChange={(e) => setBuyCost(e.target.value)}
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-mono text-mono-md text-on-surface"
              />
            </div>
            <div>
              <label htmlFor="buyCurrency" className="block font-label text-label font-bold text-on-surface">
                Buy Currency
              </label>
              <select
                id="buyCurrency"
                name="buyCurrency"
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
              <label htmlFor="marginType" className="block font-label text-label font-bold text-on-surface">
                Margin Type
              </label>
              <select
                id="marginType"
                name="marginType"
                value={marginType}
                onChange={(e) => setMarginType(e.target.value as "percentage" | "fixed_amount")}
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed_amount">Fixed Amount ($/₱)</option>
              </select>
            </div>
            <div>
              <label htmlFor="marginValue" className="block font-label text-label font-bold text-on-surface">
                Margin Value <span className="text-brand-red">*</span>
              </label>
              <input
                id="marginValue"
                name="marginValue"
                type="number"
                step="0.01"
                required
                value={marginValue}
                onChange={(e) => setMarginValue(e.target.value)}
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-mono text-mono-md text-on-surface"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sellPrice" className="block font-label text-label font-bold text-on-surface">
                Sell Price <span className="text-brand-red">*</span>
              </label>
              <input
                id="sellPrice"
                name="sellPrice"
                type="number"
                step="0.0001"
                required
                value={sellPrice}
                onChange={(e) => {
                  setSellPrice(e.target.value);
                  setIsOverride(true);
                }}
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-mono text-mono-md text-on-surface font-bold"
              />
            </div>
            <div>
              <label htmlFor="sellCurrency" className="block font-label text-label font-bold text-on-surface">
                Sell Currency
              </label>
              <select
                id="sellCurrency"
                name="sellCurrency"
                defaultValue="PHP"
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface"
              >
                <option value="PHP">PHP (₱)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="sellPriceIsOverride"
              name="sellPriceIsOverride"
              type="checkbox"
              value="true"
              checked={isOverride}
              onChange={(e) => setIsOverride(e.target.checked)}
              className="h-4 w-4 rounded border-outline-variant text-brand-navy focus:ring-brand-navy"
            />
            <label htmlFor="sellPriceIsOverride" className="font-body text-body-sm text-text-grey">
              Manual Sell Price Override (differs from standard buy cost + margin)
            </label>
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
              {isPending ? "Saving..." : "Save Rate Card"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
