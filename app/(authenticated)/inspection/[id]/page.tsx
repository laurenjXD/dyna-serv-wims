// Inspection Detail — floor/office inspection flow for a single inspection case.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §6.1 (inspection contexts),
//     §6.2 (context isolation), §6.3 (disposition table with balance effects)
//   specs/11-transfer-and-inspection/requirements.md R3, R3.1–R3.4
//   specs/00-steering/brand-design-system.md

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
  MapPin,
  Layers,
  FlaskConical,
  Building2,
  FileCheck,
  ShieldAlert,
} from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getInspectionCase } from "@/lib/db/queries/transfers";
import { resolveInspectionCase } from "@/lib/actions/transfers";

// ─── Disposition options — design.md §6.3 ────────────────────────────────────

type DispositionType = "store_as_is" | "inspect_further" | "flag_for_review";

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
  badge: string;
  description: string;
  icon: typeof CheckCircle2;
  accentColor: string;
  selectedClasses: string;
}

const DISPOSITION_OPTIONS: DispositionOption[] = [
  {
    value: "store_as_is",
    label: "Store as-is (Pass)",
    badge: "Passed Inspection",
    description: "Item meets quality standards. Move to standard storage racks for active picking and issuance.",
    icon: CheckCircle2,
    accentColor: "text-emerald-600 bg-emerald-50 border-emerald-200",
    selectedClasses: "border-emerald-600 bg-emerald-50/50 shadow-sm ring-2 ring-emerald-600/20",
  },
  {
    value: "inspect_further",
    label: "Inspect Further (Hold)",
    badge: "Hold / Secondary Review",
    description: "Hold for in-depth lab testing or secondary verification. Item remains stored in inspection bay.",
    icon: Clock,
    accentColor: "text-amber-600 bg-amber-50 border-amber-200",
    selectedClasses: "border-amber-600 bg-amber-50/50 shadow-sm ring-2 ring-amber-600/20",
  },
  {
    value: "flag_for_review",
    label: "Flag for Review / Quarantine",
    badge: "Non-Conformance",
    description: "Defect or damage detected. Escalate to supervisor and vendor for disposition or RMA return.",
    icon: AlertTriangle,
    accentColor: "text-rose-600 bg-rose-50 border-rose-200",
    selectedClasses: "border-rose-600 bg-rose-50/50 shadow-sm ring-2 ring-rose-600/20",
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

  // Gate: inspection.resolve required to submit a disposition.
  const canResolve =
    (await requirePermission(resolver, "inspection.resolve")).kind === "authorized";

  const inspection = await getInspectionCase(db, id);
  if (!inspection) {
    notFound();
  }

  const isOpen = inspection.status === "open";

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

  const showSuccess = result === "submitted";
  const showError = result === "error";

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* ── Breadcrumb & Top Navigation ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory?tab=inspection"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text-secondary shadow-sm transition-all hover:border-primary/30 hover:bg-primary/[0.04] hover:text-primary active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Back to Inspection Queue"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Inspection Case
              </span>
              <span className="font-mono text-xs text-text-secondary/60">·</span>
              <span className="font-mono text-xs font-bold text-primary">
                {inspection.sourceRefType}:{inspection.sourceRefId.slice(0, 8)}
              </span>
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-text-primary">
              Quality Inspection Review
            </h1>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-label text-xs font-bold uppercase tracking-wider ${
              isOpen
                ? "bg-amber-100 text-amber-800 border border-amber-300"
                : "bg-emerald-100 text-emerald-800 border border-emerald-300"
            }`}
          >
            {isOpen ? <Clock size={14} /> : <CheckCircle2 size={14} />}
            {inspection.status}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 font-label text-xs font-semibold text-text-secondary">
            <FlaskConical size={13} className="text-primary" />
            {inspection.contextType.toUpperCase()} Context
          </span>
        </div>
      </div>

      {/* ── Alert Banners ──────────────────────────────────────────────── */}
      {showSuccess && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 shadow-sm backdrop-blur-sm"
        >
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="font-heading text-body-md font-bold text-emerald-950">
              Inspection Disposition Recorded Successfully
            </p>
            <p className="mt-0.5 font-body text-body-sm text-emerald-800">
              The disposition has been committed to inventory ledgers. You may now return to the queue.
            </p>
            <div className="mt-3">
              <Link
                href="/inventory?tab=inspection"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 font-label text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
              >
                <ArrowLeft size={14} /> Return to Queue
              </Link>
            </div>
          </div>
        </div>
      )}

      {showError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 shadow-sm backdrop-blur-sm"
        >
          <ShieldAlert size={20} className="mt-0.5 shrink-0 text-rose-600" />
          <div>
            <p className="font-heading text-body-md font-bold text-rose-950">
              Submission Failed
            </p>
            <p className="mt-0.5 font-body text-body-sm text-rose-800">
              {errorReason ?? "Could not record this inspection disposition. Please verify inputs and try again."}
            </p>
          </div>
        </div>
      )}

      {/* ── Item & Location Overview Card ─────────────────────────────── */}
      <section aria-labelledby="item-summary-heading" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-elevation-1">
        <div className="border-b border-border bg-surface px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-label text-xs font-bold uppercase tracking-wider text-text-secondary">
                Inspected Article
              </p>
              <h2 id="item-summary-heading" className="font-heading text-xl font-bold text-text-primary">
                {inspection.itemName}
              </h2>
            </div>
            <span className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-1 font-mono text-xs font-bold text-primary">
              {inspection.itemCode}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4 bg-surface/50">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Building2 size={18} />
            </div>
            <div className="min-w-0">
              <p className="font-label text-xs font-semibold text-text-secondary">Partner Organization</p>
              <p className="truncate font-heading text-body-md font-bold text-text-primary">
                {inspection.partyName}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
              <Layers size={18} />
            </div>
            <div className="min-w-0">
              <p className="font-label text-xs font-semibold text-text-secondary">Lot Number</p>
              <p className="truncate font-mono text-body-md font-bold text-text-primary">
                {inspection.lotNumber}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <MapPin size={18} />
            </div>
            <div className="min-w-0">
              <p className="font-label text-xs font-semibold text-text-secondary">Current Location</p>
              <p className="truncate font-mono text-body-md font-bold text-text-primary">
                {inspection.locationLabel ?? "Unassigned Bay"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Package size={18} />
            </div>
            <div className="min-w-0">
              <p className="font-label text-xs font-semibold text-text-secondary">Qty to Inspect</p>
              <p className="font-mono text-body-md font-bold text-text-primary">
                {inspection.qtyToInspect} <span className="font-normal text-text-secondary text-xs">{inspection.itemUom}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Inspection Resolution Form ─────────────────────────────────── */}
      {isOpen && !canResolve && (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-elevation-1">
          <div className="flex items-center gap-3 text-text-secondary">
            <Clock size={20} className="text-amber-600" />
            <p className="font-body text-body-md">
              This case is open and awaiting supervisor resolution. You hold view-only{" "}
              <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs font-bold text-text-primary">
                inspection.perform
              </code>{" "}
              permissions.
            </p>
          </div>
        </div>
      )}

      {isOpen && canResolve ? (
        <form action={handleSubmitInspection} className="space-y-6">
          {/* Disposition Radio Cards */}
          <section aria-labelledby="disposition-heading" className="rounded-2xl border border-border bg-surface p-6 shadow-elevation-1">
            <div className="mb-4 flex items-center gap-2">
              <FileCheck size={18} className="text-primary" />
              <h3 id="disposition-heading" className="font-heading text-body-md font-bold text-text-primary">
                1. Select Inspection Outcome & Disposition
              </h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {DISPOSITION_OPTIONS.map((option) => {
                const isSelected =
                  selectedDisposition === option.value ||
                  (!selectedDisposition && option.value === "store_as_is");
                const Icon = option.icon;

                return (
                  <label
                    key={option.value}
                    className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all duration-200 hover:border-primary/40 hover:bg-background/80 ${
                      isSelected ? option.selectedClasses : "border-border bg-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="disposition"
                      value={option.value}
                      defaultChecked={isSelected}
                      className="sr-only"
                    />
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${option.accentColor}`}>
                          <Icon size={16} />
                        </span>
                        {isSelected && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                            <CheckCircle2 size={13} />
                          </span>
                        )}
                      </div>
                      <p className="mt-3 font-heading text-body-md font-bold text-text-primary">
                        {option.label}
                      </p>
                      <p className="mt-1 font-body text-xs text-text-secondary leading-relaxed">
                        {option.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Quantity Audit Matrix */}
          <section aria-labelledby="quantities-heading" className="rounded-2xl border border-border bg-surface p-6 shadow-elevation-1">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-primary" />
                <h3 id="quantities-heading" className="font-heading text-body-md font-bold text-text-primary">
                  2. Inspection Quantities Breakdown
                </h3>
              </div>
              <span className="font-mono text-xs text-text-secondary">
                Max Available: {inspection.qtyToInspect} {inspection.itemUom}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="inspectedQty"
                  className="block font-label text-xs font-bold text-text-secondary uppercase tracking-wider"
                >
                  Total Inspected
                </label>
                <input
                  id="inspectedQty"
                  name="inspectedQty"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={inspection.qtyToInspect}
                  defaultValue={inspection.qtyToInspect}
                  className="mt-1.5 h-12 w-full rounded-xl border border-border bg-surface px-3.5 font-mono text-body-md font-bold text-text-primary shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label
                  htmlFor="passedQty"
                  className="block font-label text-xs font-bold text-emerald-700 uppercase tracking-wider"
                >
                  Passed Quantity
                </label>
                <input
                  id="passedQty"
                  name="passedQty"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  defaultValue={inspection.qtyToInspect}
                  className="mt-1.5 h-12 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3.5 font-mono text-body-md font-bold text-emerald-950 shadow-sm transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="failedQty"
                  className="block font-label text-xs font-bold text-rose-700 uppercase tracking-wider"
                >
                  Failed / Defect Qty
                </label>
                <input
                  id="failedQty"
                  name="failedQty"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  defaultValue={0}
                  className="mt-1.5 h-12 w-full rounded-xl border border-rose-200 bg-rose-50/40 px-3.5 font-mono text-body-md font-bold text-rose-950 shadow-sm transition-all focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            </div>
          </section>

          {/* Observations & Notes */}
          <section aria-labelledby="notes-heading" className="rounded-2xl border border-border bg-surface p-6 shadow-elevation-1">
            <h3 id="notes-heading" className="font-heading text-body-md font-bold text-text-primary">
              3. Observations & Inspection Remarks
            </h3>
            <p className="mt-0.5 font-body text-xs text-text-secondary">
              Record physical inspection notes, package conditions, or non-conformance details for audit trails.
            </p>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="e.g. Minor outer box abrasion observed. All internal seals intact and passed electrical resistance check."
              className="mt-3 w-full rounded-xl border border-border bg-surface px-4 py-3 font-body text-body-sm text-text-primary shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-text-secondary/50"
            />
          </section>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <Link
              href="/inventory?tab=inspection"
              className="rounded-xl border border-border bg-surface px-5 py-3 font-label text-body-md font-bold text-text-secondary hover:bg-background active:scale-[0.98] transition-all"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-primary px-8 py-3 font-label text-body-md font-bold text-white shadow-sm hover:bg-primary-hover active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-all"
            >
              <CheckCircle2 size={18} />
              Submit Inspection Disposition
            </button>
          </div>
        </form>
      ) : !isOpen ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-elevation-1">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={24} />
          </div>
          <h3 className="mt-3 font-heading text-lg font-bold text-text-primary">
            Inspection Case Closed
          </h3>
          <p className="mt-1 font-body text-body-sm text-text-secondary">
            This case has already been resolved and finalized.
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              href="/inventory?tab=inspection"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-label text-body-md font-bold text-white shadow-sm hover:bg-primary-hover active:scale-95 transition-all"
            >
              <ArrowLeft size={16} />
              Back to Queue
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

