"use client";

// Generic floor-surface camera scanner toggle.
// Traceability: specs/18-barcode-integration design.md §1 (Mobile Camera Scanner)
// brand-design-system.md §3 (floor surface rules — mobile-first, no glassmorphism)
// Used by any floor scan page that needs camera input (receiving, pick).

import { useState } from "react";
import { Camera, X } from "lucide-react";
import { MobileQRScanner } from "@/components/barcode/MobileQRScanner";

interface FloorCameraScannerProps {
  onScanSubmitted: (barcode: string) => void;
}

export function FloorCameraScanner({ onScanSubmitted }: FloorCameraScannerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleScan = (decodedText: string) => {
    // 800Hz beep for 100ms per specs/18 §1.2
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      }
    } catch {
      // Audio restricted or unsupported — ignore
    }
    onScanSubmitted(decodedText);
  };

  return (
    <div className="mb-4">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-surface-white font-heading font-semibold text-xs text-brand-navy shadow-xs hover:bg-slate-50 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          <Camera size={16} className="text-brand-navy" aria-hidden="true" />
          <span>Open Camera Barcode / QR Scanner</span>
        </button>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-surface-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-heading font-bold text-xs text-brand-navy">
                Live Camera Scanner Active
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 font-label text-xs font-semibold text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <X size={13} />
              <span>Close Camera</span>
            </button>
          </div>
          <MobileQRScanner onScan={handleScan} />
        </div>
      )}
    </div>
  );
}
