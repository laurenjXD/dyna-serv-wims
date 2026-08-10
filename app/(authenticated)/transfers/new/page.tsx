// Create Transfer — office request form.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §2 (transfer_requests fields),
//     §4 (staged initial status), §5 (request design)
//   specs/11-transfer-and-inspection/requirements.md R1.1–R1.3
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1 elevation),
//     §3 (touch targets h-11), §9 (primary CTA bg-brand-red)
//
// Surface: Office. Permission gate: transfer.request.
// Lines are encoded as `line_N_fieldName` fields with a `lineCount` summary.
// On success: redirects to /transfers/[transferId].
// On error: redirects back with errors= searchParam.

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { createTransfer } from "@/lib/actions/transfers";
import { TransferLineItems } from "./_components/transfer-line-items";

// ─── Inline server action ─────────────────────────────────────────────────────

async function handleCreateTransfer(formData: FormData): Promise<void> {
  "use server";
  const actionResolver = await createPageResolver();

  const lineCount = parseInt(
    (formData.get("lineCount") as string | null) ?? "0",
    10
  );

  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    const rawQty = formData.get(`line_${i}_qtyRequested`) as string | null;
    lines.push({
      lotId: (formData.get(`line_${i}_lotId`) as string | null) ?? "",
      itemId: (formData.get(`line_${i}_itemId`) as string | null) ?? "",
      qtyRequested: rawQty ? parseFloat(rawQty) : NaN,
    });
  }

  const rawRequiresApproval = formData.get("requiresApproval");

  const input = {
    fromLocationId:
      (formData.get("fromLocationId") as string | null) ?? "",
    toLocationId:
      (formData.get("toLocationId") as string | null) ?? "",
    flowType:
      (formData.get("flowType") as string | null) ?? "",
    lines,
    reason:
      (formData.get("reason") as string | null) || null,
    requiresApproval: rawRequiresApproval === "on",
  };

  const result = await createTransfer(actionResolver, input);
  if (result.ok) {
    redirect(`/transfers/${result.transferId}`);
  }

  const encodedErrors = encodeURIComponent(result.errors.join("|"));
  redirect(`/transfers/new?errors=${encodedErrors}`);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ errors?: string }>;
}

export default async function NewTransferPage({ searchParams }: PageProps) {
  const { errors: encodedErrors } = await searchParams;
  const resolver = await createPageResolver();

  // Gate: transfer.request required to create a transfer.
  const permResult = await requirePermission(resolver, "transfer.request");
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
              href="/transfers"
              className="inline-flex h-11 items-center rounded hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Transfer Queue
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-body text-body-sm text-on-surface">
            New Transfer
          </li>
        </ol>
      </nav>

      <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
        New Transfer Request
      </h1>
      <p className="mt-1 font-body text-body-md text-text-grey">
        Request an internal location-to-location stock movement.
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

      {/* Create Transfer form — standard office surface */}
      <form action={handleCreateTransfer} className="mt-6 space-y-6">
        {/* Header section — office card, Level 1 elevation */}
        <div className="rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
          <h2 className="font-heading font-semibold text-data-display text-brand-navy">
            Transfer Details
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {/* From Location ID — required */}
            <div>
              <label
                htmlFor="fromLocationId"
                className="block font-label text-label text-text-grey"
              >
                From Location ID{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id="fromLocationId"
                name="fromLocationId"
                type="text"
                required
                placeholder="UUID of the source location"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* To Location ID — required */}
            <div>
              <label
                htmlFor="toLocationId"
                className="block font-label text-label text-text-grey"
              >
                To Location ID{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id="toLocationId"
                name="toLocationId"
                type="text"
                required
                placeholder="UUID of the destination location"
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

            {/* Reason — optional */}
            <div>
              <label
                htmlFor="reason"
                className="block font-label text-label text-text-grey"
              >
                Reason
              </label>
              <input
                id="reason"
                name="reason"
                type="text"
                placeholder="Optional reason for the transfer"
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>

            {/* Requires Approval — optional checkbox */}
            <div className="flex items-center gap-3 md:col-span-2">
              <input
                id="requiresApproval"
                name="requiresApproval"
                type="checkbox"
                className="h-5 w-5 rounded border border-outline-variant/30 accent-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
              <label
                htmlFor="requiresApproval"
                className="font-label text-label text-text-grey"
              >
                Requires approval before execution
              </label>
            </div>
          </div>
        </div>

        {/* Transfer lines section */}
        <div className="rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
          <h2 className="font-heading font-semibold text-data-display text-brand-navy">
            Transfer Lines
          </h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            At least one line is required. Each line requires a lot ID, item ID,
            and quantity to transfer.
          </p>
          <div className="mt-4">
            {/* TransferLineItems is a client component — handles dynamic add/remove. */}
            <TransferLineItems />
          </div>
        </div>

        {/* Form actions */}
        <div className="flex flex-wrap gap-3">
          {/* Primary CTA — brand-red per brand-design-system.md §9, h-11 office touch target */}
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Create Transfer
          </button>
          <Link
            href="/transfers"
            className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-6 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
