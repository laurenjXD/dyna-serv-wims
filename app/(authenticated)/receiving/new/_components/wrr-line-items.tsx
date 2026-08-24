"use client";

// WRR line items — dynamic list of expected line inputs.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §5.1 — expected line fields
//   specs/07-incoming-receiving/requirements.md R1.3 — lotNumber, expectedQty,
//     UOM, unit_cbm, disposition required per line
//   specs/00-steering/brand-design-system.md §9 (forms), §3 (touch targets h-11)
//
// Manages a stateful array of lines. Each line is rendered as a group of
// form inputs named `line_N_fieldName`. A hidden `lineCount` input tells the
// server action how many lines to parse. The disposition is submitted as `store`.

import { useEffect, useState } from "react";
import type { WrrItemOption } from "@/lib/db/queries/items";

interface LineState {
  lotNumber: string;
  expectedQty: string;
  unitCbm: string;
  uom: string;
  itemCode: string;
  itemDescription: string;
  customerItemCode: string;
  manufactureDate: string;
  remarks: string;
  itemId: string;
}

const EMPTY_LINE: LineState = {
  lotNumber: "",
  expectedQty: "",
  unitCbm: "",
  uom: "",
  itemCode: "",
  itemDescription: "",
  customerItemCode: "",
  manufactureDate: "",
  remarks: "",
  itemId: "",
};

// Item Code label is conditional on the WRR's Inventory Model (2026-08-19
// user request): Trading lines are identified by DSGC Item Number; VMI (and
// unset/Supplies) lines keep the original Supplier Item Code framing —
// `wrr_items` has no separate `dsgc_item_number` column at the line level,
// so both cases still post to the same `line_N_itemCode` field / `item_code`
// column, only the label changes.
function itemCodeLabel(flowType: string): string {
  return flowType === "trading" ? "DSGC Item Number" : "Item Code (Supplier)";
}

