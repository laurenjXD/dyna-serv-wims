import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";

// ─── Mock data (TODO: wire to real inspection_cases query) ───────────────────

interface InspectionCaseDetail {
  id: string;
  contextType: "inbound" | "transfer";
  lotNumber: string;
  itemName: string;
  itemCode: string;
  locationCode: string;
  qtyToInspect: number;
  unit: string;
  sourceRef: string;
  status: "open" | "passed" | "failed" | "cancelled";
  openedAt: string;
}

function getMockInspectionCase(id: string): InspectionCaseDetail | null {
  const cases: InspectionCaseDetail[] = [
    {
      id: "mock-ic-001",
      contextType: "transfer",
      lotNumber: "LOT-2026-0042",
      itemName: "Hydraulic Coupling Assembly",
      itemCode: "HYD-CUP-001",
      locationCode: "LOC-A03",
      qtyToInspect: 12,
      unit: "PCS",
      sourceRef: "TRF-2026-001",
      status: "open",
      openedAt: new Date().toISOString(),
    },
    {
      id: "mock-ic-002",
      contextType: "inbound",
      lotNumber: "LOT-2026-0031",
      itemName: "Pressure Sensor Unit",
      itemCode: "PRE-SEN-007",
      locationCode: "INSPECT-01",
      qtyToInspect: 5,
      unit: "PCS",
      sourceRef: "WRR-2026-008",
      status: "open",
      openedAt: new Date().toISOString(),
    },
  ];
  return cases.find((c) => c.id === id) ?? null;
}

// ─── Disposition options ──────────────────────────────────────────────────────

type DispositionType = "store_as_is" | "inspect_further" | "flag_for_review";

interface DispositionOption {
  value: DispositionType;
  label: string;
  description: string;
  selectedClasses: string;
  unselectedClasses: string;
}

const DISPOSITION_OPTIONS: DispositionOption[] = [
  {
    value: "store_as_is",
    label: "Store as-is",
    description: "Item passes inspection — return to standard storage location.",
    selectedClasses: "bg-primary-container border-primary shadow-sm",
    unselectedClasses: "bg-surface-container-highest border-transparent opacity-80",
  },
  {
    value: "inspect_further",
    label: "Inspect Further",
    description:
      "Hold for additional inspection — item remains at current location.",
    selectedClasses: "bg-tertiary-container border-tertiary shadow-sm",
    unselectedClasses: "bg-surface-container-highest border-transparent opacity-80",
  },
  {
    value: "flag_for_review",
    label: "Flag for Review",
    description:
      "Non-conformance detected — route to supervisor for resolution.",
    selectedClasses: "bg-error-container border-error shadow-sm",
    unselectedClasses: "bg-surface-container-highest border-transparent opacity-80",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ disposition?: string; result?: string }>;
}

