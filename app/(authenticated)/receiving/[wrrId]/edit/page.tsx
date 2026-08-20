import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import { getActiveSupplierParties } from "@/lib/db/queries/items";
import { updateWrrHeader } from "@/lib/actions/receiving";

export default async function EditWrrPage({ params }: { params: Promise<{ wrrId: string }> }) {
  const { wrrId } = await params;
  const resolver = await createPageResolver();
  if ((await requirePermission(resolver, "receiving.confirm")).kind !== "authorized") notFound();
  const [wrr, vendors] = await Promise.all([getWrrDocument(db, wrrId), getActiveSupplierParties(db)]);
  if (!wrr || wrr.status !== "staged_pending_arrival") notFound();

  async function save(formData: FormData) {
    "use server";
    const actionResolver = await createPageResolver();
    const result = await updateWrrHeader(actionResolver, wrrId, {
      vendorPartyId: String(formData.get("vendorPartyId") ?? ""),
      flowType: String(formData.get("flowType") ?? "") as "vmi" | "trading" | "supplies",
      commercialInvoiceNo: String(formData.get("commercialInvoiceNo") ?? "") || null,
      ipNumber: String(formData.get("ipNumber") ?? "") || null,
      mawbMblNumber: String(formData.get("mawbMblNumber") ?? "") || null,
    });
    redirect(result.ok ? `/receiving/${wrrId}` : `/receiving/${wrrId}/edit`);
  }

  return <div className="mx-auto max-w-container">
    <Link href={`/receiving/${wrrId}`} className="inline-flex h-11 items-center font-label text-label text-brand-navy">← Back to {wrr.wrrNumber}</Link>
    <h1 className="mt-3 font-heading text-headline-md font-extrabold text-on-surface">Edit WRR</h1>
    <p className="mt-1 font-body text-body-md text-text-grey">You can edit a staged WRR before receiving starts. Expected lines are locked after scan labels are used.</p>
    <form action={save} className="mt-6 max-w-2xl space-y-4 rounded-xl bg-surface-white p-6 shadow-elevation-1">
      <label className="block font-label text-label text-text-grey">Vendor Organization<select name="vendorPartyId" defaultValue={wrr.vendorPartyId} className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface">{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} — {vendor.name}</option>)}</select></label>
      <label className="block font-label text-label text-text-grey">Inventory Model<select name="flowType" defaultValue={wrr.flowType} className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface"><option value="vmi">VMI</option><option value="trading">Trading</option><option value="supplies">Supplies</option></select></label>
      <label className="block font-label text-label text-text-grey">Commercial Invoice No.<input name="commercialInvoiceNo" defaultValue={wrr.commercialInvoiceNo ?? ""} className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" /></label>
      <label className="block font-label text-label text-text-grey">IP Number<input name="ipNumber" defaultValue={wrr.ipNumber ?? ""} className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" /></label>
      <label className="block font-label text-label text-text-grey">MAWB / MBL Number<input name="mawbMblNumber" defaultValue={wrr.mawbMblNumber ?? ""} className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" /></label>
      <button type="submit" className="inline-flex h-11 items-center rounded bg-primary px-5 font-label text-label text-surface-white">Save WRR</button>
    </form>
  </div>;
}