export function WrrLineItems({ flowType, vendorPartyId, itemOptions }: { flowType: string; vendorPartyId: string; itemOptions: WrrItemOption[] }) {
  const [lines, setLines] = useState<LineState[]>([{ ...EMPTY_LINE }]);

  // Never retain a selection from a different organization. Besides being
  // confusing in the form, retaining it would let a stale hidden itemId be
  // submitted after the operator changes vendor.
  useEffect(() => {
    setLines((prev) => prev.map((line) => ({ ...line, itemId: "", itemCode: "", itemDescription: "", customerItemCode: "" })));
  }, [vendorPartyId]);

  const availableItems = vendorPartyId
    ? itemOptions.filter((item) => item.defaultSupplierPartyId === vendorPartyId)
    : [];

  function codeFor(item: WrrItemOption): string {
    return flowType === "trading"
      ? (item.dsgcItemNumber ?? item.code)
      : (item.supplierItemCode ?? item.code);
  }

  function chooseItem(index: number, itemId: string) {
    const item = availableItems.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setLines((prev) => prev.map((line, i) => i === index ? {
      ...line,
      itemId: item.id,
      itemCode: codeFor(item),
      itemDescription: item.name,
      customerItemCode: item.customerItemCode ?? "",
      uom: item.uom,
      unitCbm: item.volumeCbm,
    } : line));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLine(index: number, field: keyof LineState, value: string) {
    setLines((prev) =>
      prev.map((line, i) =>
        i === index ? { ...line, [field]: value } : line
      )
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden lineCount — consumed by the server action to know how many lines to parse */}
      <input type="hidden" name="lineCount" value={lines.length} />

      {lines.map((line, index) => (
        <div
          key={index}
          className="rounded-xl border border-outline-variant/30 bg-surface-white p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="font-label text-label text-brand-navy">
              Line {index + 1}
            </span>
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => removeLine(index)}
                className="inline-flex h-11 items-center rounded bg-status-held px-3 font-label text-label text-surface-white hover:opacity-90 active:opacity-70 motion-safe:transition-opacity motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Remove
              </button>
            )}
          </div>

          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name={`line_${index}_itemId`} value={line.itemId} />
            {/* Lot Number — required */}
            <div className="order-1">
              <label
                htmlFor={`line-${index}-lotNumber`}
                className="block font-label text-label text-text-grey"
              >
                Lot Number{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id={`line-${index}-lotNumber`}
                name={`line_${index}_lotNumber`}
                type="text"
                required
                value={line.lotNumber}
                onChange={(e) => updateLine(index, "lotNumber", e.target.value)}
                placeholder="e.g. LOT-2026-001"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* Expected Qty — required */}
            <div className="order-2">
              <label
                htmlFor={`line-${index}-expectedQty`}
                className="block font-label text-label text-text-grey"
              >
                Expected Qty{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id={`line-${index}-expectedQty`}
                name={`line_${index}_expectedQty`}
                type="number"
                required
                min="1"
                step="1"
                value={line.expectedQty}
                onChange={(e) =>
                  updateLine(index, "expectedQty", e.target.value)
                }
                placeholder="0"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* Unit CBM — required */}
            <div className="order-5">
              <label
                htmlFor={`line-${index}-unitCbm`}
                className="block font-label text-label text-text-grey"
              >
                Unit CBM{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id={`line-${index}-unitCbm`}
                name={`line_${index}_unitCbm`}
                type="number"
                required
                min="0.0001"
                step="0.0001"
                value={line.unitCbm}
                onChange={(e) => updateLine(index, "unitCbm", e.target.value)}
                placeholder="0.0000"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* UOM — required */}
            <div className="order-6">
              <label
                htmlFor={`line-${index}-uom`}
                className="block font-label text-label text-text-grey"
              >
                UOM{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id={`line-${index}-uom`}
                name={`line_${index}_uom`}
                type="text"
                required
                value={line.uom}
                onChange={(e) => updateLine(index, "uom", e.target.value)}
                placeholder="e.g. CTN, PCS, ROLL"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* WRR creation always stages for store; inspection remains a later workflow. */}
            <input type="hidden" name={`line_${index}_disposition`} value="store" />

            {/* Item code selection drives the read-only item description and defaults. */}
            <div className="order-3">
              <label
                htmlFor={`line-${index}-itemCode`}
                className="block font-label text-label text-text-grey"
              >
                {itemCodeLabel(flowType)}
              </label>
              <select id={`line-${index}-itemCode`} aria-label={`Registered ${itemCodeLabel(flowType)} options`} value={line.itemId} disabled={!vendorPartyId} onChange={(e) => chooseItem(index, e.target.value)} className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface disabled:cursor-not-allowed disabled:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy">
                <option value="">{vendorPartyId ? "Select item code…" : "Select organization first"}</option>
                {availableItems.map((item) => <option key={item.id} value={item.id}>{codeFor(item)} — {item.name}</option>)}
              </select>
              <input type="hidden" name={`line_${index}_itemCode`} value={line.itemCode} />
            </div>

            <div className="order-4 sm:col-span-2 lg:col-span-3">
              <label htmlFor={`line-${index}-itemDescription`} className="block font-label text-label text-text-grey">Item Description</label>
              <input id={`line-${index}-itemDescription`} value={line.itemDescription} readOnly placeholder="Select an item code to fill this automatically" className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-light-grey px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral" />
            </div>

            {/* Customer Item Code — optional */}
            <div className="order-7">
              <label
                htmlFor={`line-${index}-customerItemCode`}
                className="block font-label text-label text-text-grey"
              >
                Customer Item Code
              </label>
              <input id={`line-${index}-customerItemCode`} name={`line_${index}_customerItemCode`} value={line.customerItemCode} onChange={(e) => updateLine(index, "customerItemCode", e.target.value)} placeholder="Filled from selected item; editable if needed" className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy" />
            </div>

            <div className="order-8">
              <label htmlFor={`line-${index}-manufactureDate`} className="block font-label text-label text-text-grey">
                Manufacturing Date
              </label>
              <input
                id={`line-${index}-manufactureDate`}
                name={`line_${index}_manufactureDate`}
                type="date"
                value={line.manufactureDate}
                onChange={(e) => updateLine(index, "manufactureDate", e.target.value)}
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            <div className="order-9 sm:col-span-2 lg:col-span-3">
              <label htmlFor={`line-${index}-remarks`} className="block font-label text-label text-text-grey">
                Remarks
              </label>
              <textarea
                id={`line-${index}-remarks`}
                name={`line_${index}_remarks`}
                value={line.remarks}
                onChange={(e) => updateLine(index, "remarks", e.target.value)}
                rows={2}
                placeholder="Optional receiving or CIPL note"
                className="mt-1 w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add Line button — §9 secondary button style */}
      <button
        type="button"
        onClick={addLine}
        className="inline-flex h-11 items-center justify-center rounded border-2 border-outline-variant/30 px-4 font-label text-label text-brand-navy hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
      >
        + Add Line
      </button>
    </div>
  );
}
