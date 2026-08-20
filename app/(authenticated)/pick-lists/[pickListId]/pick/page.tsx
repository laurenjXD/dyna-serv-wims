// Pick Execution — floor-priority scanner pick execution screen.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R7.1  — The floor workflow SHALL present one current pick/scan task at a
//             time, with item, lot, location, quantity, and safe exception feedback.
//     R7.2  — A scan SHALL verify the expected pick list, item/barcode, lot,
//             location, and quantity before acceptance.
//     §5 acceptance criterion — "After all pick scans are accepted, dispatch is
//             direct and has no pre-dispatch inspection route or state."
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §7 (Stage 2 physical execution)
//   specs/00-steering/brand-design-system.md §3 (floor surface rules: mobile-first
//     375px base, 64px primary CTAs, active: not hover:, no glassmorphism,
//     solid bg-brand-navy, one primary action per screen), §6 (no glassmorphism
//     on floor — solid surfaces only), §5 (AAA contrast floor rule), §2 (no text
//     below 16px on floor), §8 (no backdrop-blur, no GPU-heavy animations)
//   design-system/dyna-serv-wims/MASTER.md — floor scan input pattern,
//     floor primary CTA pattern, floor status card pattern
//
// Surface: FLOOR. Designed at 375px viewport first. No glassmorphism.
// Permission gate: pick_list.execute
//
// Data source: lib/db/queries/withdrawals.ts getPickList + getPickListItems —
// the real Stage 1 committed pick_list_items rows, no mock data.
//
// Scan-progress note: pick_list_items has no persisted per-scan-progress
// column (confirmed with db-migration-verifier's schema — 01's pick_list_items
// table stores only the committed qty snapshot, not a scanned-qty counter).
// Real scan matching therefore runs against the real committed line data
// (itemCode / lotNumber / locationLabel), and "which lines have been
// confirmed this session" is tracked via the `confirmed` searchParam —
// the same redirect-with-searchParams feedback mechanism already used by
// app/(authenticated)/receiving/[wrrId]/receive/page.tsx — rather than a
// DB column that does not exist. This is a UI/session-scoped confirmation
// aid, not an authoritative persisted state; the authoritative state
// dispatchPickList relies on is the committed pick_list_items themselves.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, MapPin, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getPickList, getPickListItems } from "@/lib/db/queries/withdrawals";
import type { PickListItemRow } from "@/lib/db/queries/withdrawals";
import { markPickListPicked } from "@/lib/actions/withdrawals";
import { CameraScanBridge } from "@/components/floor/CameraScanBridge";

// ─── Error messaging ──────────────────────────────────────────────────────────

function getPickScanErrorMessage(reason: string): string {
  switch (reason) {
    case "empty_barcode":
      return "Barcode cannot be empty — aim scanner at the item, lot, or location label.";
    case "no_match":
      return "Scan does not match any remaining line on this pick list — check item, lot, and location.";
    default:
      return `Scan rejected: ${reason}. Contact a supervisor if this persists.`;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ pickListId: string }>;
  searchParams: Promise<{ result?: string; reason?: string; confirmed?: string }>;
}

