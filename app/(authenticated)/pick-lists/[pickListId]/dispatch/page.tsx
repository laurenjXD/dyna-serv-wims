// Dispatch Confirmation — exact-box scan and final handoff.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R7.5  — Final dispatch confirmation SHALL atomically verify the commitment
//             and scans, decrement authoritative inventory, release the committed
//             quantity, transition the pick list, and insert an immutable
//             inventory_transaction with movement_type = 'pick'.
//     R7.8  — After all pick/scan lines on a pick list are accepted, the floor
//             user or supervisor SHALL proceed directly to dispatch; Stage 2
//             verifies scans, decrements inventory, releases reservations, writes
//             the immutable pick transaction, and makes the priced
//             acknowledgement_receipt available.
//     R7.9  — Stage 2 SHALL have no quality-check branch that blocks or reroutes
//             dispatch.
//     §5 acceptance criterion — "After all pick scans are accepted, dispatch is
//             direct and has no pre-dispatch inspection route or state."
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §7 (Stage 2 dispatch disposition — atomic qty_remaining decrement,
//     qty_committed release, commitment → executed, pick transaction insert,
//     pick_list → dispatched, AR generation trigger)
//   specs/00-steering/brand-design-system.md §3 (floor surface: 64px primary
//     CTA, active: press not hover:, no glassmorphism, solid bg-brand-navy,
//     one primary action per screen), §6 (no glassmorphism on floor), §2 (no
//     text below 16px on floor), §1.3 (status-held for warning text)
//   design-system/dyna-serv-wims/MASTER.md — floor primary CTA, floor input
//     pattern, floor status card pattern
//
// Surface: FLOOR. Designed at 375px viewport first. No glassmorphism.
// Permission gate: dispatch.execute
//
// Data source: lib/db/queries/withdrawals.ts getPickList + getPickListItems
// for line items, and a minimal direct parties lookup (id/name only) for the
// customer party name — no mock data. The party name lookup is a raw,
// unfiltered select rather than the fully-gated getPartyWithRoles helper
// (which requires its own parties.read capability check per its doc
// comment): this page is already permission-gated on dispatch.execute for
// this exact pick list, and only exposes the single related party's display
// name, mirroring the pattern already used by floor pages elsewhere (e.g.
// receiving's floor page does its own direct location lookups rather than
// re-invoking a separately-gated query helper).
// The actual dispatch command (dispatchPickList) is wired. On success the
// user is returned to /outgoing so the next pick can begin immediately.
//
// Physical evidence is recorded here, at dispatch. The pick screen only stages
// committed boxes and never prompts for a barcode/QR scan.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  ChevronLeft,
  AlertTriangle,
  Truck,
  CheckCircle2,
  ScanLine,
} from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
import { getPickList, getPickListItems, getPickUnitSelections } from "@/lib/db/queries/withdrawals";
import { dispatchPickList, selectPickUnit } from "@/lib/actions/withdrawals";
import { CameraScanBridge } from "@/components/floor/CameraScanBridge";

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ pickListId: string }>;
  searchParams: Promise<{
    result?: string;
    reason?: string;
  }>;
}

