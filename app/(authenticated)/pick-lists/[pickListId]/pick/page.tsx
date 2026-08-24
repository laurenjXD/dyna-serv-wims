import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Boxes, ChevronLeft, MapPin } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getPickList, getPickListItems } from "@/lib/db/queries/withdrawals";
import { completeExactPick } from "@/lib/actions/withdrawals";

interface PageProps {
  params: Promise<{ pickListId: string }>;
  searchParams: Promise<{ result?: string; reason?: string }>;
}

export default async function PickExecutionPage({ params, searchParams }: PageProps) {
  const { pickListId } = await params;
  const { result, reason } = await searchParams;
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "pick_list.execute");

  if (permission.kind !== "authorized") {
    return <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center"><p className="font-heading text-headline-md text-on-surface">Access denied</p><p className="mt-2 font-body text-body-md text-text-grey">You do not have permission to execute pick lists.</p><Link href="/outgoing" className="mt-6 inline-flex h-14 items-center gap-2 text-on-surface"><ChevronLeft size={24} aria-hidden="true" /> Return to Outgoing</Link></div>;
  }

  const pickList = await getPickList(db, pickListId);
  if (!pickList) notFound();
  const lines = await getPickListItems(db, pickListId);
  const totalBoxes = lines.reduce((sum, line) => sum + line.numberOfBoxes, 0);
  const isPickable = pickList.status === "allocated";

  async function handleCompletePick(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const completeResult = await completeExactPick(actionResolver, pickListId);
    if (!completeResult.ok) redirect(`/pick-lists/${pickListId}/pick?result=error&reason=${encodeURIComponent(completeResult.errors[0] ?? "unable_to_complete_pick")}`);
    redirect(`/pick-lists/${pickListId}/dispatch`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl pb-28">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/40 pb-5">
        <div className="flex min-w-0 items-center gap-3"><Link href="/outgoing" aria-label="Back to Outgoing" className="grid size-12 shrink-0 place-items-center rounded-xl border border-outline-variant/50 bg-surface-white text-on-surface shadow-elevation-1"><ChevronLeft size={24} aria-hidden="true" /></Link><div className="min-w-0"><p className="font-mono text-body-md text-text-grey">{pickList.pickListNumber}</p><h1 className="font-heading text-headline-md font-bold text-on-surface">Stage pick list</h1></div></div>
        <div className="rounded-xl border border-outline-variant/50 bg-surface-white px-4 py-3 shadow-elevation-1"><p className="font-label text-body-md text-on-surface">{totalBoxes} boxes to stage</p></div>
      </header>

      {result === "error" && <div role="alert" className="mb-5 rounded-xl border border-status-held/40 bg-status-held/10 p-4"><p className="font-heading text-title-md font-bold text-on-surface">Pick could not be completed</p><p className="mt-1 font-body text-body-md text-on-surface">{reason === "no_pick_lines" ? "This pick list has no committed lines." : "Refresh the pick list and try again."}</p></div>}

      <div className="mb-5 rounded-2xl border border-brand-blue/25 bg-brand-blue/5 p-4"><div className="flex gap-3"><Boxes className="mt-0.5 shrink-0 text-brand-navy" size={24} aria-hidden="true" /><div><p className="font-heading text-title-md font-bold text-on-surface">Stage the committed boxes</p><p className="mt-1 font-body text-body-md text-text-grey">Collect the boxes from each exact location below. Barcode scanning happens at Dispatch, immediately before stock leaves the warehouse.</p></div></div></div>

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/50 bg-surface-white shadow-elevation-1">
        <table className="w-full min-w-[1000px] border-collapse text-left font-body text-body-md">
          <thead>
            <tr className="border-b border-outline-variant bg-accent-indigo-50/60 font-label text-label font-bold text-text-grey uppercase">
              <th className="px-3 py-3 text-right">Qty</th>
              <th className="px-3 py-3 text-right">SPQ</th>
              <th className="px-3 py-3 text-right">No. of Pckgs</th>
              <th className="px-3 py-3 font-mono">ITEM CODE</th>
              <th className="px-3 py-3 font-mono">CUST PN</th>
              <th className="px-3 py-3">ITEM DESCRIPTION</th>
              <th className="px-3 py-3 text-right">METERAGE</th>
              <th className="px-3 py-3 font-mono">LOT NUMBER</th>
              <th className="px-3 py-3 font-mono">MFG DATE</th>
              <th className="px-3 py-3">LOCATION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30 font-body text-body-sm">
            {lines.map((line) => (
              <tr key={line.id} className="hover:bg-surface-light-grey/30">
                <td className="px-3 py-3 text-right font-mono font-bold text-on-surface">{line.qty.toLocaleString()}</td>
                <td className="px-3 py-3 text-right font-mono text-on-surface">{line.spq}</td>
                <td className="px-3 py-3 text-right font-mono font-bold text-brand-navy">{line.numberOfBoxes}</td>
                <td className="px-3 py-3 font-mono font-bold text-on-surface">{line.itemCode}</td>
                <td className="px-3 py-3 font-mono text-text-grey">{line.customerItemCode ?? "—"}</td>
                <td className="px-3 py-3 text-on-surface">{line.itemDescription ?? line.itemCode}</td>
                <td className="px-3 py-3 text-right font-mono text-text-grey">{line.spqMeter ? `${line.spqMeter}m` : "—"}</td>
                <td className="px-3 py-3 font-mono font-bold text-on-surface">{line.lotNumber}</td>
                <td className="px-3 py-3 font-mono text-text-grey">{line.manufactureDate ? new Date(line.manufactureDate).toLocaleDateString() : "—"}</td>
                <td className="px-3 py-3 font-body font-semibold text-on-surface">{line.locationLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pickList.status === "picked" ? <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/50 bg-surface-white p-4 shadow-elevation-2 lg:left-[288px] lg:right-6"><Link href={`/pick-lists/${pickListId}/dispatch`} className="mx-auto flex h-16 max-w-5xl items-center justify-center rounded-xl bg-primary font-label text-body-md uppercase tracking-wide text-surface-white">Continue to Dispatch Scan</Link></div> : isPickable ? <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/50 bg-surface-white p-4 shadow-elevation-2 lg:left-[288px] lg:right-6"><form action={handleCompletePick} className="mx-auto max-w-5xl"><button type="submit" disabled={lines.length === 0} className="flex h-16 w-full items-center justify-center rounded-xl bg-primary font-label text-body-md uppercase tracking-wide text-surface-white disabled:cursor-not-allowed disabled:bg-surface-light-grey disabled:text-status-neutral">Confirm boxes staged</button></form></div> : null}
    </div>
  );
}
