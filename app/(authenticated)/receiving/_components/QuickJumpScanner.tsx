"use client";

import { useRef, useState } from "react";
import { Barcode } from "lucide-react";
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
    <div className="mt-4">
      <form ref={formRef} action={action} className="flex rounded border-2 border-brand-navy bg-surface-white p-1">
        <label htmlFor="quick-jump-wrr" className="sr-only">WRR number</label>
        <input ref={inputRef} id="quick-jump-wrr" name="wrrNumber" type="text" autoComplete="off" placeholder="Scan WRR number" className="h-12 min-w-0 flex-1 bg-transparent px-3 font-mono text-mono-md text-on-surface outline-none placeholder:font-body placeholder:text-status-neutral" />
        <button type="button" onClick={() => setCameraOpen((open) => !open)} aria-expanded={cameraOpen} aria-controls="quick-jump-camera" className="flex h-12 w-12 items-center justify-center rounded bg-brand-navy text-surface-white focus:outline-none focus:ring-2 focus:ring-primary"><Barcode size={21} aria-hidden="true" /><span className="sr-only">{cameraOpen ? "Close camera scanner" : "Open camera scanner"}</span></button>
      </form>
      {cameraOpen && <div id="quick-jump-camera" className="mt-3 rounded-xl bg-surface-white p-3 shadow-elevation-2"><div className="mb-2 flex items-center justify-between"><p className="font-heading text-body-md font-bold text-brand-navy">Scan WRR QR code</p><button type="button" onClick={() => setCameraOpen(false)} className="h-10 rounded px-3 font-label text-label text-status-held focus:outline-none focus:ring-2 focus:ring-brand-navy">Close</button></div><MobileQRScanner onScan={submitScan} /></div>}
    </div>
  );
}
