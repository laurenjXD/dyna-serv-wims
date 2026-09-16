import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
import { getPickList, getPickListItems } from "@/lib/db/queries/withdrawals";
import { PickListPrintButton } from "./_components/PickListPrintButton";
import { WrrBarcode } from "../../../receiving/[wrrId]/print/_components/WrrBarcode";

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI (Vendor Managed Inventory)",
  trading: "Trading Inventory",
  supplies: "Internal Supplies",
};

export default async function PickListPrintPage({
  params,
}: {
  params: Promise<{ pickListId: string }>;
}) {
  const { pickListId } = await params;
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "pick_list.read");
  if (permission.kind !== "authorized") notFound();

  const pickList = await getPickList(db, pickListId);
  if (!pickList) notFound();

  const [lines, partyRows] = await Promise.all([
    getPickListItems(db, pickListId),
    db
      .select({ name: parties.name, address1: parties.address1, address2: parties.address2 })
      .from(parties)
      .where(eq(parties.id, pickList.customerPartyId))
      .limit(1),
  ]);

  const party = partyRows[0];
  const totalBoxes = lines.reduce((total, line) => total + line.numberOfBoxes, 0);
  const totalPieces = lines.reduce((total, line) => total + line.qty, 0);

  return (
    <main className="mx-auto w-full max-w-7xl bg-surface-white pb-10 print:max-w-none print:p-0">
      {/* Print media rules */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              [data-testid="desktop-sidebar"], [data-testid="floor-tab-bar"], .print-hide {
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
                size: A4 portrait;
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
            }
          `,
        }}
      />

      {/* Screen Toolbar */}
      <div className="print-hide mb-6 flex items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-light-grey p-4 shadow-elevation-1">
        <Link
          href="/inventory?tab=pick-lists"
          className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/40 bg-surface-white px-4 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          Back to Pick Lists
        </Link>
        <PickListPrintButton />
      </div>

      {/* Standardized Pick List Document Container */}
      <article className="rounded-xl border border-slate-300 bg-surface-white p-6 shadow-elevation-2 print:border-0 print:p-0 print:shadow-none">
        {/* Header with Logo and Barcode */}
        <header className="border-b-2 border-slate-800 pb-3">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/api/brand/logo" alt="Dyna-Serv" className="h-7 w-auto object-contain" />
                <div>
                  <h1 className="font-heading font-bold text-xs uppercase tracking-wider text-slate-800 leading-none">
                    DYNA-SERV GLOBAL CORPORATION
                  </h1>
                  <p className="mt-0.5 font-heading text-sm font-extrabold uppercase tracking-wide text-brand-navy">
                    Official Warehouse Pick List
                  </p>
                </div>
              </div>
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                Pick List Directive &bull; Floor Allocation &bull; Warehouse Operations
              </p>
            </div>

            <div className="text-right">
              <p className="font-mono text-[10px] uppercase font-bold text-slate-500">
                Pick List No.
              </p>
              <p className="font-mono text-xs font-black text-brand-navy">
                {pickList.pickListNumber}
              </p>
              <p className="font-mono text-[10px] text-slate-500">
                Date: {pickList.createdAt.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
              </p>
              <div className="mt-1 flex justify-end">
                <WrrBarcode wrrNumber={pickList.pickListNumber} />
              </div>
            </div>
          </div>

          {/* Delivery & Shipment Info Grid */}
          <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 font-mono text-[11px] sm:grid-cols-4">
            <div className="col-span-2">
              <p className="text-[9px] font-bold uppercase text-slate-500">Delivery To (Customer)</p>
              <p className="mt-0.5 font-bold text-slate-900">{party?.name ?? pickList.customerPartyId}</p>
              <p className="text-[10px] text-slate-500 truncate">
                {[party?.address1, party?.address2].filter(Boolean).join(", ") || "Address on file"}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Inventory Model</p>
              <p className="mt-0.5 font-bold text-slate-900">
                {FLOW_LABELS[pickList.flowType] ?? pickList.flowType.toUpperCase()}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Pick List Status</p>
              <p className="mt-0.5 font-bold uppercase text-brand-navy">{pickList.status}</p>
            </div>
          </div>
        </header>

        {/* Pick List Line Items Table */}
        <section className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-800">
              Items to Pick ({lines.length} Lines)
            </h2>
            <span className="font-mono text-[10px] uppercase font-bold text-slate-500">
              Total Boxes: {totalBoxes.toLocaleString()} &bull; Total PCS: {totalPieces.toLocaleString()}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-300 font-mono text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-[10px]">
                  <th className="border border-slate-300 px-2 py-1.5 text-center uppercase font-bold tracking-wider text-slate-700 w-10">
                    Check
                  </th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700 w-8">#</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">Item Code</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">Customer PN</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">Description</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">Lot Number</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">Location</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider text-slate-700">SPQ</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider text-slate-700">Boxes</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider text-slate-700">Qty (PCS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {lines.map((line, index) => {
                  return (
                    <tr key={line.id} className="hover:bg-slate-50">
                      {/* Physical Floor Verification Checkbox Box */}
                      <td className="border border-slate-300 px-2 py-1.5 text-center">
                        <div className="mx-auto h-3.5 w-3.5 rounded border border-slate-500 bg-surface-white" />
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-slate-500 font-bold">{index + 1}</td>
                      <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900">{line.itemCode}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-slate-600">{line.customerItemCode ?? "—"}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-slate-800 max-w-[200px] truncate">{line.itemDescription ?? "—"}</td>
                      <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900">{line.lotNumber}</td>
                      <td className="border border-slate-300 px-2 py-1.5 font-bold text-brand-navy">{line.locationLabel}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right text-slate-700">{line.spq.toLocaleString()}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-slate-900">
                        {line.numberOfBoxes.toLocaleString()}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-brand-navy">
                        {line.qty.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-800 bg-slate-100 font-bold">
                <tr>
                  <td colSpan={8} className="border border-slate-300 px-2 py-1.5 text-right text-[10px] uppercase text-slate-800">
                    Total Pick Allocation:
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-right text-brand-navy">
                    {totalBoxes.toLocaleString()} boxes
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-right text-brand-navy">
                    {totalPieces.toLocaleString()} pcs
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Avoid breaking across pages for summary and sign-offs */}
        <div className="avoid-break mt-6">
          {/* Document Footer & Triple Sign-Off Authorization */}
          <footer className="grid grid-cols-3 gap-4 border-t border-slate-300 pt-4 font-mono text-[10px]">
            <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3">
              <p className="uppercase font-bold text-slate-700">Prepared By (Supervisor):</p>
              <div className="mt-8 border-b border-dashed border-slate-400" />
              <div className="mt-1 flex justify-between text-slate-500">
                <span>Signature</span>
                <span>Date</span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3">
              <p className="uppercase font-bold text-slate-700">Picked By (Floor Staff):</p>
              <div className="mt-8 border-b border-dashed border-slate-400" />
              <div className="mt-1 flex justify-between text-slate-500">
                <span>Signature</span>
                <span>Date</span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3">
              <p className="uppercase font-bold text-brand-navy">Dispatched &amp; Verified By:</p>
              <div className="mt-8 border-b border-dashed border-slate-400" />
              <div className="mt-1 flex justify-between text-slate-500">
                <span>Signature</span>
                <span>Date</span>
              </div>
            </div>
          </footer>
          <p className="mt-4 text-center font-mono text-[10px] text-slate-400">
            Dyna-Serv Warehouse Inventory Management System &bull; Confidential Picking Directive &bull; Permanent Retention
          </p>
        </div>
      </article>
    </main>
  );
}
