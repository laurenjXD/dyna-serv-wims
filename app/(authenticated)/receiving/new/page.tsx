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
import { createWrr } from "@/lib/actions/receiving";
import { WrrLineItems } from "./_components/wrr-line-items";

// ─── Inline server action ─────────────────────────────────────────────────────

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

  const result = await createWrr(actionResolver, input);
  if (result.ok) {
    redirect(`/receiving/${result.wrrId}`);
  }

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

  const permResult = await requirePermission(resolver, "receiving.create");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const errors = encodedErrors
    ? decodeURIComponent(encodedErrors).split("|").filter(Boolean)
    : [];

  return (
    <div className="mx-auto w-full max-w-5xl animate-in fade-in duration-300">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-md">
        <ol className="flex items-center gap-xs font-label text-label-md text-on-surface-variant uppercase tracking-wider">
          <li>
            <Link
              href="/receiving"
              className="inline-flex h-8 items-center rounded-sm hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Receiving Queue
            </Link>
          </li>
          <li aria-hidden="true" className="text-outline-variant">/</li>
          <li aria-current="page" className="font-label text-label-md text-on-surface">
            New WRR
          </li>
        </ol>
      </nav>

      <div className="mb-lg">
        <h1 className="font-heading text-display-sm font-bold text-on-surface tracking-tight">
          New Warehouse Receipt Record
        </h1>
        <p className="mt-xs font-body text-body-lg text-on-surface-variant">
          Encode the CIPL/packing-list reference and expected lines before physical receiving begins.
        </p>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="mb-lg rounded-lg bg-error-container/50 border border-error/20 p-md flex items-start gap-sm">
          <span className="material-symbols-outlined text-error shrink-0">error</span>
          <div>
            <p className="font-label text-label-lg font-semibold text-error">Validation errors</p>
            <ul className="mt-xs list-inside list-disc space-y-1">
              {errors.map((err) => (
                <li key={err} className="font-body text-body-sm text-error">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <form action={handleCreateWrr} className="space-y-lg pb-xl">
        {/* Header section */}
        <div className="rounded-xl bg-surface-container-lowest border border-outline-variant shadow-sm p-lg">
          <div className="flex items-center gap-sm mb-md border-b border-outline-variant/50 pb-sm">
            <span className="material-symbols-outlined text-primary text-[20px]">document_scanner</span>
            <h2 className="font-heading text-title-md font-semibold text-on-surface">
              Header Information
            </h2>
          </div>

          <div className="grid gap-md md:grid-cols-2">
            <div>
              <label htmlFor="vendorPartyId" className="block font-label text-label-sm text-on-surface-variant mb-xs">
                Vendor Party ID <span className="text-error">*</span>
              </label>
              <input
                id="vendorPartyId"
                name="vendorPartyId"
                type="text"
                required
                placeholder="UUID of the vendor party"
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-mono text-body-md text-on-surface placeholder:font-body placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <label htmlFor="flowType" className="block font-label text-label-sm text-on-surface-variant mb-xs">
                Flow Type <span className="text-error">*</span>
              </label>
              <select
                id="flowType"
                name="flowType"
                required
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-body text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              >
                <option value="">Select flow type…</option>
                <option value="vmi">VMI</option>
                <option value="trading">Trading</option>
                <option value="supplies">Supplies</option>
              </select>
            </div>

            <div>
              <label htmlFor="commercialInvoiceNo" className="block font-label text-label-sm text-on-surface-variant mb-xs">
                Commercial Invoice No.
              </label>
              <input
                id="commercialInvoiceNo"
                name="commercialInvoiceNo"
                type="text"
                placeholder="CIPL / commercial invoice reference"
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-body text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <label htmlFor="ciplFileUrl" className="block font-label text-label-sm text-on-surface-variant mb-xs">
                CIPL File URL
              </label>
              <input
                id="ciplFileUrl"
                name="ciplFileUrl"
                type="text"
                placeholder="Storage URL of the attached CIPL document"
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-body text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <label htmlFor="pezaNumber" className="block font-label text-label-sm text-on-surface-variant mb-xs">
                PEZA Number
              </label>
              <input
                id="pezaNumber"
                name="pezaNumber"
                type="text"
                placeholder="PEZA permit number"
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-body text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <label htmlFor="ipNumber" className="block font-label text-label-sm text-on-surface-variant mb-xs">
                IP Number
              </label>
              <input
                id="ipNumber"
                name="ipNumber"
                type="text"
                placeholder="Import permit number"
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-body text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="mawbMblNumber" className="block font-label text-label-sm text-on-surface-variant mb-xs">
                MAWB / MBL Number
              </label>
              <input
                id="mawbMblNumber"
                name="mawbMblNumber"
                type="text"
                placeholder="Master Air Waybill / Bill of Lading number"
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-highest px-3 font-body text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>
        </div>

        {/* Expected lines section */}
        <div className="rounded-xl bg-surface-container-lowest border border-outline-variant shadow-sm p-lg">
          <div className="flex items-center gap-sm mb-sm border-b border-outline-variant/50 pb-sm">
            <span className="material-symbols-outlined text-primary text-[20px]">list_alt</span>
            <h2 className="font-heading text-title-md font-semibold text-on-surface">
              Expected Lines
            </h2>
          </div>
          <p className="mb-md font-body text-body-sm text-on-surface-variant">
            At least one line is required. Each line requires a lot number, expected quantity, unit CBM, UOM, and disposition.
          </p>
          
          <WrrLineItems />
        </div>

        {/* Form actions */}
        <div className="flex flex-wrap items-center gap-md pt-sm">
          <button
            type="submit"
            className="flex h-11 items-center justify-center gap-sm rounded-full bg-primary px-lg font-label text-label-lg text-on-primary shadow-sm hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            Create WRR
          </button>
          <Link
            href="/receiving"
            className="flex h-11 items-center justify-center rounded-full border border-outline-variant px-lg font-label text-label-lg text-on-surface hover:bg-surface-container-highest transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
