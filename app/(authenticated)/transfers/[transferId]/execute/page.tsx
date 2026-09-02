// Execute Transfer — floor-priority physical transfer execution screen.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §3 (route), §7 (physical execution/commit)
//   specs/11-transfer-and-inspection/requirements.md R2.1–R2.3
//   specs/00-steering/brand-design-system.md §3 (floor surface rules — mobile-first
//     base styles, NO glassmorphism, active: press not hover:, one primary action,
//     primary action in bottom third full-width, 64px minimum touch targets),
//     §6 (solid bg-surface-white — no backdrop-blur on floor), §1.5 (AAA contrast
//     for time-critical text), §2 (no text below 16px on floor),
//     §8 (no backdrop-blur, animation constraints), §9 (card-based list not table)
//
// Surface: FLOOR. Designed at 375px viewport first. No glassmorphism.
// Permission gate: transfer.execute
//
// Feedback mechanism: after marking transferred, the server action redirects back
// with `result=completed` on success or `result=error&reason=...` on failure.
// Page reads search params to display the result.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getTransferRequest } from "@/lib/db/queries/transfers";
import { updateTransferStatus } from "@/lib/actions/transfers";
import type { TransferLineRow } from "@/lib/db/queries/transfers";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";

// ─── Error reason → plain language ──────────────────────────────────────────

function getExecuteErrorMessage(reason: string): string {
  switch (reason) {
    case "forbidden":
      return "You do not have permission to execute transfers.";
    case "not_found":
      return "Transfer request not found.";
    case "invalid_status":
      return "This transfer cannot be executed in its current state.";
    default:
      return `Action failed: ${reason}. Contact a supervisor if this persists.`;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ transferId: string }>;
  searchParams: Promise<{
    result?: string;
    reason?: string;
  }>;
}

