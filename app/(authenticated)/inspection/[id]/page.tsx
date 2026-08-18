// Inspection Detail — floor inspection flow for a single inspection case.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §6.1 (inspection contexts),
//     §6.2 (context isolation), §6.3 (disposition table with balance effects)
//   specs/11-transfer-and-inspection/requirements.md R3, R3.1–R3.4
//   specs/00-steering/brand-design-system.md §3 (floor — mobile-first base
//     styles at 375px, 64px CTAs full-width, one primary action per screen,
//     active: not hover:, input priority scan>tap>type), §6 (solid bg-brand-navy,
//     no glassmorphism on floor, Level 2 for solid cards), §1.5 (WCAG AAA for
//     time-critical floor text), §2 (no text <16px on floor)
//
// Surface: FLOOR (bg-brand-navy). Permission gate: inspection.perform (view);
// inspection.resolve (submit a disposition — supervisor-only two-person
// separation per 02-rbac-roles §3.2 and lib/actions/transfers.ts's
// resolveInspectionCase doc comment). A warehouse_staff session holding only
// inspection.perform can view case details but the disposition form below is
// hidden entirely for it — it never reaches the DOM, since fail-closed
// enforcement here is not just "disable the button."
//
// Disposition options correspond to inspection_dispositions.disposition_type
// (design.md §6.1, §6.3). The three UI options resolve to a context-specific
// DB value via resolveDispositionType below, since "store"/"return_to_stock"
// and "return_to_party"/"reject" are not interchangeable between the inbound
// and transfer contexts (lib/transfer/inspection-state.ts's
// validateInspectionDisposition rejects the wrong-context pairing):
//   store_as_is     → inbound: 'store'      | transfer: 'return_to_stock'
//   inspect_further → 'hold' (valid for both contexts)
//   flag_for_review → inbound: 'quarantine' | transfer: 'reject'

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getInspectionCase } from "@/lib/db/queries/transfers";
import { resolveInspectionCase } from "@/lib/actions/transfers";

// ─── Disposition options — design.md §6.3 ────────────────────────────────────

type DispositionType = "store_as_is" | "inspect_further" | "flag_for_review";

// Maps the floor's three simplified disposition choices to the real
// inspection_dispositions.disposition_type value for this case's context.
function resolveDispositionType(
  contextType: string,
  uiValue: DispositionType,
): string {
  switch (uiValue) {
    case "store_as_is":
      return contextType === "inbound" ? "store" : "return_to_stock";
    case "inspect_further":
      return "hold";
    case "flag_for_review":
      return contextType === "inbound" ? "quarantine" : "reject";
    default:
      return "hold";
  }
}

interface DispositionOption {
  value: DispositionType;
  label: string;
  description: string;
  // Tailwind classes for the selection card background/border
  selectedClasses: string;
  unselectedClasses: string;
}

const DISPOSITION_OPTIONS: DispositionOption[] = [
  {
    value: "store_as_is",
    label: "Store as-is",
    description: "Item passes inspection — return to standard storage location.",
    selectedClasses: "bg-status-available/10 border-status-available",
    unselectedClasses: "bg-white/5 border-white/20",
  },
  {
    value: "inspect_further",
    label: "Inspect Further",
    description:
      "Hold for additional inspection — item remains at current location.",
    selectedClasses: "bg-status-pending/10 border-status-pending",
    unselectedClasses: "bg-white/5 border-white/20",
  },
  {
    value: "flag_for_review",
    label: "Flag for Review",
    description:
      "Non-conformance detected — route to supervisor for resolution.",
    selectedClasses: "bg-status-held/10 border-status-held",
    unselectedClasses: "bg-white/5 border-white/20",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ disposition?: string; result?: string; reason?: string }>;
}

