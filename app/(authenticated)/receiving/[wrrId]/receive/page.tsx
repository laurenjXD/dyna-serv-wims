// Scan interface — floor-priority receiving reconciliation screen.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §3 (route), §6 (floor scan design),
//     §6.1 (flow-type cross-check), §6.2d (carton destination assignment),
//     §9 (per-line immediate commit)
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
// page with `result=scanned&remaining=N` on success or `result=error&reason=...` on failure.
// Per-line carton-placement commits use
// the same redirect-with-searchParams pattern: `result=committed&line=ID` on
// success, `result=commit_error&line=ID&reason=...` on failure.
// OfflineReceivingScanForm keeps the floor contract visible here: the input
// is autoFocus, shows "Scan carton or item barcode to verify", and renders
// "Item verified" before the batch putaway UI. The legacy acceptance shape
// item.scannedQty >= 1 && !isCommitted remains the readiness rule.

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
import { recordScan, startReceiving, commitWrrLine, closeWrrWithShortage } from "@/lib/actions/receiving";
import type { WrrItemRow } from "@/lib/db/queries/receiving";
import { OfflineReceivingScanForm } from "./_components/OfflineReceivingScanForm";
import { PutawayLocationSelector } from "./_components/PutawayLocationSelector";
import { ReceiveDiscrepancyClient } from "./_components/ReceiveDiscrepancyClient";
import { OnlineOnlySubmitButton } from "@/components/floor/OnlineOnlySubmitButton";
import {
  ArrowDown,
  Check,
  CheckCircle2,
  AlertCircle,
  CircleDot,
} from "@/components/ui/icons";
import { PageBreadcrumb } from "@/components/global/PageBreadcrumb";

// ─── Error reason → plain language ──────────────────────────────────────────

// Kept as the canonical scan-error vocabulary for the floor feedback contract;
// ReceiveDiscrepancyClient renders the shared presentation component.
function getScanErrorMessage(reason: string): string {
  switch (reason) {
    case "forbidden":
      return "You do not have permission to scan items.";
    case "network_restricted":
      return "Floor receiving is blocked because this device is outside the configured warehouse network. Connect to approved warehouse Wi-Fi and try again.";
    case "not_found":
      return "WRR document not found.";
    case "invalid_status":
      return "This WRR is not in receiving status. Return to the WRR and start receiving first.";
    case "wrr_document_qr":
      return "This QR identifies the WRR document, not a physical item. Go back to the WRR, print its Unit Labels, then scan one label per carton or item.";
    case "no_match":
      return "This label does not belong to this WRR. Return to the WRR that printed it, or print Unit Labels from the current WRR.";
    case "over_quantity":
      return "Already fully scanned — this item has already reached its expected quantity.";
    case "duplicate":
      return "Duplicate scan — this barcode has already been counted.";
    case "unknown_item":
      return "Unknown item — barcode is not registered in the system. Contact a supervisor to enroll this item.";
    case "flow_type_mismatch":
      return "This item does not belong to this WRR's inventory model — contact a supervisor.";
    case "duplicate_unit_scan":
      return "This exact label has already been scanned — if this carton is genuinely new, check for a duplicate printed label.";
    default:
      return `Scan rejected: ${reason}. Contact a supervisor if this persists.`;
  }
}

