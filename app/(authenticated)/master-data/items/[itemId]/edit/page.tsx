// Item edit page — requires items.manage.

import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import {
  getItem,
  getItemCategories,
  getActiveSupplierParties,
} from "@/lib/db/queries/items";
import { ItemForm } from "../../_components/item-form";
import { updateItemAction } from "../../_actions";

interface PageProps {
  params: Promise<{ itemId: string }>;
}

export default async function EditItemPage({ params }: PageProps) {
  const { itemId } = await params;
  const resolver = await createPageResolver();

  const perm = await requirePermission(resolver, "items.manage");
  if (perm.kind !== "authorized") {
    notFound();
  }

  const [item, categories, supplierParties] = await Promise.all([
    getItem(db, itemId),
    getItemCategories(db),
    getActiveSupplierParties(db),
  ]);

  if (!item) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Edit Item
        </h1>
        <p className="mt-1 font-mono text-mono-md text-text-grey">
          {item.code} — {item.name}
        </p>
      </div>

      <div className="rounded-xl bg-surface-white shadow-elevation-1 p-6">
        <ItemForm
          action={updateItemAction}
          item={item}
          categories={categories}
          supplierParties={supplierParties}
          cancelHref={`/master-data/items/${itemId}`}
        />
      </div>
    </div>
  );
}
