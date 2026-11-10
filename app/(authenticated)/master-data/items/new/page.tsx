// Item create page — requires items.manage.

import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getActiveSupplierParties, getItemCategories, getNextSuggestedItemCodes } from "@/lib/db/queries/items";
import { ItemForm } from "../_components/item-form";
import { createItemAction } from "../_actions";

interface PageProps {
  searchParams: Promise<{ code?: string }>;
}

export default async function NewItemPage({ searchParams }: PageProps) {
  const resolver = await createPageResolver();
  const perm = await requirePermission(resolver, "items.manage");

  if (perm.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6" role="alert">
          <h1 className="font-heading text-title-md font-bold text-amber-950">Material enrollment is unavailable</h1>
          <p className="mt-2 font-body text-body-md text-amber-900">
            Your account cannot enroll new materials. Ask an administrator with material-management access to complete this item enrollment.
          </p>
        </div>
      </div>
    );
  }

  const { code } = await searchParams;

  const [categories, supplierParties, suggestedCodes] = await Promise.all([
    getItemCategories(db),
    getActiveSupplierParties(db),
    getNextSuggestedItemCodes(db),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          New Item Enrollment
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Enroll a new item in the shared master catalog.
        </p>
      </div>

      <div className="rounded-xl bg-surface-white shadow-elevation-1 p-6">
        <ItemForm
          action={createItemAction}
          categories={categories}
          supplierParties={supplierParties}
          cancelHref="/enrollment?tab=items"
          initialCode={code}
          suggestedDsgcCode={suggestedCodes.nextDsgcCode}
          suggestedGenericCode={suggestedCodes.nextGenericCode}
        />
      </div>
    </div>
  );
}
