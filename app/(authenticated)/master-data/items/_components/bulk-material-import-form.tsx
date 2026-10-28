"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { SupplierPartyOption } from "@/lib/db/queries/items";
import { importMaterialsAction, type BulkImportState } from "../_bulk-actions";

export function BulkMaterialImportForm({ organizations }: { organizations: SupplierPartyOption[] }) {
  const [state, action, pending] = useActionState<BulkImportState, FormData>(importMaterialsAction, {});

  return (
    <form action={action} className="space-y-6" encType="multipart/form-data">
      {state.error && <div role="alert" className="rounded-lg border border-brand-red/30 bg-brand-red/5 px-4 py-3 text-brand-red">{state.error}</div>}
      {state.ok && <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-800">Imported {state.imported} material{state.imported === 1 ? "" : "s"} successfully.</div>}

      <div>
        <label htmlFor="partyId" className="block font-label text-label font-bold text-on-surface">Material-origin organization <span className="text-brand-red">*</span></label>
        <select id="partyId" name="partyId" required defaultValue="" className="mt-1 block min-h-11 w-full rounded border border-outline-variant/40 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy">
          <option value="">Select an organization…</option>
          {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.code} — {organization.name} ({organization.relationship === "vmi_customer" ? "VMI Customer" : "Trading Supplier"})</option>)}
        </select>
        <p className="mt-1 text-sm text-text-grey">Only active VMI Customer and Trading Supplier relationships are available.</p>
      </div>

      <div className="rounded-lg border border-brand-blue/20 bg-brand-blue/5 px-4 py-3 text-sm text-brand-navy">
        The Inventory Model is inherited automatically: VMI Customer → VMI; Trading Supplier → Trading. UOM will be set to <strong>piece</strong>.
      </div>

      <div>
        <label htmlFor="file" className="block font-label text-label font-bold text-on-surface">Material CSV or Excel file <span className="text-brand-red">*</span></label>
        <input id="file" name="file" type="file" required accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="mt-1 block w-full rounded border border-outline-variant/40 bg-surface-white px-3 py-3 text-sm" />
        <p className="mt-1 text-sm text-text-grey">Required column: ITEM CODE. DESCRIPTION, dimensions, CBM, SPQ, and pallet data may be missing and will receive safe defaults.</p>
      </div>

      {state.warnings && state.warnings.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p className="font-bold">Import warnings</p><ul className="mt-2 list-disc pl-5">{state.warnings.slice(0, 20).map((warning) => <li key={warning}>{warning}</li>)}</ul>{state.warnings.length > 20 && <p className="mt-2">Showing the first 20 warnings.</p>}</div>}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending || organizations.length === 0} className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand-blue px-5 font-label text-label font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Importing…" : "Validate and enroll materials"}</button>
        <Link href="/enrollment?tab=items" className="inline-flex min-h-11 items-center justify-center rounded-full border border-brand-blue px-5 font-label text-label font-bold text-brand-blue">Cancel</Link>
      </div>
      {organizations.length === 0 && <p className="text-sm text-brand-red">No eligible organizations are available. Create an active VMI Customer or Trading Supplier relationship first.</p>}
    </form>
  );
}
