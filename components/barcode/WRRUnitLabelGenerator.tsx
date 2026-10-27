"use client";

// WRR-time per-unit label generator.
// Traceability:
//   specs/18-barcode-integration/design.md §2.2 (WRR-time per-unit label generation)
//   specs/07-incoming-receiving/design.md §6.2 / §9 (scan reconciliation & duplicate rejection)
//   specs/00-steering/brand-design-system.md §9 (physical label and print typography)

import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { createWrrUnitPayload } from "@/lib/barcode/wrr-unit";
import { scheduleThermalPrint } from "@/lib/barcode/thermal-print";

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

  // Give the browser a stable, scoped print mode. This prevents the global
  // application shell and its layout containers from affecting thermal-label
  // pagination while still allowing the label sheet to render normally.
  useEffect(() => {
    if (!isModalOpen) return;

    document.body.dataset.qrPrintMode = "true";
    return () => {
      delete document.body.dataset.qrPrintMode;
    };
  }, [isModalOpen]);

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
    scheduleThermalPrint();
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
          data-qr-print-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:static print:block print:bg-white print:p-0"
        >
          {/* Print Media Isolation Rules */}
          <style>{`
            @page {
              size: 50mm 50mm;
              margin: 0;
            }
            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #FFFFFF !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                text-rendering: geometricPrecision !important;
              }
              body[data-qr-print-mode] {
                width: 50mm !important;
                min-width: 50mm !important;
              }
              body[data-qr-print-mode] * {
                visibility: hidden !important;
              }
              body[data-qr-print-mode] [data-qr-print-modal],
              body[data-qr-print-mode] [data-qr-print-modal] #print-unit-labels-sheet,
              body[data-qr-print-mode] [data-qr-print-modal] #print-unit-labels-sheet * {
                visibility: visible !important;
              }
              body[data-qr-print-mode] [data-qr-print-modal] {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                display: block !important;
                width: 50mm !important;
                min-width: 50mm !important;
                height: auto !important;
                min-height: 0 !important;
                overflow: visible !important;
                background: #FFFFFF !important;
              }
              #print-unit-labels-sheet {
                position: static !important;
                left: 0 !important;
                top: 0 !important;
                width: 50mm !important;
                min-width: 50mm !important;
                height: auto !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #FFFFFF !important;
                display: block !important;
                overflow: visible !important;
              }
              .unit-thermal-label-card {
                width: 50mm !important;
                height: 50mm !important;
                max-width: 50mm !important;
                max-height: 50mm !important;
                margin: 0 !important;
                padding: 1.5mm !important;
                box-sizing: border-box !important;
                border: none !important;
                border-radius: 0 !important;
                background: #FFFFFF !important;
                page-break-after: always !important;
                break-after: page !important;
                overflow: hidden !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: space-between !important;
                image-rendering: pixelated !important;
                image-rendering: crisp-edges !important;
              }
              .unit-thermal-label-card svg {
                display: block !important;
                width: 29mm !important;
                height: 29mm !important;
                visibility: visible !important;
              }
              .unit-thermal-label-card:last-child {
                page-break-after: avoid !important;
                break-after: avoid !important;
              }
            }
          `}</style>

          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-surface-white p-6 shadow-elevation-2 print:max-h-none print:p-0 print:shadow-none">
            {/* Header — Screen only */}
            <div className="flex items-center justify-between border-b border-outline-variant pb-4 print:hidden">
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    id="print-modal-title"
                    className="font-heading font-semibold text-headline-md text-brand-navy"
                  >
                    Unit Labels ({expectedQty} {expectedQty === 1 ? "label" : "labels"})
                  </h2>
                  <span className="rounded bg-brand-navy/10 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-navy">
                    2&quot; × 2&quot; Thermal Roll · HD
                  </span>
                </div>
                <p className="font-body text-body-sm text-on-surface mt-1">
                  {wrrNumber} — Lot:{" "}
                  <span className="font-mono text-mono-md font-bold">{lotNumber}</span>
                </p>
                <p className="mt-1 font-body text-body-sm text-text-grey">
                  Formatted for 2&quot; × 2&quot; (50mm × 50mm) continuous thermal label rolls. High-definition 1-bit monochrome output.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex h-12 items-center justify-center gap-2 rounded bg-primary px-5 font-heading font-bold text-body-md text-surface-white active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  <span aria-hidden="true">&#128424;</span>
                  <span>Print 2&quot; × 2&quot; Labels</span>
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

            {/* Printable Sheet Grid (Screen: responsive preview grid; Print: 2x2 sequential pages) */}
            <div className="mt-4 flex-1 overflow-y-auto print:overflow-visible">
              <div
                id="print-unit-labels-sheet"
                className="grid grid-cols-2 gap-4 print:block print:w-[50mm]"
              >
                {unitLabels.map((unit) => (
                  <div
                    key={unit.unitId}
                    style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
                    className="unit-thermal-label-card flex flex-col items-center justify-between rounded-xl border border-outline-variant/60 bg-surface-white p-3 text-center shadow-xs print:border-none print:shadow-none min-h-[210px] print:min-h-0"
                  >
                    {/* Header info */}
                    <div className="w-full text-black pb-0.5 border-b border-black">
                      <div className="flex items-center justify-between text-[8px] font-mono font-black uppercase tracking-wider">
                        <span>DYNA-SERV</span>
                        <span className="font-bold">
                          CTN-{String(unit.unitIndex).padStart(2, "0")} ({unit.unitIndex}/{expectedQty})
                        </span>
                      </div>
                      <p className="font-mono text-[9.5px] font-bold text-black text-left mt-0.5 truncate tracking-tight">
                        {itemCode}
                      </p>
                    </div>

                    {/* High-Definition QR Code */}
                    <div className="my-1 p-1 bg-white flex items-center justify-center">
                      <QRCode
                        value={unit.payload}
                        size={110}
                        level="M"
                        fgColor="#000000"
                        bgColor="#FFFFFF"
                        shapeRendering="crispEdges"
                        style={{ height: "auto", maxWidth: "29mm", width: "100%" }}
                        viewBox={`0 0 256 256`}
                      />
                    </div>

                    {/* Footer info */}
                    <div className="w-full text-center border-t border-black pt-0.5 font-mono text-black leading-tight">
                      <p className="text-[10px] font-black tracking-tight truncate">
                        Lot: {lotNumber}
                      </p>
                      <p className="text-[8px] font-semibold truncate mt-0.5 tracking-tight">
                        {wrrNumber} · CTN-{String(unit.unitIndex).padStart(2, "0")}
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
