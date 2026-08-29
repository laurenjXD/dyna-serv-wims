"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Save, ShieldCheck } from "lucide-react";
import { updateQueuedPickListLineItems } from "../../../_actions";

export type EditablePickListItem = {
  id: string;
  itemId: string;
  itemCode: string;
  customerItemCode: string | null;
  itemDescription: string | null;
  lotNumber: string;
  locationLabel: string;
  qty: number; // total units / pieces
  spq: number;
  numberOfBoxes: number;
};

export function EditPickListClient({
  pickListId,
  pickListNumber,
  status,
  initialItems,
}: {
  pickListId: string;
  pickListNumber: string;
  status: string;
  initialItems: EditablePickListItem[];
}) {
  const [items, setItems] = useState<EditablePickListItem[]>(initialItems);

  const updateItem = (id: string, patch: Partial<EditablePickListItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const handlePackagesChange = (id: string, val: string, currentSpq: number) => {
    const boxes = Number(val) || 0;
    updateItem(id, {
      numberOfBoxes: boxes,
      qty: boxes * currentSpq,
    });
  };

  const handleTotalUnitsChange = (id: string, val: string, currentSpq: number) => {
    const units = Number(val) || 0;
    const boxes = Math.max(1, Math.ceil(units / (currentSpq || 1)));
    updateItem(id, {
      qty: units,
      numberOfBoxes: val === "" ? 0 : boxes,
    });
  };

  const handleSpqChange = (id: string, val: string, currentBoxes: number) => {
    const spqVal = Number(val) || 1;
    updateItem(id, {
      spq: spqVal,
      qty: currentBoxes * spqVal,
    });
  };

  const lineItemsPayload = useMemo(() => {
    return JSON.stringify(
      items.map((item) => ({
        lineId: item.id,
        qty: item.qty,
        spq: item.spq,
        numberOfBoxes: item.numberOfBoxes,
      })),
    );
  }, [items]);

  const totalBoxes = items.reduce((sum, item) => sum + item.numberOfBoxes, 0);
  const totalUnits = items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/30 pb-6">
        <div className="flex items-center gap-3">
          <Link
            href={`/pick-lists/${pickListId}/dispatch`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-white text-on-surface hover:bg-surface-light-grey focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            aria-label="Back to Pick List"
          >
            <ChevronLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-headline-md font-extrabold text-on-surface">
                Edit Pick List
              </h1>
              <span className="font-mono text-mono-lg font-bold text-brand-navy">
                {pickListNumber}
              </span>
              <span className="inline-flex rounded-full bg-status-pending/20 px-2.5 py-0.5 font-label text-mono-xs font-bold uppercase text-status-pending">
                {status}
              </span>
            </div>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Modify QTY, SPQ, or Box counts before dispatch. Changes update physical picking verification.
            </p>
          </div>
        </div>

        <form action={updateQueuedPickListLineItems} className="flex items-center gap-3">
          <input type="hidden" name="pickListId" value={pickListId} />
          <input type="hidden" name="lineItemsPayload" value={lineItemsPayload} />
          <Link
            href={`/pick-lists/${pickListId}/dispatch`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-white px-4 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-label text-label font-bold text-surface-white hover:bg-primary-hover shadow-elevation-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy active:scale-[0.98]"
          >
            <Save size={18} />
            Save &amp; Update Pick List
          </button>
        </form>
      </div>

      {/* Summary Chips */}
      <div className="mt-6 flex flex-wrap gap-4">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white px-4 py-3 shadow-elevation-1">
          <p className="font-label text-label-xs uppercase text-text-grey">Total Packages (Boxes)</p>
          <p className="mt-0.5 font-mono text-title-md font-bold text-brand-navy">{totalBoxes.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white px-4 py-3 shadow-elevation-1">
          <p className="font-label text-label-xs uppercase text-text-grey">Total Dispatched Units (Pieces)</p>
          <p className="mt-0.5 font-mono text-title-md font-bold text-brand-royal-blue">{totalUnits.toLocaleString()}</p>
        </div>
      </div>

      {/* Editable Line Items Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-body text-body-sm">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey text-xs uppercase tracking-wider text-text-grey">
                <th className="px-4 py-3 font-label font-bold">QTY (Total Units)</th>
                <th className="px-4 py-3 font-label font-bold">SPQ</th>
                <th className="px-4 py-3 font-label font-bold">No. of Pckgs (Boxes)</th>
                <th className="px-4 py-3 font-label font-bold">Item Code</th>
                <th className="px-4 py-3 font-label font-bold">Customer PN</th>
                <th className="px-4 py-3 font-label font-bold">Item Description</th>
                <th className="px-4 py-3 font-label font-bold">Lot Number</th>
                <th className="px-4 py-3 font-label font-bold">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-surface-light-grey/40">
                  {/* QTY Input */}
                  <td className="px-4 py-3">
                    <label className="flex h-11 w-28 items-center rounded border border-outline-variant bg-surface-white px-2 focus-within:ring-2 focus-within:ring-primary">
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => handleTotalUnitsChange(item.id, e.target.value, item.spq)}
                        className="w-full bg-transparent text-right font-mono text-mono-md font-bold text-on-surface outline-none"
                        title="Total Units (Pieces)"
                      />
                    </label>
                  </td>

                  {/* SPQ Input */}
                  <td className="px-4 py-3">
                    <label className="flex h-11 w-24 items-center rounded border border-outline-variant bg-surface-white px-2 focus-within:ring-2 focus-within:ring-primary">
                      <input
                        type="number"
                        min="1"
                        value={item.spq}
                        onChange={(e) => handleSpqChange(item.id, e.target.value, item.numberOfBoxes)}
                        className="w-full bg-transparent text-right font-mono text-mono-md text-on-surface outline-none"
                        title="Standard Packaging Quantity (SPQ)"
                      />
                    </label>
                  </td>

                  {/* No. of Pckgs (Boxes) Input */}
                  <td className="px-4 py-3">
                    <label className="flex h-11 w-28 items-center rounded border border-outline-variant bg-surface-white px-2 focus-within:ring-2 focus-within:ring-primary">
                      <input
                        type="number"
                        min="1"
                        value={item.numberOfBoxes}
                        onChange={(e) => handlePackagesChange(item.id, e.target.value, item.spq)}
                        className="w-full bg-transparent text-right font-mono text-mono-md font-bold text-on-surface outline-none"
                        title="Number of Packages (Boxes)"
                      />
                    </label>
                  </td>

                  {/* Item Code */}
                  <td className="px-4 py-3 font-mono font-bold text-on-surface">
                    {item.itemCode}
                  </td>

                  {/* Customer PN */}
                  <td className="px-4 py-3 font-mono text-text-grey">
                    {item.customerItemCode || "—"}
                  </td>

                  {/* Description */}
                  <td className="px-4 py-3 text-on-surface">
                    {item.itemDescription || "—"}
                  </td>

                  {/* Lot Number */}
                  <td className="px-4 py-3 font-mono text-on-surface">
                    {item.lotNumber}
                  </td>

                  {/* Location */}
                  <td className="px-4 py-3 font-mono font-semibold text-brand-navy">
                    {item.locationLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
