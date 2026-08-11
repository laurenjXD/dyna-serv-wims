"use client";

import { useState } from "react";

interface LineState {
  lotNumber: string;
  expectedQty: string;
  unitCbm: string;
  uom: string;
  disposition: "store" | "inspect";
  itemCode: string;
  customerItemCode: string;
}

const EMPTY_LINE: LineState = {
  lotNumber: "",
  expectedQty: "",
  unitCbm: "",
  uom: "",
  disposition: "store",
  itemCode: "",
  customerItemCode: "",
};

export function WrrLineItems() {
  const [lines, setLines] = useState<LineState[]>([{ ...EMPTY_LINE }]);

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
    <div className="space-y-md">
      {/* Hidden lineCount — consumed by the server action to know how many lines to parse */}
      <input type="hidden" name="lineCount" value={lines.length} />

      {lines.map((line, index) => (
        <div
          key={index}
          className="rounded-xl border border-outline-variant bg-surface p-md shadow-sm"
        >
          <div className="mb-md flex items-center justify-between border-b border-outline-variant/50 pb-xs">
            <span className="font-label text-label-lg font-semibold text-primary">
              Line {index + 1}
            </span>
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => removeLine(index)}
                className="inline-flex h-8 items-center gap-xs rounded-full bg-error-container/30 px-3 font-label text-label-sm text-error hover:bg-error-container/50 transition-colors focus:outline-none focus:ring-2 focus:ring-error"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                Remove
              </button>
            )}
          </div>

          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            {/* Lot Number */}
            <div>
              <label htmlFor={`line-${index}-lotNumber`} className="block font-label text-label-sm text-on-surface-variant mb-xs">
                Lot Number <span className="text-error">*</span>
              </label>
              <input
                id={`line-${index}-lotNumber`}
                name={`line_${index}_lotNumber`}
                type="text"
                required
                value={line.lotNumber}
                onChange={(e) => updateLine(index, "lotNumber", e.target.value)}
                placeholder="e.g. LOT-2026-001"
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-mono text-body-md text-on-surface placeholder:font-body placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            {/* Expected Qty */}
            <div>
              <label htmlFor={`line-${index}-expectedQty`} className="block font-label text-label-sm text-on-surface-variant mb-xs">
                Expected Qty <span className="text-error">*</span>
              </label>
              <input
                id={`line-${index}-expectedQty`}
                name={`line_${index}_expectedQty`}
                type="number"
                required
                min="1"
                step="1"
                value={line.expectedQty}
                onChange={(e) => updateLine(index, "expectedQty", e.target.value)}
                placeholder="0"
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-mono text-body-md text-on-surface placeholder:font-body placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            {/* Unit CBM */}
            <div>
              <label htmlFor={`line-${index}-unitCbm`} className="block font-label text-label-sm text-on-surface-variant mb-xs">
                Unit CBM <span className="text-error">*</span>
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
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-mono text-body-md text-on-surface placeholder:font-body placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            {/* UOM */}
            <div>
              <label htmlFor={`line-${index}-uom`} className="block font-label text-label-sm text-on-surface-variant mb-xs">
                UOM <span className="text-error">*</span>
              </label>
              <input
                id={`line-${index}-uom`}
                name={`line_${index}_uom`}
                type="text"
                required
                value={line.uom}
                onChange={(e) => updateLine(index, "uom", e.target.value)}
                placeholder="e.g. CTN, PCS, ROLL"
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-body text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            {/* Disposition */}
            <div>
              <label htmlFor={`line-${index}-disposition`} className="block font-label text-label-sm text-on-surface-variant mb-xs">
                Disposition <span className="text-error">*</span>
              </label>
              <select
                id={`line-${index}-disposition`}
                name={`line_${index}_disposition`}
                required
                value={line.disposition}
                onChange={(e) =>
                  updateLine(
                    index,
                    "disposition",
                    e.target.value as "store" | "inspect"
                  )
                }
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-body text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              >
                <option value="store">Store</option>
                <option value="inspect">Inspect</option>
              </select>
            </div>

            {/* Item Code (supplier) */}
            <div>
              <label htmlFor={`line-${index}-itemCode`} className="block font-label text-label-sm text-on-surface-variant mb-xs">
                Item Code (Supplier)
              </label>
              <input
                id={`line-${index}-itemCode`}
                name={`line_${index}_itemCode`}
                type="text"
                value={line.itemCode}
                onChange={(e) => updateLine(index, "itemCode", e.target.value)}
                placeholder="Supplier part number"
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-body text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            {/* Customer Item Code */}
            <div>
              <label htmlFor={`line-${index}-customerItemCode`} className="block font-label text-label-sm text-on-surface-variant mb-xs">
                Customer Item Code
              </label>
              <input
                id={`line-${index}-customerItemCode`}
                name={`line_${index}_customerItemCode`}
                type="text"
                value={line.customerItemCode}
                onChange={(e) => updateLine(index, "customerItemCode", e.target.value)}
                placeholder="Customer part number"
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-body text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add Line button */}
      <button
        type="button"
        onClick={addLine}
        className="inline-flex h-11 items-center gap-xs justify-center rounded-full border border-outline-variant px-md font-label text-label-md text-primary hover:bg-primary/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary mt-sm"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        Add Line
      </button>
    </div>
  );
}