export default async function DispatchConfirmationPage({
  params,
  searchParams,
}: PageProps) {
  const { pickListId } = await params;
  const { result, reason: reasonParam } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: dispatch.execute — floor staff / warehouse operator capability.
  // Floor-style forbidden: dark navy surface, no redirect loop.
  const permResult = await requirePermission(resolver, "dispatch.execute");
  if (permResult.kind !== "authorized") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface-white px-4">
        <p className="font-heading text-headline-md text-on-surface">
          Access denied
        </p>
        <p className="mt-2 font-body text-body-md text-text-grey">
          You do not have permission to dispatch pick lists.
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

  const [items, selections] = await Promise.all([
    getPickListItems(db, pickListId),
    getPickUnitSelections(db, pickListId),
  ]);
  const selectionCountByLine = new Map<string, number>();
  for (const selection of selections) {
    if (selection.pickListItemId) selectionCountByLine.set(selection.pickListItemId, (selectionCountByLine.get(selection.pickListItemId) ?? 0) + 1);
  }

  const partyRows = (await db
    .select({ id: parties.id, name: parties.name })
    .from(parties)
    .where(eq(parties.id, pickList.customerPartyId))
    .limit(1)) as Array<{ id: string; name: string }>;
  const partyName = partyRows[0]?.name ?? "Unknown Organization";

  const alreadyDispatched = pickList.status === "dispatched";
  const awaitingPickCompletion = pickList.status === "allocated";

  const totalLines = items.length;
  const totalRequiredBoxes = items.reduce((sum, item) => sum + item.numberOfBoxes, 0);
  const selectedBoxCount = selections.length;
  const activeItem = pickList.status === "picked"
    ? items.find((item) => (selectionCountByLine.get(item.id) ?? 0) < item.numberOfBoxes)
    : undefined;
  const allBoxesScanned = items.length > 0 && !activeItem;

  async function handleBoxScan(formData: FormData): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const scanResult = await selectPickUnit(
      actionResolver,
      pickListId,
      String(formData.get("barcode") ?? ""),
    );
    if (!scanResult.ok) redirect(`/pick-lists/${pickListId}/dispatch?result=error&reason=${encodeURIComponent(scanResult.errors[0] ?? "unable_to_select_box")}`);
    redirect(`/pick-lists/${pickListId}/dispatch?result=scanned`);
  }

  // Inline server action — executes Stage 2 dispatch.
  // design.md §7: atomically decrements qty_remaining, releases qty_committed,
  // transitions commitment → executed, inserts immutable pick transaction,
  // transitions pick_list → dispatched, triggers AR generation.
  // On success: redirects to /outgoing (floor user returns to queue).
  // Non-fatal doc-generation failure does not roll back the stock movement (R8.5).
  async function handleDispatch(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const dispatchResult = await dispatchPickList(
      actionResolver,
      pickListId,
      items.map((item) => item.id),
    );
    if (dispatchResult.ok) {
      // Return to outgoing queue — dispatch is complete.
      redirect("/outgoing");
    }
    redirect(
      `/pick-lists/${pickListId}/dispatch?result=error&reason=${encodeURIComponent(
        dispatchResult.errors[0] ?? "dispatch_failed",
      )}`,
    );
  }

  const dispatchError = result === "error";
  const errorReason = reasonParam ?? "";
  const isDispatchError = dispatchError;

  // Derive flow type badge color from flowType value.
  const flowTypeBadgeClass =
    pickList.flowType === "vmi"
      ? "bg-status-pending/20 text-status-pending"
      : pickList.flowType === "trading"
        ? "bg-status-available/20 text-status-available"
        : "bg-status-neutral/20 text-status-neutral";

  return (
    // Floor screen: solid bg-surface-white, no glassmorphism, 16px padding.
    // brand-design-system.md §4: floor screens use 16px page padding.
    <div className="flex min-h-screen flex-col bg-surface-white">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-outline-variant/30 bg-surface-white px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back link — h-14 (56px) floor touch target per §3 */}
            <Link
              href="/inventory?tab=pick-lists"
              className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-white text-on-surface shadow-elevation-2 focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
              aria-label="Back to Pick Lists"
            >
              <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              {/* "Dispatch" heading — Fira Sans Bold, text-headline-lg */}
              <h1 className="font-heading text-headline-lg font-extrabold text-on-surface">
                Dispatch
              </h1>
              {/* Pick list reference — Roboto Mono, secondary text */}
              <p className="font-mono text-mono-lg text-text-grey">
                {pickList.pickListNumber}
              </p>
            </div>
          </div>
          {/* Pick-verification progress counter */}
          {!alreadyDispatched && (
            <span className="font-body text-body-md text-text-grey">
              {selectedBoxCount} / {totalRequiredBoxes} scanned
            </span>
          )}
        </div>
      </div>

      {/* ── Main content (scrollable) ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-2">

        {/* Already dispatched state */}
        {alreadyDispatched && (
          <div
            role="status"
            aria-live="polite"
            className="mb-3 rounded-xl bg-status-available/20 border border-status-available/40 px-4 py-4"
          >
            <p className="font-heading text-headline-md font-bold text-on-surface">
              Already Dispatched
            </p>
            <p className="mt-1 font-body text-body-md text-text-grey">
              This pick list has already been dispatched.
            </p>
          </div>
        )}

        {awaitingPickCompletion && (
          <div className="mb-3 rounded-xl border border-status-pending/40 bg-status-pending/10 px-4 py-4">
            <p className="font-heading text-headline-md font-bold text-on-surface">Waiting to be picked</p>
            <p className="mt-1 font-body text-body-md text-text-grey">
              Review the Pick List PDF and mark this list as picked before starting Dispatch.
            </p>
            <Link href="/inventory?tab=pick-lists" className="mt-3 inline-flex h-11 items-center rounded bg-brand-navy px-4 font-label text-label font-bold text-surface-white">
              Back to To Pick
            </Link>
          </div>
        )}

        {/* Dispatch error feedback (non-scan errors: e.g. already_dispatched, not_found) */}
        {isDispatchError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-3 flex items-start gap-2 rounded-xl bg-status-held/20 border border-status-held/40 px-4 py-4"
          >
            <AlertTriangle
              size={24}
              strokeWidth={2}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-status-held"
            />
            <div>
              <p className="font-heading text-headline-md font-bold text-on-surface">
                Dispatch Failed
              </p>
              <p className="mt-1 font-body text-body-md text-text-grey">
                {errorReason === "already_dispatched"
                  ? "This pick list was already dispatched."
                  : errorReason === "not_found"
                    ? "Pick list not found. Contact a supervisor."
                    : errorReason === "commitment_expired"
                      ? "Pick list no longer active — return to queue."
                      : errorReason === "wrong_item_or_lot_qr"
                        ? "This QR does not match an unfinished item or lot on this Pick List."
                        : errorReason === "line_complete"
                          ? "This item has already reached its required box count. Continue with the next line."
                          : `Error: ${errorReason}. Contact a supervisor if this persists.`}
              </p>
            </div>
          </div>
        )}

        {/* ── Summary card ─────────────────────────────────────────────── */}
        {/* Floor card: solid bg-surface-white, no glassmorphism.          */}
        <div className="mb-3 rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-2">
          {/* Party name — Fira Sans SemiBold heading, floor minimum text */}
          <div className="flex items-start gap-3">
            <Truck
              size={24}
              strokeWidth={2}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-text-grey"
            />
            <div className="min-w-0">
              <p className="font-heading text-headline-md font-semibold text-on-surface">
                {partyName}
              </p>
              <div className="mt-1 flex items-center gap-2">
                {/* Flow type badge — color + text per §1.3, icon ensures non-color signal */}
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 font-label text-body-md uppercase tracking-wide ${flowTypeBadgeClass}`}
                >
                  {pickList.flowType.toUpperCase()}
                </span>
                <span className="font-body text-body-md text-text-grey">
                  {items.length} items
                </span>
              </div>
            </div>
          </div>

          {/* Items list — one per card, scan status indicator per item.
              brand-design-system.md §9: floor tables are a fail case — card list. */}
          <div className="mt-4 space-y-2">
            {items.length === 0 && (
              <p className="font-body text-body-md text-text-grey">
                No committed lines were found for this pick list.
              </p>
            )}
            {items.map((item) => {
              const scannedCount = selectionCountByLine.get(item.id) ?? 0;
              const complete = scannedCount === item.numberOfBoxes;
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-xl border border-outline-variant/30 bg-surface-light-grey px-3 py-3"
                >
                  {/* Status icon — color + icon per §1.3 floor color-blind rule */}
                  <div className="mt-0.5 shrink-0" aria-hidden="true">
                    <CheckCircle2
                      size={24}
                      strokeWidth={2}
                      className={complete ? "text-status-available" : "text-status-neutral"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* Item code — Roboto Mono */}
                    <p className="font-mono text-mono-lg font-bold text-on-surface">
                      {item.itemCode}
                    </p>
                    {/* Item description */}
                    <p className="mt-0.5 font-body text-body-md text-on-surface">
                      {item.itemDescription ?? item.itemCode}
                    </p>
                    {/* Lot + qty */}
                    <p className="mt-1 font-mono text-mono-lg text-text-grey">
                      {item.lotNumber} — Qty: {item.qty}
                    </p>
                    {/* Location */}
                    <p className="mt-0.5 font-body text-body-md text-text-grey">
                      {item.locationLabel}
                    </p>
                    <p className="mt-1 font-body text-body-md text-text-grey">{scannedCount} / {item.numberOfBoxes} boxes scanned</p>
                  </div>
                  <span className="sr-only">{complete ? "Dispatch scan complete" : "Dispatch scan pending"}</span>
                </div>
              );
            })}
          </div>
        </div>

        {!alreadyDispatched && !awaitingPickCompletion && activeItem && (
          <section className="mb-3 rounded-2xl border border-brand-blue/30 bg-brand-blue/5 p-4">
            <div className="flex items-start gap-3"><ScanLine size={24} className="mt-0.5 shrink-0 text-brand-navy" aria-hidden="true" /><div><h2 className="font-heading text-title-md font-bold text-on-surface">Scan QR for dispatch</h2><p className="mt-1 font-body text-body-md text-text-grey">Scan any item or lot QR on this Pick List. The matching unfinished line is counted automatically. Next: {activeItem.itemCode} · Lot {activeItem.lotNumber} · {activeItem.locationLabel}.</p></div></div>
            <form action={handleBoxScan} className="mt-4 flex flex-col gap-3 sm:flex-row"><input name="barcode" required autoFocus autoComplete="off" placeholder="Scan item or lot QR" className="h-14 min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-white px-4 font-mono text-body-md text-on-surface outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20" /><button type="submit" className="h-14 rounded-xl bg-brand-navy px-6 font-label text-body-md text-surface-white">Count box</button></form>
            <div className="mt-3"><CameraScanBridge action={handleBoxScan} /></div>
          </section>
        )}

        {/* ── Optional fields ──────────────────────────────────────────── */}
        {/* Vehicle/driver reference and notes — optional, floor style.
            h-14 (56px) floor input touch target per §3. */}
        {!alreadyDispatched && (
          <div className="mb-3 space-y-3">
            <div>
              <label
                htmlFor="vehicle-ref"
                className="mb-1.5 block font-body text-body-md text-text-grey"
              >
                Vehicle / driver reference{" "}
                <span className="text-status-neutral">(optional)</span>
              </label>
              <input
                id="vehicle-ref"
                type="text"
                name="vehicleRef"
                autoComplete="off"
                className="h-14 w-full rounded-xl border border-outline-variant/30 bg-surface-white px-4 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
                placeholder="e.g. TRK-221 / John Smith"
              />
            </div>
            <div>
              <label
                htmlFor="dispatch-notes"
                className="mb-1.5 block font-body text-body-md text-text-grey"
              >
                Notes{" "}
                <span className="text-status-neutral">(optional)</span>
              </label>
              <textarea
                id="dispatch-notes"
                name="notes"
                rows={2}
                className="w-full resize-none rounded-xl border border-outline-variant/30 bg-surface-white px-4 py-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
                placeholder="Any handoff notes…"
              />
            </div>
          </div>
        )}

        {/* ── Final-action notice ──────────────────────────────────────── */}
        {/* §1.3: status-held (semantic warning) + icon ensures non-color signal */}
        {!alreadyDispatched && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-status-held/30 bg-status-held/10 px-4 py-3">
            <AlertTriangle
              size={24}
              strokeWidth={2}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-status-held"
            />
            <p className="font-body text-body-md text-status-held">
              Scan every committed box here before dispatching. Dispatching is final and will deduct each line from the location shown above.
            </p>
          </div>
        )}
      </div>

      {/* Exact boxes are scanned here, immediately before the final dispatch. */}
      {!alreadyDispatched && (
        <div className="sticky bottom-0 border-t border-outline-variant/30 bg-surface-white px-4 pb-6 pt-4 shadow-elevation-2">
          {totalLines > 0 ? (
            <form action={handleDispatch}>
              <button
                type="submit"
                disabled={!allBoxesScanned}
                className="flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-primary font-label text-body-md uppercase tracking-wide text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy focus:ring-offset-2 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
              >
                <Truck size={24} strokeWidth={2} aria-hidden="true" />
                {allBoxesScanned ? "Confirm Dispatch" : `Scan ${totalRequiredBoxes - selectedBoxCount} More Boxes`}
              </button>
            </form>
          ) : (
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex h-16 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-surface-light-grey font-label text-body-md uppercase tracking-wide text-status-neutral"
            >
              <Truck size={24} strokeWidth={2} aria-hidden="true" />
              No Items to Dispatch
            </button>
          )}
        </div>
      )}

      {/* Post-dispatch navigation back to queue */}
      {alreadyDispatched && (
        <div className="sticky bottom-0 border-t border-outline-variant/30 bg-surface-white px-4 pb-6 pt-4 shadow-elevation-2">
          <Link
            href="/outgoing"
            className="flex h-16 w-full items-center justify-center gap-2 rounded-xl border-2 border-outline-variant/30 bg-surface-white font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
          >
            Return to Outgoing
          </Link>
        </div>
      )}
    </div>
  );
}
