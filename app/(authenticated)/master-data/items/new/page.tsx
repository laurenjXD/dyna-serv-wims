// Item create page — requires items.manage.

import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getActiveSupplierParties, getItemCategories, getNextSuggestedItemCodes } from "@/lib/db/queries/items";
import { ItemForm } from "../_components/item-form";
import { createItemAction } from "../_actions";

interface PageProps {
  searchParams: Promise<{
    code?: string;
    supplierItemCode?: string;
    customerItemCode?: string;
    name?: string;
    description?: string;
    uom?: string;
    spq?: string;
    volumeCbm?: string;
    organization?: string;
    ciplEnrollmentChannel?: string;
  }>;
}

function normalizeOrganizationValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findOrganizationId(
  organization: string | undefined,
  parties: Array<{ id: string; code: string; name: string }>,
): string | undefined {
  const normalized = organization ? normalizeOrganizationValue(organization) : "";
  if (!normalized) return undefined;

  const exact = parties.find((party) =>
    [party.code, party.name].some((value) => normalizeOrganizationValue(value) === normalized),
  );
  if (exact) return exact.id;

  const partialMatches = parties.filter((party) =>
    [party.code, party.name].some((value) => {
      const candidate = normalizeOrganizationValue(value);
      return candidate.includes(normalized) || normalized.includes(candidate);
    }),
  );
  return partialMatches.length === 1 ? partialMatches[0]?.id : undefined;
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

  const {
    code,
    supplierItemCode,
    customerItemCode,
    name,
    description,
    uom,
    spq,
    volumeCbm,
    organization,
    ciplEnrollmentChannel,
  } = await searchParams;

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
          initialSupplierItemCode={supplierItemCode}
          initialCustomerItemCode={customerItemCode}
          initialName={name}
          initialDescription={description}
          initialUom={uom}
          initialSpq={spq}
          initialVolumeCbm={volumeCbm}
          initialDefaultSupplierPartyId={findOrganizationId(organization, supplierParties)}
          enrollmentChannel={ciplEnrollmentChannel}
          suggestedDsgcCode={suggestedCodes.nextDsgcCode}
          suggestedGenericCode={suggestedCodes.nextGenericCode}
        />
      </div>
    </div>
  );
}
