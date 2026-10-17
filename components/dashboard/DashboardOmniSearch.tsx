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
    <section aria-label="Warehouse search" className="rounded-2xl border border-border bg-surface p-3 shadow-card sm:p-4">
      <form onSubmit={handleSubmit} className="flex min-w-0 items-center gap-2">
        <Search size={18} className="shrink-0 text-text-grey" aria-hidden="true" />
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search item, lot, location..."
          aria-label="Search item, lot, or location"
          className="min-w-0 flex-1 bg-transparent font-body text-body-sm text-on-surface outline-none placeholder:text-text-grey"
        />
        <button
          type="button"
          aria-label={isCameraOpen ? "Close barcode scanner" : "Scan barcode or QR code"}
          onClick={() => {
            setIsCameraOpen((open) => !open);
            setResult(null);
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-brand-navy active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {isCameraOpen ? <X size={19} aria-hidden="true" /> : <Barcode size={19} aria-hidden="true" />}
        </button>
        <button
          type="submit"
          disabled={isVerifying || !value.trim()}
          className="hidden h-11 shrink-0 items-center rounded-xl bg-primary px-4 font-label text-label-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
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
