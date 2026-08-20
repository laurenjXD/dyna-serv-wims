"use client";

// Floor surface camera scanner toggle component.
// Traceability: specs/18-barcode-integration design.md §1 (Mobile Camera Scanner)
// brand-design-system.md §3 (floor surface rules — mobile-first, no glassmorphism)

import { useState } from "react";
import { MobileQRScanner } from "@/components/barcode/MobileQRScanner";

interface ReceivingCameraScannerProps {
  onScanSubmitted: (barcode: string) => void;
}

export function ReceivingCameraScanner({
  onScanSubmitted,
}: ReceivingCameraScannerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleScan = (decodedText: string) => {
    // Play Web Audio API 800Hz beep sound for 100ms per specs/18 §1.2
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
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
      // Audio playback restricted or unsupported — ignore silently
    }

    onScanSubmitted(decodedText);
  };

  return (
    <div className="mb-4">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded bg-surface-white font-heading font-semibold text-body-md text-brand-navy shadow-elevation-2 active:scale-[0.98] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          <span aria-hidden="true">&#128247;</span>
          <span>Open Camera Scanner</span>
        </button>
      ) : (
        <div className="rounded-xl bg-surface-white p-3 shadow-elevation-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-heading font-semibold text-body-md text-brand-navy">
              Camera Scanner Active
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded px-2 py-1 font-label text-body-md text-status-held focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Close Camera
            </button>
          </div>
          <MobileQRScanner onScan={handleScan} />
        </div>
      )}
    </div>
  );
}