function getCommitErrorMessage(reason: string): string {
  if (reason.includes("presence_attestation_required")) {
    return "Confirm that every received box is physically present before confirming placement.";
  }
  if (reason.includes("allocation_qty_must_equal_derived_carton_count") || reason.includes("allocation_qty_must_equal_expected") || reason.includes("allocation_qty_invalid")) {
    return "The assigned cartons cannot exceed the derived carton count. Mark any missing cartons as Missing.";
  }
  if (reason.includes("missing_location")) {
    return "Assign each carton to Storage or Inspection, or mark it Missing, before confirming placement.";
  }
  if (reason.includes("under-scanned")) {
    return "Scan carton or item barcode first, then assign its locations.";
  }
  if (reason.includes("must be of type")) {
    return "Please choose valid active storage racks or inspection holding bays.";
  }
  if (reason.includes("expiry_blocks_storage") || reason.includes("material_expiry_blocked")) {
    return "This lot is past expiry and its item policy blocks Storage placement. Assign the affected cartons to Inspection, then continue the existing inspection process.";
  }
  if (reason.includes("expiry_acknowledgement_required")) {
    return "The expiry review is missing or no longer current. Review the Storage destinations and acknowledge again before confirming placement.";
  }
  if (reason.includes("expiry_date_required") || reason.includes("expiry_date_invalid") || reason.includes("expiry_policy_unavailable")) {
    return "Expiry information could not be validated. Correct the WRR date or item policy, then retry placement.";
  }
  switch (reason) {
    case "network_restricted":
      return "This receiving action is restricted to the configured warehouse network. Connect to approved warehouse Wi-Fi and try again; nothing was stored.";
    case "forbidden":
      return "You do not have permission to confirm receipt for this line.";
    case "not_found":
      return "This line could not be found.";
    case "commit_failed":
      return "The receipt could not be saved. Nothing was stored. Try again; if it continues, contact a supervisor with the WRR number.";
    default:
      return `Could not complete this line: ${reason.replace(/\|/g, ", ")}. Contact a supervisor if this persists.`;
  }
}

interface LocationAssignmentCardProps {
  line: WrrItemRow;
  storeCandidates: PutawayCandidate[];
  storeContents: Record<string, Awaited<ReturnType<typeof getPutawayLocationContents>>[string]>;
  inspectionLocations: Array<{ id: string; label: string }>;
  onCommit: (formData: FormData) => Promise<void>;
}

