// Create WRR — office pre-receiving form.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §5 (pre-receiving WRR design), §5.1
//     (expected line fields)
//   specs/07-incoming-receiving/requirements.md R1 (CIPL/WRR pre-receiving staging)
//   specs/00-steering/brand-design-system.md §6 (office surface), §3 (touch targets)
//
// Surface: Office. Permission gate: receiving.confirm.
// Note: The createWrr action (lib/actions/receiving.ts) inserts the wrr_documents
// row but currently does not insert wrr_items rows from the lines array. The form
// submits all line data; future extension of the action will persist lines.

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { createWrr } from "@/lib/actions/receiving";
import { WrrLineItems } from "./_components/wrr-line-items";

// ─── Inline server action ─────────────────────────────────────────────────────

// Parses FormData from the create-WRR form into the structured input shape
// required by validateCreateWrr, then delegates to the createWrr server action.
// Lines are encoded as `line_N_fieldName` fields with a `lineCount` summary.
async function handleCreateWrr(formData: FormData): Promise<void> {
  "use server";
  const actionResolver = await createPageResolver();

  const lineCount = parseInt(
    (formData.get("lineCount") as string | null) ?? "0",
    10
  );

  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    const rawExpectedQty = formData.get(`line_${i}_expectedQty`) as string | null;
    const rawUnitCbm = formData.get(`line_${i}_unitCbm`) as string | null;
    lines.push({
      lotNumber: (formData.get(`line_${i}_lotNumber`) as string | null) ?? "",
      expectedQty: rawExpectedQty ? parseFloat(rawExpectedQty) : NaN,
      unitCbm: rawUnitCbm ? parseFloat(rawUnitCbm) : NaN,
      uom: (formData.get(`line_${i}_uom`) as string | null) ?? "",
      disposition:
        ((formData.get(`line_${i}_disposition`) as string | null) ?? "store") as
          | "store"
          | "inspect",
      putawayLocationId:
        (formData.get(`line_${i}_putawayLocationId`) as string | null) || null,
      itemCode:
        (formData.get(`line_${i}_itemCode`) as string | null) || null,
      customerItemCode:
        (formData.get(`line_${i}_customerItemCode`) as string | null) || null,
    });
  }

  const input = {
    vendorPartyId:
      (formData.get("vendorPartyId") as string | null) ?? "",
    flowType:
      (formData.get("flowType") as string | null) ?? "",
    commercialInvoiceNo:
      (formData.get("commercialInvoiceNo") as string | null) || null,
    ciplFileUrl:
      (formData.get("ciplFileUrl") as string | null) || null,
    pezaNumber:
      (formData.get("pezaNumber") as string | null) || null,
    ipNumber:
      (formData.get("ipNumber") as string | null) || null,
    mawbMblNumber:
      (formData.get("mawbMblNumber") as string | null) || null,
    lines,
  };

  const result = await createWrr(actionResolver, db, input);
  if (result.ok) {
    redirect(`/receiving/${result.wrrId}`);
  }

  // Redirect with encoded errors. The page re-reads them via searchParams.
  const encodedErrors = encodeURIComponent(result.errors.join("|"));
  redirect(`/receiving/new?errors=${encodedErrors}`);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ errors?: string }>;
}

