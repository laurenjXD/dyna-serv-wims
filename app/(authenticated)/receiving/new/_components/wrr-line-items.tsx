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
import { ItemSearchCombobox } from "./ItemSearchCombobox";

export interface ImportedWrrLine {
  itemId: string;
  customerItemCode: string;
  lotNumber: string;
  mfgDate: string;
  expiryDate: string;
  expectedQty: string;
  uom: string;
  remarks: string;
  disposition: "store" | "inspect";
}

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
  disposition: "store" | "inspect";
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
  disposition: "store",
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

export function WrrLineItems({
  flowType,
  vendorPartyId,
  itemOptions,
  importedLines,
}: {
  flowType: string;
  vendorPartyId: string;
  itemOptions: WrrItemOption[];
  importedLines?: ImportedWrrLine[];
}) {
  const [lines, setLines] = useState<LineState[]>([{ ...EMPTY_LINE }]);

  // Handle imported document lines automatically
  useEffect(() => {
    if (importedLines && importedLines.length > 0) {
      const mapped: LineState[] = importedLines.map((imp) => {
        const item = itemOptions.find((candidate) => candidate.id === imp.itemId);
        return {
          lotNumber: imp.lotNumber || "",
          expectedQty: imp.expectedQty || "",
          unitCbm: item ? item.volumeCbm : "0.001",
          uom: imp.uom || (item ? item.uom : "BOX"),
          itemCode: item
            ? flowType === "trading"
              ? (item.dsgcItemNumber ?? item.code)
              : (item.supplierItemCode ?? item.code)
            : "",
          itemDescription: item ? item.name : "",
          customerItemCode: imp.customerItemCode || (item ? (item.customerItemCode ?? "") : ""),
          manufactureDate: imp.mfgDate || "",
          remarks: imp.remarks || "",
          itemId: imp.itemId || "",
          disposition: imp.disposition || "store",
        };
      });
      setLines(mapped);
    }
  }, [importedLines, itemOptions, flowType]);

  // Never retain a selection from a different organization when vendor changes manually,
  // unless imported lines were just applied.
  useEffect(() => {
    if (!importedLines || importedLines.length === 0) {
      setLines((prev) => prev.map((line) => ({ ...line, itemId: "", itemCode: "", itemDescription: "", customerItemCode: "" })));
    }
  }, [vendorPartyId, importedLines]);

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

      {lines.map((line, index) => {
        const isImported = Boolean(importedLines && importedLines.length > 0 && line.lotNumber);
        return (
          <div
            key={index}
            className="rounded-2xl border border-slate-200/80 bg-[#FAFAFA] p-5 shadow-sm space-y-4"
          >
            {/* Line Card Header */}
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy font-mono text-xs font-bold text-surface-white">
                  {index + 1}
                </span>
                <span className="font-heading text-sm font-bold text-on-surface">
                  Line {index + 1}
                </span>
                {isImported && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-label text-label-xs font-semibold text-brand-navy border border-blue-200">
                    Auto-populated from CIPL (Locked)
                  </span>
                )}
              </div>
              {lines.length > 1 && !isImported && (
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 font-label text-label-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  Remove Line
                </button>
              )}
            </div>

            <input type="hidden" name={`line_${index}_itemId`} value={line.itemId} />
            <input type="hidden" name={`line_${index}_itemCode`} value={line.itemCode} />
            <input type="hidden" name={`line_${index}_disposition`} value="store" />

            {/* Row 1: Item Identification (3 balanced columns) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {/* Col 1: Item Code (Combobox) */}
              <div>
                <label className="block font-label text-label text-text-grey">
                  {itemCodeLabel(flowType)} <span aria-hidden="true" className="text-brand-red">*</span>
                </label>
                <div className="mt-1">
                  <ItemSearchCombobox
                    index={index}
                    flowType={flowType}
                    vendorPartyId={vendorPartyId}
                    availableItems={availableItems}
                    selectedItemId={line.itemId}
                    selectedItemCode={line.itemCode}
                    selectedItemDescription={line.itemDescription}
                    onSelectItem={(item) => chooseItem(index, item.id)}
                    disabled={isImported}
                  />
                </div>
              </div>

              {/* Col 2: Item Description (Auto-filled) */}
              <div>
                <label htmlFor={`line-${index}-itemDescription`} className="block font-label text-label text-text-grey">
                  Item Description
                </label>
                <input
                  id={`line-${index}-itemDescription`}
                  value={line.itemDescription}
                  readOnly
                  placeholder="Auto-filled from item selection"
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-slate-100/70 px-3 font-body text-body-md text-slate-700 placeholder:text-status-neutral truncate"
                />
              </div>

              {/* Col 3: Customer Item Code */}
              <div>
                <label htmlFor={`line-${index}-customerItemCode`} className="block font-label text-label text-text-grey">
                  Customer Item Code
                </label>
                <input
                  id={`line-${index}-customerItemCode`}
                  name={`line_${index}_customerItemCode`}
                  value={line.customerItemCode}
                  onChange={(e) => updateLine(index, "customerItemCode", e.target.value)}
                  placeholder="Customer SKU / reference"
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
                />
              </div>
            </div>

            {/* Row 2: Lot Number & Dates (3 balanced columns) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {/* Col 1: Lot Number */}
              <div>
                <label htmlFor={`line-${index}-lotNumber`} className="block font-label text-label text-text-grey">
                  Lot Number <span aria-hidden="true" className="text-brand-red">*</span>
                </label>
                <input
                  id={`line-${index}-lotNumber`}
                  name={`line_${index}_lotNumber`}
                  type="text"
                  required
                  readOnly={isImported}
                  value={line.lotNumber}
                  onChange={(e) => updateLine(index, "lotNumber", e.target.value)}
                  placeholder="e.g. LOT-2026-001"
                  className={`mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy ${
                    isImported ? "bg-slate-100 cursor-not-allowed text-slate-600" : "bg-surface-white"
                  }`}
                />
              </div>

              {/* Col 2: Manufacturing Date */}
              <div>
                <label htmlFor={`line-${index}-manufactureDate`} className="block font-label text-label text-text-grey">
                  Manufacturing Date
                </label>
                <input
                  id={`line-${index}-manufactureDate`}
                  name={`line_${index}_manufactureDate`}
                  type="date"
                  value={line.manufactureDate}
                  onChange={(e) => updateLine(index, "manufactureDate", e.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                />
              </div>

              {/* Col 3: Remarks */}
              <div>
                <label htmlFor={`line-${index}-remarks`} className="block font-label text-label text-text-grey">
                  Remarks
                </label>
                <input
                  id={`line-${index}-remarks`}
                  name={`line_${index}_remarks`}
                  value={line.remarks}
                  onChange={(e) => updateLine(index, "remarks", e.target.value)}
                  type="text"
                  placeholder="Optional receiving or CIPL note"
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
                />
              </div>
            </div>

            {/* Row 3: Quantities, CBM & UOM (3 balanced columns) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {/* Col 1: Expected Qty */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor={`line-${index}-expectedQty`} className="block font-label text-label text-text-grey">
                    Expected Qty (Total Units) <span aria-hidden="true" className="text-brand-red">*</span>
                  </label>
                  {(() => {
                    const selItem = itemOptions.find((i) => i.id === line.itemId);
                    if (!selItem) return null;
                    const qtyNum = Number(line.expectedQty);
                    const cartons = qtyNum > 0 && selItem.spq ? (qtyNum / selItem.spq).toFixed(1).replace(/\.0$/, "") : null;
                    return (
                      <span className="font-mono text-[11px] font-bold text-brand-navy bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        SPQ: {selItem.spq} {cartons ? `(${cartons} ctn)` : ""}
                      </span>
                    );
                  })()}
                </div>
                <input
                  id={`line-${index}-expectedQty`}
                  name={`line_${index}_expectedQty`}
                  type="number"
                  required
                  min="1"
                  step="1"
                  readOnly={Boolean(importedLines && importedLines.length > 0 && line.lotNumber)}
                  value={line.expectedQty}
                  onChange={(e) => updateLine(index, "expectedQty", e.target.value)}
                  placeholder="0"
                  className={`mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy ${
                    Boolean(importedLines && importedLines.length > 0 && line.lotNumber) ? "bg-slate-100 cursor-not-allowed" : "bg-surface-white"
                  }`}
                />
                <p className="mt-1 font-body text-[11px] text-text-grey">
                  Total units = SPQ &times; packages/cartons
                </p>
              </div>

              {/* Col 2: Unit CBM */}
              <div>
                <label htmlFor={`line-${index}-unitCbm`} className="block font-label text-label text-text-grey">
                  Unit CBM <span aria-hidden="true" className="text-brand-red">*</span>
                </label>
                <input
                  id={`line-${index}-unitCbm`}
                  name={`line_${index}_unitCbm`}
                  type="number"
                  required
                  min="0.0001"
                  step="0.0001"
                  readOnly={Boolean(importedLines && importedLines.length > 0 && line.lotNumber)}
                  value={line.unitCbm}
                  onChange={(e) => updateLine(index, "unitCbm", e.target.value)}
                  placeholder="0.0000"
                  className={`mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy ${
                    Boolean(importedLines && importedLines.length > 0 && line.lotNumber) ? "bg-slate-100 cursor-not-allowed" : "bg-surface-white"
                  }`}
                />
                <p className="mt-1 font-body text-[11px] text-text-grey">
                  Cubic meter volume per unit
                </p>
              </div>

              {/* Col 3: UOM */}
              <div>
                <label htmlFor={`line-${index}-uom`} className="block font-label text-label text-text-grey">
                  UOM <span aria-hidden="true" className="text-brand-red">*</span>
                </label>
                <input
                  id={`line-${index}-uom`}
                  name={`line_${index}_uom`}
                  type="text"
                  required
                  readOnly={Boolean(importedLines && importedLines.length > 0 && line.lotNumber)}
                  value={line.uom}
                  onChange={(e) => updateLine(index, "uom", e.target.value)}
                  placeholder="e.g. PIECE, BOX, CTN"
                  className={`mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy uppercase ${
                    Boolean(importedLines && importedLines.length > 0 && line.lotNumber) ? "bg-slate-100 cursor-not-allowed" : "bg-surface-white"
                  }`}
                />
                <p className="mt-1 font-body text-[11px] text-text-grey">
                  Standard unit of measure
                </p>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add Line button */}
      <button
        type="button"
        onClick={addLine}
        className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-surface-white px-5 font-label text-label font-bold text-brand-navy hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-navy shadow-sm"
      >
        + Add Another Line
      </button>
    </div>
  );
}
