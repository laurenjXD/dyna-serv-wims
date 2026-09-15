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
       * Print media styles: Landscape layout with table-header repetition
       * and clean multi-page pagination.
       */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              [data-testid="desktop-sidebar"], [data-testid="floor-tab-bar"], nav[aria-label="Breadcrumb"], .print-hide {
                display: none !important;
              }
              body {
                background: #FFFFFF !important;
                color: #000000 !important;
              }
              main {
                padding: 0 !important;
                margin: 0 !important;
                max-width: none !important;
                width: 100% !important;
              }
              @page {
                size: A4 landscape;
                margin: 10mm 12mm 12mm 12mm;
              }
              table {
                width: 100% !important;
                page-break-inside: auto;
              }
              thead {
                display: table-header-group !important;
              }
              tfoot {
                display: table-footer-group !important;
              }
              tr {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .avoid-break {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .client-export-hide-cbm {
                display: none !important;
              }
            }
          `,
        }}
      />

      <div className="mx-auto w-full max-w-[1400px]">
        {/* Breadcrumb — hidden on print */}
        <nav
          aria-label="Breadcrumb"
          className="mb-4 print:hidden print-hide"
        >
          <ol className="flex items-center gap-1 font-body text-body-sm text-text-grey">
            <li>
              <Link
                href="/receiving"
                className="inline-flex h-10 items-center rounded hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Receiving Queue
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/receiving/${wrrId}`}
                className="inline-flex h-10 items-center rounded hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
          <PrintButton />
          <Link
            href={`/receiving/${wrrId}`}
            className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Back to WRR
          </Link>
        </div>

        {/* Printable WRR document (Landscape) */}
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1 print:border-0 print:p-0 print:shadow-none">
          {/* Document header */}
          <div className="border-b-2 border-brand-navy pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/api/brand/logo" alt="Dyna-Serv" className="h-8 w-auto object-contain" />
                  <div>
                    <h1 className="font-heading font-extrabold text-headline-md text-brand-navy leading-none">
                      DYNA-SERV GLOBAL CORPORATION
                    </h1>
                    <p className="mt-0.5 font-label text-[10px] font-bold uppercase tracking-[0.1em] text-brand-royal-blue">
                      Warehouse Receipt Record (WRR) &bull; Official Inbound Delivery Report
                    </p>
                  </div>
                </div>
                <p className="mt-2 font-body text-[11px] text-text-grey">
                  Received Date: <span className="font-medium text-on-surface">{wrr.confirmedAt?.toLocaleString() ?? "Pending receipt"}</span>
                </p>
              </div>

              <div className="flex items-start gap-4">
                <div className="text-right">
                  <p className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">
                    WRR Document Number
                  </p>
                  <p className="font-mono text-mono-lg font-black text-brand-navy">
                    {wrr.wrrNumber}
                  </p>
                  <span className="inline-block mt-0.5 rounded bg-brand-navy/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-brand-navy">
                    Status: {wrr.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-center">
                  <WrrBarcode wrrNumber={wrr.wrrNumber} />
                  <p className="mt-0.5 max-w-[110px] font-body text-[9px] text-text-grey">
                    Document QR
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Header metadata grid — compact & readable */}
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-surface-light-grey/50 p-3 font-body text-[11px] sm:grid-cols-4 lg:grid-cols-6 border border-outline-variant/30">
            <div>
              <p className="font-label text-[10px] font-bold uppercase text-text-grey">Vendor / Supplier</p>
              <p className="mt-0.5 font-bold text-on-surface truncate">
                {wrr.vendorPartyName ?? "—"}
              </p>
              {wrr.vendorPartyCode && (
                <p className="font-mono text-[10px] text-text-grey font-semibold">({wrr.vendorPartyCode})</p>
              )}
            </div>
            <div>
              <p className="font-label text-[10px] font-bold uppercase text-text-grey">Inventory Model</p>
              <p className="mt-0.5 font-bold text-on-surface">
                {FLOW_LABELS[wrr.flowType] ?? wrr.flowType.toUpperCase()}
              </p>
            </div>
            <div>
              <p className="font-label text-[10px] font-bold uppercase text-text-grey">Commercial Invoice Ref.</p>
              <p className="mt-0.5 font-mono font-bold text-on-surface">
                {wrr.commercialInvoiceNo ?? "—"}
              </p>
            </div>
            <div>
              <p className="font-label text-[10px] font-bold uppercase text-text-grey">PEZA Permit Number</p>
              <p className="mt-0.5 font-mono font-bold text-on-surface">
                {wrr.pezaNumber ?? "—"}
              </p>
            </div>
            <div>
              <p className="font-label text-[10px] font-bold uppercase text-text-grey">Import Permit (IP)</p>
              <p className="mt-0.5 font-mono font-bold text-on-surface">
                {wrr.ipNumber ?? "—"}
              </p>
            </div>
            <div>
              <p className="font-label text-[10px] font-bold uppercase text-text-grey">MAWB / MBL Number</p>
              <p className="mt-0.5 font-mono font-bold text-on-surface">
                {wrr.mawbMblNumber ?? "—"}
              </p>
            </div>
          </div>

          {/* Line items table — 11-12px uniform typography, repeating thead */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-heading text-title-sm font-bold text-brand-navy">
                Inbound Line Items ({wrr.items.length} Lines)
              </h2>
              <span className="font-mono text-[11px] font-bold text-text-grey">
                All measurements verified at Receiving Dock
              </span>
            </div>

            {wrr.items.length === 0 ? (
              <p className="mt-4 font-body text-body-sm text-text-grey">
                No line items.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-outline-variant/30 text-left text-[11px]">
                  <thead>
                    <tr className="bg-surface-light-grey text-text-grey border-b border-outline-variant/30">
                      <th className="border border-outline-variant/30 px-2.5 py-2 text-left font-label text-[10px] uppercase font-bold tracking-wider">
                        #
                      </th>
                      <th className="border border-outline-variant/30 px-2.5 py-2 text-left font-label text-[10px] uppercase font-bold tracking-wider">
                        Item Code &amp; Reference
                      </th>
                      <th className="border border-outline-variant/30 px-2.5 py-2 text-left font-label text-[10px] uppercase font-bold tracking-wider">
                        Item Description
                      </th>
                      <th className="border border-outline-variant/30 px-2.5 py-2 text-left font-label text-[10px] uppercase font-bold tracking-wider">
                        Cust PN
                      </th>
                      <th className="border border-outline-variant/30 px-2.5 py-2 text-left font-label text-[10px] uppercase font-bold tracking-wider">
                        Lot Number
                      </th>
                      <th className="border border-outline-variant/30 px-2.5 py-2 text-left font-label text-[10px] uppercase font-bold tracking-wider">
                        Mfg. Date
                      </th>
                      <th className="border border-outline-variant/30 px-2.5 py-2 text-right font-label text-[10px] uppercase font-bold tracking-wider">
                        Expected Qty
                      </th>
                      <th className="border border-outline-variant/30 px-2.5 py-2 text-right font-label text-[10px] uppercase font-bold tracking-wider client-export-hide-cbm">
                        Unit CBM
                      </th>
                      <th className="border border-outline-variant/30 px-2.5 py-2 text-right font-label text-[10px] uppercase font-bold tracking-wider">
                        Actual Received
                      </th>
                      <th className="border border-outline-variant/30 px-2.5 py-2 text-left font-label text-[10px] uppercase font-bold tracking-wider">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {wrr.items.map((item: WrrItemRow, idx: number) => {
                      const spq = Number(item.spq) || 1;
                      return (
                        <tr key={item.id} className="border-b border-outline-variant/30 hover:bg-surface-light-grey/30">
                          <td className="border border-outline-variant/30 px-2.5 py-1.5 font-mono text-text-grey font-bold">
                            {idx + 1}
                          </td>
                          <td className="border border-outline-variant/30 px-2.5 py-1.5 font-mono text-on-surface">
                            <span className="block font-bold text-brand-navy">{item.itemCode ?? item.supplierItemCode ?? "—"}</span>
                            {item.supplierItemCode && item.supplierItemCode !== item.itemCode && (
                              <span className="block text-text-grey text-[10px]">Vendor: {item.supplierItemCode}</span>
                            )}
                            <span className="block text-[10px] text-text-grey">SPQ: {spq} {item.uom || "PCS"}/Box</span>
                          </td>
                          <td className="border border-outline-variant/30 px-2.5 py-1.5 font-body text-on-surface max-w-[220px]">
                            {item.itemName ?? item.itemCode ?? item.supplierItemCode ?? "—"}
                          </td>
                          <td className="border border-outline-variant/30 px-2.5 py-1.5 font-mono text-text-grey">{item.customerItemCode ?? "—"}</td>
                          <td className="border border-outline-variant/30 px-2.5 py-1.5 font-mono font-bold text-on-surface">
                            {item.lotNumber}
                          </td>
                          <td className="border border-outline-variant/30 px-2.5 py-1.5 font-body text-text-grey">{item.manufactureDate ?? "—"}</td>
                          <td className="border border-outline-variant/30 px-2.5 py-1.5 text-right font-body text-on-surface">
                            <span className="font-mono font-bold block">{item.expectedQty} Boxes</span>
                            <span className="text-text-grey font-mono text-[10px]">({(item.expectedQty * spq).toLocaleString()} {item.uom || "PCS"})</span>
                          </td>
                          <td className="border border-outline-variant/30 px-2.5 py-1.5 text-right font-mono text-text-grey client-export-hide-cbm">
                            {item.unitCbm.toFixed(4)}
                          </td>
                          <td className="border border-outline-variant/30 px-2.5 py-1.5 text-right font-body text-on-surface">
                            {item.scannedQty > 0 ? (
                              <>
                                <span className="font-mono font-bold text-brand-navy block">{item.scannedQty} Boxes</span>
                                <span className="text-text-grey font-mono text-[10px]">({(item.scannedQty * spq).toLocaleString()} {item.uom || "PCS"})</span>
                              </>
                            ) : (
                              <span className="text-text-grey">—</span>
                            )}
                          </td>
                          <td className="border border-outline-variant/30 px-2.5 py-1.5 font-body text-text-grey">{item.remarks ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-brand-navy bg-surface-light-grey/80 font-bold">
                    <tr>
                      <td colSpan={6} className="border border-outline-variant/30 px-2.5 py-2 text-right font-label text-[10px] uppercase text-on-surface">
                        Total Receiving Quantities:
                      </td>
                      <td className="border border-outline-variant/30 px-2.5 py-2 text-right font-mono font-bold text-brand-navy">
                        {wrr.items.reduce((sum, item) => sum + item.expectedQty, 0).toLocaleString()} Boxes
                      </td>
                      <td className="border border-outline-variant/30 px-2.5 py-2 text-right font-mono font-bold text-brand-navy client-export-hide-cbm">
                        {wrr.items.reduce((sum, item) => sum + (item.unitCbm * item.expectedQty), 0).toFixed(4)}
                      </td>
                      <td className="border border-outline-variant/30 px-2.5 py-2 text-right font-mono font-bold text-brand-navy">
                        {wrr.items.reduce((sum, item) => sum + item.scannedQty, 0).toLocaleString()} Boxes
                      </td>
                      <td className="border border-outline-variant/30 px-2.5 py-2 font-label text-[10px] uppercase text-text-grey">
                        {wrr.items.reduce((sum, item) => sum + item.scannedQty, 0) >= wrr.items.reduce((sum, item) => sum + item.expectedQty, 0) ? "Verified Complete" : "Pending / Short"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Avoid breaking across pages for summary and signature blocks */}
          <div className="avoid-break mt-6 pt-4 border-t border-outline-variant/30">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Warehouse Stamp & Notes */}
              <div>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-44 rounded-lg border-2 border-dashed border-outline-variant/50 p-2 flex flex-col justify-between">
                    <p className="font-label text-[10px] font-bold uppercase text-text-grey">
                      Warehouse Official Stamp
                    </p>
                    <p className="font-mono text-[9px] text-text-grey/60 text-right">Dyna-Serv Receiving</p>
                  </div>
                  <div className="font-body text-[11px] text-text-grey space-y-0.5">
                    <p className="font-bold text-on-surface">Warehouse Operations Notice:</p>
                    <p>Inbound counts certified under ISO 9001:2015 WMS custody guidelines.</p>
                    <p>Discrepancies reported within 24 hours of receipt confirmation.</p>
                  </div>
                </div>
              </div>

              {/* Summary totals box */}
              <div className="flex justify-end">
                <div className="w-full max-w-sm rounded-lg border border-outline-variant/40 bg-surface-light-grey/40 p-3 font-body text-[11px]">
                  <dl className="space-y-1">
                    <div className="flex justify-between">
                      <dt className="text-text-grey">Total Expected Boxes:</dt>
                      <dd className="font-mono font-bold text-on-surface">{wrr.items.reduce((sum, item) => sum + item.expectedQty, 0).toLocaleString()} Boxes</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-text-grey">Total Expected Pieces:</dt>
                      <dd className="font-mono font-bold text-on-surface">{wrr.items.reduce((sum, item) => sum + item.expectedQty * (Number(item.spq) || 1), 0).toLocaleString()} PCS</dd>
                    </div>
                    <div className="flex justify-between border-t border-outline-variant/20 pt-1">
                      <dt className="text-text-grey">Total Actual Received Boxes:</dt>
                      <dd className="font-mono font-bold text-brand-navy">{wrr.items.reduce((sum, item) => sum + item.scannedQty, 0).toLocaleString()} Boxes</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-text-grey">Total Actual Received Pieces:</dt>
                      <dd className="font-mono font-bold text-brand-navy">{wrr.items.reduce((sum, item) => sum + item.scannedQty * (Number(item.spq) || 1), 0).toLocaleString()} PCS</dd>
                    </div>
                    <div className="flex justify-between border-t border-outline-variant/20 pt-1 client-export-hide-cbm">
                      <dt className="text-text-grey">Total Shipment CBM:</dt>
                      <dd className="font-mono font-bold text-on-surface">{wrr.items.reduce((sum, item) => sum + (item.unitCbm * item.expectedQty), 0).toFixed(4)} m³</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Footer — 3-way signature lines */}
            <div className="mt-8 grid grid-cols-3 gap-8">
              <div>
                <p className="font-label text-[10px] font-bold uppercase text-text-grey">Received By (Floor Receiver):</p>
                <div className="mt-8 border-b border-on-surface pb-1" />
                <p className="mt-1 font-body text-[11px] text-text-grey">Printed Name &amp; Signature</p>
              </div>
              <div>
                <p className="font-label text-[10px] font-bold uppercase text-text-grey">Checked &amp; QC Verified By:</p>
                <div className="mt-8 border-b border-on-surface pb-1" />
                <p className="mt-1 font-body text-[11px] text-text-grey">QC Inspector / Lead</p>
              </div>
              <div>
                <p className="font-label text-[10px] font-bold uppercase text-text-grey">Authorized Supervisor:</p>
                <div className="mt-8 border-b border-on-surface pb-1" />
                <p className="mt-1 font-body text-[11px] text-text-grey">Warehouse Supervisor Approval</p>
              </div>
            </div>

            <p className="mt-6 text-center font-body text-[10px] text-text-grey/70">
              Dyna-Serv Warehouse Inventory Management System &bull; Confidential Receiving Document &bull; Retention: Permanent
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