export default async function NewWrrPage({ searchParams }: PageProps) {
  const { errors: encodedErrors } = await searchParams;
  const resolver = await createPageResolver();

  // Gate: receiving.create — creation surface only requires create capability,
  // not confirm (confirming is a separate elevated permission).
  const permResult = await requirePermission(resolver, "receiving.create");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const errors = encodedErrors
    ? decodeURIComponent(encodedErrors).split("|").filter(Boolean)
    : [];

  return (
    <div className="mx-auto max-w-container">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1 font-body text-body-sm text-text-grey">
          <li>
            <Link
              href="/receiving"
              className="inline-flex h-11 items-center rounded hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Receiving Queue
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-body text-body-sm text-on-surface">
            New WRR
          </li>
        </ol>
      </nav>

      <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
        New Warehouse Receipt Record
      </h1>
      <p className="mt-1 font-body text-body-md text-text-grey">
        Encode the CIPL/packing-list reference and expected lines before
        physical receiving begins.
      </p>

      {/* Validation errors — shown when the server action returns errors */}
      {errors.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-md bg-status-held/10 px-4 py-3"
        >
          <p className="font-label text-label uppercase text-status-held">
            Validation errors
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {errors.map((err) => (
              <li key={err} className="font-body text-body-md text-status-held">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Create WRR form — standard office surface */}
      <form action={handleCreateWrr} className="mt-6 space-y-6">
        {/* Header section — office card, Level 1 elevation */}
        <div className="rounded-md bg-surface-white shadow-elevation-1 p-6">
          <h2 className="font-heading font-semibold text-data-display text-on-surface">
            Header Information
          </h2>

          {/* Full-width on mobile, two-column grid on desktop per task requirements */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {/* Vendor Party ID — required */}
            <div>
              <label
                htmlFor="vendorPartyId"
                className="block font-label text-label text-text-grey"
              >
                Vendor Party ID{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id="vendorPartyId"
                name="vendorPartyId"
                type="text"
                required
                placeholder="UUID of the vendor party"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* Flow Type — required */}
            <div>
              <label
                htmlFor="flowType"
                className="block font-label text-label text-text-grey"
              >
                Flow Type{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <select
                id="flowType"
                name="flowType"
                required
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <option value="">Select flow type…</option>
                <option value="vmi">VMI</option>
                <option value="trading">Trading</option>
                <option value="supplies">Supplies</option>
              </select>
            </div>

            {/* Commercial Invoice No — optional */}
            <div>
              <label
                htmlFor="commercialInvoiceNo"
                className="block font-label text-label text-text-grey"
              >
                Commercial Invoice No.
              </label>
              <input
                id="commercialInvoiceNo"
                name="commercialInvoiceNo"
                type="text"
                placeholder="CIPL / commercial invoice reference"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* CIPL File URL — optional */}
            <div>
              <label
                htmlFor="ciplFileUrl"
                className="block font-label text-label text-text-grey"
              >
                CIPL File URL
              </label>
              <input
                id="ciplFileUrl"
                name="ciplFileUrl"
                type="text"
                placeholder="Storage URL of the attached CIPL document"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* PEZA Number — optional */}
            <div>
              <label
                htmlFor="pezaNumber"
                className="block font-label text-label text-text-grey"
              >
                PEZA Number
              </label>
              <input
                id="pezaNumber"
                name="pezaNumber"
                type="text"
                placeholder="PEZA permit number"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* IP Number — optional */}
            <div>
              <label
                htmlFor="ipNumber"
                className="block font-label text-label text-text-grey"
              >
                IP Number
              </label>
              <input
                id="ipNumber"
                name="ipNumber"
                type="text"
                placeholder="Import permit number"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* MAWB/MBL Number — optional */}
            <div className="md:col-span-2">
              <label
                htmlFor="mawbMblNumber"
                className="block font-label text-label text-text-grey"
              >
                MAWB / MBL Number
              </label>
              <input
                id="mawbMblNumber"
                name="mawbMblNumber"
                type="text"
                placeholder="Master Air Waybill / Bill of Lading number"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>
          </div>
        </div>

        {/* Expected lines section */}
        <div className="rounded-md bg-surface-white shadow-elevation-1 p-6">
          <h2 className="font-heading font-semibold text-data-display text-on-surface">
            Expected Lines
          </h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            At least one line is required. Each line requires a lot number,
            expected quantity, unit CBM, UOM, disposition, and a storage
            location for store lines.
          </p>
          <div className="mt-4">
            {/* WrrLineItems is a client component — handles dynamic add/remove.
                All line inputs are rendered within this form and submitted with it. */}
            <WrrLineItems />
          </div>
        </div>

        {/* Form actions */}
        <div className="flex flex-wrap gap-3">
          {/* Primary CTA — brand-red per brand-design-system.md §9, h-11 office touch target */}
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Create WRR
          </button>
          <Link
            href="/receiving"
            className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-6 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
