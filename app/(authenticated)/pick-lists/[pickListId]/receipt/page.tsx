import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
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

  const [lines, partyRows] = await Promise.all([
    getPickListItems(db, pickListId),
    db
      .select({ name: parties.name, address1: parties.address1, address2: parties.address2 })
      .from(parties)
      .where(eq(parties.id, pickList.customerPartyId))
      .limit(1),
  ]);

  const party = partyRows[0];
  const totalQty = lines.reduce((sum, line) => sum + line.qty, 0);
  const totalBoxes = lines.reduce((sum, line) => sum + line.numberOfBoxes, 0);

  return (
    <main className="delivery-receipt-document min-h-screen bg-[#EEF2F8] p-4 text-[#111827] print:bg-white print:p-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page { size: A4 landscape; margin: 10mm; }
            body:has(.delivery-receipt-document) header,
            body:has(.delivery-receipt-document) aside {
              display: none !important;
            }
            body:has(.delivery-receipt-document) main#main-content,
            body:has(.delivery-receipt-document) main#main-content > div {
              padding: 0 !important;
              margin: 0 !important;
            }
            @media print {
              .print-hide { display: none !important; }
              body { background: #fff !important; }
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
              <img src="/logo.svg" alt="Dyna-Serv" className="mb-2 h-10 w-auto" />
              <h1 className="text-lg font-bold uppercase tracking-wide">Acknowledgement Receipt</h1>
              <p className="mt-1 text-xs text-slate-600">Warehouse Inventory Management System</p>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-xs">
              <dt className="font-bold uppercase">Delivery Receipt No.</dt>
              <dd className="font-bold">DR-{pickList.pickListNumber.replace(/^PL-/, "")}</dd>
              <dt className="font-bold uppercase">Pick List No.</dt>
              <dd className="font-bold">{pickList.pickListNumber}</dd>
              <dt className="font-bold uppercase">Delivery Date</dt>
              <dd>{pickList.createdAt.toLocaleDateString()}</dd>
            </dl>
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-8 text-xs">
            <div>
              <p className="font-bold uppercase">Delivery To:</p>
              <p className="font-bold">{party?.name ?? pickList.customerPartyId}</p>
              <p>{[party?.address1, party?.address2].filter(Boolean).join(", ") || "Address on file"}</p>
            </div>
            <div className="text-right">
              <p><span className="font-bold">Inventory Model:</span> {pickList.flowType}</p>
              <p><span className="font-bold">Generated:</span> {new Date().toLocaleString()}</p>
            </div>
          </div>
        </header>

        <section className="mt-4">
          <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[1100px] table-fixed border-collapse text-[8px] leading-tight print:min-w-0">
            <colgroup>
              <col className="w-[3%]" /><col className="w-[6%]" /><col className="w-[5%]" /><col className="w-[7%]" />
              <col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[15%]" /><col className="w-[10%]" />
              <col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[7%]" />
            </colgroup>
            <thead>
              <tr className="bg-[#D8DDE5] text-center font-bold uppercase">
                {[
                  "No.", "Qty", "SPQ", "No. of Boxes", "Item Code", "CUST PN", "Item Description",
                  "Lot Number", "PO Number", "Invoice No.", "Remarks", "Location",
                ].map((heading) => <th key={heading} className="whitespace-normal break-words border border-[#374151] px-1 py-1.5">{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.id} className="align-middle">
                  <td className="border border-[#6B7280] px-1.5 py-2 text-center">{index + 1}</td>
                  <td className="border border-[#6B7280] px-1.5 py-2 text-center font-bold">{line.qty.toLocaleString()}</td>
                  <td className="border border-[#6B7280] px-1.5 py-2 text-center">{line.spq.toLocaleString()}</td>
                  <td className="border border-[#6B7280] px-1.5 py-2 text-center">{line.numberOfBoxes.toLocaleString()}</td>
                  <td className="border border-[#6B7280] px-1.5 py-2 font-mono font-bold">{line.itemCode}</td>
                  <td className="border border-[#6B7280] px-1.5 py-2 font-mono">{line.customerItemCode ?? "—"}</td>
                  <td className="border border-[#6B7280] px-1.5 py-2">{line.itemDescription ?? "—"}</td>
                  <td className="border border-[#6B7280] px-1.5 py-2 font-mono">{line.lotNumber}</td>
                  <td className="border border-[#6B7280] px-1.5 py-2">—</td>
                  <td className="border border-[#6B7280] px-1.5 py-2">—</td>
                  <td className="border border-[#6B7280] px-1.5 py-2">—</td>
                  <td className="border border-[#6B7280] px-1.5 py-2 font-mono">{line.locationLabel}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border border-[#6B7280] px-1.5 py-2">Total</td>
                <td className="border border-[#6B7280] px-1.5 py-2 text-center">{totalQty.toLocaleString()}</td>
                <td className="border border-[#6B7280] px-1.5 py-2">—</td>
                <td className="border border-[#6B7280] px-1.5 py-2 text-center">{totalBoxes.toLocaleString()}</td>
                <td colSpan={8} className="border border-[#6B7280] px-1.5 py-2" />
              </tr>
            </tbody>
          </table>
          </div>
        </section>

        <section className="mt-4 border border-[#374151] text-xs">
          <div className="bg-[#D8DDE5] px-2 py-1 font-bold uppercase">Delivery Instructions / Remarks</div>
          <div className="min-h-10 px-2 py-2">—</div>
        </section>

        <footer className="mt-6 grid grid-cols-3 border border-[#374151] text-xs">
          <div className="min-h-20 border-r border-[#374151] p-2"><p className="font-bold uppercase">Checked By:</p></div>
          <div className="min-h-20 border-r border-[#374151] p-2"><p className="font-bold uppercase">Loaded By:</p></div>
          <div className="min-h-20 p-2"><p className="font-bold uppercase">Acknowledged & Received By:</p></div>
        </footer>
      </article>
    </main>
  );
}
