// Item create page — requires items.manage.

import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getActiveSupplierParties, getItemCategories } from "@/lib/db/queries/items";
import { ItemForm } from "../_components/item-form";
import { createItemAction } from "../_actions";

export default async function NewItemPage() {
  const resolver = await createPageResolver();
  const perm = await requirePermission(resolver, "items.manage");

  if (perm.kind !== "authorized") {
    notFound();
  }

  const [categories, supplierParties] = await Promise.all([
    getItemCategories(db),
    getActiveSupplierParties(db),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading font-bold text-headline-md text-brand-navy">
          New Item
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Enroll a new item in the shared master catalog.
        </p>
      </div>

      <div className="rounded-md bg-surface-white shadow-elevation-1 p-6">
        <ItemForm
          action={createItemAction}
          categories={categories}
          supplierParties={supplierParties}
          barcodeEditable={true}
          cancelHref="/master-data/items"
        />
      </div>
    </div>
  );
}
