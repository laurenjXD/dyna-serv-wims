// Pre-Alert / Incoming Shipment Advice — Professional Exportable PDF Template.
//
// Traceability:
//   MOM Section F — Pre-Alert PDF export generation
//   MOM Section J — Professional Dyna-Serv document template with logo & internal CBM redaction
//   specs/07-incoming-receiving/design.md §5.3

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, FileSpreadsheet, Printer } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import { WrrBarcode } from "../print/_components/WrrBarcode";
import { PrintButton } from "../print/_components/PrintButton";

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI (Vendor Managed Inventory)",
  trading: "Trading Inventory",
  supplies: "Internal Supplies",
};

interface PageProps {
  params: Promise<{ wrrId: string }>;
}

export default async function PreAlertExportPage({ params }: PageProps) {
  const { wrrId } = await params;
  const resolver = await createPageResolver();

  const permResult = await requirePermission(resolver, "receiving.view");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const wrr = await getWrrDocument(db, wrrId);
  if (!wrr) {
    notFound();
  }

  const totalExpectedUnits = wrr.items.reduce((sum, item) => sum + item.expectedQty, 0);

  return (
    <div className="mx-auto max-w-5xl bg-surface-white px-4 py-8 print:max-w-none print:p-0">
      {/* Print media styling */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              aside, header, nav, .print-hide {
                display: none !important;
              }
              body {
                background: #FFFFFF !important;
              }
              main {
                padding: 0 !important;
                margin: 0 !important;
              }
              @page {
                size: A4 portrait;
                margin: 12mm 15mm 15mm 15mm;
              }
            }
          `,
        }}
      />

      {/* Screen Toolbar */}
      <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-light-grey p-4 shadow-elevation-1">
        <Link
          href={`/receiving/${wrrId}`}
          className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/40 bg-surface-white px-4 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          Back to WRR
        </Link>
        <div className="flex items-center gap-3">
          <PrintButton />
        </div>
      </div>

      {/* Formal Pre-Alert Document Container */}
      <article className="rounded-xl border border-outline-variant/40 bg-surface-white p-8 shadow-elevation-2 print:border-0 print:p-0 print:shadow-none">
        {/* Header with Logo and Title */}
        <header className="border-b-2 border-brand-navy pb-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="Dyna-Serv" className="mb-2 h-12 w-auto" />
              <p className="font-label text-label font-bold uppercase tracking-[0.15em] text-brand-royal-blue">
                Dyna-Serv Warehouse Inventory Management System
              </p>
              <h1 className="mt-1 font-heading text-headline-lg font-extrabold text-on-surface">
                Pre-Alert / Incoming Shipment Advice
              </h1>
            </div>
            <div className="text-right">
              <p className="font-label text-label-xs uppercase tracking-wider text-text-grey">
                Document Ref
              </p>
              <p className="mt-0.5 font-mono text-mono-lg font-bold text-brand-navy">
                {wrr.wrrNumber}
              </p>
              <p className="mt-1 font-body text-body-xs text-text-grey">
                Generated: {new Date().toLocaleDateString()}
              </p>
              <div className="mt-2 flex justify-end">
                <WrrBarcode wrrNumber={wrr.wrrNumber} />
              </div>
            </div>
          </div>

          {/* Shipment Summary Grid */}
          <div className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-surface-light-grey/60 p-4 font-body text-body-sm sm:grid-cols-4">
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-text-grey">Vendor / Organization</p>
              <p className="mt-0.5 font-semibold text-on-surface">{wrr.vendorPartyName ?? wrr.vendorPartyId}</p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-text-grey">Inventory Model</p>
              <p className="mt-0.5 font-semibold text-on-surface">{FLOW_LABELS[wrr.flowType] ?? wrr.flowType}</p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-text-grey">Commercial Invoice #</p>
              <p className="mt-0.5 font-mono font-semibold text-on-surface">{wrr.commercialInvoiceNo || "—"}</p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-text-grey">IP Number</p>
              <p className="mt-0.5 font-mono font-semibold text-on-surface">{wrr.ipNumber || "—"}</p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-text-grey">MAWB / MBL Number</p>
              <p className="mt-0.5 font-mono font-semibold text-on-surface">{wrr.mawbMblNumber || "—"}</p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-text-grey">PEZA Number</p>
              <p className="mt-0.5 font-mono font-semibold text-on-surface">{wrr.pezaNumber || "—"}</p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-text-grey">Person in Charge</p>
              <p className="mt-0.5 font-semibold text-on-surface">{wrr.stagedByDisplayName ?? wrr.stagedByUserId}</p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-text-grey">Shipment Status</p>
              <p className="mt-0.5 font-semibold uppercase text-brand-royal-blue">{wrr.status.replace(/_/g, " ")}</p>
            </div>
          </div>
        </header>

        {/* Line Items Table */}
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-title-md font-bold text-on-surface">
              Expected Line Items ({wrr.items.length})
            </h2>
            <span className="font-mono text-body-sm font-bold text-brand-navy">
              Total Expected Units: {totalExpectedUnits.toLocaleString()}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left font-body text-body-sm">
              <thead>
                <tr className="border-y-2 border-brand-navy bg-surface-light-grey text-xs">
                  <th className="px-3 py-2.5 font-label font-bold uppercase text-on-surface">#</th>
                  <th className="px-3 py-2.5 font-label font-bold uppercase text-on-surface">Item Code</th>
                  <th className="px-3 py-2.5 font-label font-bold uppercase text-on-surface">Cust Part #</th>
                  <th className="px-3 py-2.5 font-label font-bold uppercase text-on-surface">Description</th>
                  <th className="px-3 py-2.5 font-label font-bold uppercase text-on-surface">Lot Number</th>
                  <th className="px-3 py-2.5 font-label font-bold uppercase text-on-surface">Mfg Date</th>
                  <th className="px-3 py-2.5 text-right font-label font-bold uppercase text-on-surface">Expected Qty</th>
                  <th className="px-3 py-2.5 font-label font-bold uppercase text-on-surface">UOM</th>
                  <th className="px-3 py-2.5 font-label font-bold uppercase text-on-surface">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {wrr.items.map((item, index) => (
                  <tr key={item.id} className="hover:bg-surface-light-grey/30">
                    <td className="px-3 py-2.5 font-mono text-text-grey">{index + 1}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-on-surface">{item.itemCode ?? item.supplierItemCode ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-text-grey">{item.customerItemCode ?? "—"}</td>
                    <td className="px-3 py-2.5 text-on-surface">{item.itemName ?? item.itemCode ?? item.supplierItemCode ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-on-surface">{item.lotNumber}</td>
                    <td className="px-3 py-2.5 font-mono text-text-grey">{item.manufactureDate ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-on-surface">
                      {item.expectedQty.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 font-label uppercase text-text-grey">{item.uom}</td>
                    <td className="px-3 py-2.5 text-text-grey">{item.remarks ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-brand-navy bg-surface-light-grey/80 font-bold">
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-right font-label uppercase text-on-surface">
                    Total Expected Quantity:
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-mono-md font-bold text-brand-navy">
                    {totalExpectedUnits.toLocaleString()}
                  </td>
                  <td colSpan={2} className="px-3 py-3 font-label uppercase text-text-grey">
                    PCS / UNITS
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary totals box */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-xs rounded-lg border border-outline-variant/40 bg-surface-light-grey/40 p-4 font-body text-body-md">
              <dl className="space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-text-grey">Total Expected Lines:</dt>
                  <dd className="font-mono font-bold text-on-surface">{wrr.items.length} lines</dd>
                </div>
                <div className="flex justify-between border-t border-outline-variant/30 pt-1.5">
                  <dt className="font-bold text-on-surface">Grand Total Quantity:</dt>
                  <dd className="font-mono font-bold text-brand-navy text-headline-sm">{totalExpectedUnits.toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* Document Footer & Authorization Sign-off */}
        <footer className="mt-12 border-t border-outline-variant/50 pt-6">
          <div className="grid grid-cols-2 gap-12 font-body text-body-sm text-text-grey">
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-on-surface">Shipment Prepared By:</p>
              <div className="mt-8 border-b border-on-surface/40 pb-1" />
              <p className="mt-1 text-xs">Authorized Signature &amp; Date</p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-on-surface">Warehouse Reception Verified By:</p>
              <div className="mt-8 border-b border-on-surface/40 pb-1" />
              <p className="mt-1 text-xs">Authorized Signature &amp; Date</p>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-text-grey/70">
            Dyna-Serv Warehouse Inventory Management System &bull; Confidential Pre-Alert Advice
          </p>
        </footer>
      </article>
    </div>
  );
}
