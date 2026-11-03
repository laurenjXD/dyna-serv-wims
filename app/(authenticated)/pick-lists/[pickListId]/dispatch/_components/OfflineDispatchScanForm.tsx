"use client";

import { useRef, useState, type FormEvent } from "react";
import { ScanLine } from "@/components/ui/icons";
import { FloorCameraScanner } from "@/components/floor/FloorCameraScanner";
import { useOfflineStatus } from "@/lib/offline/provider";

export function OfflineDispatchScanForm({
  action,
  pickListId,
  pickListItemId,
  locationId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  pickListId: string;
  pickListItemId: string;
  locationId: string;
}) {
  const { connectivity, queueObservation } = useOfflineStatus();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (connectivity !== "offline") return;
    event.preventDefault();
    const barcode = inputRef.current?.value.trim() ?? "";
    if (!barcode) return;
    try {
      await queueObservation("pick_list_scan_observation", {
        operationType: "pick_list_scan_observation",
        pickListId,
        pickListItemId,
        scannedBarcode: barcode,
        scannedQty: 1,
        locationId,
      });
      setFeedback("Saved locally — this verification will sync before dispatch can be confirmed.");
      if (inputRef.current) inputRef.current.value = "";
      inputRef.current?.focus();
    } catch {
      setFeedback("This verification could not be saved locally. Keep the box aside and contact a supervisor.");
    }
  }

  function submitCameraScan(barcode: string) {
    if (inputRef.current) inputRef.current.value = barcode;
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={action} onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          ref={inputRef}
          name="barcode"
          required
          autoFocus
          autoComplete="off"
          placeholder="Scan item or lot QR (or enter carton barcode)..."
          className="h-14 min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-white px-4 font-mono text-body-md text-on-surface outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
        />
        <button type="submit" className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-brand-navy px-6 font-label text-body-md font-bold text-surface-white transition-colors hover:bg-brand-navy/90 active:scale-[0.99]">
          <ScanLine size={18} aria-hidden="true" />
          <span>{connectivity === "offline" ? "Save Scan" : "Verify Box"}</span>
        </button>
      </form>
      {feedback && <p role="status" aria-live="polite" className="mt-3 rounded-xl border border-status-pending/40 bg-status-pending/10 px-4 py-3 font-body text-body-md text-on-surface">{feedback}</p>}
      <div className="mt-3"><FloorCameraScanner onScanSubmitted={submitCameraScan} /></div>
    </>
  );
}
