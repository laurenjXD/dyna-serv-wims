"use client";

import { useState } from "react";
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${compact ? "mt-2 h-8 px-2 text-xs" : "mt-4 h-11 px-3 font-label text-label"} inline-flex w-full items-center justify-center rounded border border-brand-navy/30 bg-surface-white font-bold text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy`}
      >
        View QR
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`lot-qr-${lotId}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/60 p-4 print:p-0 print:bg-white print:static"
        >
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #lot-qr-print-card,
              #lot-qr-print-card * {
                visibility: visible !important;
              }
              #lot-qr-print-card {
                position: absolute !important;
                left: 50% !important;
                top: 20mm !important;
                transform: translateX(-50%) !important;
                width: 100mm !important;
                max-width: 100mm !important;
                padding: 8mm !important;
                border: 2px solid #000000 !important;
                border-radius: 8px !important;
                box-shadow: none !important;
                background: #FFFFFF !important;
              }
              .print-hide {
                display: none !important;
              }
              @page {
                size: auto;
                margin: 10mm;
              }
            }
          `}</style>
          <div
            id="lot-qr-print-card"
            className="w-full max-w-sm rounded-2xl bg-surface-white p-6 shadow-elevation-2 print:shadow-none"
          >
            <div className="flex items-start justify-between gap-4 print:hidden print-hide">
              <div>
                <h2 id={`lot-qr-${lotId}`} className="font-heading text-title-lg font-bold text-on-surface">
                  Lot QR code
                </h2>
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

            {/* Print Header (Visible on print & screen) */}
            <div className="flex flex-col items-center gap-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/api/brand/logo" alt="Dyna-Serv" className="h-7 w-auto object-contain" />
              <div className="my-3 flex justify-center rounded-xl border border-outline-variant bg-surface-white p-4 print:border-black">
                <QRCode value={lotId} size={180} />
              </div>
              <div className="font-mono text-on-surface">
                <p className="text-mono-lg font-bold">{lotNumber}</p>
                <p className="text-mono-md text-text-grey">{itemCode}</p>
              </div>
            </div>

            <p className="mt-4 font-body text-body-sm text-text-grey text-center print:hidden print-hide">
              This code identifies lot {lotNumber}. Scan it repeatedly at Dispatch to count the committed boxes for this lot.
            </p>

            <div className="mt-5 flex gap-2 print:hidden print-hide">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded bg-primary font-label text-label font-bold text-surface-white active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <span>&#128424;</span>
                <span>Print QR Label</span>
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
      )}
    </>
  );
}
