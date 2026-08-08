// WRR print receipt — complete WRR data for physical document output.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §5.3 (WRR printed fields), §5.4
//     (print behavior — does not create inventory or change WRR status)
//   specs/07-incoming-receiving/requirements.md R2.1, R2.2
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1),
//     §9 (tables: Epilogue SemiBold uppercase headers)
//
// Surface: Office. Permission gate: receiving.view (design.md §5.4 — print-only, no state change).
//
// Print behavior: window.print() is triggered from a client-side button.
// The @media print styles hide nav/sidebar elements for a clean printed output.
// Design.md §5.4: printing does not create a receipt outcome, does not change
// WRR status, and does not alter the scan baseline.
//
// Note: confirmedAt and confirmedByUserId are on the wrr_documents schema but
// are not included in the WrrDocumentWithItems query result. Extend
// getWrrDocument to include these fields when the query is updated.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import type { WrrItemRow } from "@/lib/db/queries/receiving";

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

const DISPOSITION_LABELS: Record<string, string> = {
  store: "STORE",
  inspect: "INSPECT",
};

interface PageProps {
  params: Promise<{ wrrId: string }>;
}

export default async function WrrPrintPage({ params }: PageProps) {
  const { wrrId } = await params;
  const resolver = await createPageResolver();

  // Gate: receiving.view per design.md §5.4 — any user who can view WRRs may
  // reprint at any lifecycle status. Printing does not change WRR state.
  const permResult = await requirePermission(resolver, "receiving.view");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const wrr = await getWrrDocument(db, wrrId);
  if (!wrr) {
    notFound();
  }

  return (
    <>
      {/*
       * Print media styles: hide the authenticated shell sidebar and top nav
       * so the printed output is clean. The layout.tsx elements use `aside`
       * and `header` tags; `main` wraps the page content.
       * brand-design-system.md §12: surface-white is the print background.
       */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              aside, header, nav[aria-label="Breadcrumb"], .print-hide {
                display: none !important;
              }
              body {
                background: #FFFFFF !important;
              }
              main {
                padding: 0 !important;
                margin: 0 !important;
              }
            }
          `,
        }}
      />

      <div className="mx-auto max-w-container">
        {/* Breadcrumb — hidden on print */}
        <nav
          aria-label="Breadcrumb"
          className="mb-4 print:hidden print-hide"
        >
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
            <li>
              <Link
                href={`/receiving/${wrrId}`}
                className="inline-flex h-11 items-center rounded hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                {wrr.wrrNumber}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-body text-body-sm text-on-surface">
              Print
            </li>
          </ol>
        </nav>

        {/* Screen-only print button */}
        <div className="mb-6 flex gap-3 print:hidden print-hide">
          {/* Print button — primary CTA: brand-red per brand-design-system.md §9 */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.print();
            }}
            suppressHydrationWarning
            className="flex h-11 items-center justify-center rounded bg-brand-red px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Print
          </button>
          <Link
            href={`/receiving/${wrrId}`}
            className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Back to WRR
          </Link>
        </div>

        {/* Printable WRR document */}
        <div className="rounded-md bg-surface-white p-8 shadow-elevation-1">
          {/* Document header */}
          <div className="border-b border-outline-variant/30 pb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-heading font-bold text-headline-lg text-brand-navy">
                  Dyna-Serv WIMS
                </h1>
                <p className="mt-1 font-label text-label uppercase tracking-[0.05em] text-brand-royal-blue">
                  Warehouse Receipt Record
                </p>
              </div>
              {/* WRR number — prominent Roboto Mono, large for barcode placeholder */}
              <div className="text-right">
                <p className="font-label text-label uppercase text-text-grey">
                  WRR Number
                </p>
                <p className="font-mono text-mono-xl font-bold text-brand-navy">
                  {wrr.wrrNumber}
                </p>
                <p className="mt-1 font-body text-body-sm text-text-grey">
                  Printed: {new Date().toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Header fields — design.md §5.3 */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Flow Type
              </p>
              <p className="mt-1 font-body text-body-md text-on-surface">
                {FLOW_LABELS[wrr.flowType] ?? wrr.flowType}
              </p>
            </div>
            <div>
              <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Vendor Party ID
              </p>
              <p className="mt-1 font-mono text-mono-md text-on-surface">
                {wrr.vendorPartyId}
              </p>
            </div>
            <div>
              <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Created At
              </p>
              <p className="mt-1 font-body text-body-md text-on-surface">
                {wrr.createdAt.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Staged By
              </p>
              <p className="mt-1 font-mono text-mono-md text-on-surface">
                {wrr.stagedByUserId}
              </p>
            </div>
            {/*
             * Note: confirmedByUserId and confirmedAt are not included in the
             * current WrrDocumentRow query result (lib/db/queries/receiving.ts).
             * Extend getWrrDocument to select these columns when updating the query.
             */}
            <div>
              <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Status
              </p>
              <p className="mt-1 font-body text-body-md text-on-surface uppercase">
                {wrr.status.replace(/_/g, " ")}
              </p>
            </div>
          </div>

          {/* Line items table — §5.3 per-line section */}
          <div className="mt-8">
            <h2 className="font-heading font-semibold text-data-display text-brand-navy">
              Expected Lines
            </h2>
            {wrr.items.length === 0 ? (
              <p className="mt-4 font-body text-body-md text-text-grey">
                No line items.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse border border-outline-variant/30">
                  <thead>
                    <tr className="bg-surface-light-grey">
                      <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Lot Number
                      </th>
                      {/* Note: Item Code and UOM require query extension —
                          see lib/db/queries/receiving.ts getWrrDocument */}
                      <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Item ID
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Expected Qty
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Scanned Qty
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Disposition
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {wrr.items.map((item: WrrItemRow) => (
                      <tr key={item.id} className="border-b border-outline-variant/30">
                        <td className="border border-outline-variant/30 px-3 py-2 font-mono text-mono-md text-on-surface">
                          {item.lotNumber}
                        </td>
                        <td className="border border-outline-variant/30 px-3 py-2 font-mono text-mono-md text-on-surface">
                          {item.itemId ?? "—"}
                        </td>
                        <td className="border border-outline-variant/30 px-3 py-2 text-right font-mono text-mono-md text-on-surface">
                          {item.expectedQty}
                        </td>
                        <td className="border border-outline-variant/30 px-3 py-2 text-right font-mono text-mono-md text-on-surface">
                          {item.scannedQty}
                        </td>
                        <td className="border border-outline-variant/30 px-3 py-2 font-label text-label uppercase text-on-surface">
                          {DISPOSITION_LABELS[item.disposition] ??
                            item.disposition.toUpperCase()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer — signature lines per design.md §5.3 */}
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <div>
              <div className="border-b border-on-surface pb-1" />
              <p className="mt-2 font-label text-label text-text-grey">
                Received By
              </p>
            </div>
            <div>
              <div className="border-b border-on-surface pb-1" />
              <p className="mt-2 font-label text-label text-text-grey">
                Checked By
              </p>
            </div>
            <div>
              <div className="border-b border-on-surface pb-1" />
              <p className="mt-2 font-label text-label text-text-grey">
                Supervisor
              </p>
            </div>
          </div>

          {/* Warehouse stamp area */}
          <div className="mt-8">
            <div className="h-24 w-48 rounded border-2 border-dashed border-outline-variant/30 p-2">
              <p className="font-label text-label text-text-grey">
                Warehouse Stamp
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
