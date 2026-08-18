"use client";

// Transfer line items — dynamic list of transfer line inputs.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §2 (transfer_lines fields)
//   specs/11-transfer-and-inspection/requirements.md R1.2 — request SHALL identify
//     item, lot, flow type, quantity, source/destination.
//   specs/00-steering/brand-design-system.md §9 (forms), §3 (touch targets h-11)
//
// Manages a stateful array of lines. Each line is rendered as a group of
// form inputs named `line_N_fieldName`. A hidden `lineCount` input tells the
// server action how many lines to parse.

import { useState } from "react";

interface LineState {
  lotId: string;
  itemId: string;
  qtyRequested: string;
}

const EMPTY_LINE: LineState = {
  lotId: "",
  itemId: "",
  qtyRequested: "",
};

export function TransferLineItems() {
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
                className="inline-flex h-11 items-center rounded bg-status-held px-3 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Remove
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Lot ID — required; Roboto Mono per §9 codes/IDs */}
            <div>
              <label
                htmlFor={`line-${index}-lotId`}
                className="block font-label text-label text-text-grey"
              >
                Lot ID{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id={`line-${index}-lotId`}
                name={`line_${index}_lotId`}
                type="text"
                required
                value={line.lotId}
                onChange={(e) => updateLine(index, "lotId", e.target.value)}
                placeholder="UUID of the lot"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* Item ID — required; Roboto Mono per §9 codes/IDs */}
            <div>
              <label
                htmlFor={`line-${index}-itemId`}
                className="block font-label text-label text-text-grey"
              >
                Item ID{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id={`line-${index}-itemId`}
                name={`line_${index}_itemId`}
                type="text"
                required
                value={line.itemId}
                onChange={(e) => updateLine(index, "itemId", e.target.value)}
                placeholder="UUID of the item"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* Qty Requested — required; must be > 0 */}
            <div>
              <label
                htmlFor={`line-${index}-qtyRequested`}
                className="block font-label text-label text-text-grey"
              >
                Qty Requested{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id={`line-${index}-qtyRequested`}
                name={`line_${index}_qtyRequested`}
                type="number"
                required
                min="0.0001"
                step="0.0001"
                value={line.qtyRequested}
                onChange={(e) =>
                  updateLine(index, "qtyRequested", e.target.value)
                }
                placeholder="0"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add Line button — §9 secondary button style */}
      <button
        type="button"
        onClick={addLine}
        className="inline-flex h-11 items-center justify-center rounded border-2 border-outline-variant px-4 font-label text-label text-brand-navy hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
      >
        + Add Line
      </button>
    </div>
  );
}