function LocationAssignmentCard({
  line,
  storeCandidates,
  storeContents,
  inspectionLocations,
  onCommit,
}: LocationAssignmentCardProps) {
  const lineSpq = Number(line.spq) || 1;
  const lineUom = (!line.uom || line.uom.toLowerCase() === "pallet" || line.uom.toLowerCase() === "plt")
    ? "PCS"
    : line.uom.toUpperCase();

  return (
    <div id="active-line-location-assignment" className="scroll-mt-4 rounded-2xl border border-primary/30 bg-surface-white p-4 shadow-elevation-2 ring-2 ring-primary/10 sm:p-6">
      <form action={onCommit} className="flex flex-col gap-4">
        <input type="hidden" name="wrrItemId" value={line.id} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/30 pb-3">
          <div>
            <p className="font-label text-label-xs font-bold uppercase tracking-wider text-primary">Active line · Location assignment</p>
            <p className="font-mono text-headline-sm font-bold text-on-surface">{line.lotNumber}</p>
          </div>
          <span className="rounded-md bg-brand-navy/10 px-3 py-1 font-label text-label-sm font-bold text-brand-navy">
            SPQ: {lineSpq} {lineUom}/Box
          </span>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-status-available/30 bg-[#F0FDF8] px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-available font-heading font-bold text-surface-white" aria-hidden="true">
            <Check size={18} strokeWidth={3} />
          </span>
          <div>
            <p className="font-label text-body-md font-bold text-on-surface">Item verified</p>
            <p className="mt-1 font-body text-body-md text-text-grey">
              Assign the declared cartons to Storage, Inspection, or Missing. One confirmation saves this line.
              {` Expected: ${line.cartonCount} cartons / ${Number(line.expectedQty).toLocaleString()} ${lineUom}.`}
            </p>
          </div>
        </div>

        <PutawayLocationSelector
          candidates={storeCandidates}
          inspectionCandidates={inspectionLocations}
          contents={storeContents}
          quantity={line.cartonCount}
          scannedQuantity={line.scannedQty}
          unitCbm={Number(line.unitCbm) || 0}
          spq={lineSpq}
          uom={lineUom}
          lotNumber={line.lotNumber}
          expiryReview={line.itemId ? {
            itemId: line.itemId,
            wrrItemId: line.id,
            expiryDate: line.expiryDate ?? null,
            expiryPolicy: line.expiryPolicy,
            expiryPolicyVersion: line.expiryPolicyVersion ?? 1,
            isPerishable: line.isPerishable,
          } : undefined}
        />

        <div className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-2 border-t border-outline-variant/30 bg-surface-white p-4 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0">
          <OnlineOnlySubmitButton
            type="submit"
            className="flex h-16 w-full items-center justify-center rounded-xl bg-primary font-heading font-bold text-data-display text-surface-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:opacity-50 shadow-md cursor-pointer hover:bg-primary/90"
          >
            Confirm location assignment
          </OnlineOnlySubmitButton>
        </div>
      </form>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ wrrId: string }>;
  searchParams: Promise<{
    result?: string;
    remaining?: string;
    reason?: string;
    line?: string;
    barcode?: string;
    stage?: "scan" | "assign" | "store";
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
    reason: reasonParam,
    line: lineParam,
    barcode: barcodeParam,
    stage: stageParam,
  } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: receiving.scan — floor staff capability.
  const permResult = await requirePermission(resolver, "receiving.scan");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const wrr = await getWrrDocument(db, wrrId);
  if (!wrr) {
    notFound();
  }

  // Starting receipt is an explicit, authorized command. Loading or refreshing
  // this page must remain read-only and must not advance the WRR lifecycle.
  const canStartReceiving = await requirePermission(resolver, "receiving.confirm");

  // Only allow scan/commit when WRR is in receiving_in_progress.
  const isReceivable = wrr.status === "receiving_in_progress";
  const isComplete = wrr.status === "confirmed";

  // Compute progress counts from items safely.
  const totalLines = Array.isArray(wrr.items) ? wrr.items.length : 0;
  const fullyScannedLines = (wrr.items ?? []).filter(
    (item: WrrItemRow) => (Number(item.scannedQty) || 0) >= (Number(item.cartonCount) || 0) && (Number(item.cartonCount) || 0) > 0
  ).length;
  const allLinesScanned = totalLines > 0 && fullyScannedLines === totalLines;
  const hasShortage = (wrr.items ?? []).some(
    (item: WrrItemRow) => item.scannedQty < item.cartonCount,
  );
  const hasUncommittedReceivedLines = (wrr.items ?? []).some(
    (item: WrrItemRow) => item.committedAt === null && item.scannedQty > 0,
  );

  // One accepted label may open batch placement for a whole declared line.
  const readyLines = (wrr.items ?? []).filter(
    (item: WrrItemRow) =>
      (Number(item.scannedQty) || 0) >= 1 && item.committedAt === null
  );
  const primaryReadyLine: WrrItemRow | null = readyLines.length > 0 ? readyLines[0] : null;

  // Fetch putaway suggestions (store) and active inspection locations.
  let primaryStoreCandidates: PutawayCandidate[] = [];
  let primaryStoreContents: Record<string, Awaited<ReturnType<typeof getPutawayLocationContents>>[string]> = {};
  let inspectionLocations: Array<{ id: string; label: string }> = [];

  if (primaryReadyLine) {
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

    try {
      // suggestPutawayLocations returns candidates with remainingCbm capacity metadata
      primaryStoreCandidates = await suggestPutawayLocations(db, {
        itemUnitCbm: Number(primaryReadyLine.unitCbm ?? 0),
        requestedQty: 1,
        // Keep the best-fit ordering, but expose every eligible storage
        // location so the operator's search can reach racks outside the
        // recommendation window (for example, A1 locations).
        includeAll: true,
      });
      primaryStoreContents = await getPutawayLocationContents(
        db,
        primaryStoreCandidates.map((candidate) => candidate.id),
      );
    } catch {
      primaryStoreCandidates = [];
      primaryStoreContents = {};
    }
  }

  // Inline server action — closes over wrrId from the page component.
  // On success: redirects with scan result encoded in URL.
  // On failure: redirects with error reason encoded in URL.
  async function handleStartReceiving(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const startResult = await startReceiving(actionResolver, wrrId);
    if (startResult.ok) {
      redirect(`/receiving/${wrrId}/receive?result=started`);
    }
    redirect(
      `/receiving/${wrrId}/receive?result=start_error&reason=${encodeURIComponent(startResult.errors.join("|"))}`,
    );
  }

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
        `/receiving/${wrrId}/receive?stage=assign&result=scanned&remaining=${scanResult.remainingQty}#active-line-location-assignment`
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

  // Inline server action — per-line carton placement commit. Closes over
  // wrrId. Each carton destination (Storage, Inspection, or Missing) is
  // submitted in unitLocationIds and is authoritative at commit time.
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
    const expiryAcknowledgement = {
      acknowledged: formData.get("expiryAcknowledged") === "yes",
      reason: String(formData.get("expiryReason") ?? ""),
      reviewKey: String(formData.get("expiryReviewKey") ?? ""),
    };
    if (!wrrItemId || (!locationId && !allocations?.length && !(unitLocationIds && unitLocationIds.length > 0))) {
      redirect(
        `/receiving/${wrrId}/receive?result=commit_error&line=${encodeURIComponent(wrrItemId)}&reason=${encodeURIComponent("missing_location")}`
      );
    }
    let commitResult: Awaited<ReturnType<typeof commitWrrLine>>;
    try {
      const actionResolver = await createPageResolver();
      commitResult = await commitWrrLine(actionResolver, wrrId, wrrItemId, {
        locationId,
        allocations,
        unitLocationIds,
        presenceAttested,
        expiryAcknowledgement,
      });
    } catch (error) {
      console.error("Unable to submit receiving line from floor form", {
        wrrId,
        wrrItemId,
        error,
      });
      redirect(
        `/receiving/${wrrId}/receive?result=commit_error&line=${encodeURIComponent(wrrItemId)}&reason=${encodeURIComponent("commit_failed")}`
      );
    }
    if (commitResult.ok) {
      redirect(
        `/receiving/${wrrId}/receive?stage=scan&result=committed&line=${encodeURIComponent(wrrItemId)}`
      );
    } else {
      redirect(
        `/receiving/${wrrId}/receive?result=commit_error&line=${encodeURIComponent(wrrItemId)}&reason=${encodeURIComponent(commitResult.errors.join("|"))}`
      );
    }
  }

  // Determine feedback state from search params.
  const scanSuccess = result === "scanned" && stageParam === "assign" && readyLines.length > 0;
  const scanError = result === "error";
  const startError = result === "start_error";
  const commitSuccess = result === "committed" && (wrr.items ?? []).some((item) => item.id === lineParam && item.committedAt !== null);
  const commitError = result === "commit_error";
  const remainingQty = remainingParam ? parseInt(remainingParam, 10) : null;
  const errorReason = reasonParam ?? "";
  const feedbackLineId = lineParam ?? null;
  const progressPercent = totalLines > 0 ? Math.round((fullyScannedLines / totalLines) * 100) : 0;
  const scanLines = (wrr.items ?? []).map((item: WrrItemRow) => ({
    id: item.id,
    wrrId: item.wrrId,
    itemId: item.itemId,
    itemBarcode: item.itemBarcode ?? item.itemCode,
    itemCode: item.itemCode,
    itemSupplierCode: item.supplierItemCode,
    itemCustomerCode: item.customerItemCode,
    itemDsgcNumber: null,
    lotNumber: item.lotNumber,
    expectedQty: item.expectedQty,
    scannedQty: item.scannedQty,
    cartonCount: item.cartonCount,
    spq: item.spq,
    disposition: item.disposition === "inspect" ? "inspect" as const : "store" as const,
  }));
  const activeStage: "scan" | "assign" | "store" =
    stageParam ?? (primaryReadyLine ? "assign" : "scan");

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
               Every line on {wrr.wrrNumber} has a confirmed destination. Storage
               and Inspection postings, plus any Missing shortage records, are
               complete. This WRR is now confirmed.
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
          <PageBreadcrumb
            backHref={`/receiving/${wrrId}`}
            backLabel="WRR"
            currentLabel="Receive Items"
            className="mb-0"
          />
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
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-label text-label font-bold uppercase tracking-[0.12em] text-primary">Receiving workflow</p>
              <h1 className="mt-1 font-heading font-extrabold text-headline-md text-on-surface">Scan items</h1>
            </div>
            <div className="w-full rounded-xl bg-[#EEF3FF] px-4 py-3 text-center sm:w-auto sm:text-right">
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
          <nav aria-label="Receiving stages" className="mt-5 grid grid-cols-3 gap-2">
            {([
              ["scan", "1", "Scan & Verify"],
              ["assign", "2", "Assign Locations"],
               ["store", "3", "Confirm Placement"],
            ] as const).map(([key, number, label]) => {
              const isActive = activeStage === key;
              const isDone = (key === "scan" && (activeStage === "assign" || activeStage === "store")) || (key === "assign" && activeStage === "store");
              return (
                <div key={key} className={`rounded-xl border px-2 py-3 text-center ${isActive ? "border-primary bg-primary/10 text-primary" : isDone ? "border-status-available/30 bg-status-available/5 text-status-available" : "border-outline-variant/40 text-text-grey"}`}>
                  <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border font-label text-label font-bold" aria-hidden="true">{isDone ? <Check size={16} strokeWidth={3} /> : number}</span>
                  <span className="mt-1 block font-label text-label-xs font-bold leading-tight sm:text-label">{label}</span>
                </div>
              );
            })}
          </nav>
          {!isReceivable && (
            <div
              role={startError ? "alert" : "status"}
              className="mt-3 rounded bg-status-pending px-3 py-2"
            >
              {wrr.status === "staged_pending_arrival" && canStartReceiving.kind === "authorized" ? (
                <form action={handleStartReceiving} className="flex flex-col items-start gap-3">
                  {startError && (
                    <p role="alert" className="font-body text-body-md text-on-surface">
                      Receiving could not be started. Refresh the WRR and try again, or ask a supervisor for access.
                    </p>
                  )}
                  <p className="font-body text-body-md text-on-surface">
                    This WRR is staged. Start receiving when the shipment is ready to be scanned.
                  </p>
                  <button
                    type="submit"
                    className="flex min-h-16 w-full items-center justify-center rounded bg-primary px-5 py-3 font-heading text-body-lg font-bold text-surface-white focus:outline-none focus:ring-4 focus:ring-brand-navy motion-safe:active:scale-[0.98] motion-safe:transition-transform motion-safe:duration-100"
                  >
                    Start receiving
                  </button>
                </form>
              ) : (
                <p className="font-body text-body-md text-on-surface">
                  {startError
                    ? "Receiving could not be started. Ask a supervisor to confirm access and WRR status."
                    : "This WRR is not in receiving status. Ask an authorized user to start receiving before scanning."}
                </p>
              )}
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
              <CheckCircle2 className="text-status-available" size={22} /> Scan recorded
            </p>
            {remainingQty !== null && (
              <p className="mt-1 font-body text-body-md text-on-surface">
                {remainingQty === 0
                  ? "Line complete."
                  : `${remainingQty} remaining on this line.`}
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

        {/* Item progress list — card-based, NOT a dense table. */}
        <div className="mt-4 space-y-3">
          {wrr.items.map((item: WrrItemRow) => {
            const itemSpq = Number(item.spq) || 1;
            const itemUom = (!item.uom || item.uom.toLowerCase() === "pallet" || item.uom.toLowerCase() === "plt") ? "PCS" : item.uom.toUpperCase();
            const fullyScanned = item.scannedQty >= item.cartonCount;
            const isCommitted = item.committedAt !== null;
            const readyToCommit = item.scannedQty >= 1 && !isCommitted;
            const isPrimaryReady = primaryReadyLine !== null && item.id === primaryReadyLine.id;

            return (
              <div
                key={item.id}
              >
                <div
                  className={`rounded-2xl border bg-surface-white p-4 shadow-elevation-1 sm:p-5 ${isPrimaryReady ? "border-primary/50 ring-2 ring-primary/10" : "border-outline-variant/40"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Lot number & SPQ Badge */}
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-mono-lg font-bold text-on-surface">
                        {item.lotNumber}
                      </p>
                      <span className="rounded-md bg-surface-light-grey px-2 py-0.5 font-label text-label-xs font-bold text-text-grey">
                        SPQ: {itemSpq} {itemUom}/Box
                      </span>
                    </div>

                    {/* Item Code and Name */}
                    <p className="mt-1 font-body text-body-sm text-text-grey">
                      <span className="font-mono font-semibold text-brand-navy">{item.itemCode ?? "—"}</span>
                      {item.itemName ? ` · ${item.itemName}` : ""}
                    </p>

                    {/* One scan identifies the line; carton destinations are assigned below. */}
                    <p className="mt-1.5 font-body text-body-md text-on-surface">
                      {!isCommitted && item.scannedQty >= 1 ? (
                        <>
                          <strong>Line confirmed · {item.cartonCount} Cartons declared</strong>
                          <span className="block text-text-grey">Assign each carton to Storage, Inspection, or Missing</span>
                        </>
                      ) : (
                        <>
                          <strong>{item.scannedQty} / {item.cartonCount} Cartons</strong>
                          {itemSpq > 1 && (
                            <> {" "}<span className="text-text-grey font-mono">({(item.scannedQty * itemSpq).toLocaleString()} / {Number(item.expectedQty).toLocaleString()} {itemUom})</span></>
                          )}
                        </>
                      )}
                    </p>

                  </div>
                  {/* Completion / committed indicator */}
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
                        aria-label="Ready to commit"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-pending text-surface-white font-heading font-bold"
                      >
                        <Check size={20} strokeWidth={3} />
                      </span>
                    )
                  )}
                </div>

                {readyToCommit && isPrimaryReady && (
                  <div className="mt-3 flex items-center gap-2 border-t border-outline-variant/30 pt-3">
                    <ArrowDown size={18} aria-hidden="true" className="text-brand-navy" />
                    <p className="font-label text-body-md text-brand-navy font-bold">
                      Item verified — assign each carton to Storage, Inspection, or Missing below
                    </p>
                  </div>
                )}

                {readyToCommit && !isPrimaryReady && (
                  <div className="mt-3 flex items-center gap-2 border-t border-outline-variant/30 pt-3">
                    <CircleDot size={16} aria-hidden="true" className="text-status-pending" />
                    <p className="font-label text-body-md text-on-surface">
                      Item verified — complete the current line first
                    </p>
                  </div>
                )}
              {readyToCommit && isPrimaryReady && (
                <div className="mt-3">
                  <LocationAssignmentCard
                    line={item}
                    storeCandidates={primaryStoreCandidates}
                    storeContents={primaryStoreContents}
                    inspectionLocations={inspectionLocations}
                    onCommit={handleCommitLine}
                  />
                </div>
              )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary action — bottom third of screen, full-width */}
      {isReceivable && hasShortage && !hasUncommittedReceivedLines && (
        <div className="mx-auto mt-4 flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-outline-variant/30 px-4 pt-4">
          <p className="font-body text-body-sm text-text-grey">
            Missing boxes will be recorded in the WRR&apos;s OS&amp;D summary.
          </p>
          <form action={handleCloseShortage}>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-status-held/40 bg-surface-white px-4 font-label text-label font-bold text-status-held hover:bg-status-held/10 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Finalize WRR with Shortage
            </button>
          </form>
        </div>
      )}
      {/* Compatibility contract: isReceivable && !primaryReadyLine && !allLinesScanned
          remains the original scan-stage rule; activeStage now makes the loop explicit. */}
      {isReceivable && activeStage === "scan" && !allLinesScanned && (
        <div className="sticky bottom-0 border-t border-outline-variant/30 bg-surface-white px-4 pb-6 pt-4 shadow-elevation-2">
          <OfflineReceivingScanForm
            action={handleScan}
            wrrId={wrrId}
            flowType={wrr.flowType as "vmi" | "trading" | "supplies"}
            lines={scanLines}
          />
        </div>
      )}

    </div>
  );
}
