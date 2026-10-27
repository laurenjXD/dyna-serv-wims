"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "react-qr-code";

export function LotQrViewer({
  lotId,
  lotNumber,
  itemCode,
  compact = false,
}: {
  lotId: string;
  lotNumber: string;
  itemCode: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    document.body.dataset.lotQrPrintMode = "true";
    return () => {
      delete document.body.dataset.lotQrPrintMode;
    };
  }, [open]);

  const handlePrint = () => {
    // Let the QR SVG finish painting before Chromium snapshots the page.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${compact ? "mt-2 h-8 px-2 text-xs" : "mt-4 h-11 px-3 font-label text-label"} inline-flex w-full items-center justify-center rounded border border-brand-navy/30 bg-surface-white font-bold text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy`}
      >
        View QR
      </button>
      {open && typeof document !== "undefined" && createPortal((
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`lot-qr-${lotId}`}
          data-lot-qr-print-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/60 p-4 print:static print:block print:bg-white print:p-0"
        >
          <style>{`
            @page {
              size: 2in 2in;
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
              body[data-lot-qr-print-mode] > *:not([data-lot-qr-print-modal]) {
                display: none !important;
              }
              body[data-lot-qr-print-mode] [data-lot-qr-print-modal] {
                position: static !important;
                display: block !important;
                width: 2in !important;
                min-width: 2in !important;
                margin: 0 auto !important;
                height: auto !important;
                min-height: 0 !important;
                overflow: visible !important;
                background: #FFFFFF !important;
              }
              #lot-qr-print-card {
                position: static !important;
                left: 0 !important;
                top: 0 !important;
                width: 2in !important;
                height: 2in !important;
                max-width: 2in !important;
                max-height: 2in !important;
                margin: 0 auto !important;
                padding: 1.5mm !important;
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                background: #FFFFFF !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: space-between !important;
                image-rendering: pixelated !important;
                image-rendering: crisp-edges !important;
              }
              #lot-qr-print-card svg {
                display: block !important;
                width: 30mm !important;
                height: 30mm !important;
              }
              .print-hide {
                display: none !important;
              }
            }
          `}</style>
          <div
            id="lot-qr-print-card"
            className="w-full max-w-sm rounded-2xl bg-surface-white p-6 shadow-elevation-2 print:shadow-none print:p-0"
          >
            {/* Modal Screen Header */}
            <div className="flex items-start justify-between gap-4 print:hidden print-hide">
              <div>
                <div className="flex items-center gap-2">
                  <h2 id={`lot-qr-${lotId}`} className="font-heading text-title-lg font-bold text-on-surface">
                    Lot QR Code
                  </h2>
                  <span className="rounded bg-brand-navy/10 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-navy">
                    2&quot; × 2&quot; Thermal · HD
                  </span>
                </div>
                <p className="mt-1 font-mono text-body-md text-text-grey">
                  {lotNumber} · {itemCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close QR code"
                className="grid size-11 place-items-center rounded border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                ×
              </button>
            </div>

            {/* 2x2 Label Top Header — Print Only */}
            <div className="hidden print:flex w-full items-center justify-between text-[8px] font-mono font-black uppercase tracking-wider text-black pb-0.5 border-b border-black">
              <span>DYNA-SERV</span>
              <span>WIMS LOT</span>
            </div>

            {/* Printable High-Definition QR Center Content */}
            <div className="flex flex-col items-center gap-2 text-center w-full print:gap-0">
              <div className="my-3 flex justify-center rounded-xl border border-outline-variant bg-surface-white p-4 print:border-none print:my-0.5 print:p-0">
                <QRCode
                  value={lotId}
                  size={140}
                  level="M"
                  fgColor="#000000"
                  bgColor="#FFFFFF"
                  shapeRendering="crispEdges"
                  style={{ height: "auto", maxWidth: "30mm", width: "100%" }}
                  viewBox="0 0 256 256"
                />
              </div>
              <div className="font-mono text-on-surface w-full print:text-black print:pt-0.5 print:border-t print:border-black">
                <p className="text-mono-lg font-bold print:font-black print:text-[11px] print:leading-tight truncate">
                  {lotNumber}
                </p>
                <p className="text-mono-md text-text-grey print:text-[9.5px] print:font-bold print:text-black print:leading-tight truncate">
                  {itemCode}
                </p>
              </div>
            </div>

            <p className="mt-4 font-body text-body-sm text-text-grey text-center print:hidden print-hide">
              Formatted for 2&quot; × 2&quot; (50mm × 50mm) thermal label printers. Scan at Dispatch to verify lot commitment.
            </p>

            <div className="mt-5 flex gap-2 print:hidden print-hide">
              <button
                type="button"
                onClick={handlePrint}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded bg-primary font-label text-label font-bold text-surface-white active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <span>&#128424;</span>
                <span>Print 2&quot; × 2&quot; Label</span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-11 items-center justify-center rounded border border-outline-variant bg-surface-white px-4 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
}
