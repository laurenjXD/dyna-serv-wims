import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
import { vmiPermits } from "@/lib/db/schema/vmi_billing";
import { getPickList, getPickListItems } from "@/lib/db/queries/withdrawals";
import { PickListPrintButton } from "../print/_components/PickListPrintButton";

export default async function DeliveryReceiptPage({
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

  const [lines, partyRows, permitRows] = await Promise.all([
    getPickListItems(db, pickListId),
    db
      .select({ name: parties.name, address1: parties.address1, address2: parties.address2 })
      .from(parties)
      .where(eq(parties.id, pickList.customerPartyId))
      .limit(1),
    db
      .select({ permitNumber: vmiPermits.permitNumber })
      .from(vmiPermits)
      .where(and(eq(vmiPermits.partyId, pickList.customerPartyId), eq(vmiPermits.isActive, true)))
      .limit(1),
  ]);

  const party = partyRows[0];
  const pezaPermitNo = permitRows[0]?.permitNumber ?? null;
  const totalQty = lines.reduce((sum, line) => sum + line.qty, 0);
  const totalBoxes = lines.reduce((sum, line) => sum + line.numberOfBoxes, 0);

  return (
    <main className="min-h-screen bg-[#EEF2F8] p-4 text-[#111827] print:bg-white print:p-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page {
              size: A4 landscape;
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

      <div className="print-hide mx-auto mb-4 flex max-w-[1500px] items-center justify-between gap-4">
        <Link
          href="/outgoing?tab=ledger"
          className="inline-flex items-center gap-2 rounded border border-outline-variant/40 bg-surface-white px-4 py-2.5 font-label text-label font-bold text-brand-navy hover:bg-surface-light-grey"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          Back to Outgoing Ledger
        </Link>
        <PickListPrintButton />
      </div>

      <article className="mx-auto max-w-[1500px] rounded-xl border border-slate-300 bg-surface-white p-6 shadow-elevation-2 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        {/* Document Header */}
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
                    Official Acknowledgement Receipt (Delivery Proof)
                  </p>
                </div>
              </div>
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                Official Carrier Dock Handover &amp; Custody Turnover Record
              </p>
            </div>

            <div className="text-right">
              <p className="font-mono text-[10px] uppercase font-bold text-slate-500">Delivery Receipt No.</p>
              <p className="font-mono text-xs font-black text-brand-navy">DR-{pickList.pickListNumber.replace(/^PL-/, "")}</p>
              <p className="font-mono text-[10px] text-slate-500">Pick List Ref: {pickList.pickListNumber}</p>
            </div>
          </div>

          {/* Delivery & Logistics Details Grid */}
          <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 font-mono text-[11px] sm:grid-cols-4">
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Delivery To (Customer)</p>
              <p className="mt-0.5 font-bold text-slate-900">{party?.name ?? pickList.customerPartyId}</p>
              <p className="text-[10px] text-slate-500 truncate">{[party?.address1, party?.address2].filter(Boolean).join(", ") || "Address on file"}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Inventory Flow</p>
              <p className="mt-0.5 font-bold text-slate-900">{pickList.flowType.toUpperCase()}</p>
              <p className="text-[10px] text-slate-500">STATUS: {pickList.status.toUpperCase()}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">PEZA Permit No.</p>
              <p className="mt-0.5 font-bold text-slate-900">{pezaPermitNo ?? "—"}</p>
              <p className="text-[10px] text-slate-500">Zone Authorization</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500">Delivery Date</p>
              <p className="mt-0.5 font-bold text-slate-900">
                {pickList.createdAt.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
              </p>
              <p className="text-[10px] text-slate-500">GEN: {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        </header>

        <section className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-800">
              Delivered Cargo Line Items ({lines.length} Lines)
            </h2>
            <span className="font-mono text-[10px] uppercase font-bold text-slate-500">
              Total Boxes: {totalBoxes.toLocaleString()} &bull; Total PCS: {totalQty.toLocaleString()}
            </span>
          </div>

          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse border border-slate-300 font-mono text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-[10px]">
                  <th className="border border-slate-300 px-2 py-1.5 text-center uppercase font-bold tracking-wider text-slate-700 w-8">#</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">Item Code</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">Cust PN</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">Description</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">Lot Number</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left uppercase font-bold tracking-wider text-slate-700">Location</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider text-slate-700">SPQ</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider text-slate-700">Boxes</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right uppercase font-bold tracking-wider text-slate-700">Qty (PCS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {lines.map((line, index) => (
                  <tr key={line.id} className="hover:bg-slate-50">
                    <td className="border border-slate-300 px-2 py-1.5 text-center font-bold text-slate-500">{index + 1}</td>
                    <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900">{line.itemCode}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-slate-600">{line.customerItemCode ?? "—"}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-slate-800 max-w-[220px] truncate">{line.itemDescription ?? "—"}</td>
                    <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900">{line.lotNumber}</td>
                    <td className="border border-slate-300 px-2 py-1.5 font-bold text-brand-navy">{line.locationLabel}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right text-slate-700">{line.spq.toLocaleString()}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-slate-900">{line.numberOfBoxes.toLocaleString()}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-brand-navy">{line.qty.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-800 bg-slate-100 font-bold">
                <tr>
                  <td colSpan={7} className="border border-slate-300 px-2 py-1.5 text-right text-[10px] uppercase text-slate-800">
                    Total Delivered:
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-right text-brand-navy">
                    {totalBoxes.toLocaleString()} boxes
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-right text-brand-navy">
                    {totalQty.toLocaleString()} pcs
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="avoid-break mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 font-mono text-[11px]">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Delivery Instructions / Remarks</div>
          <div className="mt-0.5 text-slate-700">Official Physical Handover &amp; Custody Turnover for Client Account. Intact and Accounted.</div>
        </section>

        <footer className="avoid-break mt-6 grid grid-cols-3 gap-4 border-t border-slate-300 pt-4 font-mono text-[10px]">
          <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3">
            <p className="uppercase font-bold text-slate-700">Checked By:</p>
            <div className="mt-8 border-b border-dashed border-slate-400" />
            <p className="mt-1 text-slate-500">Signature over Printed Name</p>
          </div>
          <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3">
            <p className="uppercase font-bold text-slate-700">Loaded By:</p>
            <div className="mt-8 border-b border-dashed border-slate-400" />
            <p className="mt-1 text-slate-500">Signature over Printed Name</p>
          </div>
          <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3">
            <p className="uppercase font-bold text-brand-navy">Acknowledged &amp; Received By:</p>
            <div className="mt-8 border-b border-dashed border-slate-400" />
            <p className="mt-1 text-slate-500">Signature over Printed Name</p>
          </div>
        </footer>
      </article>
    </main>
  );
}
