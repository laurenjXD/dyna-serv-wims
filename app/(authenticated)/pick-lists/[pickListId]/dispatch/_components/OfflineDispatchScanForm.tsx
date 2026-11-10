"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ScanLine } from "@/components/ui/icons";
import { FloorCameraScanner } from "@/components/floor/FloorCameraScanner";
import { useOfflineStatus } from "@/lib/offline/provider";
import { listPendingOfflineEntries } from "@/lib/offline/storage";

export type OfflineDispatchLine = {
  id: string;
  itemCode: string;
  itemBarcode: string | null;
  lotId: string;
  lotNumber: string;
  locationId: string;
  locationLabel: string;
  numberOfBoxes: number;
  selectedCount: number;
};

export function OfflineDispatchScanForm({
  action,
  pickListId,
  lines,
}: {
  action: (formData: FormData) => void | Promise<void>;
  pickListId: string;
  lines: OfflineDispatchLine[];
}) {
  const { connectivity, queueObservation, currentUserId } = useOfflineStatus();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const savingRef = useRef(false);
  const revision = JSON.stringify(lines.map((line) => [line.id, line.selectedCount, line.numberOfBoxes]));
  const [local, setLocal] = useState<{ actor: string | null; revision: string; completed: string[] }>({ actor: currentUserId, revision, completed: [] });
  const saved = new Set(local.actor === currentUserId && local.revision === revision ? local.completed : []);
  const nextLine = lines.find((line) => line.selectedCount < line.numberOfBoxes && !saved.has(line.id));

  useEffect(() => {
    let active = true;
    if (!currentUserId) return;
    void listPendingOfflineEntries(currentUserId).then((entries) => {
      if (!active) return;
      const completed = entries.filter((entry) => entry.capturedByUserId === currentUserId &&
        entry.actionType === "pick_list_scan_observation" && entry.payload.pickListId === pickListId)
        .map((entry) => String(entry.payload.pickListItemId ?? ""));
      setLocal({ actor: currentUserId, revision, completed });
    }).catch(() => {});
    return () => { active = false; };
  }, [currentUserId, pickListId, revision]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (connectivity !== "offline") return;
    event.preventDefault();
    if (!currentUserId) { setFeedback("Sign in again before saving a scan."); return; }
    const barcode = inputRef.current?.value.trim() ?? "";
    if (!barcode || savingRef.current) return;
    if (!barcode.startsWith("{")) {
      setFeedback("A carton-specific QR is required. Item and lot QR codes cannot confirm a box.");
      return;
    }
    // A carton QR cannot be safely assigned to a committed line while offline;
    // defer it to the online authoritative lookup rather than guessing.
    setFeedback("Reconnect to verify this carton-specific QR before dispatch. The system must confirm its committed line online.");
  }

  function submitCameraScan(barcode: string) {
    if (inputRef.current) inputRef.current.value = barcode;
    formRef.current?.requestSubmit();
  }

  return (
    <>
      {connectivity === "offline" && (
        <p className="mt-3 font-body text-body-md text-on-surface">
          {nextLine ? `Offline next: ${nextLine.itemCode} - Lot ${nextLine.lotNumber} - ${nextLine.locationLabel}. Reconnect to verify each carton QR.` : "All shown lines are saved locally or already verified. Reconnect and sync before final dispatch."}
        </p>
      )}
      <form ref={formRef} action={action} onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          ref={inputRef}
          name="barcode"
          required
          autoFocus
          autoComplete="off"
          placeholder="Scan carton QR..."
          className="h-14 min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-white px-4 font-mono text-body-md text-on-surface outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
        />
        <button type="submit" className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-brand-navy px-6 font-label text-body-md font-bold text-surface-white transition-colors hover:bg-brand-navy/90 active:scale-[0.99]">
          <ScanLine size={18} aria-hidden="true" />
          <span>{connectivity === "offline" ? "Save Box" : "Verify Box"}</span>
        </button>
      </form>
      {feedback && <p role="status" aria-live="polite" className="mt-3 rounded-xl border border-status-pending/40 bg-status-pending/10 px-4 py-3 font-body text-body-md text-on-surface">{feedback}</p>}
      <div className="mt-3"><FloorCameraScanner onScanSubmitted={submitCameraScan} /></div>
    </>
  );
}
