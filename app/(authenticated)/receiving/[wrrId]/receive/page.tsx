// Scan interface — floor-priority receiving reconciliation screen.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §3 (route), §6 (floor scan design)
//   specs/07-incoming-receiving/requirements.md R3 (barcode reconciliation),
//     R2.5 (floor flow shows WRR, expected lines, quantities, exceptions)
//   specs/00-steering/brand-design-system.md §3 (floor surface rules — mobile-first
//     base styles, NO glassmorphism, active: press not hover:, one primary action,
//     primary action in bottom third full-width, 64px minimum touch targets),
//     §6 (solid bg-surface-white — no backdrop-blur on floor), §5 (AAA contrast),
//     §2 (no text below 16px on floor), §8 (no backdrop-blur, animation constraints)
//
// Surface: FLOOR. Designed at 375px viewport first. No glassmorphism.
// Permission gate: receiving.scan
//
// Feedback mechanism: after a scan the server action redirects back to this
// page with `result=scanned&remaining=N&disposition=D` on success or
// `result=error&reason=...` on failure. The page reads search params to display
// the result, then clears them on the next scan.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import { recordScan, startReceiving, commitWrr } from "@/lib/actions/receiving";
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
    default:
      return `Scan rejected: ${reason}. Contact a supervisor if this persists.`;
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
    await startReceiving(resolver, db, wrrId);
    // Re-fetch to get the updated status after the transition.
    const refreshed = await getWrrDocument(db, wrrId);
    if (refreshed) {
      wrr = refreshed;
    }
  }

  // Only allow scan when WRR is in receiving_in_progress.
  const isReceivable = wrr.status === "receiving_in_progress";

  // Compute progress counts from items.
  const totalLines = wrr.items.length;
  const fullyScannedLines = wrr.items.filter(
    (item: WrrItemRow) => item.scannedQty >= item.expectedQty
  ).length;
  const allLinesScanned = totalLines > 0 && fullyScannedLines === totalLines;

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
    const scanResult = await recordScan(actionResolver, db, wrrId, barcode);
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

  // Inline server action — commit all scanned lines and confirm the WRR.
  // R7.1: confirmation is an explicit, authorized server command.
  async function handleCommit(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const commitResult = await commitWrr(actionResolver, db, wrrId);
    if (commitResult.ok) {
      redirect(`/receiving/${wrrId}`);
    }
    // On failure, return to the scan page with an error state.
    redirect(
      `/receiving/${wrrId}/receive?result=error&reason=${encodeURIComponent("commit_failed")}`
    );
  }

  // Determine feedback state from search params.
  const scanSuccess = result === "scanned";
  const scanError = result === "error";
  const remainingQty = remainingParam ? parseInt(remainingParam, 10) : null;
  const dispositionResult = dispositionParam;
  const errorReason = reasonParam ?? "";

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
            className="inline-flex h-14 items-center gap-2 text-body-md font-body text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
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
      <div className="flex flex-1 flex-col px-4 py-4">
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
                <span className="text-body-md font-body uppercase">
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

        {/* Item progress list — card-based, NOT a dense table.
            brand-design-system.md §9: floor tables are a fail case;
            use card-based list, one item per row. */}
        <div className="mt-4 space-y-2">
          {wrr.items.map((item: WrrItemRow) => {
            const fullyScanned = item.scannedQty >= item.expectedQty;
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
                      <span className="text-body-md font-body text-on-surface">
                        Disposition:
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-body-md font-body uppercase ${
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
                  {/* Completion checkmark — visible, accessible indicator */}
                  {fullyScanned && (
                    <span
                      aria-label="Fully scanned"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-available text-surface-white font-heading font-bold text-data-display"
                    >
                      &#10003;
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary action — bottom third of screen, full-width.
          brand-design-system.md §3: primary action in the bottom third of the
          viewport, full-width, always visible. 64px minimum height for floor
          primary actions. Autofocus on load so scanner is immediately ready.
          Input priority: scan > tap > type (§3).
          When all lines are fully scanned, the primary action switches to
          "Confirm Receipt" (R7.1: one primary floor action). */}
      {isReceivable && (
        <div className="sticky bottom-0 bg-brand-navy px-4 pb-6 pt-4 shadow-elevation-2">
          {allLinesScanned ? (
            /* Confirm Receipt CTA — R7.1: one primary floor action, full-width,
               h-16 (64px) minimum, bg-brand-red per design-system §3 floor CTAs.
               Solid surface, no glassmorphism, AAA contrast (white on red). */
            <form action={handleCommit}>
              <button
                type="submit"
                className="flex h-16 w-full items-center justify-center rounded bg-brand-red font-heading font-bold text-data-display text-surface-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-4 focus:ring-surface-white"
              >
                Confirm Receipt
              </button>
            </form>
          ) : (
            <form action={handleScan} className="flex flex-col gap-3">
              <label
                htmlFor="barcode-input"
                className="text-body-md font-body text-surface-white"
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
          )}
        </div>
      )}
    </div>
  );
}
