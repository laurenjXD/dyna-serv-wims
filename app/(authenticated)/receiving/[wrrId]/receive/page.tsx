// Scan interface — floor-priority receiving reconciliation screen.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §3 (route), §6 (floor scan design),
//     §6.1 (flow-type cross-check), §6.2 (store: scan-first, then suggested
//     location), §6.3 (inspect: location-first, then scan), §9 (per-line
//     immediate commit, Reversed 2026-08-10)
//   specs/07-incoming-receiving/requirements.md R3 (barcode reconciliation),
//     R2.5 (floor flow shows WRR, expected lines, quantities, exceptions)
//   specs/00-steering/brand-design-system.md §3 (floor surface rules — mobile-first
//     base styles, NO glassmorphism, active: press not hover:, one primary action,
//     primary action in bottom third full-width, 64px minimum touch targets),
//     §6 (solid bg-surface-white — no backdrop-blur on floor), §5 (AAA contrast),
//     §2 (no text below 16px on floor), §8 (no backdrop-blur, animation constraints)
//
// Surface: FLOOR. Designed at 375px viewport first. No glassmorphism.
// Permission gate: receiving.scan (scan), receiving.confirm (per-line commit)
//
// Feedback mechanism: after a scan the server action redirects back to this
// page with `result=scanned&remaining=N&disposition=D` on success or
// `result=error&reason=...` on failure. Per-line "Store"/"Hold" commits use
// the same redirect-with-searchParams pattern: `result=committed&line=ID` on
// success, `result=commit_error&line=ID&reason=...` on failure.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { locations } from "@/lib/db/schema/locations";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import { getPutawayLocationContents, suggestPutawayLocations } from "@/lib/db/queries/locations";
import type { PutawayCandidate } from "@/lib/db/queries/locations";
import { recordScan, startReceiving, commitWrrLine, setWrrLineDisposition, closeWrrWithShortage } from "@/lib/actions/receiving";
import type { WrrItemRow } from "@/lib/db/queries/receiving";
import { CameraScanBridge } from "./_components/CameraScanBridge";
import { PutawayLocationSelector } from "./_components/PutawayLocationSelector";
import { LocationCombobox } from "./_components/LocationCombobox";
import { ReceiveDiscrepancyClient } from "./_components/ReceiveDiscrepancyClient";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  Check,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Archive,
  ShieldAlert,
  CircleDot,
} from "lucide-react";

// ─── Error reason → plain language ──────────────────────────────────────────

function getScanErrorMessage(reason: string): string {
  switch (reason) {
    case "forbidden":
      return "You do not have permission to scan items.";
    case "not_found":
      return "WRR document not found.";
    case "invalid_status":
      return "This WRR is not in receiving status. Return to the WRR and start receiving first.";
    case "wrr_document_qr":
      return "This QR identifies the WRR document, not a physical item. Go back to the WRR, print its Unit Labels, then scan one label per carton or item.";
    case "no_match":
      return "Item not found — barcode does not match any expected line on this WRR.";
    case "over_quantity":
      return "Already fully scanned — this item has already reached its expected quantity.";
    case "duplicate":
      return "Duplicate scan — this barcode has already been counted.";
    case "unknown_item":
      return "Unknown item — barcode is not registered in the system. Contact a supervisor to enroll this item.";
    case "flow_type_mismatch":
      return "This item does not belong to this WRR's flow type — contact a supervisor.";
    case "duplicate_unit_scan":
      return "This exact label has already been scanned — if this carton is genuinely new, check for a duplicate printed label.";
    default:
      return `Scan rejected: ${reason}. Contact a supervisor if this persists.`;
  }
}

function getCommitErrorMessage(reason: string): string {
  if (reason.includes("presence_attestation_required")) {
    return "Confirm that every declared box or pallet is physically present before storing.";
  }
  if (reason.includes("allocation_qty_must_equal_expected")) {
    return "Assign a location to every declared box or pallet before storing.";
  }
  if (reason.includes("missing_location")) {
    return "Choose a storage location for every declared box or pallet before storing.";
  }
  if (reason.includes("under-scanned")) {
    return "Scan one QR from this pallet first, then assign its locations.";
  }
  switch (reason) {
    case "forbidden":
      return "You do not have permission to confirm receipt for this line.";
    case "not_found":
      return "This line could not be found.";
    case "commit_failed":
      return "The receipt could not be saved. Nothing was stored. Try again; if it continues, contact a supervisor with the WRR number.";
    default:
      return `Could not complete this line: ${reason}. Contact a supervisor if this persists.`;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ wrrId: string }>;
  searchParams: Promise<{
    result?: string;
    remaining?: string;
    disposition?: string;
    reason?: string;
    line?: string;
    barcode?: string;
  }>;
}

