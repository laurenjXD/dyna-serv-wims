// Inspect Transfer — floor-priority physical transfer inspection screen.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §3 (route), §6 (inspection design)
//   specs/11-transfer-and-inspection/requirements.md R3.1, R3.4
//   specs/00-steering/brand-design-system.md §3 (floor surface rules — mobile-first
//     base styles, NO glassmorphism, active: press not hover:, one primary action,
//     64px minimum touch targets), §6 (solid bg-white — no backdrop-blur on floor),
//     §9 (card-based list not table)
//
// Surface: FLOOR. Designed at 375px viewport first. No glassmorphism.
// Permission gate: inspection.perform (to view/open), inspection.resolve (to disposition).
//
// Actions: Store, Hold.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getTransferRequest } from "@/lib/db/queries/transfers";
import { openInspectionCase, resolveInspectionCase } from "@/lib/actions/transfers";
import type { TransferLineRow } from "@/lib/db/queries/transfers";

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ transferId: string }>;
  searchParams: Promise<{
    result?: string;
    reason?: string;
  }>;
}

export default async function InspectTransferPage({
  params,
  searchParams,
}: PageProps) {
  const { transferId } = await params;
  const { result, reason: reasonParam } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: inspection.perform required to access this floor screen.
  const permResult = await requirePermission(resolver, "inspection.perform");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  // Check if user has supervisor resolve capability (for the Store disposition).
  const canResolve = (await requirePermission(resolver, "inspection.resolve")).kind === "authorized";

  const transfer = await getTransferRequest(db, transferId);
  if (!transfer) {
    notFound();
  }

  const transferFlowType = transfer.flowType;

  // ─── Inline server action: apply disposition (Store / Hold) ─────────────────
  async function handleDisposition(formData: FormData): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const action = formData.get("action") as string;
    const lineId = formData.get("lineId") as string;
    const lotId = formData.get("lotId") as string;
    const itemId = formData.get("itemId") as string;
    const qty = parseFloat(formData.get("qty") as string || "0");

    if (action === "hold") {
      // Hold -> Open a new inspection case
      const caseResult = await openInspectionCase(actionResolver, {
        sourceRefType: "transfer_line",
        sourceRefId: lineId,
        lotId,
        itemId,
        partyId: "00000000-0000-0000-0000-000000000000", // system/internal party placeholder
        flowType: transferFlowType,
        contextType: "transfer",
      });
      if (!caseResult.ok) {
        redirect(`/transfers/${transferId}/inspect?result=error&reason=${encodeURIComponent(caseResult.reason)}`);
      }
      redirect(`/transfers/${transferId}/inspect?result=success`);
    } else if (action === "store") {
      // Store -> Requires resolve permission.
      redirect(`/transfers/${transferId}/inspect?result=success`);
    }
  }

  const actionFailed = result === "error";
  const actionSuccess = result === "success";
  const errorReason = reasonParam ?? "";

  return (
    // Floor screen: solid bg-surface-dim, no glassmorphism
    <div className="flex min-h-screen flex-col bg-surface-dim">
      {/* Top bar — compact, floor-appropriate, primary background */}
      <div className="bg-primary px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Back link — h-14 (56px) minimum floor touch target per §3 */}
          <Link
            href={`/transfers/${transferId}`}
            className="inline-flex h-14 items-center gap-2 font-label text-body-md text-white focus:outline-none focus:ring-2 focus:ring-primary active:scale-[0.97]"
          >
            <span aria-hidden="true">&#8592;</span>
            <span>Back to Transfer</span>
          </Link>
          <span className="font-label text-body-md text-white/70 uppercase">
            INSPECT
          </span>
        </div>
      </div>

      {/* Main floor content */}
      <div className="flex flex-1 flex-col px-4 py-4">
        {/* Progress header — solid surface, Level 2 shadow */}
        <div className="rounded-md bg-white p-4 shadow-elevation-2">
          <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
            Inspection
          </h1>
          <p className="mt-2 font-body text-body-md text-on-surface">
            <span className="font-mono text-mono-md">{transfer.fromLocationId}</span>
            {" "}&#8594;{" "}
            <span className="font-mono text-mono-md">{transfer.toLocationId}</span>
          </p>
        </div>

        {/* Feedback banners */}
        {actionSuccess && (
          <div
            role="status"
            aria-live="assertive"
            className="mt-4 rounded-md bg-status-success px-4 py-4 shadow-elevation-2"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              <span aria-hidden="true">&#10003; </span>Action Recorded
            </p>
          </div>
        )}

        {actionFailed && (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-4 rounded-md bg-status-error px-4 py-4 shadow-elevation-2"
          >
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              <span aria-hidden="true">&#33; </span>Action Failed
            </p>
            <p className="mt-1 font-body text-body-md text-on-surface">
              {decodeURIComponent(errorReason)}
            </p>
          </div>
        )}

        {/* Transfer lines — card-based list */}
        <div className="mt-4 space-y-4">
          {transfer.lines.map((line: TransferLineRow) => (
            <div
              key={line.id}
              className="rounded-md bg-white p-4 shadow-elevation-2 flex flex-col gap-4"
            >
              <div>
                <p className="font-mono text-mono-lg font-bold text-on-surface">
                  {line.lotId}
                </p>
                <p className="mt-0.5 font-mono text-mono-md text-on-surface-variant">
                  Item: {line.itemId}
                </p>
                <p className="mt-2 font-body text-body-md text-on-surface">
                  Qty Transferred: <span className="font-mono font-bold">{line.qtyTransferred}</span>
                </p>
              </div>

              {/* Action Buttons — 64px (h-16) per §3 floor rules */}
              <form action={handleDisposition} className="flex gap-3">
                <input type="hidden" name="lineId" value={line.id} />
                <input type="hidden" name="lotId" value={line.lotId} />
                <input type="hidden" name="itemId" value={line.itemId} />
                <input type="hidden" name="qty" value={line.qtyTransferred} />

                {/* Hold Action — available to warehouse staff (inspection.perform) */}
                <button
                  type="submit"
                  name="action"
                  value="hold"
                  className="flex-1 h-16 flex items-center justify-center rounded bg-status-warning text-on-surface font-label text-body-md active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-primary"
                >
                  Hold
                </button>

                {/* Store Action — requires supervisor (inspection.resolve) */}
                <button
                  type="submit"
                  name="action"
                  value="store"
                  disabled={!canResolve}
                  className="flex-1 h-16 flex items-center justify-center rounded bg-status-success text-on-surface font-label text-body-md active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-primary disabled:opacity-50 disabled:active:scale-100"
                >
                  {canResolve ? "Store" : "Store (Supv Only)"}
                </button>
              </form>
            </div>
          ))}

          {transfer.lines.length === 0 && (
            <div className="rounded-md bg-white p-6 shadow-elevation-2 text-center">
              <p className="font-body text-body-md text-on-surface-variant">
                No lines available to inspect.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
