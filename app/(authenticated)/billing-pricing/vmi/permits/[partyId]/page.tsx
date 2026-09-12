import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { listVmiPermits } from "@/lib/actions/vmi-permits";
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
import { PermitForm } from "./_components/PermitForm";

interface Props { params: Promise<{ partyId: string }>; }

export default async function VmiPermitsPage({ params }: Props) {
  const { partyId } = await params;
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "reporting.financial_read");
  if (permission.kind !== "authorized") return <div className="mx-auto max-w-container px-8 py-12 text-center font-body text-body-md text-text-grey">You do not have permission to view VMI permits.</div>;

  const [party] = await db.select({ id: parties.id, name: parties.name, code: parties.code }).from(parties).where(eq(parties.id, partyId)).limit(1);
  if (!party) notFound();
  const permitResult = await listVmiPermits(resolver, partyId);
  const permits = permitResult.ok ? permitResult.permits : [];

  return (
    <main className="mx-auto max-w-container space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link href="/billing-pricing?section=configuration&tab=vmi-contracts" className="inline-flex items-center font-body text-body-sm text-text-grey hover:text-brand-navy"><ArrowLeft size={16} className="mr-1" /> Back to Configuration</Link>
        <p className="mt-4 font-label text-label font-bold uppercase tracking-wider text-text-grey">VMI permits and LOA</p>
        <h1 className="mt-1 font-heading text-headline-lg font-bold text-on-surface">{party.code} · {party.name}</h1>
      </div>
      <section className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <h2 className="font-heading text-title-md font-bold text-on-surface">Permit history</h2>
        {permits.length === 0 ? <p className="mt-3 font-body text-body-sm text-text-grey">No permits recorded for this organization.</p> : <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left font-body text-body-sm"><thead className="bg-surface-light-grey/60 font-label text-label text-text-grey"><tr><th className="px-3 py-2">Permit</th><th className="px-3 py-2">Scope</th><th className="px-3 py-2">Validity</th><th className="px-3 py-2 text-right">Monthly fee</th><th className="px-3 py-2">Status</th></tr></thead><tbody>{permits.map((permit) => <tr key={permit.id} className="border-t border-outline-variant/20"><td className="px-3 py-2 font-mono">{permit.permitNumber}</td><td className="px-3 py-2">{permit.itemScope}</td><td className="px-3 py-2">{permit.validFrom} to {permit.validTo}</td><td className="px-3 py-2 text-right font-mono">${Number(permit.monthlyFeeUsd).toFixed(2)}</td><td className="px-3 py-2"><span className={permit.isActive ? "text-status-available font-bold" : "text-text-grey"}>{permit.isActive ? "Active" : "Inactive"}</span></td></tr>)}</tbody></table></div>}
      </section>
      <PermitForm partyId={party.id} />
    </main>
  );
}
