"use client";

// Scannable representation of the WRR number for the printed document
// (design.md §5.3: "WRR number rendered as a scannable barcode"). This
// codebase's established scannable-code format is QR (see
// components/barcode/WRRUnitLabelGenerator.tsx, MobileQRScanner.tsx) rather
// than a 1D barcode — reused here rather than introducing a second, parallel
// symbology the floor scanners don't already read.

import QRCode from "react-qr-code";

export function WrrBarcode({ wrrNumber }: { wrrNumber: string }) {
  return (
    <div className="rounded border border-outline-variant/30 bg-white p-2">
      <QRCode
        value={wrrNumber}
        size={88}
        style={{ height: "auto", maxWidth: "100%", width: "88px" }}
        viewBox="0 0 256 256"
      />
    </div>
  );
}
