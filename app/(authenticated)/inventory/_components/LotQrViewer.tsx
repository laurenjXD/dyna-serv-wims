"use client";

import { useState } from "react";
import QRCode from "react-qr-code";

export function LotQrViewer({
  lotId,
  lotNumber,
  itemCode,
}: {
  lotId: string;
  lotNumber: string;
  itemCode: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded border border-brand-navy/30 bg-surface-white px-3 font-label text-label font-bold text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
      >
        View QR
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby={`lot-qr-${lotId}`} className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface-white p-6 shadow-elevation-2">
            <div className="flex items-start justify-between gap-4"><div><h2 id={`lot-qr-${lotId}`} className="font-heading text-title-lg font-bold text-on-surface">Lot QR code</h2><p className="mt-1 font-mono text-body-md text-text-grey">{lotNumber} · {itemCode}</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close QR code" className="grid size-11 place-items-center rounded border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy">×</button></div>
            <div className="mt-6 flex justify-center rounded-xl border border-outline-variant bg-surface-white p-4"><QRCode value={lotId} size={220} /></div>
            <p className="mt-4 font-body text-body-md text-text-grey">This code identifies lot {lotNumber}. Exact-box dispatch uses each box’s unique QR label.</p>
          </div>
        </div>
      )}
    </>
  );
}
