"use client";

// WRR-time per-unit label generator.
// Traceability:
//   specs/18-barcode-integration/design.md §2.2 (WRR-time per-unit label generation)
//   specs/07-incoming-receiving/design.md §6.2 / §9 (scan reconciliation & duplicate rejection)
//   specs/00-steering/brand-design-system.md §9 (physical label and print typography)

import { useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { createWrrUnitPayload } from "@/lib/barcode/wrr-unit";

export interface WRRUnitLabelGeneratorProps {
  wrrItemId: string;
  wrrNumber: string;
  itemCode: string;
  lotNumber: string;
  expectedQty: number;
}

interface UnitLabelData {
  unitId: string;
  cartonId: string;
  unitIndex: number;
  payload: string; // JSON includes the unique carton_id and legacy unit_id matcher fields.
}

export function WRRUnitLabelGenerator({
  wrrItemId,
  wrrNumber,
  itemCode,
  lotNumber,
  expectedQty,
}: WRRUnitLabelGeneratorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Generate N unique unit labels per line when modal is opened
  const unitLabels = useMemo<UnitLabelData[]>(() => {
    if (!isModalOpen || expectedQty <= 0) return [];

    const labels: UnitLabelData[] = [];
    for (let i = 1; i <= expectedQty; i++) {
      const unitPayload = createWrrUnitPayload(wrrItemId, i);
      const unitId = unitPayload.unit_id;
      const payload = JSON.stringify(unitPayload);

      labels.push({
        unitId,
        cartonId: unitPayload.carton_id,
        unitIndex: i,
        payload,
      });
    }
    return labels;
  }, [isModalOpen, wrrItemId, expectedQty]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="inline-flex h-10 w-max min-w-[172px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded border border-outline-variant bg-surface-white px-3 font-heading font-semibold text-body-md text-brand-navy shadow-sm active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-navy"
      >
        <span aria-hidden="true">&#128424;</span>
        <span>Print Unit Labels ({expectedQty})</span>
      </button>

      {/* Modal Preview & Print Sheet */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="print-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:p-0 print:bg-white print:static"
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-surface-white p-6 shadow-elevation-2 print:max-h-none print:p-0 print:shadow-none">
            {/* Header — Screen only */}
            <div className="flex items-center justify-between border-b border-outline-variant pb-4 print:hidden">
              <div>
                <h2
                  id="print-modal-title"
                  className="font-heading font-semibold text-headline-md text-brand-navy"
                >
                  Unit Labels ({expectedQty} {expectedQty === 1 ? "label" : "labels"})
                </h2>
                <p className="font-body text-body-sm text-on-surface">
                  {wrrNumber} — Lot:{" "}
                  <span className="font-mono text-mono-md font-bold">{lotNumber}</span>
                </p>
                <p className="mt-1 font-body text-body-sm text-text-grey">
                  Each carton has its own unique QR label. Scan any one label to resolve the related cartons on this WRR line.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex h-12 items-center justify-center gap-2 rounded bg-primary px-5 font-heading font-bold text-body-md text-surface-white active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  <span aria-hidden="true">&#128424;</span>
                  <span>Print Labels</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex h-12 w-12 items-center justify-center rounded border border-outline-variant bg-surface-white text-body-md font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  aria-label="Close modal"
                >
                  &#10005;
                </button>
              </div>
            </div>

            {/* Printable Sheet Grid */}
            <div className="mt-4 flex-1 overflow-y-auto print:overflow-visible">
              <div className="grid grid-cols-2 gap-4 print:grid-cols-2 print:gap-4 print:w-full">
                {unitLabels.map((unit) => (
                  <div
                    key={unit.unitId}
                    className="flex flex-col items-center justify-between rounded border-2 border-brand-navy bg-surface-white p-4 text-center break-inside-avoid print:border-black print:p-3"
                  >
                    {/* Header info */}
                    <div className="mb-2 w-full">
                      <div className="flex items-center justify-between">
                        <p className="font-heading text-body-sm uppercase font-bold text-brand-navy">
                          Dyna-Serv WIMS
                        </p>
                        <span className="rounded bg-brand-navy px-1.5 py-0.5 font-mono text-label-xs font-bold text-surface-white">
                          CTN-{String(unit.unitIndex).padStart(2, "0")}
                        </span>
                      </div>
                      <p className="font-mono text-mono-md font-bold text-on-surface text-left mt-1">
                        {itemCode}
                      </p>
                    </div>

                    {/* QR Code */}
                    <div className="my-2 p-2 bg-white rounded border border-outline-variant">
                      <QRCode
                        value={unit.payload}
                        size={120}
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        viewBox={`0 0 256 256`}
                      />
                    </div>

                    {/* Footer info & hierarchical carton tag (Option 3) */}
                    <div className="mt-2 w-full text-center border-t border-outline-variant/30 pt-1.5">
                      <p className="font-mono text-mono-sm font-semibold text-on-surface">
                        Lot: {lotNumber}
                      </p>
                      <p className="font-mono text-mono-xs font-bold text-brand-navy mt-0.5">
                        Carton: {lotNumber} · CTN-{String(unit.unitIndex).padStart(2, "0")} ({unit.unitIndex} of {expectedQty})
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
