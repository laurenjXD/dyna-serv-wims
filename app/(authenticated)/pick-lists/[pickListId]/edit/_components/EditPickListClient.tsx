"use client";

import Link from "next/link";
import { FileText, RefreshCw, ShieldCheck } from "@/components/ui/icons";
import { PageBreadcrumb } from "@/components/global/PageBreadcrumb";

export type EditablePickListItem = {
  id: string;
  itemId: string;
  itemCode: string;
  customerItemCode: string | null;
  itemDescription: string | null;
  lotNumber: string;
  manufactureDate: string | null;
  expiryDate: string | null;
  locationLabel: string;
  qty: number;
  spq: number;
  numberOfBoxes: number;
};

/**
 * Safe landing page for old edit bookmarks. Committed pick lists are
 * immutable; corrections must go through a new draft so FIFO/FEFO and stock
 * validation run again on the server.
 */
export function EditPickListClient({
  pickListId,
  pickListNumber,
  status,
  error,
  initialItems,
}: {
  pickListId: string;
  pickListNumber: string;
  status: string;
  error?: string;
  initialItems: EditablePickListItem[];
}) {
  const totalBoxes = initialItems.reduce((sum, item) => sum + item.numberOfBoxes, 0);
  const totalUnits = initialItems.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/30 pb-6">
        <div>
          <PageBreadcrumb
            backHref={`/pick-lists/${pickListId}/pick`}
            backLabel="Pick List Review"
            currentLabel={pickListNumber}
            monoCurrent
            className="mb-3"
          />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-headline-md font-extrabold text-on-surface">Pick List Details</h1>
              <span className="font-mono text-mono-md font-bold text-brand-navy">{pickListNumber}</span>
              <span className="inline-flex rounded-full bg-status-pending/15 px-2.5 py-0.5 font-label text-label-xs font-bold uppercase text-status-pending">{status}</span>
            </div>
            <p className="mt-1 max-w-2xl font-body text-body-sm text-text-grey">
              This pick list is already reserved. Its quantities and locations cannot be edited after generation.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/pick-lists/${pickListId}/print`}
            target="_blank"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-outline-variant/50 bg-surface-white px-4 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          >
            <FileText size={16} aria-hidden="true" />
            View PDF
          </Link>
          <Link
            href="/inventory?tab=pick-lists"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Create replacement draft
          </Link>
        </div>
      </header>

      {error && (
        <div role="alert" className="mt-5 rounded-xl border border-status-held/40 bg-status-held/10 px-4 py-3 font-body text-body-sm text-status-held">
          {error === "pick_list_replacement_required"
            ? "Committed pick lists cannot be edited. Create a replacement draft so FIFO/FEFO and stock validation run again."
            : "This pick list is read-only after reservation. Create a replacement draft for corrections."}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-status-pending/35 bg-status-pending/5 p-5 shadow-elevation-1" aria-labelledby="replacement-heading">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-7 w-7 shrink-0 text-brand-navy" aria-hidden="true" />
          <div>
            <h2 id="replacement-heading" className="font-heading text-headline-sm font-bold text-on-surface">Create a replacement instead</h2>
            <p className="mt-2 max-w-3xl font-body text-body-sm text-text-grey">
              Changing a committed quantity or location in place can desynchronise the reservation and warehouse instructions. Start a new draft with the corrected demand and let the server recalculate the current FIFO/FEFO plan. The original list remains unchanged for auditability.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <div className="rounded-xl border border-outline-variant/30 bg-surface-white px-4 py-3">
            <p className="font-label text-label-xs font-bold uppercase tracking-wide text-text-grey">Committed boxes</p>
            <p className="mt-1 font-mono text-mono-md font-bold text-brand-navy">{totalBoxes.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-outline-variant/30 bg-surface-white px-4 py-3">
            <p className="font-label text-label-xs font-bold uppercase tracking-wide text-text-grey">Committed units</p>
            <p className="mt-1 font-mono text-mono-md font-bold text-brand-navy">{totalUnits.toLocaleString()}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-status-available/30 bg-status-available/5 px-4 py-3">
            <p className="font-label text-label-xs font-bold uppercase tracking-wide text-status-available">Editable in replacement draft</p>
            <p className="mt-1 font-body text-body-sm text-on-surface">Requested Qty (Boxes) and location allocation.</p>
          </div>
          <div className="rounded-xl border border-outline-variant/30 bg-surface-light-grey/45 px-4 py-3">
            <p className="font-label text-label-xs font-bold uppercase tracking-wide text-text-grey">Fixed after item selection</p>
            <p className="mt-1 font-body text-body-sm text-on-surface">SPQ, item code, customer PN, lot, and description.</p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface-white">
          <table className="w-full min-w-[930px] border-collapse text-left">
            <thead className="bg-surface-light-grey">
              <tr className="border-b border-outline-variant/30">
                {["Item code", "Description", "Lot", "Mfg. date", "Expiry date", "Location", "Boxes", "Units"].map((label) => (
                  <th key={label} className="px-4 py-3 font-label text-label-xs font-bold uppercase tracking-wide text-text-grey">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {initialItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-mono text-mono-sm font-bold text-on-surface">{item.itemCode}</td>
                  <td className="max-w-[18rem] truncate px-4 py-3 font-body text-body-sm text-on-surface">{item.itemDescription ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-mono-sm text-on-surface">{item.lotNumber}</td>
                  <td className="px-4 py-3 font-mono text-mono-sm text-on-surface">{item.manufactureDate ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-mono-sm text-on-surface">{item.expiryDate ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-mono-sm font-bold text-brand-navy">{item.locationLabel}</td>
                  <td className="px-4 py-3 font-mono text-mono-sm text-on-surface">{item.numberOfBoxes}</td>
                  <td className="px-4 py-3 font-mono text-mono-sm text-on-surface">{item.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
