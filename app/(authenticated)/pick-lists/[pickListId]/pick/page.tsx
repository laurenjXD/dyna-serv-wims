// Pick Execution — floor-priority pick confirmation screen.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R7.1  — The floor workflow presents item, lot, location, quantity, and
//             safe exception feedback for operator confirmation.
//     §5 acceptance criterion — Dispatch follows pick confirmation directly,
//             with no pre-dispatch inspection route or state.
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §7 (Stage 2 physical execution)
//   specs/00-steering/brand-design-system.md §3 (floor surface rules: mobile-first
//     375px base, 64px primary CTAs, active: not hover:, no glassmorphism,
//     solid surfaces, one primary action per screen), §6 (no glassmorphism
//     on floor — solid surfaces only), §5 (AAA contrast floor rule), §2 (no text
//     below 16px on floor), §8 (no backdrop-blur, no GPU-heavy animations)
//   design-system/dyna-serv-wims/MASTER.md — floor primary CTA and status-card patterns
//
// Surface: FLOOR. Designed at 375px viewport first. No glassmorphism.
// Permission gate: pick_list.execute
//
// Data source: lib/db/queries/withdrawals.ts getPickList + getPickListItems —
// the real Stage 1 committed pick_list_items rows, no mock data.
//
// Barcode verification belongs to the Dispatch stage. This page presents the
// allocated lines and records the operator's pick confirmation; the next page
// is responsible for scanning each line before stock is dispatched.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, MapPin, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getPickList, getPickListItems } from "@/lib/db/queries/withdrawals";
import type { PickListItemRow } from "@/lib/db/queries/withdrawals";
import { markPickListPicked } from "@/lib/actions/withdrawals";

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ pickListId: string }>;
  searchParams: Promise<{ result?: string; reason?: string }>;
}

export default async function PickExecutionPage({
  params,
  searchParams,
}: PageProps) {
  const { pickListId } = await params;
  const { result, reason: reasonParam } = await searchParams;

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
  const alreadyAdvanced = pickList.status !== "allocated";

  const items = lines.map((line) => ({
    ...line,
    qtyPicked: alreadyAdvanced ? line.qty : 0,
  }));

  function getItemStatus(item: PickListItemRow & { qtyPicked: number }): "complete" | "pending" {
    return item.qtyPicked >= item.qty ? "complete" : "pending";
  }

  const totalLines = items.length;

  // Inline server action — marks pick complete (allocated → picked) and
  // advances to dispatch. Calls the real markPickListPicked Server Action.
  async function handleCompletePick(_formData: FormData): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const pickResult = await markPickListPicked(
      actionResolver,
      pickListId,
      lines.map((line) => line.id),
    );
    if (!pickResult.ok) {
      redirect(
        `/pick-lists/${pickListId}/pick?result=error&reason=${encodeURIComponent(pickResult.errors[0] ?? "complete_pick_failed")}`,
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
          {totalLines} {totalLines === 1 ? "line" : "lines"} to pick
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
                      Quantity to pick: {item.qty}
                    </span>
                    {/* Progress bar */}
                    <div
                      className="h-2 flex-1 rounded-full bg-surface-light-grey"
                      role="progressbar"
                      aria-valuenow={item.qtyPicked}
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
                          width: `${Math.min(100, (item.qtyPicked / item.qty) * 100)}%`,
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

      {/* ── Sticky bottom — pick confirmation ───────────────────────────── */}
      {isPickable && (
        <div className="sticky bottom-0 border-t border-outline-variant/30 bg-surface-white px-4 pb-6 pt-4 shadow-elevation-2">
          {result === "error" && (
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
                Could not confirm this pick list: {reasonParam ?? "try again."}
              </p>
            </div>
          )}

          {totalLines > 0 ? (
            <form action={handleCompletePick}>
              {/* White on brand-red: 7.31:1 (AAA) — resolved 2026-08-12 by darkening brand-red to #9A3412; see brand-design-system.md §1.1. */}
              <button
                type="submit"
                className="flex h-16 w-full items-center justify-center rounded-xl bg-primary font-label text-body-md uppercase tracking-wide text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy focus:ring-offset-2 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
              >
                Confirm Pick
              </button>
            </form>
          ) : (
            /* No items are available to confirm. */
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex h-16 w-full cursor-not-allowed items-center justify-center rounded-xl bg-surface-light-grey font-label text-body-md uppercase tracking-wide text-status-neutral"
            >
              No Items to Confirm
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
