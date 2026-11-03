"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight } from "@/components/ui/icons";
import { ReceivingCameraScanner } from "./ReceivingCameraScanner";
import { matchScan, type WrrLine } from "@/lib/receiving/scan-matcher";
import { useOfflineStatus } from "@/lib/offline/provider";
import { listPendingOfflineEntries } from "@/lib/offline/storage";

type ReceivingScanLine = WrrLine & { wrrId: string };

export function OfflineReceivingScanForm({
  action,
  wrrId,
  flowType,
  lines,
}: {
  action: (formData: FormData) => void | Promise<void>;
  wrrId: string;
  flowType: "vmi" | "trading" | "supplies";
  lines: ReceivingScanLine[];
}) {
  const { connectivity, queueObservation, currentUserId } = useOfflineStatus();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const serverRevision = JSON.stringify(lines.map((line) => [line.id, line.scannedQty]));
  const [localState, setLocalState] = useState<{ actorId: string | null; revision: string; counts: Record<string, number> }>({ actorId: currentUserId, revision: serverRevision, counts: {} });
  const localCounts = localState.actorId === currentUserId && localState.revision === serverRevision ? localState.counts : {};
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!currentUserId) return;
    void listPendingOfflineEntries(currentUserId).then((entries) => {
      if (!active) return;
      const restored: Record<string, number> = {};
      for (const entry of entries) {
        if (entry.actionType !== "receiving_scan_observation") continue;
        if (entry.payload.wrrId !== wrrId) continue;
        const lineId = String(entry.payload.wrrItemId ?? "");
        if (lineId) restored[lineId] = (restored[lineId] ?? 0) + Number(entry.payload.scannedQty ?? 1);
      }
      setLocalState({ actorId: currentUserId, revision: serverRevision, counts: restored });
    }).catch(() => {});
    return () => { active = false; };
  }, [wrrId, currentUserId, serverRevision]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (connectivity !== "offline") return;
    event.preventDefault();
    if (!currentUserId) {
      setFeedback("Sign in again before saving a scan.");
      return;
    }
    const barcode = inputRef.current?.value.trim() ?? "";
    const localLines = lines.map((line) => ({
      ...line,
      scannedQty: line.scannedQty + (localCounts[line.id] ?? 0),
    }));
    const result = matchScan(barcode, localLines, flowType);
    if (!result.matched) {
      const messages: Record<typeof result.reason, string> = {
        invalid_barcode: "The scan is empty. Scan a carton or item label, or enter its barcode.",
        unknown_item: "This barcode could not be matched to an expected item. Check the WRR and scan the matching label, or ask a supervisor to check the item enrollment.",
        fully_scanned: "This item already has all expected scans. Continue with the next unfinished item.",
        over_quantity: "This item has more scans than expected. Reconnect and ask a supervisor to review the quantity before continuing.",
        flow_type_mismatch: "This item's Inventory Model differs from the WRR. Check the shipment and ask a supervisor to review the item.",
        duplicate_unit_scan: "This label has already been scanned. Scan the next carton or check for a duplicate printed label.",
      };
      setFeedback(messages[result.reason]);
      return;
    }
    try {
      await queueObservation("receiving_scan_observation", {
        operationType: "receiving_scan_observation",
        wrrId,
        wrrItemId: result.line.id,
        scannedBarcode: barcode,
        scannedQty: result.scanQty,
      });
      setLocalState((current) => {
        const counts = current.actorId === currentUserId && current.revision === serverRevision ? current.counts : {};
        return { actorId: currentUserId, revision: serverRevision, counts: { ...counts, [result.line.id]: (counts[result.line.id] ?? 0) + result.scanQty } };
      });
      setFeedback("Saved locally — this scan will sync when the connection returns.");
      if (inputRef.current) inputRef.current.value = "";
      inputRef.current?.focus();
    } catch {
      setFeedback("This scan could not be saved locally. Keep the label and contact a supervisor before continuing.");
    }
  }

  function submitCameraScan(barcode: string) {
    if (inputRef.current) inputRef.current.value = barcode;
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={action} onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="barcode-input" className="text-body-md font-body text-on-surface">
          Scan carton or item barcode to verify
        </label>
        <p className="font-body text-body-md text-text-grey">
          {connectivity === "offline"
            ? "Offline capture is enabled for this scan only. Putaway and receipt confirmation still require connection."
            : "Scan one barcode from the incoming shipment first. We will confirm the item before asking where its declared boxes should be stored."}
        </p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            id="barcode-input"
            name="barcode"
            type="text"
            autoFocus
            autoComplete="off"
            inputMode="text"
            placeholder="Scan or enter barcode"
            className="h-16 flex-1 rounded border-2 border-outline-variant bg-surface-white px-4 font-mono text-mono-lg text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-4 focus:ring-brand-navy"
          />
          <button type="submit" className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-primary font-heading font-bold text-data-display text-surface-white motion-safe:active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-surface-white" aria-label="Submit scan">
            <ArrowRight size={22} />
          </button>
        </div>
        {feedback && (
          <p role="status" aria-live="polite" className={`rounded-xl border px-4 py-3 font-body text-body-md ${feedback.startsWith("Saved") ? "border-status-available/40 bg-status-available/10 text-on-surface" : "border-status-held/40 bg-status-held/10 text-on-surface"}`}>
            {feedback}
          </p>
        )}
      </form>
      <ReceivingCameraScanner onScanSubmitted={submitCameraScan} />
    </>
  );
}
