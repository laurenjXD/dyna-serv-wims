"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "react-qr-code";
import { Printer, X } from "@/components/ui/icons";
import type { MigratedLotQrLabel } from "@/lib/actions/data-migration";
import { scheduleThermalPrint } from "@/lib/barcode/thermal-print";

export function BulkLotQrPrintButton({ labels }: { labels: MigratedLotQrLabel[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.body.dataset.bulkLotQrPrintMode = "true";
    return () => {
      delete document.body.dataset.bulkLotQrPrintMode;
    };
  }, [open]);

  if (labels.length === 0) return null;

  const handlePrint = () => {
    scheduleThermalPrint();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand-blue px-6 font-label text-label font-bold text-white hover:bg-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-blue"
      >
        <Printer size={18} aria-hidden="true" />
        Print all lot QRs ({labels.length})
      </button>

      {open && typeof document !== "undefined" && createPortal((
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-lot-qr-title"
          data-bulk-lot-qr-print-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/60 p-4 print:static print:block print:bg-white print:p-0"
        >
          <style>{`
            @page { size: 50mm 50mm; margin: 0; }
            @media print {
              html, body {
                width: 50mm !important;
                min-width: 50mm !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              body[data-bulk-lot-qr-print-mode] > *:not([data-bulk-lot-qr-print-modal]) {
                display: none !important;
              }
              body[data-bulk-lot-qr-print-mode] [data-bulk-lot-qr-print-modal] {
                position: static !important;
                display: block !important;
                width: 50mm !important;
                min-width: 50mm !important;
                margin: 0 auto !important;
                height: auto !important;
                overflow: visible !important;
                background: #fff !important;
              }
              #bulk-lot-qr-sheet {
                display: block !important;
                width: 50mm !important;
                min-width: 50mm !important;
                margin: 0 auto !important;
                padding: 0 !important;
              }
              .bulk-lot-qr-card {
                display: flex !important;
                width: 50mm !important;
                height: 50mm !important;
                box-sizing: border-box !important;
                margin: 0 auto !important;
                padding: 1mm !important;
                border: none !important;
                border-radius: 0 !important;
                background: #fff !important;
                page-break-after: always !important;
                break-after: page !important;
                overflow: hidden !important;
                justify-content: center !important;
                gap: 0 !important;
              }
              .bulk-lot-qr-header {
                flex: 0 0 6mm !important;
                width: 100% !important;
                height: 6mm !important;
                max-height: 6mm !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
              }
              .bulk-lot-qr-code {
                flex: 0 0 36mm !important;
                width: 36mm !important;
                height: 36mm !important;
                max-width: 36mm !important;
                max-height: 36mm !important;
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                overflow: hidden !important;
              }
              .bulk-lot-qr-code svg {
                display: block !important;
                width: 36mm !important;
                height: 36mm !important;
                max-width: 36mm !important;
                max-height: 36mm !important;
              }
              .bulk-lot-qr-footer {
                flex: 0 0 6mm !important;
                width: 100% !important;
                height: 6mm !important;
                max-height: 6mm !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
                line-height: 1 !important;
                padding-top: 0.5mm !important;
              }
              .bulk-lot-qr-card:last-child { page-break-after: avoid !important; break-after: avoid !important; }
              .bulk-lot-qr-card svg { display: block !important; width: 40mm !important; height: 40mm !important; max-width: 40mm !important; max-height: 40mm !important; }
            }
          `}</style>

          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-surface-white p-6 shadow-elevation-2 print:block print:max-h-none print:w-[50mm] print:p-0 print:shadow-none">
            <div className="flex items-center justify-between gap-4 border-b border-outline-variant pb-4 print:hidden">
              <div>
                <h2 id="bulk-lot-qr-title" className="font-heading text-title-lg font-bold text-on-surface">
                  Migrated Lot QR Labels
                </h2>
                <p className="mt-1 font-body text-body-sm text-text-grey">
                  {labels.length} unique labels. Each QR resolves to its existing inventory lot.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-blue" aria-label="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div id="bulk-lot-qr-sheet" className="grid grid-cols-2 gap-4 overflow-y-auto py-4 print:block print:overflow-visible print:py-0">
              {labels.map((label) => (
                <div key={label.lotId} className="bulk-lot-qr-card flex min-h-[210px] flex-col items-center justify-between rounded-xl border border-outline-variant/60 bg-surface-white p-3 text-center shadow-xs print:min-h-0">
                  <div className="bulk-lot-qr-header w-full border-b border-black pb-0.5 text-left font-mono text-[8px] font-black uppercase tracking-wider text-black">
                    <div className="flex items-center justify-between"><span>DYNA-SERV</span><span>WIMS LOT</span></div>
                    <div className="mt-0.5 truncate text-[9.5px]">{label.itemCode}</div>
                  </div>
                  <div className="bulk-lot-qr-code flex items-center justify-center bg-white p-1">
                    <QRCode value={label.lotId} size={115} level="M" fgColor="#000" bgColor="#fff" shapeRendering="crispEdges" style={{ height: "auto", maxWidth: "40mm", width: "100%" }} viewBox="0 0 256 256" />
                  </div>
                  <div className="bulk-lot-qr-footer w-full border-t border-black pt-0.5 font-mono leading-tight text-black">
                    <div className="truncate text-[11px] font-black">{label.lotNumber}</div>
                    <div className="truncate text-[9.5px] font-bold">{label.itemCode}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 border-t border-outline-variant pt-4 print:hidden">
              <button type="button" onClick={handlePrint} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded bg-primary font-label text-label font-bold text-white focus:outline-none focus:ring-2 focus:ring-brand-blue">
                <Printer size={18} aria-hidden="true" /> Print {labels.length} lot labels
              </button>
              <button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded border border-outline-variant px-5 font-label text-label font-bold text-on-surface">Close</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
}
