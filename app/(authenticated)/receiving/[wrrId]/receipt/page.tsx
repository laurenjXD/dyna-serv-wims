import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Printer, Truck, ShieldCheck, CheckCircle2 } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import type { WrrItemRow } from "@/lib/db/queries/receiving";
import { WrrBarcode } from "../print/_components/WrrBarcode";
import { PrintButton } from "../print/_components/PrintButton";

interface PageProps {
  params: Promise<{ wrrId: string }>;
}

export default async function InboundTurnoverReceiptPage({ params }: PageProps) {
  const { wrrId } = await params;
  const resolver = await createPageResolver();

  const permResult = await requirePermission(resolver, "receiving.view");
  const docPermResult = await requirePermission(resolver, "documents.read");
  if (permResult.kind !== "authorized" && docPermResult.kind !== "authorized") {
    notFound();
  }

  const wrr = await getWrrDocument(db, wrrId);
  if (!wrr) {
    notFound();
  }

  const items = wrr.items || [];
  const receiptNumber = `IGR-${(wrr.wrrNumber || "00000").replace(/^WRR-/, "")}`;
  const totalBoxes = items.reduce((sum, item) => sum + (Number(item.scannedQty) > 0 ? Number(item.scannedQty) : Number(item.expectedQty) || 0), 0);
  const totalPieces = items.reduce((sum, item) => {
    const spq = Number(item.spq) || 1;
    const count = Number(item.scannedQty) > 0 ? Number(item.scannedQty) : Number(item.expectedQty) || 0;
    return sum + (count * spq);
  }, 0);

  return (
    <main className="mx-auto max-w-4xl bg-surface-white pb-12 print:max-w-none print:p-0">
      {/* Print styles */}
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

      {/* Screen-only navigation bar */}
      <div className="print-hide mb-6 flex items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-light-grey p-4 shadow-elevation-1">
        <Link
          href={`/receiving/${wrrId}`}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-white px-3 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          <ChevronLeft size={16} /> Back to Receiving
        </Link>
        <div className="flex items-center gap-2">
          <PrintButton />
        </div>
      </div>

      {/* Official Inbound Goods Turnover Document Sheet */}
      <div className="rounded-xl border border-slate-300 bg-surface-white p-6 shadow-elevation-2 print:border-0 print:p-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/api/brand/logo" alt="Dyna-Serv" className="h-7 w-auto" />
              <span className="font-heading text-xs font-bold uppercase tracking-wider text-slate-800">
                Dyna-Serv WIMS
              </span>
            </div>
            <h1 className="font-heading text-sm font-extrabold uppercase tracking-wide text-brand-navy">
              Inbound Goods Turnover Receipt
            </h1>
            <p className="font-mono text-[10px] text-slate-500">
              Official Carrier Dock Handover &amp; Physical Receipt Record
            </p>
          </div>

          <div className="text-right">
            <p className="font-mono text-[10px] uppercase font-bold text-slate-500">
              Receipt No.
            </p>
            <p className="font-mono text-xs font-extrabold text-brand-navy">
              {receiptNumber}
            </p>
            <p className="font-mono text-[10px] text-slate-500">
              Ref WRR: {wrr.wrrNumber}
            </p>
            <div className="mt-1.5 flex justify-end">
              <WrrBarcode wrrNumber={receiptNumber} />
            </div>
          </div>
        </div>

        {/* Handover & Vendor Logistics Details */}
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 font-mono text-[11px] sm:grid-cols-4">
          <div>
            <p className="text-[9px] uppercase font-bold text-slate-500">Supplier / Vendor</p>
            <p className="mt-0.5 font-bold text-slate-900">{wrr.vendorPartyName ?? "—"}</p>
            <p className="text-[10px] text-slate-500">{wrr.vendorPartyCode ?? "—"}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold text-slate-500">Invoice / CI/PL Ref</p>
            <p className="mt-0.5 font-bold text-slate-900">{wrr.commercialInvoiceNo ?? "—"}</p>
            <p className="text-[10px] text-slate-500">FLOW: {wrr.flowType.toUpperCase()}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold text-slate-500">MAWB / MBL No.</p>
            <p className="mt-0.5 font-bold text-slate-900">{wrr.mawbMblNumber ?? "—"}</p>
            <p className="text-[10px] text-slate-500">IP: {wrr.ipNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold text-slate-500">Dock Receipt Date</p>
            <p className="mt-0.5 font-bold text-slate-900">
              {wrr.confirmedAt
                ? new Date(wrr.confirmedAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
                : new Date(wrr.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
            </p>
            <p className="text-[10px] text-slate-500">STATUS: {wrr.status.toUpperCase()}</p>
          </div>
        </div>

        {/* Goods Tally Table */}
        <div className="mt-5">
          <div className="flex items-center justify-between pb-1.5">
            <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-800">
              Cargo Turnover Breakdown
            </h2>
            <span className="font-mono text-[10px] uppercase font-bold text-slate-500">
              Total {wrr.items.length} Line Items
            </span>
          </div>

          <table className="w-full border-collapse border border-slate-300 font-mono text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-[10px]">
                <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">
                  Item / Part Number
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">
                  Description
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">
                  Lot / Batch
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider text-slate-700">
                  Boxes
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider text-slate-700">
                  Total Units
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-center uppercase font-bold tracking-wider text-slate-700">
                  Condition
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {wrr.items.map((item: WrrItemRow) => {
                const spq = Number(item.spq) || 1;
                const boxCount = item.scannedQty > 0 ? item.scannedQty : item.expectedQty;
                const totalUnits = boxCount * spq;

                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900">
                      {item.itemCode ?? item.supplierItemCode ?? "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 text-slate-800 font-body text-[11px]">
                      {item.itemName ?? "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900">
                      {item.lotNumber}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-slate-900">
                      {boxCount.toLocaleString()} {boxCount === 1 ? "box" : "boxes"}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-brand-navy">
                      {totalUnits.toLocaleString()} {item.uom || "PCS"}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 text-center">
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={11} /> Intact / Verified
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-800 bg-slate-100 font-bold">
              <tr>
                <td colSpan={3} className="border border-slate-300 px-2 py-1.5 text-right text-[10px] uppercase text-slate-800">
                  Grand Total Received:
                </td>
                <td className="border border-slate-300 px-2 py-1.5 text-right text-brand-navy">
                  {totalBoxes.toLocaleString()} boxes
                </td>
                <td className="border border-slate-300 px-2 py-1.5 text-right text-brand-navy">
                  {totalPieces.toLocaleString()} pcs
                </td>
                <td className="border border-slate-300 px-2 py-1.5 text-center text-[10px] uppercase text-emerald-700">
                  Accounted
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Physical Handover & Sign-off Blocks */}
        <div className="avoid-break mt-8 grid grid-cols-2 gap-6 border-t border-slate-300 pt-5">
          <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3.5">
            <p className="font-mono text-[10px] uppercase font-bold text-slate-600">
              Delivered By (Forwarder / Driver)
            </p>
            <div className="mt-8 border-b border-dashed border-slate-400" />
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-slate-500">
              <span>Driver Signature &amp; Printed Name</span>
              <span>Plate # / Forwarder</span>
            </div>
            <p className="mt-2.5 font-mono text-[10px] text-slate-500">
              Date &amp; Time: ________________________
            </p>
          </div>

          <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3.5">
            <p className="font-mono text-[10px] uppercase font-bold text-brand-navy">
              Received &amp; Inspected At Dock By (Dyna-Serv WIMS)
            </p>
            <div className="mt-8 border-b border-dashed border-slate-400" />
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-slate-500">
              <span>Warehouse Receiver Signature</span>
              <span>Supervisor Verified</span>
            </div>
            <p className="mt-2.5 font-mono text-[10px] text-slate-500">
              Date &amp; Time: ________________________
            </p>
          </div>
        </div>

        {/* Footer Security Notice */}
        <div className="avoid-break mt-6 flex items-center justify-between border-t border-slate-200 pt-3 text-slate-500 font-mono text-[10px]">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-brand-navy" />
            <span>Official Dyna-Serv WIMS Dock Turnover Record — Authoritative System Ledger</span>
          </div>
          <span>{receiptNumber}</span>
        </div>
      </div>
    </main>
  );
}
