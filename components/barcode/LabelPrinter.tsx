"use client";

// specs/18-barcode-integration FR-3.1, FR-3.2, AC-3
// Floor surface component — `bg-surface-white`, solid, no glassmorphism.
// Rendered in browser; Admin clicks "Print Label" to invoke print driver (design.md §2.1).

import QRCode from "react-qr-code";
import { scheduleThermalPrint } from "@/lib/barcode/thermal-print";

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
    <div
      data-print-label
      className="bg-surface-white shadow-elevation-2 rounded-xl p-5 flex flex-col items-center gap-3 w-full max-w-[280px] mx-auto border border-outline-variant/60"
    >
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
          body * {
            visibility: hidden !important;
          }
          [data-print-label],
          [data-print-label] * {
            visibility: visible !important;
          }
          [data-print-label] {
            position: fixed !important;
            inset: 0 !important;
            margin: auto !important;
            width: 50mm !important;
            height: 50mm !important;
            max-width: 50mm !important;
            max-height: 50mm !important;
            margin: 0 !important;
            padding: 2mm !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #FFFFFF !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 1.5mm !important;
            image-rendering: pixelated !important;
            image-rendering: crisp-edges !important;
          }
          .thermal-screen-only {
            display: none !important;
          }
          [data-print-label] svg {
            display: block !important;
            width: 34mm !important;
            height: 34mm !important;
            min-width: 34mm !important;
            min-height: 34mm !important;
            visibility: visible !important;
          }
        }
      `}</style>

      {/* Screen helper banner */}
      <div className="thermal-screen-only flex items-center justify-between w-full pb-2 border-b border-outline-variant/40">
        <span className="text-[11px] font-bold text-brand-navy uppercase tracking-wider">
          Thermal Preview
        </span>
        <span className="rounded bg-brand-navy/10 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-navy">
          2&quot; × 2&quot; (50mm) · HD
        </span>
      </div>

      {/* 2x2 Label Top Header */}
      <div className="w-full flex items-center justify-between text-[8px] font-mono font-black uppercase tracking-wider text-black pb-0.5 border-b border-black">
        <span>DYNA-SERV</span>
        <span>WIMS LOT</span>
      </div>

      {/* High-Definition QR Code (Pure 1-bit B&W, crispEdges, Level M error correction) */}
      <div className="my-0.5 p-1 bg-white flex items-center justify-center">
        <QRCode
          value={lotId}
          size={115}
          level="M"
          fgColor="#000000"
          bgColor="#FFFFFF"
          shapeRendering="crispEdges"
          style={{ height: "auto", maxWidth: "30mm", width: "100%" }}
          viewBox="0 0 256 256"
        />
      </div>

      {/* High-Contrast Human-readable metadata */}
      <div className="font-mono text-black text-center leading-tight w-full pt-0.5 border-t border-black">
        <div className="font-black text-[11px] tracking-tight truncate">{lotNumber}</div>
        <div className="text-[9.5px] font-bold tracking-tight truncate">{itemCode}</div>
        {locationLabel && (
          <div className="text-[8px] font-semibold tracking-tight truncate mt-0.5">{locationLabel}</div>
        )}
      </div>

      {/* Print action CTA */}
      <button
        type="button"
        onClick={scheduleThermalPrint}
        className="thermal-screen-only mt-2 h-12 w-full bg-primary text-surface-white font-label text-body-md font-bold rounded-lg shadow-sm active:scale-[0.97] transition-all focus:outline-none focus:ring-2 focus:ring-brand-navy"
      >
        Print 2&quot; × 2&quot; Label
      </button>
    </div>
  );
}
