"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ScanLine, X } from "@/components/ui/icons";
import { MobileQRScanner } from "@/components/barcode/MobileQRScanner";
import { verifyBarcodeAction, type ScanVerificationResult } from "@/lib/actions/scanner";
import { ItemLookupPanel } from "./ItemLookupPanel";
import { FilterSearchInput } from "@/components/ui";

export function DashboardOmniSearch() {
  const [value, setValue] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [result, setResult] = useState<ScanVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [lookupItemId, setLookupItemId] = useState<string | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const updateViewport = () => setIsMobile(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  async function verify(code: string) {
    const cleanCode = code.trim();
    if (!cleanCode) return;
    setValue(cleanCode);
    setIsVerifying(true);
    setResult(null);
    try {
      const nextResult = await verifyBarcodeAction(cleanCode);
      setResult(nextResult);
      if (nextResult.success && nextResult.data?.type === "item") {
        setIsCameraOpen(false);
        setLookupItemId(nextResult.data.id);
      }
    } finally {
      setIsVerifying(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void verify(value);
  }

  return (
    <>
      <section aria-label="Warehouse search" className="hidden rounded-xl border border-border bg-surface p-3 shadow-elevation-1 sm:block">
        <form onSubmit={handleSubmit} className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <FilterSearchInput
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search item, lot, or location"
            aria-label="Search item, lot, or location"
            onClear={() => { setValue(""); setResult(null); }}
          />
        </div>
        <button
          type="submit"
          disabled={isVerifying || !value.trim()}
          className="inline-flex h-12 shrink-0 items-center rounded-xl bg-primary px-5 font-label text-label font-bold text-white shadow-none transition-colors hover:bg-primary-hover active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isVerifying ? "Checking..." : "Search"}
        </button>
        </form>

        {result && (
          <div className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 font-body text-body-xs ${result.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`} role="status">
            {result.success ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
            <span>{result.message}</span>
          </div>
        )}
      </section>

      {isMobile && (
        <>
          <button
            type="button"
            aria-label="Scan item"
            onClick={() => {
              setResult(null);
              setIsCameraOpen(true);
            }}
            className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-elevation-3 ring-4 ring-surface focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 sm:hidden"
          >
            <ScanLine size={27} strokeWidth={2.25} aria-hidden="true" />
          </button>

          {isCameraOpen && (
            <div className="fixed inset-0 z-50 flex items-end bg-brand-navy/45 sm:hidden" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCameraOpen(false); }}>
              <section role="dialog" aria-modal="true" aria-labelledby="mobile-dashboard-scan-title" className="w-full rounded-t-3xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-label text-label-xs font-bold uppercase tracking-wide text-text-secondary">Mobile scanner</p>
                    <h2 id="mobile-dashboard-scan-title" className="font-heading text-lg font-bold text-text-primary">Scan an item</h2>
                  </div>
                  <button type="button" onClick={() => setIsCameraOpen(false)} aria-label="Close scanner" className="flex h-11 w-11 items-center justify-center rounded-xl text-text-secondary hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <X size={21} aria-hidden="true" />
                  </button>
                </div>
                <MobileQRScanner onScan={(code) => void verify(code)} />
                <div className="my-4 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  <span className="font-label text-label-xs font-bold uppercase tracking-wide text-text-secondary">Or search manually</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <FilterSearchInput
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      placeholder="Search item code or barcode"
                      aria-label="Search item code or barcode"
                      onClear={() => { setValue(""); setResult(null); }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isVerifying || !value.trim()}
                    className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-primary px-4 font-label text-label font-bold text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isVerifying ? "Checking..." : "Search"}
                  </button>
                </form>
                {result && !result.success && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-body text-body-xs text-rose-900" role="status">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{result.message}</span>
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
      {lookupItemId && <ItemLookupPanel itemId={lookupItemId} onClose={() => setLookupItemId(null)} />}
    </>
  );
}
