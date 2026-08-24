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
    db.select({ name: parties.name, address1: parties.address1, address2: parties.address2 }).from(parties).where(eq(parties.id, pickList.customerPartyId)).limit(1),
  ]);
  const party = partyRows[0];
  const totalBoxes = lines.reduce((total, line) => total + line.numberOfBoxes, 0);
  const totalPieces = lines.reduce((total, line) => total + line.qty, 0);

  return (
    <main className="mx-auto max-w-6xl bg-surface-white pb-10 print:max-w-none print:p-0">
      <style>{`@media print { aside, header, nav, .print-hide { display:none !important; } body { background:#fff; } }`}</style>
      <div className="print-hide mb-6 flex items-center justify-between gap-4">
        <Link href="/inventory?tab=pick-lists" className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant bg-surface-white px-4 font-label text-label font-bold text-on-surface"><ChevronLeft size={18} aria-hidden="true" />Back to Pick Lists</Link>
        <PickListPrintButton />
      </div>

      <article className="border border-outline-variant/50 p-8 print:border-0 print:p-0">
        <header className="border-b-2 border-on-surface pb-5">
          <div className="flex items-start justify-between gap-6">
            <div><p className="font-label text-label font-bold uppercase tracking-[0.12em] text-text-grey">Dyna-Serv WIMS</p><h1 className="mt-1 font-heading text-headline-lg font-bold text-on-surface">Pick List</h1></div>
            <div className="text-right"><p className="font-label text-label uppercase text-text-grey">Pick List No.</p><p className="mt-1 font-mono text-mono-lg font-bold text-on-surface">{pickList.pickListNumber}</p><p className="mt-1 font-body text-body-sm text-text-grey">Generated {pickList.createdAt.toLocaleString()}</p></div>
          </div>
          <div className="mt-6 grid gap-4 border-t border-outline-variant/50 pt-4 sm:grid-cols-2"><div><p className="font-label text-label uppercase text-text-grey">Delivery to</p><p className="mt-1 font-body text-body-md font-bold text-on-surface">{party?.name ?? pickList.customerPartyId}</p><p className="font-body text-body-sm text-text-grey">{[party?.address1, party?.address2].filter(Boolean).join(", ") || "Address not recorded"}</p></div><div className="sm:text-right"><p className="font-label text-label uppercase text-text-grey">Inventory Model</p><p className="mt-1 font-body text-body-md font-bold uppercase text-on-surface">{pickList.flowType}</p></div></div>
        </header>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left"><thead><tr className="border-y border-on-surface bg-surface-light-grey"><th className="px-3 py-3 font-label text-label uppercase text-on-surface">Qty</th><th className="px-3 py-3 font-label text-label uppercase text-on-surface">SPQ</th><th className="px-3 py-3 font-label text-label uppercase text-on-surface">Boxes</th><th className="px-3 py-3 font-label text-label uppercase text-on-surface">Item Code</th><th className="px-3 py-3 font-label text-label uppercase text-on-surface">Customer Code</th><th className="px-3 py-3 font-label text-label uppercase text-on-surface">Item Description</th><th className="px-3 py-3 font-label text-label uppercase text-on-surface">Lot Number</th><th className="px-3 py-3 font-label text-label uppercase text-on-surface">Location</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id} className="border-b border-outline-variant/50"><td className="px-3 py-3 font-mono text-mono-md text-on-surface">{line.qty}</td><td className="px-3 py-3 font-mono text-mono-md text-on-surface">{line.spq}</td><td className="px-3 py-3 font-mono text-mono-md text-on-surface">{line.numberOfBoxes}</td><td className="px-3 py-3 font-mono text-mono-md font-bold text-on-surface">{line.itemCode}</td><td className="px-3 py-3 font-mono text-mono-md text-on-surface">{line.customerItemCode ?? "—"}</td><td className="px-3 py-3 font-body text-body-sm text-on-surface">{line.itemDescription ?? "—"}</td><td className="px-3 py-3 font-mono text-mono-md text-on-surface">{line.lotNumber}</td><td className="px-3 py-3 font-mono text-mono-md text-on-surface">{line.locationLabel}</td></tr>)}</tbody></table>
        </div>
        <div className="mt-6 flex justify-end"><dl className="grid grid-cols-2 gap-x-8 gap-y-2 border-t border-on-surface pt-3 font-body text-body-md"><dt>Total quantity</dt><dd className="font-mono text-right font-bold">{totalPieces}</dd><dt>Total boxes</dt><dd className="font-mono text-right font-bold">{totalBoxes}</dd></dl></div>
        <div className="mt-14 grid grid-cols-2 gap-12 border-t border-outline-variant/50 pt-5 font-body text-body-sm text-text-grey"><p>Prepared by: ______________________________<br />Date: ______________________________</p><p>Picking completed by: ______________________________<br />Date: ______________________________</p></div>
      </article>
    </main>
  );
}