export default async function PickExecutionPage({
  params,
  searchParams,
}: PageProps) {
  const { pickListId } = await params;
  const { result, reason: reasonParam, confirmed: confirmedParam } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: pick_list.execute — floor staff / warehouse operator capability.
  // Floor-style forbidden: dark navy surface, no redirect loop.
  const permResult = await requirePermission(resolver, "pick_list.execute");
  if (permResult.kind !== "authorized") {
    // Surface: floor forbidden — dark navy, clear message, no sidebar.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface-white px-4">
        <p className="font-heading text-headline-md text-on-surface">Access denied</p>
        <p className="mt-2 font-body text-body-md text-text-grey">
          You do not have permission to execute pick lists.
        </p>
        <Link
          href="/outgoing"
          className="mt-6 inline-flex h-14 items-center gap-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
        >
          <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
          Return to Outgoing
        </Link>
      </div>
    );
  }

  const pickList = await getPickList(db, pickListId);
  if (!pickList) {
    notFound();
  }

  const lines = await getPickListItems(db, pickListId);

  // Only allow picking when status is allocated.
  const isPickable = pickList.status === "allocated";
  // Once the pick list has advanced past 'allocated' (picked/dispatched), the
  // committed lines are, by definition, already picked — display them as
  // complete regardless of this session's confirmed set (e.g. after a
  // Back-navigation from dispatch, or a fresh page load on a later visit).
  const alreadyAdvanced = pickList.status !== "allocated";

  const confirmedIds = new Set(
    confirmedParam ? confirmedParam.split(",").filter(Boolean) : [],
  );

  const items = lines.map((line) => ({
    ...line,
    qtyScanned: alreadyAdvanced || confirmedIds.has(line.id) ? line.qty : 0,
  }));

  function getItemStatus(item: PickListItemRow & { qtyScanned: number }): "complete" | "pending" {
    return item.qtyScanned >= item.qty ? "complete" : "pending";
  }

  const completedLines = items.filter((i) => getItemStatus(i) === "complete").length;
  const totalLines = items.length;
  const allItemsPicked = totalLines > 0 && completedLines === totalLines;

  const scanError = result === "error";
  const errorReason = reasonParam ?? "";
  const confirmedQueryValue = Array.from(confirmedIds).join(",");

  // Inline server action — verifies a scan against the real committed
  // pick_list_items for this pick list (itemCode, lotNumber, or
  // locationLabel — R7.2). On match, adds the line to this session's
  // confirmed set via the `confirmed` searchParam and redirects back.
  async function handleScan(formData: FormData): Promise<void> {
    "use server";
    const barcode = ((formData.get("barcode") as string | null) ?? "").trim();
    const confirmedRaw = ((formData.get("confirmed") as string | null) ?? "").trim();

    if (!barcode) {
      redirect(
        `/pick-lists/${pickListId}/pick?result=error&reason=${encodeURIComponent("empty_barcode")}&confirmed=${encodeURIComponent(confirmedRaw)}`,
      );
    }

    const currentlyConfirmed = new Set(
      confirmedRaw ? confirmedRaw.split(",").filter(Boolean) : [],
    );

    const currentLines = await getPickListItems(db, pickListId);
    const match = currentLines.find(
      (line) =>
        !currentlyConfirmed.has(line.id) &&
        (line.itemBarcode === barcode ||
          line.itemCode === barcode ||
          line.lotNumber === barcode ||
          line.locationLabel === barcode),
    );

    if (!match) {
      redirect(
        `/pick-lists/${pickListId}/pick?result=error&reason=${encodeURIComponent("no_match")}&confirmed=${encodeURIComponent(confirmedRaw)}`,
      );
    } else {
      currentlyConfirmed.add(match.id);
      redirect(
        `/pick-lists/${pickListId}/pick?result=scanned&confirmed=${encodeURIComponent(Array.from(currentlyConfirmed).join(","))}`,
      );
    }
  }

  // Inline server action — marks pick complete (allocated → picked) and
  // advances to dispatch. Calls the real markPickListPicked Server Action.
  async function handleCompletePick(_formData: FormData): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const pickResult = await markPickListPicked(
      actionResolver,
      pickListId,
      Array.from(confirmedIds),
    );
    if (!pickResult.ok) {
      redirect(
        `/pick-lists/${pickListId}/pick?result=error&reason=${encodeURIComponent(pickResult.errors[0] ?? "complete_pick_failed")}&confirmed=${encodeURIComponent(confirmedQueryValue)}`,
      );
    }
    redirect(`/pick-lists/${pickListId}/dispatch`);
  }

  return (
    // Floor screen: solid bg-brand-navy, no glassmorphism, 16px padding.
    // brand-design-system.md §4: floor screens use 16px page padding.
    // brand-design-system.md §6: floor — no backdrop-blur, solid surfaces.
    <div className="flex min-h-screen flex-col bg-surface-white">

      {/* ── Top bar (sticky) ──────────────────────────────────────────────── */}
      {/* brand-design-system.md §3: top bar stays visible during scroll.     */}
      <div className="sticky top-0 z-10 border-b border-outline-variant/30 bg-surface-white px-4 pb-2 pt-4">
        <div className="flex items-center justify-between">
          {/* Back link — h-14 (56px) floor touch target per §3 */}
          <Link
            href="/outgoing"
            className="inline-flex h-14 items-center gap-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
            aria-label="Back to Outgoing"
          >
            <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
            <span>Back</span>
          </Link>
          {/* Pick list reference — Roboto Mono per §2 */}
          <span className="font-mono text-mono-lg text-on-surface">
            {pickList.pickListNumber}
          </span>
        </div>
        {/* Item progress — secondary label, text-white/70 ≥5.1:1 against navy */}
        <p className="mt-1 pb-2 font-body text-body-md text-text-grey">
          {completedLines} / {totalLines} items scanned
        </p>
        {/* Status warning if pick list is not in pickable state */}
        {!isPickable && (
          <div
            role="alert"
            className="mb-2 flex items-center gap-2 rounded-xl border border-status-pending/30 bg-status-pending/10 px-4 py-3"
          >
            <AlertTriangle
              size={24}
              strokeWidth={2}
              aria-hidden="true"
              className="shrink-0 text-status-pending"
            />
            {/* Icon + color per §1.3 floor color-blind rule */}
            <p className="font-body text-body-md text-on-surface">
              Pick list is not in allocated state — current status:{" "}
              <span className="font-mono text-mono-lg">{pickList.status}</span>
            </p>
          </div>
        )}
      </div>

      {/* ── Items to pick (scrollable middle) ────────────────────────────── */}
      {/* brand-design-system.md §9: floor tables are a fail case — card list */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {totalLines === 0 && (
          <div className="mb-3 rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-2">
            <p className="font-body text-body-md text-text-grey">
              No committed lines were found for this pick list.
            </p>
          </div>
        )}
        {items.map((item) => {
          const status = getItemStatus(item);
          return (
            <div
              key={item.id}
              // Floor card: solid bg-white/10 over navy, no glassmorphism.
              // Level 2 treatment per §6 floor card rule.
              className="mb-3 rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Item code — Roboto Mono, bold, floor minimum 16px (mono-lg is 18px) */}
                  <p className="font-mono text-mono-lg font-bold text-on-surface">
                    {item.itemCode}
                  </p>
                  {/* Item name — Outfit Regular, floor minimum text-body-md (16px) */}
                  <p className="mt-0.5 font-body text-body-md text-on-surface">
                    {item.itemDescription ?? item.itemCode}
                  </p>
                  {/* Lot number — Roboto Mono, secondary text-white/70 */}
                  <p className="mt-1 font-mono text-mono-lg text-text-grey">
                    {item.lotNumber}
                  </p>
                  {/* Location — Outfit + MapPin icon per §1.3 floor icon rule */}
                  <div className="mt-1 flex items-center gap-1.5">
                    <MapPin
                      size={24}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="shrink-0 text-text-grey"
                    />
                    <span className="font-body text-body-md text-text-grey">
                      {item.locationLabel}
                    </span>
                  </div>
                  {/* Qty progress */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-mono text-mono-lg text-on-surface">
                      {item.qtyScanned} / {item.qty}
                    </span>
                    {/* Progress bar */}
                    <div
                      className="h-2 flex-1 rounded-full bg-surface-light-grey"
                      role="progressbar"
                      aria-valuenow={item.qtyScanned}
                      aria-valuemin={0}
                      aria-valuemax={item.qty}
                      aria-label={`${item.itemCode} progress`}
                    >
                      <div
                        className={`h-full rounded-full ${
                          status === "complete"
                            ? "bg-status-available"
                            : "bg-status-neutral/30"
                        }`}
                        style={{
                          width: `${Math.min(100, (item.qtyScanned / item.qty) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                {/* Status icon — color + icon per §1.3 floor color-blind rule */}
                <div className="shrink-0 pt-1" aria-hidden="true">
                  {status === "complete" ? (
                    <CheckCircle2
                      size={24}
                      strokeWidth={2}
                      className="text-status-available"
                    />
                  ) : (
                    <Circle
                      size={24}
                      strokeWidth={2}
                      className="text-status-neutral"
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Sticky bottom — scan input + CTA ─────────────────────────────── */}
      {/* brand-design-system.md §3: primary action in bottom third, full-width,
          always visible without scrolling. One primary action per floor screen.
          Input priority: scan > tap > type (§3). */}
      {isPickable && (
        <div className="sticky bottom-0 border-t border-outline-variant/30 bg-surface-white px-4 pb-6 pt-4 shadow-elevation-2">
          {/* Scan input — auto-focused, inputMode="none" suppresses virtual
              keyboard on scanner devices; scanner fires hardware keystrokes.
              h-14 (56px) floor secondary input touch target per §3. */}
          <form action={handleScan} className="mb-3 flex gap-3">
            <input type="hidden" name="confirmed" value={confirmedQueryValue} />
            <input
              autoFocus
              type="text"
              name="barcode"
              inputMode="none"
              autoComplete="off"
              aria-label="Scan item barcode"
              className="h-14 min-w-0 flex-1 rounded-xl border border-outline-variant/30 bg-surface-white px-4 font-mono text-mono-lg text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              placeholder="Scan barcode..."
            />
            <button
              type="submit"
              className="inline-flex h-14 shrink-0 items-center justify-center rounded-xl bg-primary px-5 font-label text-body-md uppercase tracking-wide text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Scan
            </button>
          </form>

          <CameraScanBridge
            action={handleScan}
            extraFields={{ confirmed: confirmedQueryValue }}
          />

          {/* Scan error feedback — above CTA */}
          {scanError && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-3 flex items-center gap-2 rounded-xl bg-status-held/20 border border-status-held/40 px-4 py-3"
            >
              <AlertTriangle
                size={24}
                strokeWidth={2}
                aria-hidden="true"
                className="shrink-0 text-status-held"
              />
              <p className="font-body text-body-md text-on-surface">
                {getPickScanErrorMessage(errorReason)}
              </p>
            </div>
          )}

          {/* Complete Pick CTA — disabled until all items scanned.
              brand-design-system.md §3: 64px (h-16) primary action, full-width.
              No hover: on floor — active: press feedback only. */}
          {allItemsPicked ? (
            <form action={handleCompletePick}>
              {/* White on brand-red: 7.31:1 (AAA) — resolved 2026-08-12 by darkening brand-red to #9A3412; see brand-design-system.md §1.1. */}
              <button
                type="submit"
                className="flex h-16 w-full items-center justify-center rounded-xl bg-primary font-label text-body-md uppercase tracking-wide text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy focus:ring-offset-2 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
              >
                Complete Pick
              </button>
            </form>
          ) : (
            /* Disabled state — not all items scanned yet */
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex h-16 w-full cursor-not-allowed items-center justify-center rounded-xl bg-surface-light-grey font-label text-body-md uppercase tracking-wide text-status-neutral"
            >
              Complete Pick
            </button>
          )}
        </div>
      )}

      {/* Pick already completed for this list — wayfinding to Stage 2. */}
      {pickList.status === "picked" && (
        <div className="sticky bottom-0 border-t border-outline-variant/30 bg-surface-white px-4 pb-6 pt-4 shadow-elevation-2">
          <Link
            href={`/pick-lists/${pickListId}/dispatch`}
            className="flex h-16 w-full items-center justify-center rounded-xl bg-primary font-label text-body-md uppercase tracking-wide text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy focus:ring-offset-2 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
          >
            Continue to Dispatch
          </Link>
        </div>
      )}
    </div>
  );
}
