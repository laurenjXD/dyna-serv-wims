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
          <div className="border-b-2 border-slate-800 pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/api/brand/logo" alt="Dyna-Serv" className="h-7 w-auto object-contain" />
                  <div>
                    <h1 className="font-heading font-bold text-xs uppercase tracking-wider text-slate-800 leading-none">
                      DYNA-SERV GLOBAL CORPORATION
                    </h1>
                    <p className="mt-0.5 font-heading text-sm font-extrabold uppercase tracking-wide text-brand-navy">
                      Warehouse Receiving Report (WRR)
                    </p>
                  </div>
                </div>
                <p className="mt-1.5 font-mono text-[10px] text-slate-500">
                  Received Date: <span className="font-bold text-slate-900">{wrr.confirmedAt?.toLocaleString() ?? "Pending receipt"}</span>
                </p>
              </div>

              <div className="flex items-start gap-4">
                <div className="text-right">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    WRR Document Number
                  </p>
                  <p className="font-mono text-xs font-black text-brand-navy">
                    {wrr.wrrNumber}
                  </p>
                  <span className="inline-block mt-0.5 rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-slate-700 border border-slate-200">
                    Status: {wrr.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-center">
                  <WrrBarcode wrrNumber={wrr.wrrNumber} />
                  <p className="mt-0.5 max-w-[110px] font-mono text-[9px] text-slate-400">
                    Document QR
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Header metadata grid — compact & readable */}
          <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-lg bg-slate-50/70 p-2.5 font-mono text-[11px] sm:grid-cols-4 lg:grid-cols-5 border border-slate-200">
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Vendor / Supplier</p>
              <p className="mt-0.5 font-bold text-slate-900 truncate">
                {wrr.vendorPartyName ?? "—"}
              </p>
              {wrr.vendorPartyCode && (
                <p className="text-[10px] text-slate-500 font-semibold">({wrr.vendorPartyCode})</p>
              )}
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Inventory Model</p>
              <p className="mt-0.5 font-bold text-slate-900">
                {FLOW_LABELS[wrr.flowType] ?? wrr.flowType.toUpperCase()}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Commercial Invoice Ref.</p>
              <p className="mt-0.5 font-bold text-slate-900">
                {wrr.commercialInvoiceNo ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Import Permit (IP)</p>
              <p className="mt-0.5 font-bold text-slate-900">
                {wrr.ipNumber ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">MAWB / MBL Number</p>
              <p className="mt-0.5 font-bold text-slate-900">
                {wrr.mawbMblNumber ?? "—"}
              </p>
            </div>
          </div>

          {/* Line items table — 11-12px uniform typography, repeating thead */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-800">
                Inbound Line Items ({wrr.items.length} Lines)
              </h2>
              <span className="font-mono text-[10px] uppercase font-bold text-slate-500">
                Verified at Receiving Dock
              </span>
            </div>

            {wrr.items.length === 0 ? (
              <p className="mt-4 font-mono text-[11px] text-slate-500">
                No line items recorded.
              </p>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full border-collapse border border-slate-300 text-left font-mono text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 text-[10px]">
                      <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider">
                        #
                      </th>
                      <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider">
                        Item Code &amp; Reference
                      </th>
                      <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider font-body">
                        Item Description
                      </th>
                      <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider">
                        Cust PN
                      </th>
                      <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider">
                        Lot Number
                      </th>
                      <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider">
                        Mfg. Date
                      </th>
                      <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider">
                        Expected Qty
                      </th>
                      <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider client-export-hide-cbm">
                        Unit CBM
                      </th>
                      <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider">
                        Actual Received
                      </th>
                      <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {wrr.items.map((item: WrrItemRow, idx: number) => {
                      const spq = Number(item.spq) || 1;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5">
                            <span className="block font-bold text-brand-navy">{item.itemCode ?? item.supplierItemCode ?? "—"}</span>
                            {item.supplierItemCode && item.supplierItemCode !== item.itemCode && (
                              <span className="block text-slate-500 text-[10px]">Vendor: {item.supplierItemCode}</span>
                            )}
                            <span className="block text-[10px] text-slate-500">SPQ: {spq} {item.uom || "PCS"}/Box</span>
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 font-body text-[11px] text-slate-900 max-w-[220px]">
                            {item.itemName ?? item.itemCode ?? item.supplierItemCode ?? "—"}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-slate-600">{item.customerItemCode ?? "—"}</td>
                          <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900">
                            {item.lotNumber}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-slate-600">{item.manufactureDate ?? "—"}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right">
                            <span className="font-bold block text-slate-900">{item.expectedQty} Boxes</span>
                            <span className="text-slate-500 text-[10px]">({(item.expectedQty * spq).toLocaleString()} {item.uom || "PCS"})</span>
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right text-slate-600 client-export-hide-cbm">
                            {item.unitCbm.toFixed(4)}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right">
                            {item.scannedQty > 0 ? (
                              <>
                                <span className="font-bold text-brand-navy block">{item.scannedQty} Boxes</span>
                                <span className="text-slate-500 text-[10px]">({(item.scannedQty * spq).toLocaleString()} {item.uom || "PCS"})</span>
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-slate-500">{item.remarks ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-800 bg-slate-100 font-bold">
                    <tr>
                      <td colSpan={6} className="border border-slate-300 px-2 py-1.5 text-right text-[10px] uppercase text-slate-800">
                        Total Receiving Quantities:
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right text-brand-navy">
                        {wrr.items.reduce((sum, item) => sum + item.expectedQty, 0).toLocaleString()} Boxes
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right text-brand-navy client-export-hide-cbm">
                        {wrr.items.reduce((sum, item) => sum + (item.unitCbm * item.expectedQty), 0).toFixed(4)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right text-brand-navy">
                        {wrr.items.reduce((sum, item) => sum + item.scannedQty, 0).toLocaleString()} Boxes
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-[10px] uppercase text-slate-600">
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
            <div className="flex justify-end">
              {/* Summary totals box */}
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
