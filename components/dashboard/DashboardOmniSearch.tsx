"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, Barcode, Camera, CheckCircle2, Search, X } from "lucide-react";
import { MobileQRScanner } from "@/components/barcode/MobileQRScanner";
import { verifyBarcodeAction, type ScanVerificationResult } from "@/lib/actions/scanner";

export function DashboardOmniSearch() {
  const [value, setValue] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [result, setResult] = useState<ScanVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  async function verify(code: string) {
    const cleanCode = code.trim();
    if (!cleanCode) return;
    setValue(cleanCode);
    setIsVerifying(true);
    setResult(null);
    try {
      setResult(await verifyBarcodeAction(cleanCode));
    } finally {
      setIsVerifying(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void verify(value);
  }

  return (
    <section aria-label="Warehouse search" className="rounded-2xl border border-[#dbe4f7] bg-surface p-2.5 shadow-card sm:p-3">
      <form onSubmit={handleSubmit} className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border-2 border-[#dbe4f7] bg-white px-3 shadow-[0_2px_5px_rgba(94,116,170,0.08)] focus-within:border-[#91a8df] focus-within:ring-4 focus-within:ring-[#91a8df]/15 sm:h-14 sm:px-4">
          <Search size={21} className="shrink-0 text-[#647ba8] sm:h-6 sm:w-6" aria-hidden="true" />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search item, lot, location..."
            aria-label="Search item, lot, or location"
            className="min-w-0 flex-1 bg-transparent font-body text-sm text-on-surface outline-none placeholder:text-[#8ea1c4] sm:text-base"
          />
          {value && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => { setValue(""); setResult(null); }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#647ba8] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X size={19} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            aria-label={isCameraOpen ? "Close barcode scanner" : "Scan barcode or QR code"}
            onClick={() => {
              setIsCameraOpen((open) => !open);
              setResult(null);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#647ba8] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {isCameraOpen ? <X size={18} aria-hidden="true" /> : <Barcode size={19} aria-hidden="true" />}
          </button>
        </div>
        <button
          type="submit"
          disabled={isVerifying || !value.trim()}
          className="inline-flex h-12 shrink-0 items-center rounded-2xl bg-[#8299d6] px-4 font-heading text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#7189ca] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8299d6]/40 disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:px-7 sm:text-base"
        >
          {isVerifying ? "Checking..." : "Search"}
        </button>
      </form>

      {isCameraOpen && (
        <div className="mt-3 rounded-xl border border-border bg-surface-light-grey p-3">
          <div className="mb-2 flex items-center gap-2 font-label text-label-xs font-bold text-on-surface">
            <Camera size={15} aria-hidden="true" />
            Scan an item, lot, or location QR code
          </div>
          <MobileQRScanner onScan={(code) => void verify(code)} />
        </div>
      )}

      {result && (
        <div className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 font-body text-body-xs ${result.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`} role="status">
          {result.success ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          <span>{result.message}</span>
        </div>
      )}
    </section>
  );
}