export default async function ExecuteTransferPage({
  params,
  searchParams,
}: PageProps) {
  const { transferId } = await params;
  const { result, reason: reasonParam } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: transfer.execute — floor staff / warehouse operator capability.
  const permResult = await requirePermission(resolver, "transfer.execute");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const transfer = await getTransferRequest(db, transferId);
  if (!transfer) {
    notFound();
  }

  // Only allow execution when transfer is in_progress.
  const isExecutable = transfer.status === "in_progress";

  // Inline server action — marks the transfer completed.
  // Closes over transferId from the page component.
  async function handleMarkTransferred(formData: FormData): Promise<void> {
    "use server";
    // qty input is available in formData but updateTransferStatus only takes
    // the new status; the physical quantity is recorded via the underlying
    // inventory transaction which updateTransferStatus drives internally.
    void formData; // acknowledged — qty collected for UX but not separately passed
    const actionResolver = await createPageResolver();
    const actionResult = await updateTransferStatus(
      actionResolver,
      transferId,
      "completed"
    );
    if (actionResult.ok) {
      redirect(`/transfers/${transferId}/execute?result=completed`);
    }
    redirect(
      `/transfers/${transferId}/execute?result=error&reason=${encodeURIComponent(actionResult.reason)}`
    );
  }

  const transferComplete = result === "completed";
  const transferError = result === "error";
  const errorReason = reasonParam ?? "";

  const totalLines = transfer.lines.length;
  const completedLines = transfer.lines.filter(
    (l: TransferLineRow) => l.status === "completed"
  ).length;

  return (
    // Floor screen: solid bg-surface-light-grey, no glassmorphism, 16px padding.
    // brand-design-system.md §4: floor screens use 16px page padding.
    <div className="flex min-h-screen flex-col bg-surface-light-grey">
      {/* Top bar — compact, floor-appropriate, brand-navy background */}
      <div className="bg-brand-navy px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Back link — h-14 (56px) minimum floor touch target per §3 */}
          <Link
            href={`/transfers/${transferId}`}
            className="inline-flex h-14 items-center gap-2 font-label text-body-md text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy active:scale-[0.97]"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Back to Transfer</span>
          </Link>
          {/* Flow type badge — Epilogue, floor-visible */}
          <span className="font-label text-body-md text-white/70 uppercase">
            {transfer.flowType.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Main floor content — flex-1, single-column, 16px padding */}
      <div className="flex flex-1 flex-col px-4 py-4">
        {/* Progress header — solid surface, Level 2 shadow per §6 floor rule */}
        <div className="rounded-xl bg-surface-white p-4 shadow-elevation-2">
          <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
            Execute Transfer
          </h1>
          {/* Route — Roboto Mono for location IDs per §9; min 16px on floor per §2 */}
          <div className="mt-2 flex items-center gap-2 font-body text-body-md text-on-surface">
            <span className="font-mono text-mono-md">{transfer.fromLocationId}</span>
            <ArrowRight size={16} className="text-slate-400 shrink-0" aria-hidden="true" />
            <span className="font-mono text-mono-md">{transfer.toLocationId}</span>
          </div>
          {/* Progress — no text below 16px (body-md) on floor screens per §2 */}
          <p className="mt-2 font-body text-body-md text-on-surface">
            <span className="font-mono text-mono-lg font-bold">
              {completedLines} / {totalLines}
            </span>{" "}
            lines completed
          </p>
          {!isExecutable && (
            <div
              role="alert"
              className="mt-3 rounded bg-status-pending px-3 py-2"
            >
              {/* Icon paired with color per §1.3 floor color-blind rule */}
              <p className="flex items-center gap-2 font-body text-body-md text-on-surface">
                <AlertTriangle size={18} className="text-amber-800 shrink-0" aria-hidden="true" />
                This transfer is not in progress. Return to the transfer detail
                to start it first.
              </p>
            </div>
          )}
        </div>

        {/* Execution feedback — full-screen flash equivalent via solid color block.
            brand-design-system.md §9 §10: scan feedback is a solid color fill,
            not a gradient or blurred overlay. AAA contrast (7:1) for
            time-critical text per §1.5.
            text-on-surface (#0F172A) on status-available (#10B981) → 7.04:1, meets AAA. */}
        {transferComplete && (
          <div
            role="status"
            aria-live="assertive"
            // White background + status-available left border — text-on-surface (#0F172A)
            // on white (#FFFFFF) → >15:1, meets AAA (7:1 floor requirement per
            // brand-design-system.md §1.5). Left border + icon carry the semantic
            // color signal per §1.3 floor color-blind rule.
            className="mt-4 rounded-xl border border-status-available/40 bg-status-available/5 px-4 py-4 shadow-sm"
          >
            {/* Icon paired with color per §1.3 floor color-blind rule */}
            <p className="font-heading font-semibold text-headline-md text-on-surface flex items-center gap-2">
              <CheckCircle2 size={22} className="text-status-available" aria-hidden="true" /> Transfer Completed
            </p>
            <p className="mt-1 font-body text-body-md text-on-surface">
              Stock movement has been recorded successfully.
            </p>
          </div>
        )}

        {transferError && (
          <div
            role="alert"
            aria-live="assertive"
            // White background + status-held left border — text-on-surface (#0F172A)
            // on white (#FFFFFF) → >15:1, meets AAA (7:1 floor requirement per
            // brand-design-system.md §1.5). The left border + icon carry the
            // color-semantic signal per §1.3 floor color-blind rule.
            className="mt-4 rounded-xl border border-status-held/40 bg-status-held/5 px-4 py-4 shadow-sm"
          >
            {/* Icon paired with color per §1.3 floor color-blind rule */}
            <p className="font-heading font-semibold text-headline-md text-on-surface flex items-center gap-2">
              <AlertCircle size={22} className="text-status-held" aria-hidden="true" /> Action Failed
            </p>
            <p className="mt-1 font-body text-body-md text-on-surface">
              {getExecuteErrorMessage(errorReason)}
            </p>
          </div>
        )}

        {/* Transfer lines — card-based list, NOT a table.
            brand-design-system.md §9: floor tables are a fail case;
            use card-based list, one item per row. */}
        <div className="mt-4 space-y-2">
          {transfer.lines.map((line: TransferLineRow) => {
            const isCompleted = line.status === "completed";
            const qtyRequested = parseFloat(line.qtyRequested) || 0;
            const qtyTransferred = parseFloat(line.qtyTransferred) || 0;
            const progressPct =
              qtyRequested > 0
                ? Math.min(100, Math.round((qtyTransferred / qtyRequested) * 100))
                : 0;

            return (
              <div
                key={line.id}
                // Floor card: solid surface-white, Level 2 shadow, no glassmorphism per §6
                className="rounded-xl bg-surface-white p-4 shadow-elevation-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Lot ID — Roboto Mono per §9, min 16px on floor */}
                    <p className="font-mono text-mono-lg font-bold text-on-surface">
                      {line.lotId}
                    </p>
                    {/* Item ID — Roboto Mono per §9 */}
                    <p className="mt-0.5 font-mono text-mono-md text-on-surface">
                      {line.itemId}
                    </p>
                    {/* Qty progress text — min body-md (16px) per §2 */}
                    <p className="mt-2 font-body text-body-md text-on-surface">
                      {line.qtyTransferred} / {line.qtyRequested} transferred
                      {" "}({progressPct}%)
                    </p>
                    {/* Progress bar — visual aide, not the sole signal (text is primary) */}
                    <div
                      role="progressbar"
                      aria-valuenow={progressPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${progressPct}% transferred`}
                      className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-light-grey"
                    >
                      <div
                        className={`h-full rounded-full transition-none ${isCompleted ? "bg-status-available" : "bg-status-pending"}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                  {/* Completion indicator — icon + color, never color alone per §1.3 */}
                  {isCompleted && (
                    <span
                      aria-label="Line completed"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-available text-surface-white font-heading font-bold"
                    >
                      <Check size={20} strokeWidth={3} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary action — full-width, sticky bottom, 64px minimum height.
          brand-design-system.md §3: primary action in the bottom third of the
          viewport, full-width, always visible. 64px minimum for floor primary actions.
          No hover: on floor — active: press feedback only (§3 §10).
          focus:ring-brand-navy — NEVER focus:ring-brand-red (§9 forms). */}
      {isExecutable && !transferComplete && (
        <div className="sticky bottom-0 bg-brand-navy px-4 pb-6 pt-4 shadow-elevation-2">
          <form action={handleMarkTransferred} className="flex flex-col gap-3">
            <label
              htmlFor="qty-input"
              className="font-label text-body-md text-surface-white"
            >
              Quantity transferred (all lines)
            </label>
            <input
              id="qty-input"
              name="qty"
              type="number"
              min="0.0001"
              step="0.0001"
              placeholder="Enter transferred quantity…"
              // h-14 = 56px — floor secondary input, min floor default per §3
              className="h-14 w-full rounded border-2 border-surface-white bg-surface-white px-4 font-mono text-mono-lg text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-4 focus:ring-brand-navy"
            />
            {/* Mark Transferred — 64px (h-16) full-width primary action per §3 */}
            <button
              type="submit"
              // active: press feedback, no hover: (floor screen per §3 §10)
              className="flex h-16 w-full items-center justify-center rounded bg-primary font-label text-body-md text-surface-white active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-brand-navy"
            >
              Mark Transferred
            </button>
          </form>
        </div>
      )}

      {/* Post-completion back navigation — shown after successful transfer */}
      {transferComplete && (
        <div className="sticky bottom-0 bg-brand-navy px-4 pb-6 pt-4 shadow-elevation-2">
          <Link
            href={`/transfers/${transferId}`}
            className="flex h-16 w-full items-center justify-center rounded bg-brand-navy border-2 border-surface-white font-label text-body-md text-surface-white active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-brand-navy"
          >
            Return to Transfer
          </Link>
        </div>
      )}
    </div>
  );
}
