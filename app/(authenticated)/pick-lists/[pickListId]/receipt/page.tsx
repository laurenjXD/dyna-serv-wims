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

      <article className="mx-auto max-w-[1500px] bg-white p-6 shadow-elevation-2 print:max-w-none print:p-0 print:shadow-none">
        <header className="border-b-2 border-[#111827] pb-3">
          <div className="flex items-start justify-between gap-8">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/api/brand/logo" alt="Dyna-Serv" className="mb-2 h-10 w-auto" />
              <h1 className="text-lg font-bold uppercase tracking-wide">Acknowledgement Receipt</h1>
              <p className="mt-1 text-xs text-slate-600">Dyna-Serv Global Corporation</p>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-xs">
              <dt className="font-bold uppercase text-slate-600">Delivery Receipt No.</dt>
              <dd className="font-mono font-bold text-brand-navy">DR-{pickList.pickListNumber.replace(/^PL-/, "")}</dd>
              <dt className="font-bold uppercase text-slate-600">Pick List No.</dt>
              <dd className="font-mono font-bold">{pickList.pickListNumber}</dd>
              <dt className="font-bold uppercase text-slate-600">PEZA Permit No.</dt>
              <dd className="font-mono font-bold">{pezaPermitNo ?? "—"}</dd>
              <dt className="font-bold uppercase text-slate-600">Delivery Date</dt>
              <dd className="font-mono">{pickList.createdAt.toLocaleDateString()}</dd>
            </dl>
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-8 text-xs">
            <div>
              <p className="font-bold uppercase text-slate-600">Delivery To:</p>
              <p className="font-bold text-on-surface">{party?.name ?? pickList.customerPartyId}</p>
              <p className="text-slate-600">{[party?.address1, party?.address2].filter(Boolean).join(", ") || "Address on file"}</p>
            </div>
            <div className="text-right">
              <p><span className="font-bold uppercase text-slate-600">Inventory Model:</span> <span className="font-semibold uppercase">{pickList.flowType}</span></p>
              <p><span className="font-bold uppercase text-slate-600">Generated:</span> <span className="font-mono">{new Date().toLocaleString()}</span></p>
            </div>
          </div>
        </header>

        <section className="mt-4">
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full table-fixed border-collapse font-body text-[11px] leading-tight">
              <colgroup>
                <col className="w-[4%]" />
                <col className="w-[6%]" />
                <col className="w-[5%]" />
                <col className="w-[7%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="bg-[#D8DDE5] text-left text-[10px] font-bold uppercase tracking-wider text-on-surface">
                  <th className="border border-[#374151] px-2 py-1.5 text-center">#</th>
                  <th className="border border-[#374151] px-2 py-1.5 text-right">Qty</th>
                  <th className="border border-[#374151] px-2 py-1.5 text-right">SPQ</th>
                  <th className="border border-[#374151] px-2 py-1.5 text-right">Boxes</th>
                  <th className="border border-[#374151] px-2 py-1.5">Item Code</th>
                  <th className="border border-[#374151] px-2 py-1.5">Cust PN</th>
                  <th className="border border-[#374151] px-2 py-1.5">Item Description</th>
                  <th className="border border-[#374151] px-2 py-1.5">Lot Number</th>
                  <th className="border border-[#374151] px-2 py-1.5">PO #</th>
                  <th className="border border-[#374151] px-2 py-1.5">Invoice #</th>
                  <th className="border border-[#374151] px-2 py-1.5">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {lines.map((line, index) => (
                  <tr key={line.id} className="hover:bg-surface-light-grey/20">
                    <td className="border border-[#6B7280] px-2 py-1.5 text-center font-mono text-text-grey">{index + 1}</td>
                    <td className="border border-[#6B7280] px-2 py-1.5 text-right font-mono font-bold text-on-surface">{line.qty.toLocaleString()}</td>
                    <td className="border border-[#6B7280] px-2 py-1.5 text-right font-mono text-text-grey">{line.spq.toLocaleString()}</td>
                    <td className="border border-[#6B7280] px-2 py-1.5 text-right font-mono font-bold text-on-surface">{line.numberOfBoxes.toLocaleString()}</td>
                    <td className="border border-[#6B7280] px-2 py-1.5 font-mono font-bold text-on-surface">{line.itemCode}</td>
                    <td className="border border-[#6B7280] px-2 py-1.5 font-mono text-text-grey">{line.customerItemCode ?? "—"}</td>
                    <td className="border border-[#6B7280] px-2 py-1.5 text-on-surface">{line.itemDescription ?? "—"}</td>
                    <td className="border border-[#6B7280] px-2 py-1.5 font-mono font-bold text-on-surface">{line.lotNumber}</td>
                    <td className="border border-[#6B7280] px-2 py-1.5 font-mono text-text-grey">—</td>
                    <td className="border border-[#6B7280] px-2 py-1.5 font-mono text-text-grey">—</td>
                    <td className="border border-[#6B7280] px-2 py-1.5 font-mono font-bold text-brand-navy">{line.locationLabel}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-brand-navy bg-[#D8DDE5] font-bold text-[11px]">
                <tr>
                  <td className="border border-[#6B7280] px-2 py-1.5 text-center uppercase font-bold text-on-surface">Total</td>
                  <td className="border border-[#6B7280] px-2 py-1.5 text-right font-mono font-bold text-brand-navy">{totalQty.toLocaleString()}</td>
                  <td className="border border-[#6B7280] px-2 py-1.5 text-right font-mono text-text-grey">—</td>
                  <td className="border border-[#6B7280] px-2 py-1.5 text-right font-mono font-bold text-brand-navy">{totalBoxes.toLocaleString()}</td>
                  <td colSpan={7} className="border border-[#6B7280] px-2 py-1.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="avoid-break mt-4 border border-[#374151] text-xs">
          <div className="bg-[#D8DDE5] px-2.5 py-1.5 font-bold uppercase tracking-wider text-on-surface">Delivery Instructions / Remarks</div>
          <div className="min-h-10 px-2.5 py-2 font-body text-[11px] text-text-grey">—</div>
        </section>

        <footer className="avoid-break mt-6 grid grid-cols-3 border border-[#374151] text-xs">
          <div className="min-h-20 border-r border-[#374151] p-3">
            <p className="font-bold uppercase tracking-wider text-on-surface">Checked By:</p>
            <div className="mt-8 border-b border-dashed border-outline-variant/60" />
            <p className="mt-1 text-[10px] text-text-grey">Signature over Printed Name</p>
          </div>
          <div className="min-h-20 border-r border-[#374151] p-3">
            <p className="font-bold uppercase tracking-wider text-on-surface">Loaded By:</p>
            <div className="mt-8 border-b border-dashed border-outline-variant/60" />
            <p className="mt-1 text-[10px] text-text-grey">Signature over Printed Name</p>
          </div>
          <div className="min-h-20 p-3">
            <p className="font-bold uppercase tracking-wider text-on-surface">Acknowledged &amp; Received By:</p>
            <div className="mt-8 border-b border-dashed border-outline-variant/60" />
            <p className="mt-1 text-[10px] text-text-grey">Signature over Printed Name</p>
          </div>
        </footer>
      </article>
    </main>
  );
}
