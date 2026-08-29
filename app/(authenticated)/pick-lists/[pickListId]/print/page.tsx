import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeft, Printer } from "lucide-react";
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
    <main className="mx-auto max-w-7xl bg-surface-white pb-10 print:max-w-none print:p-0">
      {/* Print media rules */}
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
      <article className="rounded-xl border border-outline-variant/40 bg-surface-white p-8 shadow-elevation-2 print:border-0 print:p-0 print:shadow-none">
        {/* Header with Logo and Barcode */}
        <header className="border-b-2 border-brand-navy pb-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="Dyna-Serv" className="mb-2 h-12 w-auto" />
              <p className="font-label text-label font-bold uppercase tracking-[0.15em] text-brand-royal-blue">
                Dyna-Serv Warehouse Inventory Management System
              </p>
              <h1 className="mt-1 font-heading text-headline-lg font-extrabold text-on-surface">
                Official Pick List
              </h1>
            </div>
            <div className="text-right">
              <p className="font-label text-label-xs uppercase tracking-wider text-text-grey">
                Document Number
              </p>
              <p className="mt-0.5 font-mono text-mono-lg font-bold text-brand-navy">
                {pickList.pickListNumber}
              </p>
              <p className="mt-1 font-body text-body-xs text-text-grey">
                Date: {pickList.createdAt.toLocaleDateString()}
              </p>
              <div className="mt-2 flex justify-end">
                <WrrBarcode wrrNumber={pickList.pickListNumber} />
              </div>
            </div>
          </div>

          {/* Delivery & Shipment Info Grid */}
          <div className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-surface-light-grey/60 p-4 font-body text-body-sm sm:grid-cols-4">
            <div className="col-span-2">
              <p className="font-label text-label-xs font-bold uppercase text-text-grey">Delivery To (Customer)</p>
              <p className="mt-0.5 font-bold text-on-surface">{party?.name ?? pickList.customerPartyId}</p>
              <p className="mt-0.5 text-body-xs text-text-grey">
                {[party?.address1, party?.address2].filter(Boolean).join(", ") || "Address on file"}
              </p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-text-grey">Inventory Model</p>
              <p className="mt-0.5 font-semibold text-on-surface">
                {FLOW_LABELS[pickList.flowType] ?? pickList.flowType}
              </p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-text-grey">Pick List Status</p>
              <p className="mt-0.5 font-semibold uppercase text-brand-royal-blue">{pickList.status}</p>
            </div>
          </div>
        </header>

        {/* Pick List Line Items Table */}
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-title-md font-bold text-on-surface">
              Items to Pick ({lines.length} Lines)
            </h2>
            <span className="font-mono text-body-sm font-bold text-brand-navy">
              Total Boxes: {totalBoxes.toLocaleString()} &bull; Total PCS: {totalPieces.toLocaleString()}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left font-body text-body-sm">
              <thead>
                <tr className="border-y-2 border-brand-navy bg-surface-light-grey text-xs">
                  <th className="px-2.5 py-3 text-center font-label font-bold uppercase text-on-surface w-12">
                    Picked
                  </th>
                  <th className="px-2.5 py-3 font-label font-bold uppercase text-on-surface">#</th>
                  <th className="px-3 py-3 font-label font-bold uppercase text-on-surface">Item Code</th>
                  <th className="px-3 py-3 font-label font-bold uppercase text-on-surface">Customer PN</th>
                  <th className="px-3 py-3 font-label font-bold uppercase text-on-surface">Description</th>
                  <th className="px-3 py-3 font-label font-bold uppercase text-on-surface">Lot Number</th>
                  <th className="px-3 py-3 font-label font-bold uppercase text-on-surface">Location</th>
                  <th className="px-3 py-3 text-right font-label font-bold uppercase text-on-surface">SPQ</th>
                  <th className="px-3 py-3 text-right font-label font-bold uppercase text-on-surface">Boxes</th>
                  <th className="px-3 py-3 text-right font-label font-bold uppercase text-on-surface">Qty (PCS)</th>
                  <th className="px-3 py-3 text-right font-label font-bold uppercase text-on-surface">Meterage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {lines.map((line, index) => {
                  const totalMeterage = line.spqMeter
                    ? (line.numberOfBoxes * Number(line.spqMeter)).toFixed(2) + " m"
                    : "—";

                  return (
                    <tr key={line.id} className="hover:bg-surface-light-grey/30">
                      {/* Physical Floor Verification Checkbox Box */}
                      <td className="px-2.5 py-3 text-center">
                        <div className="mx-auto h-5 w-5 rounded border-2 border-on-surface/80 bg-surface-white" />
                      </td>
                      <td className="px-2.5 py-3 font-mono text-text-grey">{index + 1}</td>
                      <td className="px-3 py-3 font-mono font-bold text-on-surface">{line.itemCode}</td>
                      <td className="px-3 py-3 font-mono text-text-grey">{line.customerItemCode ?? "—"}</td>
                      <td className="px-3 py-3 text-on-surface">{line.itemDescription ?? "—"}</td>
                      <td className="px-3 py-3 font-mono text-on-surface font-semibold">{line.lotNumber}</td>
                      <td className="px-3 py-3 font-mono font-bold text-brand-navy">{line.locationLabel}</td>
                      <td className="px-3 py-3 text-right font-mono text-on-surface">{line.spq.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-on-surface">
                        {line.numberOfBoxes.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-on-surface">
                        {line.qty.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-text-grey">{totalMeterage}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Summary Totals Box */}
        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-sm rounded-lg border border-outline-variant/40 bg-surface-light-grey/40 p-4 font-body text-body-md">
            <dl className="space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-text-grey">Total Packages / Boxes:</dt>
                <dd className="font-mono font-bold text-on-surface">{totalBoxes.toLocaleString()} boxes</dd>
              </div>
              <div className="flex justify-between border-t border-outline-variant/30 pt-1.5">
                <dt className="font-bold text-on-surface">Total Pick Quantity:</dt>
                <dd className="font-mono font-bold text-brand-navy text-headline-sm">{totalPieces.toLocaleString()} PCS</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Document Footer & Triple Sign-Off Authorization */}
        <footer className="mt-12 border-t border-outline-variant/50 pt-6">
          <div className="grid grid-cols-3 gap-8 font-body text-body-sm text-text-grey">
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-on-surface">Prepared By (Inventory Supervisor):</p>
              <div className="mt-8 border-b border-on-surface/40 pb-1" />
              <p className="mt-1 text-xs">Signature &amp; Date</p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-on-surface">Picked By (Warehouse Floor Staff):</p>
              <div className="mt-8 border-b border-on-surface/40 pb-1" />
              <p className="mt-1 text-xs">Signature &amp; Date</p>
            </div>
            <div>
              <p className="font-label text-label-xs font-bold uppercase text-on-surface">Dispatched &amp; Verified By:</p>
              <div className="mt-8 border-b border-on-surface/40 pb-1" />
              <p className="mt-1 text-xs">Signature &amp; Date</p>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-text-grey/70">
            Dyna-Serv Warehouse Inventory Management System &bull; Confidential Picking Document
          </p>
        </footer>
      </article>
    </main>
  );
}
