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
import { suggestPutawayLocations } from "@/lib/db/queries/locations";
import type { PutawayCandidate } from "@/lib/db/queries/locations";
import { recordScan, startReceiving, commitWrrLine } from "@/lib/actions/receiving";
import type { WrrItemRow } from "@/lib/db/queries/receiving";

// ─── Error reason → plain language ──────────────────────────────────────────

function getScanErrorMessage(reason: string): string {
  switch (reason) {
    case "forbidden":
      return "You do not have permission to scan items.";
    case "not_found":
      return "WRR document not found.";
    case "invalid_status":
      return "This WRR is not in receiving status. Return to the WRR and start receiving first.";
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
    default:
      return `Scan rejected: ${reason}. Contact a supervisor if this persists.`;
  }
}

function getCommitErrorMessage(reason: string): string {
  switch (reason) {
    case "forbidden":
      return "You do not have permission to confirm receipt for this line.";
    case "not_found":
      return "This line could not be found.";
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
    await startReceiving(resolver, wrrId);
    // Re-fetch to get the updated status after the transition.
    const refreshed = await getWrrDocument(db, wrrId);
    if (refreshed) {
      wrr = refreshed;
    }
  }

  // Only allow scan/commit when WRR is in receiving_in_progress.
  const isReceivable = wrr.status === "receiving_in_progress";
  const isComplete = wrr.status === "confirmed";

  // Compute progress counts from items.
  const totalLines = wrr.items.length;
  const fullyScannedLines = wrr.items.filter(
    (item: WrrItemRow) => item.scannedQty >= item.expectedQty
  ).length;
  const allLinesScanned = totalLines > 0 && fullyScannedLines === totalLines;

  // Lines that are fully scanned but not yet committed need their commit UI.
  // brand-design-system.md §3 "One primary action per floor screen": only the
  // FIRST ready line (by wrr.items order) is presented as the primary,
  // full-width brand-red commit action for this render. Any other ready
  // lines get a smaller, secondary indicator in their own card instead of a
  // second equal-weight primary CTA — see the card list below. Once the
  // primary line commits, the redirect re-renders this page and the next
  // ready line (by the same order) becomes the new primary action.
  const readyLines = wrr.items.filter(
    (item: WrrItemRow) =>
      item.scannedQty >= item.expectedQty && item.committedAt === null
  );
  const primaryReadyLine: WrrItemRow | null = readyLines.length > 0 ? readyLines[0] : null;

  // Fetch putaway suggestions (store) / active inspection locations (inspect)
  // only for the single primary ready line — no other line's commit UI is
  // rendered on this pass, so there's nothing else to fetch for.
  let primaryStoreCandidates: PutawayCandidate[] = [];
  let inspectionLocations: Array<{ id: string; label: string }> = [];
  if (primaryReadyLine?.disposition === "store") {
    primaryStoreCandidates = await suggestPutawayLocations(db, {
      itemUnitCbm: primaryReadyLine.unitCbm,
      requestedQty: primaryReadyLine.expectedQty,
    });
  } else if (primaryReadyLine?.disposition === "inspect") {
    inspectionLocations = (await db
      .select({ id: locations.id, label: locations.label })
      .from(locations)
      .where(and(eq(locations.locationType, "inspection"), eq(locations.isActive, true)))) as Array<{
      id: string;
      label: string;
    }>;
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
        `/receiving/${wrrId}/receive?result=error&reason=${encodeURIComponent(scanResult.reason)}`
      );
    }
  }

  // Inline server action — per-line commit ("Store" or "Hold"). Closes over
  // wrrId. locationId comes from the line's select input.
  async function handleCommitLine(formData: FormData): Promise<void> {
    "use server";
    const wrrItemId = (formData.get("wrrItemId") as string | null) ?? "";
    const locationId = (formData.get("locationId") as string | null) ?? "";
    if (!wrrItemId || !locationId) {
      redirect(
        `/receiving/${wrrId}/receive?result=commit_error&line=${encodeURIComponent(wrrItemId)}&reason=${encodeURIComponent("missing_location")}`
      );
    }
    const actionResolver = await createPageResolver();
    const commitResult = await commitWrrLine(actionResolver, wrrId, wrrItemId, {
      locationId,
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

  // Determine feedback state from search params.
  const scanSuccess = result === "scanned";
  const scanError = result === "error";
  const commitSuccess = result === "committed";
  const commitError = result === "commit_error";
  const remainingQty = remainingParam ? parseInt(remainingParam, 10) : null;
  const dispositionResult = dispositionParam;
  const errorReason = reasonParam ?? "";
  const feedbackLineId = lineParam ?? null;

  // ─── Receipt complete: all lines committed, WRR already confirmed server-side ───
  if (isComplete) {
    return (
      <div className="flex min-h-screen flex-col bg-brand-navy">
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-4 text-center">
          <div className="w-full max-w-md rounded-md bg-surface-white p-6 shadow-elevation-2">
            <span
              aria-hidden="true"
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-status-available text-surface-white font-heading font-bold text-headline-md"
            >
              &#10003;
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
              className="mt-6 flex h-16 w-full items-center justify-center rounded bg-brand-red font-heading font-bold text-data-display text-surface-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-4 focus:ring-brand-navy"
            >
              Back to WRR
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    // Floor screen: solid bg-brand-navy, no glassmorphism, 16px padding.
    // brand-design-system.md §4: floor screens use 16px page padding.
    <div className="flex min-h-screen flex-col bg-brand-navy">
      {/* Top bar — compact, floor-appropriate */}
      <div className="bg-brand-navy px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Back link — h-14 (56px) minimum floor touch target per §3 */}
          <Link
            href={`/receiving/${wrrId}`}
            className="inline-flex h-14 items-center gap-2 text-body-md font-outfit text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
          >
            {/* Left arrow — no icon dependency, pure text/unicode for floor performance */}
            <span aria-hidden="true">&#8592;</span>
            <span>Back to WRR</span>
          </Link>
          {/* WRR reference — Roboto Mono per §9 */}
          <span className="font-mono text-mono-lg text-white/70">
            {wrr.wrrNumber}
          </span>
        </div>
      </div>

      {/* Main floor content — flex-1, single-column, 16px padding */}
      <div className="flex flex-1 flex-col px-4 py-4 pb-6">
        {/* Progress header — Fira Sans, large enough for floor visibility */}
        <div className="rounded-md bg-surface-white p-4 shadow-elevation-2">
          <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
            Scan Items
          </h1>
          {/* Progress — no text below 16px (body-md) on floor screens per §2 */}
          <p className="mt-2 font-body text-body-md text-on-surface">
            <span className="font-mono text-mono-lg">
              {fullyScannedLines} / {totalLines}
            </span>{" "}
            lines fully scanned
          </p>
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
            className="mt-4 rounded-md bg-white border-l-4 border-status-available px-4 py-4 shadow-elevation-2"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              &#10003; Scanned
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
                <span className="text-body-md font-outfit uppercase">
                  {dispositionResult}
                </span>
              </p>
            )}
          </div>
        )}

        {scanError && (
          <div
            role="alert"
            aria-live="assertive"
            // White background with status-held left border — AAA contrast
            // (near-black on white >15:1). Icon carries the semantic red signal.
            className="mt-4 rounded-md bg-white border-l-4 border-status-held px-4 py-4 shadow-elevation-2"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              &#33; Scan Rejected
            </p>
            <p className="mt-1 font-body text-body-md text-on-surface">
              {getScanErrorMessage(errorReason)}
            </p>
          </div>
        )}

        {commitSuccess && (
          <div
            role="status"
            aria-live="assertive"
            className="mt-4 rounded-md bg-white border-l-4 border-status-available px-4 py-4 shadow-elevation-2"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              &#10003; Line committed
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
            className="mt-4 rounded-md bg-white border-l-4 border-status-held px-4 py-4 shadow-elevation-2"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              &#33; Could not complete line
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
            const readyToCommit = fullyScanned && !isCommitted;
            const isPrimaryReady = primaryReadyLine !== null && item.id === primaryReadyLine.id;

            return (
              <div
                key={item.id}
                // Floor card: solid surface-white, Level 2 shadow, no glassmorphism
                className="rounded-md bg-surface-white p-4 shadow-elevation-2"
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
                      <span className="text-body-md font-outfit text-on-surface">
                        Disposition:
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-body-md font-label uppercase ${
                          item.disposition === "store"
                            ? "bg-status-available/10 text-on-surface"
                            : "bg-status-pending/10 text-on-surface"
                        }`}
                      >
                        {/* Icon paired with color to satisfy §1.3 floor color-blind rule */}
                        <span aria-hidden="true">
                          {item.disposition === "store" ? "&#9660;" : "&#9675;"}
                        </span>
                        {item.disposition === "store" ? "STORE" : "INSPECT"}
                      </span>
                    </div>
                  </div>
                  {/* Completion / committed indicator — visible, accessible */}
                  {isCommitted ? (
                    <span
                      aria-label="Committed"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-available text-surface-white font-heading font-bold text-data-display"
                    >
                      &#10003;
                    </span>
                  ) : (
                    fullyScanned && (
                      <span
                        aria-label="Fully scanned"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-pending text-surface-white font-heading font-bold text-data-display"
                      >
                        &#10003;
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
                    <span aria-hidden="true" className="text-brand-navy">
                      &#8595;
                    </span>
                    <p className="font-label text-body-md text-brand-navy">
                      Ready to {item.disposition === "store" ? "store" : "hold"} — complete below
                    </p>
                  </div>
                )}

                {readyToCommit && !isPrimaryReady && (
                  <div className="mt-3 flex items-center gap-2 border-t border-outline-variant/30 pt-3">
                    <span aria-hidden="true" className="text-status-pending">
                      &#9679;
                    </span>
                    <p className="font-label text-body-md text-on-surface">
                      Ready to {item.disposition === "store" ? "store" : "hold"} — complete the current line first
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
        <div className="sticky bottom-0 bg-brand-navy px-4 pb-6 pt-4 shadow-elevation-2">
          <form action={handleCommitLine} className="flex flex-col gap-3">
            <input type="hidden" name="wrrItemId" value={primaryReadyLine.id} />
            <p className="font-mono text-mono-lg font-bold text-surface-white">
              {primaryReadyLine.lotNumber}
            </p>
            {primaryReadyLine.disposition === "store" ? (
              <>
                <label
                  htmlFor="location-primary"
                  className="text-body-md font-outfit text-surface-white"
                >
                  Putaway location
                </label>
                {primaryStoreCandidates.length > 0 ? (
                  <select
                    id="location-primary"
                    name="locationId"
                    defaultValue={primaryStoreCandidates[0].id}
                    className="h-16 w-full rounded border-2 border-surface-white bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-4 focus:ring-brand-navy"
                  >
                    {primaryStoreCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.label} | {candidate.remainingCbm.toFixed(2)} CBM remaining
                      </option>
                    ))}
                  </select>
                ) : (
                  <div role="alert" className="rounded border-l-4 border-status-held bg-white px-3 py-2">
                    <p className="flex items-center gap-2 font-body text-body-md text-on-surface">
                      <span aria-hidden="true" className="text-status-held">
                        &#33;
                      </span>
                      No storage location has enough remaining capacity. Contact a supervisor.
                    </p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={primaryStoreCandidates.length === 0}
                  className="flex h-16 w-full items-center justify-center rounded bg-brand-red font-heading font-bold text-data-display text-surface-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-4 focus:ring-surface-white disabled:opacity-50"
                >
                  Store
                </button>
              </>
            ) : (
              <>
                <label
                  htmlFor="location-primary"
                  className="text-body-md font-outfit text-surface-white"
                >
                  Inspection location
                </label>
                {inspectionLocations.length > 0 ? (
                  <select
                    id="location-primary"
                    name="locationId"
                    defaultValue={
                      inspectionLocations.length === 1 ? inspectionLocations[0].id : undefined
                    }
                    className="h-16 w-full rounded border-2 border-surface-white bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-4 focus:ring-brand-navy"
                  >
                    {inspectionLocations.length > 1 && (
                      <option value="">Select an inspection location…</option>
                    )}
                    {inspectionLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div role="alert" className="rounded border-l-4 border-status-held bg-white px-3 py-2">
                    <p className="flex items-center gap-2 font-body text-body-md text-on-surface">
                      <span aria-hidden="true" className="text-status-held">
                        &#33;
                      </span>
                      No active inspection location is configured. Contact a supervisor.
                    </p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={inspectionLocations.length === 0}
                  className="flex h-16 w-full items-center justify-center rounded bg-brand-red font-heading font-bold text-data-display text-surface-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-4 focus:ring-surface-white disabled:opacity-50"
                >
                  Hold
                </button>
              </>
            )}
          </form>
        </div>
      )}

      {isReceivable && !primaryReadyLine && !allLinesScanned && (
        <div className="sticky bottom-0 bg-brand-navy px-4 pb-6 pt-4 shadow-elevation-2">
          <form action={handleScan} className="flex flex-col gap-3">
            <label
              htmlFor="barcode-input"
              className="text-body-md font-outfit text-surface-white"
            >
              Scan or enter barcode
            </label>
            <div className="flex gap-2">
              <input
                id="barcode-input"
                name="barcode"
                type="text"
                // autoFocus: scanner input focused immediately for scan-first workflow.
                // brand-design-system.md §3 input priority: scan > tap > type.
                autoFocus
                autoComplete="off"
                inputMode="none"
                placeholder="Waiting for scan…"
                // h-16 = 64px — floor primary input touch target per §3
                className="h-16 flex-1 rounded border-2 border-surface-white bg-surface-white px-4 font-mono text-mono-lg text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-4 focus:ring-brand-navy"
              />
              {/* Submit button — 64px minimum, full secondary width alongside input */}
              <button
                type="submit"
                // active: press feedback, no hover: (floor screen, §3 §10)
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-brand-red font-heading font-bold text-data-display text-surface-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-4 focus:ring-surface-white"
                aria-label="Submit scan"
              >
                &#8594;
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