export default async function ReceiveFloorPage({
  params,
  searchParams,
}: PageProps) {
  const { wrrId } = await params;
  const {
    result,
    remaining: remainingParam,
    disposition: dispositionParam,
    reason: reasonParam,
    line: lineParam,
    barcode: barcodeParam,
  } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: receiving.scan — floor staff capability.
  const permResult = await requirePermission(resolver, "receiving.scan");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  let wrr = await getWrrDocument(db, wrrId);
  if (!wrr) {
    notFound();
  }

  // Auto-initiate: if the WRR is still staged, transition it to
  // receiving_in_progress on load (idempotent — if already in progress, the
  // action returns invalid_status which we ignore). R2.4 requires this to be
  // safe to retry and not require a separate manual step on the floor.
  if (wrr.status === "staged_pending_arrival") {
    try {
      const startResult = await startReceiving(resolver, wrrId);
      if (startResult.ok) {
        const refreshed = await getWrrDocument(db, wrrId);
        if (refreshed) {
          wrr = refreshed;
        }
      }
    } catch {
      // Non-fatal: if auto-initiation fails, render page with current state
    }
  }

  // Only allow scan/commit when WRR is in receiving_in_progress.
  const isReceivable = wrr.status === "receiving_in_progress";
  const isComplete = wrr.status === "confirmed";

  // Compute progress counts from items safely.
  const totalLines = Array.isArray(wrr.items) ? wrr.items.length : 0;
  const fullyScannedLines = (wrr.items ?? []).filter(
    (item: WrrItemRow) => (Number(item.scannedQty) || 0) >= (Number(item.expectedQty) || 0) && (Number(item.expectedQty) || 0) > 0
  ).length;
  const allLinesScanned = totalLines > 0 && fullyScannedLines === totalLines;

  // One accepted label may open batch placement for a whole declared line.
  const readyLines = (wrr.items ?? []).filter(
    (item: WrrItemRow) =>
      (Number(item.scannedQty) || 0) >= 1 && item.committedAt === null
  );
  const primaryReadyLine: WrrItemRow | null = readyLines.length > 0 ? readyLines[0] : null;

  // Fetch putaway suggestions (store) / active inspection locations (inspect).
  // Candidate data includes remainingCbm and the selector renders it per box.
  // only for the single primary ready line.
  let primaryStoreCandidates: PutawayCandidate[] = [];
  let primaryStoreContents: Record<string, Awaited<ReturnType<typeof getPutawayLocationContents>>[string]> = {};
  let inspectionLocations: Array<{ id: string; label: string }> = [];
  if (primaryReadyLine?.disposition === "store") {
    // A location-preview failure must never remove the scan screen. It is a
    // recoverable placement error, not a reason to fail the entire WRR route.
    try {
      primaryStoreCandidates = await suggestPutawayLocations(db, {
        itemUnitCbm: Number(primaryReadyLine.unitCbm ?? 0),
        requestedQty: 1,
        limit: 50,
      });
      primaryStoreContents = await getPutawayLocationContents(
        db,
        primaryStoreCandidates.map((candidate) => candidate.id),
      );
    } catch {
      primaryStoreCandidates = [];
      primaryStoreContents = {};
    }
  } else if (primaryReadyLine?.disposition === "inspect") {
    try {
      inspectionLocations = ((await db
        .select({ id: locations.id, label: locations.label })
        .from(locations)
        .where(and(eq(locations.locationType, "inspection"), eq(locations.isActive, true)))) as Array<{
          id: string;
          label: string;
        }>).sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "", undefined, { numeric: true, sensitivity: "base" }));
    } catch {
      inspectionLocations = [];
    }
  }

  // Inline server action — closes over wrrId from the page component.
  // On success: redirects with scan result encoded in URL.
  // On failure: redirects with error reason encoded in URL.
  async function handleScan(formData: FormData): Promise<void> {
    "use server";
    const barcode = ((formData.get("barcode") as string | null) ?? "").trim();
    if (!barcode) {
      redirect(
        `/receiving/${wrrId}/receive?result=error&reason=${encodeURIComponent("empty_barcode")}`
      );
    }
    const actionResolver = await createPageResolver();
    const scanResult = await recordScan(actionResolver, wrrId, barcode);
    if (scanResult.ok) {
      redirect(
        `/receiving/${wrrId}/receive?result=scanned&remaining=${scanResult.remainingQty}&disposition=${scanResult.disposition}`
      );
    } else {
      redirect(
        `/receiving/${wrrId}/receive?result=error&reason=${encodeURIComponent(scanResult.reason)}&barcode=${encodeURIComponent(barcode)}`
      );
    }
  }

  async function handleCloseShortage(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    await closeWrrWithShortage(actionResolver, wrrId);
    redirect(`/receiving/${wrrId}`);
  }

  // Inline server action — per-line commit ("Store" or "Hold"). Closes over
  // wrrId. locationId comes from the line's select input.
  async function handleCommitLine(formData: FormData): Promise<void> {
    "use server";
    const wrrItemId = (formData.get("wrrItemId") as string | null) ?? "";
    const locationId = (formData.get("locationId") as string | null) ?? "";
    const serializedAllocations = (formData.get("allocations") as string | null) ?? "";
    const serializedUnitLocations = (formData.get("unitLocationIds") as string | null) ?? "";
    let allocations: Array<{ locationId: string; qty: number }> | undefined;
    let unitLocationIds: string[] | undefined;
    try {
      const parsed = JSON.parse(serializedAllocations || "null");
      if (Array.isArray(parsed)) allocations = parsed;
    } catch {
      // Validation below returns the normal recoverable error.
    }
    try {
      const parsed = JSON.parse(serializedUnitLocations || "null");
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
        unitLocationIds = parsed;
      }
    } catch {
      // The server command validates the missing/malformed unit assignment.
    }
    const presenceAttested = formData.get("presenceAttested") === "true";
    if (!wrrItemId || (!locationId && !allocations?.length)) {
      redirect(
        `/receiving/${wrrId}/receive?result=commit_error&line=${encodeURIComponent(wrrItemId)}&reason=${encodeURIComponent("missing_location")}`
      );
    }
    const actionResolver = await createPageResolver();
    const commitResult = await commitWrrLine(actionResolver, wrrId, wrrItemId, {
      locationId,
      allocations,
      unitLocationIds,
      presenceAttested,
    });
    if (commitResult.ok) {
      redirect(
        `/receiving/${wrrId}/receive?result=committed&line=${encodeURIComponent(wrrItemId)}`
      );
    } else {
      redirect(
        `/receiving/${wrrId}/receive?result=commit_error&line=${encodeURIComponent(wrrItemId)}&reason=${encodeURIComponent(commitResult.errors.join("|"))}`
      );
    }
  }

  // A receiving operator can route an unscanned line to inspection directly
  // from the floor workflow. The subsequent hold flow requires an inspection
  // location and commits the lot as quarantined, never as available stock.
  async function handleSetDisposition(formData: FormData): Promise<void> {
    "use server";
    const wrrItemId = String(formData.get("wrrItemId") ?? "");
    const disposition = formData.get("disposition");
    if (disposition !== "store" && disposition !== "inspect") {
      redirect(`/receiving/${wrrId}/receive`);
    }
    await setWrrLineDisposition(
      await createPageResolver(),
      wrrId,
      wrrItemId,
      disposition,
    );
    redirect(`/receiving/${wrrId}/receive`);
  }

  // Determine feedback state from search params.
  const scanSuccess = result === "scanned";
  const scanError = result === "error";
  const commitSuccess = result === "committed";
  const commitError = result === "commit_error";
  const remainingQty = remainingParam ? parseInt(remainingParam, 10) : null;
  const dispositionResult = dispositionParam;
  const errorReason = reasonParam ?? "";
  const feedbackLineId = lineParam ?? null;
  const progressPercent = totalLines > 0 ? Math.round((fullyScannedLines / totalLines) * 100) : 0;

  // ─── Receipt complete: all lines committed, WRR already confirmed server-side ───
  if (isComplete) {
    return (
      <div className="flex min-h-screen flex-col bg-[#F3F6FC]">
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-4 text-center">
          <div className="w-full max-w-md rounded-xl bg-surface-white p-6 shadow-elevation-2">
            <span
              aria-hidden="true"
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-status-available text-surface-white font-heading font-bold text-headline-md"
            >
              <Check size={32} strokeWidth={3} />
            </span>
            <h1 className="mt-4 font-heading font-semibold text-headline-md text-brand-navy">
              Receipt complete
            </h1>
            <p className="mt-2 font-body text-body-md text-on-surface">
              Every line on {wrr.wrrNumber} has been stored or held. This WRR
              is now confirmed.
            </p>
            <Link
              href={`/receiving/${wrrId}`}
              className="mt-6 flex h-16 w-full items-center justify-center rounded bg-primary font-heading font-bold text-data-display text-surface-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-4 focus:ring-brand-navy"
            >
              Back to WRR
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    // Floor screen uses the active light surface by default. Dark mode is
    // controlled globally from the Profile preference, never hard-coded here.
    // brand-design-system.md §4: floor screens use 16px page padding.
    <div className="flex min-h-screen flex-col bg-[#F3F6FC]">
      {/* Top bar — compact, floor-appropriate */}
      <div className="border-b border-outline-variant/30 bg-surface-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          {/* Back link — h-14 (56px) minimum floor touch target per §3 */}
          <Link
            href={`/receiving/${wrrId}`}
            className="inline-flex h-14 items-center gap-2 text-body-md font-body text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
          >
            {/* Left arrow — no icon dependency, pure text/unicode for floor performance */}
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Back to WRR</span>
          </Link>
          {/* WRR reference — Roboto Mono per §9 */}
          <span className="font-mono text-mono-lg text-text-grey">
            {wrr.wrrNumber}
          </span>
        </div>
      </div>

      {/* Main floor content — flex-1, single-column, 16px padding */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 pb-8">
        {/* Progress header — Fira Sans, large enough for floor visibility */}
        <div className="rounded-2xl border border-outline-variant/40 bg-surface-white p-5 shadow-elevation-2 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-label text-label font-bold uppercase tracking-[0.12em] text-primary">Receiving workflow</p>
              <h1 className="mt-1 font-heading font-extrabold text-headline-md text-on-surface">Scan items</h1>
            </div>
            <div className="rounded-xl bg-[#EEF3FF] px-4 py-3 text-right">
              <p className="font-mono text-data-display font-bold text-brand-navy">{fullyScannedLines}/{totalLines}</p>
              <p className="font-label text-label font-bold uppercase tracking-wide text-text-grey">Lines complete</p>
            </div>
          </div>
          {/* Progress — no text below 16px (body-md) on floor screens per §2 */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between font-label text-label font-bold uppercase tracking-wide text-text-grey"><span>Receipt progress</span><span>{progressPercent}%</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-[#E6ECF8]" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Receipt progress">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          {!isReceivable && (
            <div
              role="alert"
              className="mt-3 rounded bg-status-pending px-3 py-2"
            >
              <p className="font-body text-body-md text-on-surface">
                This WRR is not in receiving status. Return to the WRR detail
                and start receiving before scanning.
              </p>
            </div>
          )}
        </div>

        {/* Scan feedback — full-screen flash equivalent via solid color block.
            brand-design-system.md §9 §10: scan feedback is a solid color fill,
            not a gradient or blurred overlay. AAA contrast (7:1) for
            time-critical text per §1.5. */}
        {scanSuccess && (
          <div
            role="status"
            aria-live="assertive"
            // White background with status-available left border — AAA contrast
            // (near-black on white >15:1). Icon carries the semantic green signal.
            className="mt-4 rounded-xl border border-status-available/40 bg-status-available/5 px-4 py-4 shadow-sm"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface flex items-center gap-2">
              <CheckCircle2 className="text-status-available" size={22} /> Scanned
            </p>
            {remainingQty !== null && (
              <p className="mt-1 font-body text-body-md text-on-surface">
                {remainingQty === 0
                  ? "Line complete."
                  : `${remainingQty} remaining on this line.`}
              </p>
            )}
            {dispositionResult && (
              <p className="mt-1 font-body text-body-md text-on-surface">
                Disposition:{" "}
                <span className="text-body-md font-body uppercase">
                  {dispositionResult}
                </span>
              </p>
            )}
          </div>
        )}

        <ReceiveDiscrepancyClient
          wrrId={wrrId}
          wrrNumber={wrr.wrrNumber}
          isError={scanError}
          reason={errorReason}
          scannedBarcode={barcodeParam}
        />

        {fullyScannedLines > 0 && fullyScannedLines < totalLines && (
          <div className="mt-4 rounded-xl border border-status-pending/40 bg-[#FFF9EB] p-4 shadow-elevation-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-heading text-body-md font-bold text-on-surface">
                  Partial Receipt / Delivery Shortage
                </p>
                <p className="mt-1 font-body text-body-sm text-text-grey">
                  {fullyScannedLines} of {totalLines} lines are ready. If the remaining items are not physically arriving on this truck, you can finalize this WRR with shortage.
                </p>
              </div>
              <form action={handleCloseShortage}>
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-status-held/40 bg-surface-white px-4 font-label text-label font-bold text-status-held hover:bg-status-held/10 focus:outline-none focus:ring-2 focus:ring-brand-navy whitespace-nowrap"
                >
                  Finalize with Shortage (OS&D)
                </button>
              </form>
            </div>
          </div>
        )}

        {commitSuccess && (
          <div
            role="status"
            aria-live="assertive"
            className="mt-4 rounded-xl border border-status-available/40 bg-status-available/5 px-4 py-4 shadow-sm"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface flex items-center gap-2">
              <CheckCircle2 className="text-status-available" size={22} /> Line committed
            </p>
            <p className="mt-1 font-body text-body-md text-on-surface">
              This line has been posted to inventory.
            </p>
          </div>
        )}

        {commitError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-4 rounded-xl border border-status-held/40 bg-status-held/5 px-4 py-4 shadow-sm"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface flex items-center gap-2">
              <AlertCircle className="text-status-held" size={22} /> Could not complete line
            </p>
            <p className="mt-1 font-body text-body-md text-on-surface">
              {getCommitErrorMessage(errorReason)}
            </p>
            {feedbackLineId && (
              <p className="mt-1 font-mono text-mono-lg text-status-neutral">
                Line: {feedbackLineId}
              </p>
            )}
          </div>
        )}

        {/* Item progress list — card-based, NOT a dense table.
            brand-design-system.md §9: floor tables are a fail case;
            use card-based list, one item per row. */}
        <div className="mt-4 space-y-3">
          {wrr.items.map((item: WrrItemRow) => {
            const fullyScanned = item.scannedQty >= item.expectedQty;
            const isCommitted = item.committedAt !== null;
            // Batch putaway begins after one accepted physical QR. The final
            // command still needs the attestation and a complete allocation;
            // it is not an unverified shortcut around reconciliation.
            const readyToCommit = item.scannedQty >= 1 && !isCommitted;
            const isPrimaryReady = primaryReadyLine !== null && item.id === primaryReadyLine.id;

            return (
              <div
                key={item.id}
                // Floor card: solid surface-white, Level 2 shadow, no glassmorphism
                className={`rounded-2xl border bg-surface-white p-4 shadow-elevation-1 sm:p-5 ${isPrimaryReady ? "border-primary/50 ring-2 ring-primary/10" : "border-outline-variant/40"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Lot number — Roboto Mono per §9, min 16px on floor */}
                    <p className="font-mono text-mono-lg font-bold text-on-surface">
                      {item.lotNumber}
                    </p>
                    {/* Qty progress */}
                    <p className="mt-1 font-body text-body-md text-on-surface">
                      {item.scannedQty} / {item.expectedQty} scanned
                    </p>
                    {/* Disposition — label + badge with icon, never color alone per §1.3 floor rule */}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-body-md font-body text-on-surface">
                        Disposition:
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-body-md font-label uppercase ${item.disposition === "store"
                            ? "bg-status-available/10 text-emerald-800 border border-status-available/20"
                            : "bg-status-pending/10 text-amber-800 border border-status-pending/20"
                          }`}
                      >
                        {item.disposition === "store" ? (
                          <Archive size={14} className="text-emerald-700 shrink-0" aria-hidden="true" />
                        ) : (
                          <ShieldAlert size={14} className="text-amber-700 shrink-0" aria-hidden="true" />
                        )}
                        <span>{item.disposition === "store" ? "STORE" : "INSPECT"}</span>
                      </span>
                    </div>
                    {!isCommitted && item.scannedQty === 0 && (
                      <button
                        type="submit"
                        form={`set-disposition-${item.id}`}
                        className="mt-3 inline-flex min-h-11 items-center justify-center rounded border border-status-pending px-3 font-label text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:active:scale-[0.97]"
                      >
                        {item.disposition === "inspect" ? "Return to Store" : "Hold for Inspection"}
                      </button>
                    )}
                  </div>
                  {/* Completion / committed indicator — visible, accessible */}
                  {isCommitted ? (
                    <span
                      aria-label="Committed"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-available text-surface-white font-heading font-bold"
                    >
                      <Check size={20} strokeWidth={3} />
                    </span>
                  ) : (
                    (fullyScanned || readyToCommit) && (
                      <span
                        aria-label="Fully scanned"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-pending text-surface-white font-heading font-bold"
                      >
                        <Check size={20} strokeWidth={3} />
                      </span>
                    )
                  )}
                </div>

                {/* At most one full-width brand-red primary CTA is ever visible at
                    a time on this floor screen (brand-design-system.md §3). The
                    actual Store/Hold commit form for the primary ready line lives
                    in the sticky bottom primary-action area below, not inline
                    here. Any OTHER ready-but-not-yet-committed line gets a
                    compact, secondary-styled indicator instead of a second
                    equal-weight primary button. design.md §6.2/§6.3. */}
                {readyToCommit && isPrimaryReady && (
                  <div className="mt-3 flex items-center gap-2 border-t border-outline-variant/30 pt-3">
                    <ArrowDown size={18} aria-hidden="true" className="text-brand-navy" />
                    <p className="font-label text-body-md text-brand-navy">
                      QR verified — {item.disposition === "store" ? "assign locations" : "choose the inspection location"} below
                    </p>
                  </div>
                )}

                {readyToCommit && !isPrimaryReady && (
                  <div className="mt-3 flex items-center gap-2 border-t border-outline-variant/30 pt-3">
                    <CircleDot size={16} aria-hidden="true" className="text-status-pending" />
                    <p className="font-label text-body-md text-on-surface">
                      QR verified — complete the current line first
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary action — bottom third of screen, full-width, exactly ONE
          brand-red CTA at a time (brand-design-system.md §3). Priority:
          if a line is fully scanned and awaiting commit, THAT line's
          Store/Hold form is the primary action here (design.md §6.2/§6.3/§9)
          — scanning resumes once it's resolved. Otherwise, if lines remain
          unscanned, the scan input is the primary action. 64px minimum
          height for floor primary actions throughout. */}
      {isReceivable && primaryReadyLine && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-outline-variant/40 bg-surface-white px-4 pb-6 pt-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] sm:-mx-6 sm:rounded-t-2xl sm:border-x">
          <form action={handleCommitLine} className="flex flex-col gap-3">
            <input type="hidden" name="wrrItemId" value={primaryReadyLine.id} />
            <p className="font-mono text-mono-lg font-bold text-on-surface">
              {primaryReadyLine.lotNumber}
            </p>
            <div className="flex items-start gap-3 rounded-xl border border-status-available/30 bg-[#F0FDF8] px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-available font-heading font-bold text-surface-white" aria-hidden="true">
                <Check size={18} strokeWidth={3} />
              </span>
              <div>
                <p className="font-label text-body-md font-bold text-on-surface">
                  Pallet verified
                </p>
                <p className="mt-1 font-body text-body-md text-text-grey">
                  Assign all {primaryReadyLine.expectedQty} declared boxes before storing.
                </p>
              </div>
            </div>
            {primaryReadyLine.disposition === "store" ? (
              <>
                {primaryStoreCandidates.length > 0 ? (
                  <>
                    <p className="rounded border border-outline-variant/30 bg-surface-light-grey px-3 py-2 font-body text-body-md text-on-surface">
                      This receipt needs {((Number(primaryReadyLine.unitCbm) || 0) * (Number(primaryReadyLine.expectedQty) || 0)).toFixed(2)} CBM. Choose a location, review its capacity and current contents, then store.
                    </p>
                    <PutawayLocationSelector
                      candidates={primaryStoreCandidates}
                      contents={primaryStoreContents}
                      quantity={primaryReadyLine.expectedQty}
                      unitCbm={Number(primaryReadyLine.unitCbm) || 0}
                    />
                  </>
                ) : (
                  <div role="alert" className="rounded-lg border border-status-held/40 bg-status-held/5 px-3 py-2 shadow-sm">
                    <p className="flex items-center gap-2 font-body text-body-md text-on-surface">
                      <AlertTriangle size={18} aria-hidden="true" className="text-status-held" />
                      No storage location has enough remaining capacity. Contact a supervisor.
                    </p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={primaryStoreCandidates.length === 0}
                  className="flex h-16 w-full items-center justify-center rounded bg-primary font-heading font-bold text-data-display text-surface-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-4 focus:ring-surface-white disabled:opacity-50"
                >
                  Store all {primaryReadyLine.expectedQty} boxes
                </button>
              </>
            ) : (
              <>
                <label
                  htmlFor="location-primary"
                  className="text-body-md font-body text-on-surface"
                >
                  Inspection location
                </label>
                {inspectionLocations.length > 0 ? (
                  <LocationCombobox
                    id="location-primary"
                    name="locationId"
                    required={inspectionLocations.length > 1}
                    options={inspectionLocations}
                    defaultValue={inspectionLocations.length === 1 ? inspectionLocations[0].id : ""}
                    placeholder="Search or choose an inspection location"
                  />
                ) : (
                  <div role="alert" className="rounded-lg border border-status-held/40 bg-status-held/5 px-3 py-2 shadow-sm">
                    <p className="flex items-center gap-2 font-body text-body-md text-on-surface">
                      <AlertTriangle size={18} aria-hidden="true" className="text-status-held" />
                      No active inspection location is configured. Contact a supervisor.
                    </p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={inspectionLocations.length === 0}
                  className="flex h-16 w-full items-center justify-center rounded bg-primary font-heading font-bold text-data-display text-surface-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-4 focus:ring-surface-white disabled:opacity-50"
                >
                  Hold
                </button>
              </>
            )}
          </form>
        </div>
      )}

      {isReceivable && !primaryReadyLine && !allLinesScanned && (
        <div className="sticky bottom-0 border-t border-outline-variant/30 bg-surface-white px-4 pb-6 pt-4 shadow-elevation-2">
          <form action={handleScan} className="flex flex-col gap-3">
            <label
              htmlFor="barcode-input"
              className="text-body-md font-body text-on-surface"
            >
              Scan one pallet QR to verify the boxes
            </label>
            <p className="font-body text-body-md text-text-grey">
              Scan one QR from the pallet first. We will confirm the item before asking where its declared boxes should be stored.
            </p>
            <div className="flex gap-2">
              <input
                id="barcode-input"
                name="barcode"
                type="text"
                autoFocus
                autoComplete="off"
                inputMode="text"
                placeholder="Scan or enter pallet code"
                className="h-16 flex-1 rounded border-2 border-outline-variant bg-surface-white px-4 font-mono text-mono-lg text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-4 focus:ring-brand-navy"
              />
              <button
                type="submit"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-primary font-heading font-bold text-data-display text-surface-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-4 focus:ring-surface-white"
                aria-label="Submit scan"
              >
                <ArrowRight size={22} />
              </button>
            </div>
          </form>
          {/* Camera scanner — secondary/alternate scan input, below the
              primary auto-focused manual input, feeding the exact same
              handleScan action. brand-design-system.md §3 one-primary-
              action rule: this must never compete with the manual input. */}
          <CameraScanBridge action={handleScan} />
        </div>
      )}

      {/* These forms sit outside the scan cards and sticky primary-action
          region. Their linked buttons are compact secondary controls. */}
      {wrr.items.map((item: WrrItemRow) =>
        item.committedAt === null && item.scannedQty === 0 ? (
          <form key={item.id} id={`set-disposition-${item.id}`} action={handleSetDisposition}>
            <input type="hidden" name="wrrItemId" value={item.id} />
            <input
              type="hidden"
              name="disposition"
              value={item.disposition === "inspect" ? "store" : "inspect"}
            />
          </form>
        ) : null,
      )}
    </div>
  );
}