export default async function InspectionDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { disposition: selectedDisposition, result } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: inspection.perform required.
  const permResult = await requirePermission(resolver, "inspection.perform");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const inspection = getMockInspectionCase(id);
  if (!inspection) {
    notFound();
  }

  // Only allow submission when case is open.
  const isOpen = inspection.status === "open";

  // ─── Placeholder server action ─────────────────────────────────────────────
  async function handleSubmitInspection(formData: FormData): Promise<void> {
    "use server";
    const disposition = formData.get("disposition") as string | null;
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
    const notes = (formData.get("notes") as string | null) ?? "";

    void { disposition, inspectedQty, passedQty, failedQty, notes };
    redirect(`/inspection/${id}?result=submitted`);
  }

  const showSuccess = result === "submitted";

  return (
    <div className="mx-auto w-full max-w-md animate-in fade-in duration-300 pb-[100px]">
      {/* Top bar */}
      <div className="mb-md rounded-xl bg-surface-container-lowest p-sm shadow-sm border border-outline-variant flex items-center justify-between">
        <Link
          href="/inspection"
          className="flex h-11 items-center gap-xs rounded-full px-sm hover:bg-surface-container-highest transition-colors font-label text-label-md text-on-surface"
        >
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
          <span>Queue</span>
        </Link>
        <span className="font-mono text-label-lg font-semibold text-primary px-sm">
          {inspection.sourceRef}
        </span>
      </div>

      <div className="flex flex-1 flex-col">
        {/* Success feedback */}
        {showSuccess && (
          <div
            role="status"
            aria-live="assertive"
            className="mb-md rounded-xl bg-primary-container border border-primary p-md shadow-sm"
          >
            <p className="font-heading text-title-md font-semibold text-on-primary-container flex items-center gap-xs">
              <span className="material-symbols-outlined text-[24px]">check_circle</span>
              Inspection Submitted
            </p>
            <p className="mt-xs font-body text-body-md text-on-primary-container/80">
              The inspection case has been recorded. Redirecting…
            </p>
          </div>
        )}

        {/* Item context card */}
        <div className="rounded-xl bg-surface-container-lowest border border-outline-variant p-md shadow-sm mb-md">
          <h1 className="font-heading text-display-sm font-bold text-on-surface tracking-tight leading-tight">
            {inspection.itemName}
          </h1>
          <p className="mt-xs font-mono text-body-lg text-on-surface-variant font-medium">
            {inspection.itemCode}
          </p>
          
          <div className="mt-md grid grid-cols-2 gap-md border-t border-outline-variant/50 pt-md">
            <div>
              <p className="font-label text-label-sm text-on-surface-variant">Lot Number</p>
              <p className="font-mono text-body-md text-on-surface mt-xs">{inspection.lotNumber}</p>
            </div>
            <div>
              <p className="font-label text-label-sm text-on-surface-variant">Location</p>
              <p className="font-mono text-body-md text-on-surface mt-xs">{inspection.locationCode}</p>
            </div>
            <div>
              <p className="font-label text-label-sm text-on-surface-variant">Qty to Inspect</p>
              <p className="font-mono text-body-md text-on-surface mt-xs font-semibold">
                {inspection.qtyToInspect} {inspection.unit}
              </p>
            </div>
            <div>
              <p className="font-label text-label-sm text-on-surface-variant">Context</p>
              <p className="font-body text-body-md text-on-surface mt-xs capitalize">
                {inspection.contextType}
              </p>
            </div>
          </div>
        </div>

        {/* Inspection form */}
        {isOpen ? (
          <form action={handleSubmitInspection} className="flex flex-col gap-md">
            {/* Disposition selection */}
            <fieldset className="rounded-xl bg-surface-container-lowest border border-outline-variant p-md shadow-sm">
              <legend className="font-heading text-title-md font-semibold text-on-surface mb-md">
                Disposition
              </legend>
              <div className="space-y-sm">
                {DISPOSITION_OPTIONS.map((option) => {
                  const isSelected =
                    selectedDisposition === option.value ||
                    (!selectedDisposition && option.value === "store_as_is");
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-md rounded-xl border-2 p-md transition-all active:scale-[0.99] ${
                        isSelected ? option.selectedClasses : option.unselectedClasses
                      }`}
                    >
                      <input
                        type="radio"
                        name="disposition"
                        value={option.value}
                        defaultChecked={isSelected}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 mt-0.5 ${
                          isSelected
                            ? "border-current bg-current/20"
                            : "border-outline-variant"
                        }`}
                      >
                        {isSelected && (
                          <span className="block h-2.5 w-2.5 rounded-full bg-current" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className={`font-label text-label-lg ${isSelected ? 'text-on-surface font-semibold' : 'text-on-surface'}`}>
                          {option.label}
                        </p>
                        <p className={`mt-xs font-body text-body-md ${isSelected ? 'text-on-surface/80' : 'text-on-surface-variant'}`}>
                          {option.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Quantity fields */}
            <div className="rounded-xl bg-surface-container-lowest border border-outline-variant p-md shadow-sm">
              <p className="font-heading text-title-md font-semibold text-on-surface mb-md">
                Quantities
              </p>
              <div className="grid grid-cols-3 gap-sm">
                <div>
                  <label htmlFor="inspectedQty" className="block font-label text-label-sm text-on-surface-variant mb-xs">
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
                    className="h-14 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-mono text-title-sm text-on-surface text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    aria-label="Inspected quantity"
                  />
                </div>
                <div>
                  <label htmlFor="passedQty" className="block font-label text-label-sm text-on-surface-variant mb-xs">
                    Passed
                  </label>
                  <input
                    id="passedQty"
                    name="passedQty"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    defaultValue={0}
                    className="h-14 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-mono text-title-sm text-on-surface text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    aria-label="Passed quantity"
                  />
                </div>
                <div>
                  <label htmlFor="failedQty" className="block font-label text-label-sm text-on-surface-variant mb-xs">
                    Failed
                  </label>
                  <input
                    id="failedQty"
                    name="failedQty"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    defaultValue={0}
                    className="h-14 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-mono text-title-sm text-on-surface text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    aria-label="Failed quantity"
                  />
                </div>
              </div>
            </div>

            {/* Notes field */}
            <div className="rounded-xl bg-surface-container-lowest border border-outline-variant p-md shadow-sm">
              <label htmlFor="notes" className="block font-heading text-title-md font-semibold text-on-surface mb-xs">
                Notes <span className="font-body text-body-sm text-on-surface-variant font-normal">(optional)</span>
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Add any observations, remarks, or exception notes…"
                className="mt-sm w-full rounded-md border border-outline-variant bg-surface-container-highest px-4 py-3 font-body text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
              />
            </div>

            {/* Submit CTA */}
            <div className="fixed bottom-[80px] left-0 w-full z-40 px-4 md:absolute md:bottom-0 md:px-0">
              <div className="mx-auto flex max-w-md items-center gap-sm rounded-2xl bg-surface-container-lowest/80 p-sm shadow-elevation-3 backdrop-blur-md border border-outline-variant/50">
                <button
                  type="submit"
                  className="flex h-12 w-full items-center justify-center gap-xs rounded-xl bg-primary font-label text-label-lg text-on-primary shadow-sm hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                  Submit Inspection
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="rounded-xl bg-surface-container-lowest border border-outline-variant p-md shadow-sm text-center">
            <span className="material-symbols-outlined text-[48px] text-on-surface-variant/50 mb-sm block">inventory_2</span>
            <p className="font-body text-body-md text-on-surface-variant">
              This inspection case is{" "}
              <span className="font-label text-label-md text-on-surface uppercase font-semibold">
                {inspection.status}
              </span>{" "}
              and cannot be edited.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
