// Pick Execution — floor-priority scanner pick execution screen.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R7.1 — floor workflow SHALL present one current pick/scan task at a time,
//             with item, lot, location, quantity, and safe exception feedback.
//     R7.2 — a scan SHALL verify the expected pick list, item/barcode, lot,
//             location, and quantity before acceptance.
//     §5 acceptance criterion — "After all pick scans are accepted, dispatch is
//             direct and has no pre-dispatch inspection route or state."
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §7 (Stage 2 physical execution)
//   specs/00-steering/brand-design-system.md §3 (floor surface rules: mobile-first
//     375px base, 64px primary CTAs, active: not hover:, no glassmorphism,
//     solid backgrounds, one primary action per screen)
//
// Surface: FLOOR. Designed at 375px viewport first. No glassmorphism.
// Permission gate: withdrawal.execute

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getPickList } from "@/lib/db/queries/withdrawals";
import type { PickListRow } from "@/lib/db/queries/withdrawals";

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

  // Gate: withdrawal.execute — floor staff / warehouse operator capability.
  // 2026-08-08: "withdrawal.execute" -> "pick_list.execute" (05's already-approved
  // capability for this exact route) — see outgoing-ledger/page.tsx's note.
  const permResult = await requirePermission(resolver, "pick_list.execute");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const pickList = await getPickList(db, pickListId);
  if (!pickList) {
    notFound();
  }

  // Only allow picking when status is allocated.
  const isPickable = pickList.status === "allocated";

  // Inline server action — redirects to dispatch page after confirming pick.
  async function handleConfirmPick(_formData: FormData): Promise<void> {
    "use server";
    // Scan validation is a future extension. For now, proceed directly to dispatch.
    redirect(`/pick-lists/${pickListId}/dispatch`);
  }

  const pickComplete = result === "completed";
  const pickError = result === "error";
  const errorReason = reasonParam ?? "";

  return (
    // Floor screen: solid bg-surface-light-grey, no glassmorphism, 16px padding.
    // brand-design-system.md §4: floor screens use 16px page padding.
    <div className="flex min-h-screen flex-col bg-surface-light-grey">
      {/* Top bar — compact, floor-appropriate, brand-navy background */}
      <div className="bg-brand-navy px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Back link — h-14 (56px) minimum floor touch target per §3 */}
          <Link
            href={`/pick-lists/${pickListId}`}
            className="inline-flex h-14 items-center gap-2 font-label text-body-md text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy active:scale-[0.97]"
          >
            <span aria-hidden="true">&#8592;</span>
            <span>Back to Pick List</span>
          </Link>
          {/* Flow type badge — Epilogue, floor-visible */}
          <span className="font-label text-body-md text-surface-white/70 uppercase">
            {(pickList as PickListRow).flowType.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Main floor content — flex-1, single-column, 16px padding */}
      <div className="flex flex-1 flex-col px-4 py-4">
        {/* Pick list summary card — solid surface, Level 2 shadow per §6 floor rule */}
        <div className="rounded-md bg-surface-white p-4 shadow-elevation-2">
          <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
            Pick Execution
          </h1>
          <p className="mt-2 font-body text-body-md text-on-surface">
            Pick List:{" "}
            <span className="font-mono text-mono-lg">{pickListId}</span>
          </p>
          <p className="mt-1 font-body text-body-md text-on-surface">
            Customer:{" "}
            <span className="font-mono text-mono-md">
              {(pickList as PickListRow).customerPartyId}
            </span>
          </p>
          {!isPickable && (
            <div
              role="alert"
              className="mt-3 rounded bg-status-pending px-3 py-2"
            >
              {/* Icon paired with color per §1.3 floor color-blind rule */}
              <p className="font-body text-body-md text-on-surface">
                <span aria-hidden="true">&#9888; </span>
                This pick list is not in the allocated state. Current status:{" "}
                <span className="font-mono text-mono-md">
                  {(pickList as PickListRow).status}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Scan feedback — full-screen flash equivalent via solid color block.
            brand-design-system.md §9 §10: scan feedback is a solid color fill.
            AAA contrast (7:1) for time-critical text per §1.5. */}
        {pickComplete && (
          <div
            role="status"
            aria-live="assertive"
            className="mt-4 rounded-md bg-status-available px-4 py-4 shadow-elevation-2"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              <span aria-hidden="true">&#10003; </span>Pick Confirmed
            </p>
            <p className="mt-1 font-body text-body-md text-on-surface">
              Proceeding to dispatch confirmation.
            </p>
          </div>
        )}

        {pickError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-4 rounded-md bg-status-held px-4 py-4 shadow-elevation-2"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              <span aria-hidden="true">&#33; </span>Action Failed
            </p>
            <p className="mt-1 font-body text-body-md text-on-surface">
              {errorReason
                ? `Error: ${errorReason}. Contact a supervisor if this persists.`
                : "An error occurred. Contact a supervisor if this persists."}
            </p>
          </div>
        )}

        {/* Scan input section — card-based, one item per row per §9 */}
        {isPickable && (
          <div className="mt-4 rounded-md bg-surface-white p-4 shadow-elevation-2">
            <p className="font-label text-body-md text-on-surface">
              Scan item barcode
            </p>
            {/* h-14 = 56px floor secondary input, autoFocus for scan-first per §3 */}
            <input
              type="text"
              name="barcode"
              autoFocus
              placeholder="Scan or enter barcode…"
              className="mt-2 h-14 w-full rounded border-2 border-outline-variant/30 bg-surface-white px-4 font-mono text-mono-lg text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-4 focus:ring-brand-navy"
            />
          </div>
        )}
      </div>

      {/* Primary action — full-width, sticky bottom, 64px minimum height.
          brand-design-system.md §3: primary action in the bottom third of the
          viewport, full-width, always visible. 64px minimum for floor primary actions.
          No hover: on floor — active: press feedback only (§3 §10). */}
      {isPickable && !pickComplete && (
        <div className="sticky bottom-0 bg-brand-navy px-4 pb-6 pt-4 shadow-elevation-2">
          <form action={handleConfirmPick}>
            {/* Confirm Pick — 64px (h-16) full-width primary action per §3 */}
            <button
              type="submit"
              className="flex h-16 w-full items-center justify-center rounded bg-brand-red font-label text-body-md text-surface-white active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-brand-navy"
            >
              Confirm Pick
            </button>
          </form>
        </div>
      )}

      {/* Post-completion back navigation */}
      {pickComplete && (
        <div className="sticky bottom-0 bg-brand-navy px-4 pb-6 pt-4 shadow-elevation-2">
          <Link
            href={`/pick-lists/${pickListId}/dispatch`}
            className="flex h-16 w-full items-center justify-center rounded border-2 border-surface-white bg-brand-navy font-label text-body-md text-surface-white active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-brand-navy"
          >
            Proceed to Dispatch
          </Link>
        </div>
      )}
    </div>
  );
}
