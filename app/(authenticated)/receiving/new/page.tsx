// Create WRR — office pre-receiving form.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §5 (pre-receiving WRR design), §5.1
//     (expected line fields)
//   specs/07-incoming-receiving/requirements.md R1 (CIPL/WRR pre-receiving staging)
//   specs/00-steering/brand-design-system.md §6 (office surface), §3 (touch targets)
//
// Surface: Office. Permission gate: receiving.confirm.
// The createWrr action stages the WRR header and every expected line together.

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { createWrr, uploadCiplFile } from "@/lib/actions/receiving";
import type { UploadCiplFileResult } from "@/lib/actions/receiving";
import { db } from "@/lib/db/client";
import { getActiveSupplierParties, listActiveWrrItemOptions } from "@/lib/db/queries/items";
import { WrrNewForm } from "./_components/wrr-new-form";

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
      itemId: (formData.get(`line_${i}_itemId`) as string | null) || null,
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
    // Client-generated (see WrrNewForm) so an uploaded CIPL file's Storage
    // path — reserved before this row exists — and this row's own id agree.
    id: (formData.get("id") as string | null) || undefined,
    vendorPartyId:
      (formData.get("vendorPartyId") as string | null) ?? "",
    flowType:
      (formData.get("flowType") as string | null) ?? "",
    commercialInvoiceNo:
      (formData.get("commercialInvoiceNo") as string | null) || null,
    ciplFileUrl:
      (formData.get("ciplFileUrl") as string | null) || null,
    // PEZA Number is no longer collected on this form (2026-08-19 user
    // request) — wrr_documents.peza_number stays nullable and unset here.
    pezaNumber: null,
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

  // Redirect with encoded errors. The page re-reads them via searchParams.
  const encodedErrors = encodeURIComponent(result.errors.join("|"));
  redirect(`/receiving/new?errors=${encodedErrors}`);
}

// Thin wrapper so WrrNewForm (client) can call uploadCiplFile with a real
// resolver built from this request's session — the pure action itself takes
// a resolver, which only server-side code can construct.
async function handleUploadCipl(
  wrrId: string,
  formData: FormData,
): Promise<UploadCiplFileResult> {
  "use server";
  const actionResolver = await createPageResolver();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file was provided." };
  }
  return uploadCiplFile(actionResolver, wrrId, file);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ errors?: string }>;
}

export default async function NewWrrPage({ searchParams }: PageProps) {
  const { errors: encodedErrors } = await searchParams;
  const resolver = await createPageResolver();

  // Gate: receiving.confirm — matches specs/00-steering revision-log's
  // resolved decision (02-rbac-roles design.md §3.2) and the RBAC seed
  // (supabase/migrations/0005_rbac_constraints_and_seed.sql), which never
  // grants a "receiving.create" capability to any role. Gating on that
  // nonexistent string silently blocked every session from ever reaching
  // this form — the underlying createWrr action itself already requires
  // receiving.confirm (lib/actions/receiving.ts), so this now matches.
  const permResult = await requirePermission(resolver, "receiving.confirm");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  // A WRR header holds a foreign key to parties.id. Showing the available
  // vendor/supplier organizations prevents operators from having to discover
  // and paste an internal UUID (and avoids a database exception on submit).
  const vendorParties = await getActiveSupplierParties(db);
  const wrrItemOptions = await listActiveWrrItemOptions(db);

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
          className="mt-4 rounded-xl bg-status-held/10 px-4 py-3"
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

      {/* Create WRR form — standard office surface. WrrNewForm is a client
          component: it owns Inventory Model state (shared with WrrLineItems'
          conditional Item Code label) and renders the Vendor Organization
          dropdown, header fields (no PEZA Number — no longer collected),
          expected lines, and form actions. */}
      <WrrNewForm
        action={handleCreateWrr}
        vendorParties={vendorParties}
        itemOptions={wrrItemOptions}
        onUploadCipl={handleUploadCipl}
      />
    </div>
  );
}