export default async function InspectionDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { disposition: selectedDisposition, result, reason: errorReason } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: inspection.perform required to view.
  const permResult = await requirePermission(resolver, "inspection.perform");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  // Gate: inspection.resolve required to submit a disposition — two-person
  // separation (02-rbac-roles §3.2). warehouse_staff (inspection.perform
  // only) can view but not resolve; supervisors hold inspection.resolve.
  const canResolve =
    (await requirePermission(resolver, "inspection.resolve")).kind === "authorized";

  const inspection = await getInspectionCase(db, id);
  if (!inspection) {
    notFound();
  }

  // Only allow submission when case is open (and the session can resolve it).
  const isOpen = inspection.status === "open";

  // ─── Server action — resolveInspectionCase(resolver, id, { disposition }) ──
  // Re-checks inspection.resolve itself (fail-closed even if a client somehow
  // POSTs directly to this action with the form hidden).
  async function handleSubmitInspection(formData: FormData): Promise<void> {
    "use server";
    const dispositionValue = ((formData.get("disposition") as string | null) ??
      "store_as_is") as DispositionType;
    const inspectedQty = parseInt(
      (formData.get("inspectedQty") as string | null) ?? "0",
      10
    );
    const passedQty = parseInt(
      (formData.get("passedQty") as string | null) ?? "0",
      10
    );
    const failedQty = parseInt(
      (formData.get("failedQty") as string | null) ?? "0",
      10
    );
    const notesInput = (formData.get("notes") as string | null) ?? "";

    const actionResolver = await createPageResolver();
    const dispositionType = resolveDispositionType(
      inspection!.contextType,
      dispositionValue,
    );
    const combinedNotes =
      `Passed: ${passedQty}, Failed: ${failedQty}` +
      (notesInput ? ` — ${notesInput}` : "");

    const submitResult = await resolveInspectionCase(actionResolver, id, {
      dispositionType,
      quantityAffected: inspectedQty,
      notes: combinedNotes,
    });

    if (submitResult.ok) {
      redirect(`/inspection/${id}?result=submitted`);
    } else {
      redirect(
        `/inspection/${id}?result=error&reason=${encodeURIComponent(submitResult.errors.join(", "))}`
      );
    }
  }

  // Submission success flash — brand-design-system.md §9: scan/result feedback
  // is a solid color block, not a gradient. Full-screen style for high-priority
  // floor feedback.
  const showSuccess = result === "submitted";
  const showError = result === "error";

  return (
    // Floor screen — solid bg-brand-navy, no glassmorphism, 16px padding.
    // brand-design-system.md §6: floor never gets Level 1 glassmorphism.
    <div className="flex min-h-screen flex-col bg-brand-navy">
      {/* Top bar — back link + inspection reference */}
      <div className="bg-brand-navy px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Back link — h-14 (56px) floor touch target per §3 */}
          <Link
            href="/inspection"
            className="inline-flex h-14 items-center gap-2 font-body text-body-md text-white
                       active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100
                       focus:outline-none focus:ring-2 focus:ring-white"
          >
            <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
            <span>Inspections</span>
          </Link>
          {/* Source reference — Roboto Mono per §9. Raw sourceRefType/sourceRefId;
              inspection_cases.source_ref_id is a polymorphic reference (design.md §2)
              with no formatted business document number resolved here. */}
          <span className="font-mono text-mono-lg text-white/70">
            {inspection.sourceRefType}:{inspection.sourceRefId.slice(0, 8)}
          </span>
        </div>
      </div>

      {/* Main content — flex-1, single-column, 16px padding */}
      <div className="flex flex-1 flex-col px-4 pb-4">
        {/* Success feedback — solid color block per §9 full-screen flash pattern */}
        {showSuccess && (
          <div
            role="status"
            aria-live="assertive"
            className="mb-4 rounded-xl bg-status-available border border-status-available px-4 py-4"
          >
            {/* WCAG AAA: brand-navy on status-available = high contrast */}
            <p className="font-heading font-bold text-headline-md text-on-surface">
              ✓ Inspection Submitted
            </p>
            <p className="mt-1 font-body text-body-md text-brand-navy/80">
              The inspection case has been recorded. Redirecting…
            </p>
          </div>
        )}

        {/* Error feedback — mirrors success block styling with held-status color */}
        {showError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-4 rounded-xl bg-status-held border border-status-held px-4 py-4"
          >
            <p className="font-heading font-bold text-headline-md text-white">
              Submission failed
            </p>
            <p className="mt-1 font-body text-body-md text-white/80">
              {errorReason ?? "Could not record this inspection. Try again."}
            </p>
          </div>
        )}

        {/* Item context card — solid surface, Level 2 shadow, no glassmorphism */}
        <div className="rounded-xl bg-white/10 border border-white/20 p-4">
          {/* Item name — Fira Sans SemiBold, headline-md; floor min 16px §2 */}
          <h1 className="font-heading font-extrabold text-headline-md text-white">
            {inspection.itemName}
          </h1>
          {/* Item code — Roboto Mono per §9 */}
          <p className="mt-1 font-mono text-mono-lg text-white/70">
            {inspection.itemCode}
          </p>
          {/* Party — VMI cases carry an owner party; Trading/Supplies too (partyId is required) */}
          <p className="mt-1 font-body text-body-md text-white/70">
            {inspection.partyName}
          </p>
          {/* Lot + location context — body-md (16px) per §2 floor minimum */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="font-label text-body-md text-white/50">Lot</p>
              <p className="font-mono text-mono-lg text-white">
                {inspection.lotNumber}
              </p>
            </div>
            <div>
              <p className="font-label text-body-md text-white/50">Location</p>
              <p className="font-mono text-mono-lg text-white">
                {inspection.locationLabel ?? "Unavailable"}
              </p>
            </div>
            <div>
              <p className="font-label text-body-md text-white/50">Qty to Inspect</p>
              <p className="font-mono text-mono-lg text-white">
                {inspection.qtyToInspect} {inspection.itemUom}
              </p>
            </div>
            <div>
              <p className="font-label text-body-md text-white/50">Context</p>
              <p className="font-body text-body-md text-white capitalize">
                {inspection.contextType}
              </p>
            </div>
          </div>
        </div>

        {/* Inspection form — only shown when case is open AND this session
            holds inspection.resolve (two-person separation — see top-of-file
            comment). A warehouse_staff session that opened this case never
            gets the resolve form, even while the case is open. */}
        {isOpen && !canResolve && (
          <div className="mt-4 rounded-xl bg-white/10 border border-white/20 p-4">
            <p className="font-body text-body-md text-white/70">
              This case is open and awaiting a supervisor&apos;s resolution.
              You do not have the{" "}
              <span className="font-mono text-mono-md text-white">
                inspection.resolve
              </span>{" "}
              capability required to record a disposition.
            </p>
          </div>
        )}
        {isOpen && canResolve ? (
          <form action={handleSubmitInspection} className="mt-4 flex flex-col gap-4">
            {/* ── Disposition selection — large tap targets per §3 ───────────── */}
            <fieldset>
              <legend className="font-label text-body-md text-white/70">
                Disposition
              </legend>
              <div className="mt-2 space-y-2">
                {DISPOSITION_OPTIONS.map((option) => {
                  const isSelected =
                    selectedDisposition === option.value ||
                    (!selectedDisposition && option.value === "store_as_is");
                  return (
                    <label
                      key={option.value}
                      // h-16 (64px) minimum floor tap target per §3 — radio-style card
                      className={`flex h-16 cursor-pointer items-center gap-4 rounded-xl border-2 px-4
                                  active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100
                                  ${isSelected ? option.selectedClasses : option.unselectedClasses}`}
                    >
                      <input
                        type="radio"
                        name="disposition"
                        value={option.value}
                        defaultChecked={isSelected}
                        className="sr-only"
                      />
                      {/* Visual radio indicator — visible circle, accessible label */}
                      <span
                        aria-hidden="true"
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                          isSelected
                            ? "border-current bg-current/20"
                            : "border-white/40"
                        }`}
                      >
                        {isSelected && (
                          <span className="block h-2.5 w-2.5 rounded-full bg-current" />
                        )}
                      </span>
                      <div className="min-w-0">
                        {/* Label — body-md minimum per floor §2 rule */}
                        <p className="font-label text-body-md text-white">
                          {option.label}
                        </p>
                        <p className="font-body text-body-md text-white/60 truncate">
                          {option.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* ── Quantity fields ─────────────────────────────────────────────── */}
            <div className="rounded-xl bg-white/10 border border-white/20 p-4">
              <p className="font-label text-body-md text-white/70 mb-3">
                Quantities
              </p>
              <div className="grid grid-cols-3 gap-3">
                {/* Inspected Qty */}
                <div>
                  <label
                    htmlFor="inspectedQty"
                    className="block font-label text-body-md text-white/70"
                  >
                    Inspected
                  </label>
                  <input
                    id="inspectedQty"
                    name="inspectedQty"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={inspection.qtyToInspect}
                    defaultValue={inspection.qtyToInspect}
                    // h-14 (56px) floor default touch target — §3
                    className="mt-1 h-14 w-full rounded-xl border border-white/20 bg-white/15 px-3 font-mono text-mono-lg text-white
                               focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent
                               placeholder:text-white/40"
                    aria-label="Inspected quantity"
                  />
                </div>
                {/* Passed Qty */}
                <div>
                  <label
                    htmlFor="passedQty"
                    className="block font-label text-body-md text-white/70"
                  >
                    Passed
                  </label>
                  <input
                    id="passedQty"
                    name="passedQty"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    defaultValue={0}
                    className="mt-1 h-14 w-full rounded-xl border border-white/20 bg-white/15 px-3 font-mono text-mono-lg text-white
                               focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent
                               placeholder:text-white/40"
                    aria-label="Passed quantity"
                  />
                </div>
                {/* Failed Qty */}
                <div>
                  <label
                    htmlFor="failedQty"
                    className="block font-label text-body-md text-white/70"
                  >
                    Failed
                  </label>
                  <input
                    id="failedQty"
                    name="failedQty"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    defaultValue={0}
                    className="mt-1 h-14 w-full rounded-xl border border-white/20 bg-white/15 px-3 font-mono text-mono-lg text-white
                               focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent
                               placeholder:text-white/40"
                    aria-label="Failed quantity"
                  />
                </div>
              </div>
            </div>

            {/* ── Notes field ─────────────────────────────────────────────────── */}
            <div>
              <label
                htmlFor="notes"
                className="block font-label text-body-md text-white/70"
              >
                Notes{" "}
                <span className="font-body text-body-md text-white/40">
                  (optional)
                </span>
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Add any observations, remarks, or exception notes…"
                className="mt-1 w-full rounded-xl border border-white/20 bg-white/15 px-4 py-3 font-body text-body-md text-white
                           focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent
                           placeholder:text-white/40 resize-none"
              />
            </div>

            {/* ── Submit CTA — bottom, full-width, h-16 (64px) ───────────────── */}
            {/* brand-design-system.md §3: primary action in bottom third,
                full-width, always visible without scrolling. bg-brand-red,
                text-white, active: scale not hover:. WCAG AAA (7:1 white on
                brand-red ≈ 5.7:1 — boosted by font-bold). */}
            {/* White on brand-red: 7.31:1 (AAA) — resolved 2026-08-12 by darkening brand-red to #9A3412; see brand-design-system.md §1.1. */}
            <button
              type="submit"
              className="mt-2 flex h-16 w-full items-center justify-center rounded-xl bg-primary font-label text-body-md uppercase tracking-wide text-white
                         active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100
                         focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
            >
              Submit Inspection
            </button>
          </form>
        ) : !isOpen ? (
          // Non-open case — read-only view
          <div className="mt-4 rounded-xl bg-white/10 border border-white/20 p-4">
            <p className="font-body text-body-md text-white/70">
              This inspection case is{" "}
              <span className="font-label text-body-md text-white uppercase">
                {inspection.status}
              </span>{" "}
              and cannot be edited.
            </p>
            <Link
              href="/inspection"
              className="mt-4 flex h-16 w-full items-center justify-center rounded-xl bg-brand-navy border border-white/20 font-label text-body-md uppercase text-white
                         active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100
                         focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
            >
              Back to Queue
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
