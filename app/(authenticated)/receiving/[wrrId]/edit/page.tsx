import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import { getActiveSupplierParties } from "@/lib/db/queries/items";
import { updateWrrHeader, updateWrrLines } from "@/lib/actions/receiving";

export default async function EditWrrPage({ params }: { params: Promise<{ wrrId: string }> }) {
  const { wrrId } = await params;
  const resolver = await createPageResolver();
  if ((await requirePermission(resolver, "receiving.confirm")).kind !== "authorized") notFound();
  const [wrr, vendors] = await Promise.all([getWrrDocument(db, wrrId), getActiveSupplierParties(db)]);
  if (!wrr || wrr.status !== "staged_pending_arrival") notFound();
  const editableItems = wrr.items;

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
    if (result.ok) {
      const lines = editableItems.map((line) => ({
        id: line.id,
        lotNumber: String(formData.get(`line_${line.id}_lotNumber`) ?? ""),
        expectedQty: Number(formData.get(`line_${line.id}_expectedQty`) ?? 0),
        unitCbm: Number(formData.get(`line_${line.id}_unitCbm`) ?? 0),
        uom: String(formData.get(`line_${line.id}_uom`) ?? ""),
        itemCode: String(formData.get(`line_${line.id}_itemCode`) ?? "") || null,
        customerItemCode: String(formData.get(`line_${line.id}_customerItemCode`) ?? "") || null,
        manufactureDate: String(formData.get(`line_${line.id}_manufactureDate`) ?? "") || null,
        remarks: String(formData.get(`line_${line.id}_remarks`) ?? "") || null,
      }));
      const lineResult = await updateWrrLines(actionResolver, wrrId, lines);
      if (!lineResult.ok) redirect(`/receiving/${wrrId}/edit`);
    }
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
      <div className="border-t border-outline-variant/30 pt-5"><h2 className="font-heading text-title-md font-bold text-on-surface">Expected Lines</h2><p className="mt-1 font-body text-body-sm text-text-grey">These values remain editable only while the WRR is staged.</p><div className="mt-4 space-y-4">{wrr.items.map((line) => <fieldset key={line.id} className="grid gap-3 rounded-lg border border-outline-variant/30 p-4 sm:grid-cols-2"><legend className="px-1 font-mono text-mono-md text-on-surface">Line {line.lotNumber}</legend><label className="block font-label text-label text-text-grey">Shipping Lot<input name={`line_${line.id}_lotNumber`} defaultValue={line.lotNumber} required className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" /></label><label className="block font-label text-label text-text-grey">Expected Qty<input name={`line_${line.id}_expectedQty`} type="number" min="1" defaultValue={line.expectedQty} required className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" /></label><label className="block font-label text-label text-text-grey">UOM<input name={`line_${line.id}_uom`} defaultValue={line.uom} required className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" /></label><label className="block font-label text-label text-text-grey">Unit CBM<input name={`line_${line.id}_unitCbm`} type="number" min="0.0001" step="0.0001" defaultValue={line.unitCbm} required className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" /></label><label className="block font-label text-label text-text-grey">Supplier Item Code<input name={`line_${line.id}_itemCode`} defaultValue={line.supplierItemCode ?? ""} className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" /></label><label className="block font-label text-label text-text-grey">Customer Item Code<input name={`line_${line.id}_customerItemCode`} defaultValue={line.customerItemCode ?? ""} className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" /></label><label className="block font-label text-label text-text-grey">Manufacturing Date<input name={`line_${line.id}_manufactureDate`} type="date" defaultValue={line.manufactureDate ?? ""} className="mt-1 h-11 w-full rounded border border-outline-variant/30 px-3 font-body text-body-md" /></label><label className="block font-label text-label text-text-grey sm:col-span-2">Remarks<textarea name={`line_${line.id}_remarks`} defaultValue={line.remarks ?? ""} rows={2} className="mt-1 w-full rounded border border-outline-variant/30 px-3 py-2 font-body text-body-md" /></label></fieldset>)}</div></div>
      <button type="submit" className="inline-flex h-11 items-center rounded bg-primary px-5 font-label text-label text-surface-white">Save WRR</button>
    </form>
  </div>;
}
