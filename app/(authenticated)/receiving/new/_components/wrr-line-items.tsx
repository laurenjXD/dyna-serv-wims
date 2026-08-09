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
// server action how many lines to parse. Fields default to { disposition: "store" }.

import { useState } from "react";

interface LineState {
  lotNumber: string;
  expectedQty: string;
  unitCbm: string;
  uom: string;
  disposition: "store" | "inspect";
  putawayLocationId: string;
  itemCode: string;
  customerItemCode: string;
}

const EMPTY_LINE: LineState = {
  lotNumber: "",
  expectedQty: "",
  unitCbm: "",
  uom: "",
  disposition: "store",
  putawayLocationId: "",
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
    <div className="space-y-4">
      {/* Hidden lineCount — consumed by the server action to know how many lines to parse */}
      <input type="hidden" name="lineCount" value={lines.length} />

      {lines.map((line, index) => (
        <div
          key={index}
          className="rounded-md border border-outline-variant/30 bg-surface-white p-4"
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Lot Number — required */}
            <div>
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
            <div>
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
            <div>
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
            <div>
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

            {/* Disposition — required, defaults to store per design.md §7.1 */}
            <div>
              <label
                htmlFor={`line-${index}-disposition`}
                className="block font-label text-label text-text-grey"
              >
                Disposition{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
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
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <option value="store">Store</option>
                <option value="inspect">Inspect</option>
              </select>
            </div>

            {/* Store lines must name their designated storage location before
                confirmation. Inspect lines intentionally leave this blank and
                commit to the configured inspection location instead. */}
            <div>
              <label
                htmlFor={`line-${index}-putawayLocationId`}
                className="block font-label text-label text-text-grey"
              >
                Putaway Location ID {line.disposition === "store" && (
                  <span aria-hidden="true" className="text-brand-red">*</span>
                )}
              </label>
              <input
                id={`line-${index}-putawayLocationId`}
                name={`line_${index}_putawayLocationId`}
                type="text"
                required={line.disposition === "store"}
                disabled={line.disposition === "inspect"}
                value={line.putawayLocationId}
                onChange={(e) => updateLine(index, "putawayLocationId", e.target.value)}
                placeholder={line.disposition === "store" ? "Storage location UUID" : "Resolved to inspection location"}
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral disabled:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* Item Code (supplier) — optional */}
            <div>
              <label
                htmlFor={`line-${index}-itemCode`}
                className="block font-label text-label text-text-grey"
              >
                Item Code (Supplier)
              </label>
              <input
                id={`line-${index}-itemCode`}
                name={`line_${index}_itemCode`}
                type="text"
                value={line.itemCode}
                onChange={(e) => updateLine(index, "itemCode", e.target.value)}
                placeholder="Supplier part number"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* Customer Item Code — optional */}
            <div>
              <label
                htmlFor={`line-${index}-customerItemCode`}
                className="block font-label text-label text-text-grey"
              >
                Customer Item Code
              </label>
              <input
                id={`line-${index}-customerItemCode`}
                name={`line_${index}_customerItemCode`}
                type="text"
                value={line.customerItemCode}
                onChange={(e) =>
                  updateLine(index, "customerItemCode", e.target.value)
                }
                placeholder="Customer part number"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
