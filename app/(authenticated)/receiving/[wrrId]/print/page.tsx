// WRR print receipt — complete WRR data for physical document output.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §5.3 (WRR printed fields — exact
//     header/per-line/footer field contract), §5.4 (print/reprint behavior —
//     does not create inventory or change WRR status)
//   specs/07-incoming-receiving/requirements.md R2.1, R2.2
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1),
//     §9 (tables: Inter SemiBold uppercase headers)
//
// Surface: Office. Permission gate: receiving.view (design.md §5.4 — print-only, no state change).
//
// Print behavior: window.print() is triggered from a client-side button
// (_components/PrintButton.tsx — a native onClick cannot live directly in
// this Server Component's own JSX). The @media print styles hide nav/
// sidebar elements for a clean printed output. Design.md §5.4: printing does
// not create a receipt outcome, does not change WRR status, and does not
// alter the scan baseline.
//
// KNOWN, FLAGGED GAP (not silently worked around): design.md §5.4 requires a
// reprint to be visibly watermarked "REPRINT" with who/when. There is
// currently no persistence anywhere in the schema for WRR print events (no
// `wrr_documents.printed_at`/count column, no print-event table analogous to
// `generated_documents`/`document_events` from spec 10's separate document
// pipeline) — this page has no way to know whether a given render is the
// first print or a reprint. Implementing this correctly needs a schema
// migration (through database-builder + db-migration-verifier per CLAUDE.md,
// not invented here) before the watermark can be built; do not fake this
// with a client-side/query-param heuristic.
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
import { PrintButton } from "./_components/PrintButton";
import { WrrBarcode } from "./_components/WrrBarcode";

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
          <PrintButton />
          <Link
            href={`/receiving/${wrrId}`}
            className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Back to WRR
          </Link>
        </div>

        {/* Printable WRR document */}
        <div className="rounded-xl bg-surface-white p-8 shadow-elevation-1">
          {/* Document header — design.md §5.3 header section */}
          <div className="border-b border-outline-variant/30 pb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-heading font-extrabold text-headline-lg text-on-surface">
                  Dyna-Serv WIMS
                </h1>
                <p className="mt-1 font-label text-label uppercase tracking-[0.05em] text-brand-royal-blue">
                  Warehouse Receipt Record
                </p>
                <p className="mt-3 font-body text-body-sm text-text-grey">Received Date: {wrr.confirmedAt?.toLocaleString() ?? "Pending receipt"}</p>
              </div>
              {/* This QR identifies the WRR document. It deliberately does
                  not represent a physical unit and must not be used in the
                  receiving scan loop; unit labels are printed per WRR line. */}
              <div className="flex items-start gap-3">
                <div className="text-right">
                  <p className="font-label text-label uppercase text-text-grey">
                    WRR Number
                  </p>
                  <p className="font-mono text-mono-xl font-bold text-brand-navy">
                    {wrr.wrrNumber}
                  </p>
                </div>
                <div className="text-center">
                  <WrrBarcode wrrNumber={wrr.wrrNumber} />
                  <p className="mt-1 max-w-[120px] font-body text-body-sm text-text-grey">
                    Document QR — not for item scanning
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Header fields — design.md §5.3 */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Source Organization (Vendor)
              </p>
              <p className="mt-1 font-body text-body-md text-on-surface">
                {wrr.vendorPartyName ?? "—"}
                {wrr.vendorPartyCode ? (
                  <span className="ml-1 font-mono text-mono-sm text-text-grey">
                    ({wrr.vendorPartyCode})
                  </span>
                ) : null}
              </p>
            </div>
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
                CIPL / Commercial Invoice Ref.
              </p>
              <p className="mt-1 font-mono text-mono-md text-on-surface">
                {wrr.commercialInvoiceNo ?? "—"}
              </p>
            </div>
            {/* PEZA/IP/MAWB — "where applicable" per design.md §5.3, so only
                rendered when the WRR actually has a value for them. */}
            {wrr.pezaNumber && (
              <div>
                <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  PEZA Permit Number
                </p>
                <p className="mt-1 font-mono text-mono-md text-on-surface">
                  {wrr.pezaNumber}
                </p>
              </div>
            )}
            {wrr.ipNumber && (
              <div>
                <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Import Permit (IP) Number
                </p>
                <p className="mt-1 font-mono text-mono-md text-on-surface">
                  {wrr.ipNumber}
                </p>
              </div>
            )}
            {wrr.mawbMblNumber && (
              <div>
                <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  MAWB / MBL Number
                </p>
                <p className="mt-1 font-mono text-mono-md text-on-surface">
                  {wrr.mawbMblNumber}
                </p>
              </div>
            )}
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
            <h2 className="font-heading font-semibold text-data-display text-on-surface">
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
                        Item Code
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Item Name
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Customer Code
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Lot Number
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Mfg. Date
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Expected Qty / UOM
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Unit CBM
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Disposition
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Actual Qty / UOM
                      </th>
                      <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {wrr.items.map((item: WrrItemRow) => (
                      <tr key={item.id} className="border-b border-outline-variant/30">
                        <td className="border border-outline-variant/30 px-3 py-2 font-mono text-mono-md text-on-surface">
                          <span className="block">Dyna-Serv: {item.itemCode ?? "—"}</span>
                          <span className="block text-text-grey">Supplier: {item.supplierItemCode ?? "—"}</span>
                        </td>
                        <td className="border border-outline-variant/30 px-3 py-2 font-body text-body-sm text-on-surface">
                          {item.itemName ?? "—"}
                        </td>
                        <td className="border border-outline-variant/30 px-3 py-2 font-mono text-mono-md text-on-surface">{item.customerItemCode ?? "—"}</td>
                        <td className="border border-outline-variant/30 px-3 py-2 font-mono text-mono-md text-on-surface">
                          {item.lotNumber}
                        </td>
                        <td className="border border-outline-variant/30 px-3 py-2 font-body text-body-sm text-on-surface">{item.manufactureDate ?? "—"}</td>
                        <td className="border border-outline-variant/30 px-3 py-2 text-right font-mono text-mono-md text-on-surface">
                          {item.expectedQty} {item.uom}
                        </td>
                        <td className="border border-outline-variant/30 px-3 py-2 text-right font-mono text-mono-md text-on-surface">
                          {item.unitCbm.toFixed(4)}
                        </td>
                        <td className="border border-outline-variant/30 px-3 py-2 font-label text-label uppercase text-on-surface">
                          {DISPOSITION_LABELS[item.disposition] ??
                            item.disposition.toUpperCase()}
                        </td>
                        <td className="border border-outline-variant/30 px-3 py-2 text-right font-mono text-mono-md text-on-surface">
                          {item.scannedQty > 0 ? `${item.scannedQty} ${item.uom}` : "—"}
                        </td>
                        <td className="border border-outline-variant/30 px-3 py-2 font-body text-body-sm text-on-surface">{item.remarks ?? "—"}</td>
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
