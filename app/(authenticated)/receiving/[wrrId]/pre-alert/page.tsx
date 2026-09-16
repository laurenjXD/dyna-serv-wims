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
            @page {
              size: A4 portrait;
              margin: 10mm 12mm 12mm 12mm;
            }
            @media print {
              [data-testid="desktop-sidebar"], [data-testid="floor-tab-bar"], .print-hide {
                display: none !important;
              }
              body {
                background: #FFFFFF !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              main {
                padding: 0 !important;
                margin: 0 !important;
              }
              thead {
                display: table-header-group !important;
              }
              tr {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .avoid-break {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
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
      <article className="rounded-xl border border-slate-300 bg-surface-white p-6 shadow-elevation-2 print:border-0 print:p-0 print:shadow-none">
        {/* Header with Logo and Title */}
        <header className="border-b-2 border-slate-800 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/api/brand/logo" alt="Dyna-Serv" className="h-7 w-auto object-contain" />
                <span className="font-heading text-xs font-bold uppercase tracking-wider text-slate-800">
                  Dyna-Serv WIMS
                </span>
              </div>
              <h1 className="mt-1 font-heading text-sm font-extrabold uppercase tracking-wide text-brand-navy">
                Pre-Alert / Incoming Shipment Advice
              </h1>
              <p className="font-mono text-[10px] text-slate-500">
                Official Advance Inbound Freight &amp; Cargo Notification
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase font-bold text-slate-500">
                Document Ref
              </p>
              <p className="mt-0.5 font-mono text-xs font-black text-brand-navy">
                {wrr.wrrNumber}
              </p>
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                Generated: {new Date().toLocaleDateString()}
              </p>
              <div className="mt-1.5 flex justify-end">
                <WrrBarcode wrrNumber={wrr.wrrNumber} />
              </div>
            </div>
          </div>

          {/* Shipment Summary Grid */}
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 font-mono text-[11px] sm:grid-cols-4">
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Vendor / Organization</p>
              <p className="mt-0.5 font-bold text-slate-900">{wrr.vendorPartyName ?? wrr.vendorPartyId}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Inventory Model</p>
              <p className="mt-0.5 font-bold text-slate-900">{FLOW_LABELS[wrr.flowType] ?? wrr.flowType.toUpperCase()}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Commercial Invoice No.</p>
              <p className="mt-0.5 font-bold text-slate-900">{wrr.commercialInvoiceNo || "—"}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Import Permit (IP)</p>
              <p className="mt-0.5 font-bold text-slate-900">{wrr.ipNumber || "—"}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">MAWB / MBL Number</p>
              <p className="mt-0.5 font-bold text-slate-900">{wrr.mawbMblNumber || "—"}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Person in Charge</p>
              <p className="mt-0.5 font-bold text-slate-900">{wrr.stagedByDisplayName ?? wrr.stagedByUserId}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Shipment Status</p>
              <p className="mt-0.5 font-bold uppercase text-brand-navy">{wrr.status.replace(/_/g, " ")}</p>
            </div>
          </div>
        </header>

        {/* Line Items Table */}
        <section className="mt-5">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-800">
              Expected Line Items ({wrr.items.length})
            </h2>
            <span className="font-mono text-[10px] uppercase font-bold text-slate-500">
              Total Units: {totalExpectedUnits.toLocaleString()}
            </span>
          </div>

          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse border border-slate-300 text-left font-mono text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-[10px] border-b border-slate-300">
                  <th className="border border-slate-300 px-2 py-1.5 uppercase font-bold tracking-wider">#</th>
                  <th className="border border-slate-300 px-2 py-1.5 uppercase font-bold tracking-wider">Item Code</th>
                  <th className="border border-slate-300 px-2 py-1.5 uppercase font-bold tracking-wider">Cust Part #</th>
                  <th className="border border-slate-300 px-2 py-1.5 uppercase font-bold tracking-wider font-body">Description</th>
                  <th className="border border-slate-300 px-2 py-1.5 uppercase font-bold tracking-wider">Lot Number</th>
                  <th className="border border-slate-300 px-2 py-1.5 uppercase font-bold tracking-wider">Mfg Date</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider">Expected Qty</th>
                  <th className="border border-slate-300 px-2 py-1.5 uppercase font-bold tracking-wider">UOM</th>
                  <th className="border border-slate-300 px-2 py-1.5 uppercase font-bold tracking-wider">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {wrr.items.map((item, index) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="border border-slate-300 px-2 py-1.5 text-slate-500">{index + 1}</td>
                    <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900">
                      {item.itemCode ?? item.supplierItemCode ?? "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 text-slate-600">{item.customerItemCode ?? "—"}</td>
                    <td className="border border-slate-300 px-2 py-1.5 font-body text-[11px] text-slate-900">{item.itemName ?? item.itemCode ?? item.supplierItemCode ?? "—"}</td>
                    <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900">{item.lotNumber}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-slate-600">{item.manufactureDate ?? "—"}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-slate-900">
                      {item.expectedQty.toLocaleString()}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 uppercase text-slate-600">{item.uom || "PCS"}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-slate-500">{item.remarks ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-800 bg-slate-100 font-bold">
                <tr>
                  <td colSpan={6} className="border border-slate-300 px-2 py-1.5 text-right text-[10px] uppercase text-slate-800">
                    Total Expected Quantity:
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-brand-navy">
                    {totalExpectedUnits.toLocaleString()}
                  </td>
                  <td colSpan={2} className="border border-slate-300 px-2 py-1.5"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary totals box */}
          <div className="avoid-break mt-4 flex justify-end">
            <div className="w-full max-w-sm rounded-lg border border-slate-300 bg-slate-50/60 p-3 font-mono text-[11px]">
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Total Expected Lines:</dt>
                  <dd className="font-bold text-slate-900">{wrr.items.length} lines</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1">
                  <dt className="font-bold text-slate-900">Grand Total Quantity:</dt>
                  <dd className="font-bold text-brand-navy">{totalExpectedUnits.toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* Document Footer & Authorization Sign-off */}
        <footer className="avoid-break mt-8 border-t border-slate-300 pt-5">
          <div className="grid grid-cols-2 gap-8 font-mono text-[10px] text-slate-600">
            <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3.5">
              <p className="font-bold uppercase text-slate-700">Shipment Prepared By:</p>
              <div className="mt-8 border-b border-dashed border-slate-400 pb-1" />
              <p className="mt-1 text-[9px] text-slate-500">Authorized Signature &amp; Date</p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3.5">
              <p className="font-bold uppercase text-slate-700">Warehouse Reception Verified By:</p>
              <div className="mt-8 border-b border-dashed border-slate-400 pb-1" />
              <p className="mt-1 text-[9px] text-slate-500">Authorized Signature &amp; Date</p>
            </div>
          </div>
          <p className="mt-5 text-center font-mono text-[9px] text-slate-400">
            Dyna-Serv Warehouse Inventory Management System &bull; Confidential Pre-Alert Advice
          </p>
        </footer>
      </article>
    </div>
  );
}
