// Dispatch Confirmation — floor-priority direct dispatch confirmation screen.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R7.5 — final dispatch confirmation SHALL atomically verify commitment and
//             scans, decrement authoritative inventory, release committed quantity,
//             transition pick list, and insert immutable inventory_transaction
//             with movement_type = 'pick'.
//     R7.8 — after all pick/scan lines are accepted, floor user or supervisor
//             SHALL proceed directly to dispatch.
//     R7.9 — Stage 2 SHALL have no quality-check branch that blocks or reroutes
//             dispatch.
//     §5 acceptance criterion — "After all pick scans are accepted, dispatch is
//             direct and has no pre-dispatch inspection route or state."
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §7 (Stage 2 dispatch disposition)
//   specs/00-steering/brand-design-system.md §3 (floor surface: 64px primary CTA,
//     active: press, no glassmorphism, solid bg-brand-red for primary action,
//     one primary action per screen)
//
// Surface: FLOOR. Designed at 375px viewport first. No glassmorphism.
// Permission gate: withdrawal.execute

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getPickList } from "@/lib/db/queries/withdrawals";
import { dispatchPickList } from "@/lib/actions/withdrawals";
import type { PickListRow } from "@/lib/db/queries/withdrawals";

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ pickListId: string }>;
  searchParams: Promise<{ result?: string; reason?: string }>;
}

export default async function DispatchConfirmationPage({
  params,
  searchParams,
}: PageProps) {
  const { pickListId } = await params;
  const { result, reason: reasonParam } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: withdrawal.execute — floor staff / warehouse operator capability.
  const permResult = await requirePermission(resolver, "withdrawal.execute");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const pickList = await getPickList(db, pickListId);
  if (!pickList) {
    notFound();
  }

  const alreadyDispatched =
    (pickList as PickListRow).status === "dispatched";

  // Inline server action — dispatches the pick list.
  // Closes over pickListId from the page component.
  async function handleDispatch(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const dispatchResult = await dispatchPickList(actionResolver, db, pickListId);
    if (dispatchResult.ok) {
      redirect(`/pick-lists/${pickListId}/dispatch?result=completed`);
    }
    redirect(`/pick-lists/${pickListId}/dispatch?result=error`);
  }

  const dispatchComplete = result === "completed";
  const dispatchError = result === "error";
  const errorReason = reasonParam ?? "";

  const pickListData = pickList as PickListRow;

  return (
    // Floor screen: solid bg-surface-light-grey, no glassmorphism, 16px padding.
    // brand-design-system.md §4: floor screens use 16px page padding.
    <div className="flex min-h-screen flex-col bg-surface-light-grey">
      {/* Top bar — compact, floor-appropriate, brand-navy background */}
      <div className="bg-brand-navy px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Back link — h-14 (56px) minimum floor touch target per §3 */}
          <Link
            href={`/pick-lists/${pickListId}/pick`}
            className="inline-flex h-14 items-center gap-2 font-label text-body-md text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy active:scale-[0.97]"
          >
            <span aria-hidden="true">&#8592;</span>
            <span>Back to Pick</span>
          </Link>
          {/* Flow type badge — Epilogue, floor-visible */}
          <span className="font-label text-body-md text-surface-white/70 uppercase">
            {pickListData.flowType.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Main floor content — flex-1, single-column, 16px padding */}
      <div className="flex flex-1 flex-col px-4 py-4">
        {/* Summary card — solid surface, Level 2 shadow per §6 floor rule */}
        <div className="rounded-md bg-surface-white p-4 shadow-elevation-2">
          <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
            Ready to Dispatch
          </h1>
          <p className="mt-2 font-body text-body-md text-on-surface">
            Pick List:{" "}
            <span className="font-mono text-mono-lg">{pickListId}</span>
          </p>
          <p className="mt-1 font-body text-body-md text-on-surface">
            Flow:{" "}
            <span className="font-mono text-mono-md">
              {pickListData.flowType}
            </span>
          </p>
          <p className="mt-1 font-body text-body-md text-on-surface">
            Customer:{" "}
            <span className="font-mono text-mono-md">
              {pickListData.customerPartyId}
            </span>
          </p>
        </div>

        {/* Already dispatched state */}
        {alreadyDispatched && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 rounded-md bg-status-available px-4 py-4 shadow-elevation-2"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              <span aria-hidden="true">&#10003; </span>Already Dispatched
            </p>
            <p className="mt-1 font-body text-body-md text-on-surface">
              This pick list has already been dispatched.
            </p>
          </div>
        )}

        {/* Dispatch success feedback */}
        {dispatchComplete && (
          <div
            role="status"
            aria-live="assertive"
            className="mt-4 rounded-md bg-status-available px-4 py-4 shadow-elevation-2"
          >
            {/* Icon paired with color per §1.3 floor color-blind rule */}
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              <span aria-hidden="true">&#10003; </span>Dispatch Confirmed
            </p>
            <p className="mt-1 font-body text-body-md text-on-surface">
              Stock movement has been recorded. Acknowledgement receipt is being
              generated.
            </p>
          </div>
        )}

        {/* Dispatch error feedback */}
        {dispatchError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-4 rounded-md bg-status-held px-4 py-4 shadow-elevation-2"
          >
            {/* Icon paired with color per §1.3 floor color-blind rule */}
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              <span aria-hidden="true">&#33; </span>Dispatch Failed
            </p>
            <p className="mt-1 font-body text-body-md text-on-surface">
              {errorReason
                ? `Error: ${errorReason}. Contact a supervisor if this persists.`
                : "Dispatch failed. Contact a supervisor if this persists."}
            </p>
          </div>
        )}
      </div>

      {/* Primary action — full-width, sticky bottom, 64px minimum height.
          brand-design-system.md §3: primary action in the bottom third of the
          viewport, full-width, always visible. 64px minimum for floor primary actions.
          No hover: on floor — active: press feedback only (§3 §10).
          R7.9: no quality-check branch — confirmation is the only path forward. */}
      {!alreadyDispatched && !dispatchComplete && (
        <div className="sticky bottom-0 bg-brand-navy px-4 pb-6 pt-4 shadow-elevation-2">
          <form action={handleDispatch}>
            {/* Confirm Dispatch — 64px (h-16) full-width primary action per §3 */}
            <button
              type="submit"
              className="flex h-16 w-full items-center justify-center rounded bg-brand-red font-label text-body-md text-surface-white active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-brand-navy"
            >
              Confirm Dispatch
            </button>
          </form>
        </div>
      )}

      {/* Post-dispatch navigation */}
      {dispatchComplete && (
        <div className="sticky bottom-0 bg-brand-navy px-4 pb-6 pt-4 shadow-elevation-2">
          <Link
            href="/pick-lists"
            className="flex h-16 w-full items-center justify-center rounded border-2 border-surface-white bg-brand-navy font-label text-body-md text-surface-white active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-brand-navy"
          >
            Return to Pick Lists
          </Link>
        </div>
      )}
    </div>
  );
}
