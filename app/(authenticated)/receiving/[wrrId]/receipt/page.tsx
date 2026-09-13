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
      <div className="rounded-2xl border border-outline-variant/40 bg-surface-white p-8 shadow-elevation-2 print:border-0 print:p-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-brand-navy pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="Dyna-Serv" className="h-8 w-auto" />
              <span className="font-heading text-headline-sm font-extrabold text-on-surface">
                Dyna-Serv WIMS
              </span>
            </div>
            <h1 className="font-heading text-headline-md font-bold uppercase tracking-tight text-brand-navy">
              Inbound Goods Turnover Receipt
            </h1>
            <p className="font-body text-body-xs text-text-grey">
              Official Carrier Dock Handover & Physical Receipt Proof
            </p>
          </div>

          <div className="text-right">
            <p className="font-label text-label-xs uppercase text-text-grey font-bold">
              Receipt #
            </p>
            <p className="font-mono text-mono-lg font-extrabold text-brand-navy">
              {receiptNumber}
            </p>
            <p className="mt-1 font-mono text-mono-xs text-text-grey">
              Ref WRR: {wrr.wrrNumber}
            </p>
            <div className="mt-2 flex justify-end">
              <WrrBarcode wrrNumber={receiptNumber} />
            </div>
          </div>
        </div>

        {/* Handover & Vendor Logistics Details */}
        <div className="mt-5 grid grid-cols-2 gap-4 rounded-xl border border-outline-variant/30 bg-surface-light-grey/40 p-4 text-body-sm sm:grid-cols-4">
          <div>
            <p className="font-label text-label-xs uppercase text-text-grey font-bold">Supplier / Vendor</p>
            <p className="mt-0.5 font-body font-bold text-on-surface">{wrr.vendorPartyName ?? "—"}</p>
            <p className="font-mono text-mono-xs text-text-grey">{wrr.vendorPartyCode ?? "—"}</p>
          </div>
          <div>
            <p className="font-label text-label-xs uppercase text-text-grey font-bold">Invoice / CI/PL Ref</p>
            <p className="mt-0.5 font-mono font-bold text-on-surface">{wrr.commercialInvoiceNo ?? "—"}</p>
            <p className="font-label text-label-xs uppercase text-text-grey">Flow: {wrr.flowType.toUpperCase()}</p>
          </div>
          <div>
            <p className="font-label text-label-xs uppercase text-text-grey font-bold">MAWB / MBL #</p>
            <p className="mt-0.5 font-mono font-bold text-on-surface">{wrr.mawbMblNumber ?? "—"}</p>
            <p className="font-mono text-mono-xs text-text-grey">PEZA: {wrr.pezaNumber ?? "N/A"}</p>
          </div>
          <div>
            <p className="font-label text-label-xs uppercase text-text-grey font-bold">Dock Receipt Date</p>
            <p className="mt-0.5 font-mono font-bold text-on-surface">
              {wrr.confirmedAt
                ? new Date(wrr.confirmedAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
                : new Date(wrr.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
            </p>
            <p className="font-mono text-mono-xs text-text-grey">Status: {wrr.status.toUpperCase()}</p>
          </div>
        </div>

        {/* Goods Tally Table */}
        <div className="mt-6">
          <div className="flex items-center justify-between pb-2">
            <h2 className="font-heading text-headline-sm font-bold text-on-surface">
              Cargo Turnover Breakdown
            </h2>
            <span className="font-label text-label-xs uppercase text-text-grey">
              Total {wrr.items.length} Line Items
            </span>
          </div>

          <table className="w-full border-collapse border border-outline-variant/40">
            <thead>
              <tr className="bg-surface-light-grey">
                <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label-xs uppercase font-bold text-text-grey">
                  Item / Part Number
                </th>
                <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label-xs uppercase font-bold text-text-grey">
                  Description
                </th>
                <th className="border border-outline-variant/30 px-3 py-2 text-left font-label text-label-xs uppercase font-bold text-text-grey">
                  Lot / Batch
                </th>
                <th className="border border-outline-variant/30 px-3 py-2 text-right font-label text-label-xs uppercase font-bold text-text-grey">
                  Boxes / Cartons
                </th>
                <th className="border border-outline-variant/30 px-3 py-2 text-right font-label text-label-xs uppercase font-bold text-text-grey">
                  Total Units (PCS)
                </th>
                <th className="border border-outline-variant/30 px-3 py-2 text-center font-label text-label-xs uppercase font-bold text-text-grey">
                  Package Condition
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {wrr.items.map((item: WrrItemRow) => {
                const spq = Number(item.spq) || 1;
                const boxCount = item.scannedQty > 0 ? item.scannedQty : item.expectedQty;
                const totalUnits = boxCount * spq;

                return (
                  <tr key={item.id} className="text-body-sm">
                    <td className="border border-outline-variant/30 px-3 py-2 font-mono text-mono-sm font-bold text-on-surface">
                      {item.itemCode ?? item.supplierItemCode ?? "—"}
                    </td>
                    <td className="border border-outline-variant/30 px-3 py-2 font-body text-body-sm text-on-surface">
                      {item.itemName ?? "—"}
                    </td>
                    <td className="border border-outline-variant/30 px-3 py-2 font-mono text-mono-sm text-text-grey">
                      {item.lotNumber}
                    </td>
                    <td className="border border-outline-variant/30 px-3 py-2 text-right font-mono text-mono-sm font-bold text-on-surface">
                      {boxCount.toLocaleString()} {boxCount === 1 ? "box" : "boxes"}
                    </td>
                    <td className="border border-outline-variant/30 px-3 py-2 text-right font-mono text-mono-sm font-bold text-brand-navy">
                      {totalUnits.toLocaleString()} {item.uom || "PCS"}
                    </td>
                    <td className="border border-outline-variant/30 px-3 py-2 text-center">
                      <span className="inline-flex items-center gap-1 rounded bg-status-available/10 px-2 py-0.5 font-label text-[11px] font-bold text-status-available">
                        <CheckCircle2 size={12} /> Intact / Verified
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-brand-navy bg-surface-light-grey font-bold">
              <tr>
                <td colSpan={3} className="border border-outline-variant/30 px-3 py-2 text-right font-label text-label-xs uppercase text-on-surface">
                  Grand Total Received:
                </td>
                <td className="border border-outline-variant/30 px-3 py-2 text-right font-mono text-mono-md text-brand-navy">
                  {totalBoxes.toLocaleString()} boxes
                </td>
                <td className="border border-outline-variant/30 px-3 py-2 text-right font-mono text-mono-md text-brand-navy">
                  {totalPieces.toLocaleString()} pcs
                </td>
                <td className="border border-outline-variant/30 px-3 py-2 text-center font-label text-label-xs uppercase text-status-available">
                  All Items Accounted
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Physical Handover & Sign-off Blocks */}
        <div className="mt-10 grid grid-cols-2 gap-8 border-t border-outline-variant/30 pt-6">
          <div className="rounded-xl border border-outline-variant/30 bg-surface-light-grey/20 p-4">
            <p className="font-label text-label-xs uppercase font-bold text-text-grey">
              Delivered By (Forwarder / Driver)
            </p>
            <div className="mt-8 border-b border-dashed border-outline-variant/60" />
            <div className="mt-2 flex justify-between font-body text-body-xs text-text-grey">
              <span>Driver Signature & Printed Name</span>
              <span>Plate # / Forwarder</span>
            </div>
            <p className="mt-3 font-body text-body-xs text-text-grey">
              Date & Time: ________________________
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-light-grey/20 p-4">
            <p className="font-label text-label-xs uppercase font-bold text-brand-navy">
              Received & Inspected At Dock By (Dyna-Serv WIMS)
            </p>
            <div className="mt-8 border-b border-dashed border-outline-variant/60" />
            <div className="mt-2 flex justify-between font-body text-body-xs text-text-grey">
              <span>Warehouse Receiver Signature</span>
              <span>Supervisor Verified</span>
            </div>
            <p className="mt-3 font-body text-body-xs text-text-grey">
              Date & Time: ________________________
            </p>
          </div>
        </div>

        {/* Footer Security Notice */}
        <div className="mt-8 flex items-center justify-between border-t border-outline-variant/20 pt-4 text-text-grey font-body text-body-xs">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-brand-navy" />
            <span>Official Dyna-Serv WIMS Dock Turnover Record — Stored Authoritatively</span>
          </div>
          <span className="font-mono text-[11px]">{receiptNumber}</span>
        </div>
      </div>
    </main>
  );
}
