"use client";

// Create-WRR form body — header fields, expected lines, and actions.
//
// Split out from page.tsx (2026-08-19 user request) so Inventory Model
// selection can be shared client-side state between the header select and
// WrrLineItems' conditional Item Code label, and so Vendor Organization is a
// dropdown of real parties instead of a raw pasted UUID. PEZA Number is no
// longer collected on this form.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §5 (pre-receiving WRR design), §5.1
//     (expected line fields)

import { useState } from "react";
import Link from "next/link";
import type { SupplierPartyOption } from "@/lib/db/queries/items";
import { WrrLineItems } from "./wrr-line-items";

interface WrrNewFormProps {
  action: (formData: FormData) => void;
  vendorParties: SupplierPartyOption[];
}

export function WrrNewForm({ action, vendorParties }: WrrNewFormProps) {
  const [flowType, setFlowType] = useState("");

  return (
    <form action={action} className="mt-6 space-y-6">
      {/* Header section — office card, Level 1 elevation */}
      <div className="rounded-xl bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Header Information
        </h2>

        {/* Full-width on mobile, two-column grid on desktop per task requirements */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Vendor Organization — dropdown of active vendor/supplier parties,
              resolves to their party id (their code is shown for identification). */}
          <div>
            <label
              htmlFor="vendorPartyId"
              className="block font-label text-label text-text-grey"
            >
              Vendor Organization{" "}
              <span aria-hidden="true" className="text-brand-red">
                *
              </span>
              <span className="sr-only">(required)</span>
            </label>
            <select
              id="vendorPartyId"
              name="vendorPartyId"
              required
              defaultValue=""
              className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="" disabled>
                Select vendor organization…
              </option>
              {vendorParties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Inventory Model — required. Drives WrrLineItems' conditional
              Item Code label below. */}
          <div>
            <label
              htmlFor="flowType"
              className="block font-label text-label text-text-grey"
            >
              Inventory Model{" "}
              <span aria-hidden="true" className="text-brand-red">
                *
              </span>
              <span className="sr-only">(required)</span>
            </label>
            <select
              id="flowType"
              name="flowType"
              required
              value={flowType}
              onChange={(e) => setFlowType(e.target.value)}
              className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="">Select inventory model…</option>
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
      <div className="rounded-xl bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Expected Lines
        </h2>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          At least one line is required. Each line requires a lot number,
          expected quantity, unit CBM, UOM, and disposition. The putaway
          location for store-disposition lines is selected on the floor at
          scan/store time, not here.
        </p>
        <div className="mt-4">
          <WrrLineItems flowType={flowType} />
        </div>
      </div>

      {/* Form actions */}
      <div className="flex flex-wrap gap-3">
        {/* Primary CTA — brand-red per brand-design-system.md §9, h-11 office touch target */}
        <button
          type="submit"
          className="flex h-11 items-center justify-center rounded bg-primary px-6 font-label text-label text-surface-white hover:bg-primary-hover motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
  );
}
