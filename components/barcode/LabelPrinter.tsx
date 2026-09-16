"use client";

// specs/18-barcode-integration FR-3.1, FR-3.2, AC-3
// Floor surface component — `bg-surface-white`, solid, no glassmorphism.
// Rendered in browser; Admin clicks "Print Label" to invoke print driver (design.md §2.1).

import QRCode from "react-qr-code";

interface LabelPrinterProps {
  /** UUID of the lot — encoded directly into the QR code as the payload value. */
  lotId: string;
  /** Human-readable lot number displayed below the QR code. */
  lotNumber: string;
  /** Item code displayed below the lot number. */
  itemCode: string;
  /** Optional location label (e.g. "Rack A-01") displayed when provided. */
  locationLabel?: string;
}

export function LabelPrinter({
  lotId,
  lotNumber,
  itemCode,
  locationLabel,
}: LabelPrinterProps) {
  return (
    // brand-design-system.md §6: floor cards use solid surface-white, shadow-elevation-2.
    <div data-print-label className="bg-surface-white shadow-elevation-2 rounded p-4 flex flex-col items-center gap-4 w-full max-w-sm mx-auto">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          [data-print-label],
          [data-print-label] * {
            visibility: visible !important;
          }
          [data-print-label] {
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
          [data-print-label] button {
            display: none !important;
          }
          @page {
            size: auto;
            margin: 10mm;
          }
        }
      `}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/api/brand/logo" alt="Dyna-Serv" className="h-7 w-auto object-contain" />
      {/*
        FR-3.2: QR payload is exactly the UUID string — "a UUID lookup, not a data blob"
        (design.md §2). No prefix, no JSON wrapping, no transformation.
      */}
      <QRCode value={lotId} size={150} />

      {/*
        FR-3.1: human-readable label text displayed below the QR code.
        brand-design-system.md §2: Roboto Mono for codes, lot numbers.
        Floor minimum: 16px (body-md). mono-lg (18px) satisfies this comfortably.
      */}
      <div className="font-mono text-mono-lg text-on-surface text-center leading-snug">
        <div className="font-bold">{lotNumber}</div>
        <div>{itemCode}</div>
        {locationLabel && <div>{locationLabel}</div>}
      </div>

      {/*
        AC-3: "Print Label" button triggers window.print().
        brand-design-system.md §3: floor primary action, h-16 (64px), full-width,
        bg-primary for CTA, active:scale-[0.97] press feedback, no hover state.
      */}
      <button
        type="button"
        onClick={() => window.print()}
        className="h-16 w-full bg-primary text-surface-white font-label text-body-md rounded active:scale-[0.97] motion-safe:transition-transform"
      >
        Print Label
      </button>
    </div>
  );
}
