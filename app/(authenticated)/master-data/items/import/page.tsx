import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getActiveSupplierParties } from "@/lib/db/queries/items";
import { BulkMaterialImportForm } from "../_components/bulk-material-import-form";

export default async function BulkMaterialImportPage() {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "items.manage");
  if (permission.kind !== "authorized") notFound();
  const organizations = (await getActiveSupplierParties(db)).filter((organization) => organization.relationship === "vmi_customer" || organization.relationship === "trading_supplier");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">Import Materials</h1>
        <p className="mt-1 font-body text-body-md text-text-grey">Enroll a batch of master materials under one material-origin organization.</p>
      </div>
      <div className="rounded-xl bg-surface-white p-6 shadow-elevation-1">
        <BulkMaterialImportForm organizations={organizations} />
      </div>
    </div>
  );
}
