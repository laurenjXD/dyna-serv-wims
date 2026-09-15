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
      <article className="rounded-xl border border-outline-variant/40 bg-surface-white p-6 shadow-elevation-2 print:border-0 print:p-0 print:shadow-none">
        {/* Header with Logo and Barcode */}
        <header className="border-b-2 border-brand-navy pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/api/brand/logo" alt="Dyna-Serv" className="h-8 w-auto object-contain" />
                <div>
                  <h1 className="font-heading font-extrabold text-headline-md text-brand-navy leading-none">
                    DYNA-SERV GLOBAL CORPORATION
                  </h1>
                  <p className="mt-0.5 font-label text-[10px] font-bold uppercase tracking-[0.1em] text-brand-royal-blue">
                    Warehouse Inventory Management System &bull; Official Pick List
                  </p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="font-label text-[10px] uppercase tracking-wider text-text-grey font-bold">
                Document Number
              </p>
              <p className="mt-0.5 font-mono text-mono-lg font-black text-brand-navy">
                {pickList.pickListNumber}
              </p>
              <p className="mt-0.5 font-body text-[11px] text-text-grey">
                Date: {pickList.createdAt.toLocaleDateString()}
              </p>
              <div className="mt-1 flex justify-end">
                <WrrBarcode wrrNumber={pickList.pickListNumber} />
              </div>
            </div>
          </div>

          {/* Delivery & Shipment Info Grid */}
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-surface-light-grey/60 p-3 font-body text-[11px] sm:grid-cols-4 border border-outline-variant/30">
            <div className="col-span-2">
              <p className="font-label text-[10px] font-bold uppercase text-text-grey">Delivery To (Customer)</p>
              <p className="mt-0.5 font-bold text-on-surface">{party?.name ?? pickList.customerPartyId}</p>
              <p className="mt-0.5 text-[10px] text-text-grey">
                {[party?.address1, party?.address2].filter(Boolean).join(", ") || "Address on file"}
              </p>
            </div>
            <div>
              <p className="font-label text-[10px] font-bold uppercase text-text-grey">Inventory Model</p>
              <p className="mt-0.5 font-bold text-on-surface">
                {FLOW_LABELS[pickList.flowType] ?? pickList.flowType}
              </p>
            </div>
            <div>
              <p className="font-label text-[10px] font-bold uppercase text-text-grey">Pick List Status</p>
              <p className="mt-0.5 font-bold uppercase text-brand-royal-blue">{pickList.status}</p>
            </div>
          </div>
        </header>

        {/* Pick List Line Items Table */}
        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-heading text-title-sm font-bold text-brand-navy">
              Items to Pick ({lines.length} Lines)
            </h2>
            <span className="font-mono text-[11px] font-bold text-brand-navy">
              Total Boxes: {totalBoxes.toLocaleString()} &bull; Total PCS: {totalPieces.toLocaleString()}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left font-body text-[11px] border border-outline-variant/30">
              <thead>
                <tr className="border-y border-brand-navy bg-surface-light-grey text-text-grey text-[10px]">
                  <th className="px-2 py-2 text-center font-label font-bold uppercase text-on-surface w-10 border border-outline-variant/30">
                    Picked
                  </th>
                  <th className="px-2 py-2 font-label font-bold uppercase text-on-surface border border-outline-variant/30">#</th>
                  <th className="px-2.5 py-2 font-label font-bold uppercase text-on-surface border border-outline-variant/30">Item Code</th>
                  <th className="px-2.5 py-2 font-label font-bold uppercase text-on-surface border border-outline-variant/30">Customer PN</th>
                  <th className="px-2.5 py-2 font-label font-bold uppercase text-on-surface border border-outline-variant/30">Description</th>
                  <th className="px-2.5 py-2 font-label font-bold uppercase text-on-surface border border-outline-variant/30">Lot Number</th>
                  <th className="px-2.5 py-2 font-label font-bold uppercase text-on-surface border border-outline-variant/30">Location</th>
                  <th className="px-2.5 py-2 text-right font-label font-bold uppercase text-on-surface border border-outline-variant/30">SPQ</th>
                  <th className="px-2.5 py-2 text-right font-label font-bold uppercase text-on-surface border border-outline-variant/30">Boxes</th>
                  <th className="px-2.5 py-2 text-right font-label font-bold uppercase text-on-surface border border-outline-variant/30">Qty (PCS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {lines.map((line, index) => {
                  return (
                    <tr key={line.id} className="hover:bg-surface-light-grey/30">
                      {/* Physical Floor Verification Checkbox Box */}
                      <td className="px-2 py-1.5 text-center border border-outline-variant/30">
                        <div className="mx-auto h-4 w-4 rounded border border-on-surface/80 bg-surface-white" />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-text-grey font-bold border border-outline-variant/30">{index + 1}</td>
                      <td className="px-2.5 py-1.5 font-mono font-bold text-brand-navy border border-outline-variant/30">{line.itemCode}</td>
                      <td className="px-2.5 py-1.5 font-mono text-text-grey border border-outline-variant/30">{line.customerItemCode ?? "—"}</td>
                      <td className="px-2.5 py-1.5 text-on-surface border border-outline-variant/30 max-w-[200px]">{line.itemDescription ?? "—"}</td>
                      <td className="px-2.5 py-1.5 font-mono text-on-surface font-semibold border border-outline-variant/30">{line.lotNumber}</td>
                      <td className="px-2.5 py-1.5 font-mono font-bold text-brand-navy border border-outline-variant/30">{line.locationLabel}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-on-surface border border-outline-variant/30">{line.spq.toLocaleString()}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono font-bold text-on-surface border border-outline-variant/30">
                        {line.numberOfBoxes.toLocaleString()}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono font-bold text-brand-navy border border-outline-variant/30">
                        {line.qty.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-brand-navy bg-surface-light-grey/80 font-bold">
                <tr>
                  <td colSpan={8} className="px-2.5 py-2 text-right font-label text-[10px] uppercase text-on-surface border border-outline-variant/30">
                    Total Pick Allocation:
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono text-brand-navy border border-outline-variant/30">
                    {totalBoxes.toLocaleString()} Boxes
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono text-brand-navy border border-outline-variant/30">
                    {totalPieces.toLocaleString()} PCS
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Avoid breaking across pages for summary and sign-offs */}
        <div className="avoid-break">
          {/* Summary Totals Box */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-sm rounded-lg border border-outline-variant/40 bg-surface-light-grey/40 p-3 font-body text-[11px]">
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-text-grey">Total Packages / Boxes:</dt>
                  <dd className="font-mono font-bold text-on-surface">{totalBoxes.toLocaleString()} boxes</dd>
                </div>
                <div className="flex justify-between border-t border-outline-variant/20 pt-1">
                  <dt className="font-bold text-on-surface">Total Pick Quantity:</dt>
                  <dd className="font-mono font-bold text-brand-navy">{totalPieces.toLocaleString()} PCS</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Document Footer & Triple Sign-Off Authorization */}
          <footer className="mt-8 border-t border-outline-variant/40 pt-4">
            <div className="grid grid-cols-3 gap-8 font-body text-[11px] text-text-grey">
              <div>
                <p className="font-label text-[10px] font-bold uppercase text-on-surface">Prepared By (Inventory Supervisor):</p>
                <div className="mt-8 border-b border-on-surface/40 pb-1" />
                <p className="mt-1 text-[10px]">Signature &amp; Date</p>
              </div>
              <div>
                <p className="font-label text-[10px] font-bold uppercase text-on-surface">Picked By (Warehouse Floor Staff):</p>
                <div className="mt-8 border-b border-on-surface/40 pb-1" />
                <p className="mt-1 text-[10px]">Signature &amp; Date</p>
              </div>
              <div>
                <p className="font-label text-[10px] font-bold uppercase text-on-surface">Dispatched &amp; Verified By:</p>
                <div className="mt-8 border-b border-on-surface/40 pb-1" />
                <p className="mt-1 text-[10px]">Signature &amp; Date</p>
              </div>
            </div>
            <p className="mt-6 text-center text-[10px] text-text-grey/70">
              Dyna-Serv Warehouse Inventory Management System &bull; Confidential Picking Document &bull; Retention: Permanent
            </p>
          </footer>
        </div>
      </article>
    </main>
  );
}
