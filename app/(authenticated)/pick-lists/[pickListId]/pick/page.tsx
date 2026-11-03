import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { FileText, ShieldCheck, Truck } from "@/components/ui/icons";
import { PageBreadcrumb } from "@/components/global/PageBreadcrumb";
import { PageContainer } from "@/components/ui/Page";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
import { getPickList, getPickListItems } from "@/lib/db/queries/withdrawals";
import { approvePickList, deletePickList } from "../../_actions";

type PageProps = {
  params: Promise<{ pickListId: string }>;
  searchParams: Promise<{ result?: string }>;
};

/**
 * Pre-dispatch review for an allocated pick list.
 *
 * Allocated work belongs to To Pick. Approval is the only transition into
 * the picked state, which is what makes the list appear in Dispatch.
 */
export default async function PickListApprovalPage({ params, searchParams }: PageProps) {
  const { pickListId } = await params;
  const { result } = await searchParams;
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "pick_list.execute");
  if (permission.kind !== "authorized") notFound();

  const pickList = await getPickList(db, pickListId);
  if (!pickList) notFound();
  if (pickList.status === "picked") redirect(`/pick-lists/${pickListId}/dispatch`);
  if (pickList.status === "dispatched") redirect("/outgoing");
  if (pickList.status !== "allocated") notFound();

  const [items, partyRows] = await Promise.all([
    getPickListItems(db, pickListId),
    db
      .select({ name: parties.name })
      .from(parties)
      .where(eq(parties.id, pickList.endCustomerPartyId))
      .limit(1),
  ]);
  const partyName = partyRows[0]?.name ?? "Unknown recipient";
  const totalBoxes = items.reduce((sum, item) => sum + item.numberOfBoxes, 0);
  const totalUnits = items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <PageContainer className="pb-10">
      <PageBreadcrumb backHref="/pick-lists" backLabel="Pick Lists" currentLabel="Review & Approve" />

      <header className="mt-2 flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/30 pb-5">
        <div>
          <p className="font-label text-label font-bold uppercase tracking-[0.12em] text-text-secondary">To Pick Queue</p>
          <h1 className="mt-1 font-heading text-headline-lg font-bold tracking-tight text-heading">Review Pick List</h1>
          <p className="mt-1 font-mono text-mono-md text-text-grey">{pickList.pickListNumber}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/pick-lists/${pickListId}/print`} target="_blank" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-outline-variant/50 bg-surface-white px-4 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">
            <FileText size={16} aria-hidden="true" />
            Review PDF
          </Link>
          <Link href="/inventory?tab=pick-lists" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-brand-navy/25 bg-brand-navy/5 px-4 font-label text-label font-bold text-brand-navy hover:bg-brand-navy/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">
            Create replacement draft
          </Link>
        </div>
      </header>

      {result === "edit_blocked" && (
        <div role="status" className="mt-5 rounded-xl border border-status-available/40 bg-status-available/10 px-4 py-3 font-body text-body-sm text-on-surface">
          Committed pick lists are read-only. Create a replacement draft to recalculate the allocation safely.
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-status-pending/40 bg-status-pending/10 p-5 shadow-elevation-1" aria-labelledby="approval-heading">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-7 w-7 shrink-0 text-brand-navy" aria-hidden="true" />
          <div>
            <h2 id="approval-heading" className="font-heading text-headline-md font-bold text-on-surface">Pick List Approval Gate</h2>
            <p className="mt-2 max-w-3xl font-body text-body-md text-text-grey">
              Review the committed lines and the physical picking instructions. Approving this list moves it from To Pick to Dispatch; scanning is not available until that transition is complete.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-outline-variant/30 bg-surface-white px-4 py-3">
            <p className="font-label text-label-xs font-bold uppercase tracking-wide text-text-grey">Recipient</p>
            <p className="mt-1 truncate font-body text-body-md font-semibold text-on-surface" title={partyName}>{partyName}</p>
          </div>
          <div className="rounded-xl border border-outline-variant/30 bg-surface-white px-4 py-3">
            <p className="font-label text-label-xs font-bold uppercase tracking-wide text-text-grey">Committed lines</p>
            <p className="mt-1 font-mono text-mono-md font-bold text-brand-navy">{items.length}</p>
          </div>
          <div className="rounded-xl border border-outline-variant/30 bg-surface-white px-4 py-3">
            <p className="font-label text-label-xs font-bold uppercase tracking-wide text-text-grey">Boxes / units</p>
            <p className="mt-1 font-mono text-mono-md font-bold text-brand-navy">{totalBoxes} / {totalUnits}</p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface-white">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-surface-light-grey">
              <tr className="border-b border-outline-variant/30">
                {["Item code", "Description", "Lot", "Location", "Boxes", "Units"].map((label) => (
                  <th key={label} className="px-4 py-3 font-label text-label-xs font-bold uppercase tracking-wide text-text-grey">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-mono text-mono-sm font-bold text-on-surface">{item.itemCode}</td>
                  <td className="max-w-[18rem] truncate px-4 py-3 font-body text-body-sm text-on-surface">{item.itemDescription ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-mono-sm text-on-surface">{item.lotNumber}</td>
                  <td className="px-4 py-3 font-mono text-mono-sm font-bold text-brand-navy">{item.locationLabel}</td>
                  <td className="px-4 py-3 font-mono text-mono-sm text-on-surface">{item.numberOfBoxes}</td>
                  <td className="px-4 py-3 font-mono text-mono-sm text-on-surface">{item.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-status-pending/30 pt-4">
          <form action={deletePickList}>
            <input type="hidden" name="pickListId" value={pickListId} />
            <button type="submit" className="inline-flex h-11 items-center justify-center rounded-xl border border-status-held/40 bg-surface-white px-4 font-label text-label font-bold text-status-held hover:bg-status-held/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">Delete Pick List</button>
          </form>
          <form action={approvePickList}>
            <input type="hidden" name="pickListId" value={pickListId} />
            <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-label text-body-md font-bold text-surface-white shadow-elevation-1 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy active:scale-[0.98]">
              <Truck className="h-5 w-5" aria-hidden="true" />
              Approve &amp; Move to Dispatch
            </button>
          </form>
        </div>
      </section>
    </PageContainer>
  );
}
