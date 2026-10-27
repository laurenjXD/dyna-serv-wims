"use client";

import { useRef, useState } from "react";
import { Barcode, Camera, X } from "@/components/ui/icons";
import { MobileQRScanner } from "@/components/barcode/MobileQRScanner";

export function QuickJumpScanner({ action }: { action: (formData: FormData) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  function submitScan(wrrNumber: string) {
    if (inputRef.current) inputRef.current.value = wrrNumber;
    formRef.current?.requestSubmit();
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-4 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-brand-navy flex items-center gap-1.5">
            <Barcode size={15} /> Quick Barcode / WRR Scanner
          </h3>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            Scan or enter a WRR number / ticket QR code to jump straight into receiving.
          </p>
        </div>
      </div>

      <form ref={formRef} action={action} className="flex gap-2">
        <div className="relative flex-1">
          <label htmlFor="quick-jump-wrr" className="sr-only">WRR number</label>
          <input
            ref={inputRef}
            id="quick-jump-wrr"
            name="wrrNumber"
            type="text"
            autoComplete="off"
            placeholder="Scan or enter WRR number (e.g. WRR-2026-0001)..."
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 font-mono text-xs text-on-surface outline-none transition-all placeholder:font-body placeholder:text-slate-400 focus:border-brand-navy focus:bg-white focus:ring-2 focus:ring-brand-navy/20"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-navy px-4 font-label text-xs font-bold text-white shadow-2xs hover:bg-brand-navy/90 active:scale-98 transition-all"
        >
          Open WRR
        </button>
        <button
          type="button"
          onClick={() => setCameraOpen((open) => !open)}
          aria-expanded={cameraOpen}
          className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border px-3 font-label text-xs font-bold transition-all ${
            cameraOpen
              ? "border-status-held/40 bg-status-held/10 text-status-held"
              : "border-slate-200 bg-surface-white text-brand-navy hover:bg-slate-50"
          }`}
        >
          {cameraOpen ? (
            <>
              <X size={14} /> Close
            </>
          ) : (
            <>
              <Camera size={14} /> Scan with Camera
            </>
          )}
        </button>
      </form>

      {cameraOpen && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-inner">
          <div className="mb-3 flex items-center justify-between border-b border-slate-200/60 pb-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-heading font-bold text-xs text-brand-navy">
                Scan WRR QR code / Barcode
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCameraOpen(false)}
              className="rounded px-2 py-0.5 font-label text-xs text-status-held hover:bg-status-held/10"
            >
              Close Camera
            </button>
          </div>
          <MobileQRScanner onScan={submitScan} />
        </div>
      )}
    </div>
  );
}
