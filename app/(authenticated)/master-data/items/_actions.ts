"use server";

// Next.js 15 server action wrappers for item enrollment.
//
// Traceability:
//   lib/actions/items.ts — pure action functions
//   specs/06-party-and-item-enrollment/design.md §4, §6

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { db as _db } from "@/lib/db/client";
import { createItem, updateItem, deactivateItem } from "@/lib/actions/items";
import { getItemOperationalRecords } from "@/lib/db/queries/items";

// ---------------------------------------------------------------------------
// FormState
// ---------------------------------------------------------------------------

export type ItemFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nullableString(value: FormDataEntryValue | null): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function nullableInt(value: FormDataEntryValue | null): number | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = parseInt(trimmed, 10);
  return isNaN(n) ? null : n;
}

function parseItemFormData(formData: FormData) {
  const flowType = formData.get("flowType") as string;
  const isVmi = flowType === "vmi";
  const isTrading = flowType === "trading";
  const isSupplies = flowType === "supplies";

  const spqRaw = isVmi ? nullableInt(formData.get("spq")) : null;
  const boxesPerPalletRaw = nullableInt(formData.get("boxesPerPallet"));
  const minReorderLevelRaw = isSupplies ? nullableInt(formData.get("minReorderLevel")) : null;

  return {
    code: formData.get("code"),
    name: formData.get("name"),
    barcode: formData.get("barcode"),
    supplierItemCode: nullableString(formData.get("supplierItemCode")),
    customerItemCode: nullableString(formData.get("customerItemCode")),
    dsgcItemNumber: nullableString(formData.get("dsgcItemNumber")),
    description: nullableString(formData.get("description")),
    itemType: nullableString(formData.get("itemType")) ?? "standard",
    categoryId: nullableString(formData.get("categoryId")),
    defaultSupplierPartyId: isVmi ? nullableString(formData.get("defaultSupplierPartyId")) : null,
    uom: formData.get("uom") ?? "piece",
    currency: isTrading ? (formData.get("currency") ?? "USD") : "USD",
    spq: spqRaw ?? 1,
    spqMeter: isVmi ? nullableString(formData.get("spqMeter")) : null,
    lengthCm: nullableString(formData.get("lengthCm")),
    widthCm: nullableString(formData.get("widthCm")),
    heightCm: nullableString(formData.get("heightCm")),
    volumeCbm: formData.get("volumeCbm") ?? "0",
    boxesPerPallet: boxesPerPalletRaw,
    weightKg: nullableString(formData.get("weightKg")),
    minReorderLevel: minReorderLevelRaw ?? 0,
    isPerishable: formData.get("isPerishable") === "true",
    isActive: formData.get("isActive") !== "false",
    buyingPrice: isTrading ? nullableString(formData.get("buyingPrice")) : null,
    sellingPrice: isTrading ? nullableString(formData.get("sellingPrice")) : null,
  };
}

// ---------------------------------------------------------------------------
// createItemAction
// ---------------------------------------------------------------------------

export async function createItemAction(
  _prevState: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const resolver = await createPageResolver();
  const input = parseItemFormData(formData);

  const result = await createItem(resolver, input);

  if (!result.ok) {
    if ("fieldErrors" in result) {
      return { fieldErrors: result.fieldErrors };
    }
    return { error: result.error };
  }

  revalidatePath("/master-data/items");
  redirect(`/master-data/items/${result.data.id}`);
}

// ---------------------------------------------------------------------------
// updateItemAction
// ---------------------------------------------------------------------------

export async function updateItemAction(
  _prevState: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const resolver = await createPageResolver();
  const id = formData.get("id") as string;
  const submittedUpdatedAt = formData.get("updatedAt") as string;
  const input = parseItemFormData(formData);

  const result = await updateItem(resolver, id, input, submittedUpdatedAt, {
    getBarcodeCheckData: async (_actionDb, itemId) =>
      getItemOperationalRecords(_db, itemId),
  });

  if (!result.ok) {
    if ("fieldErrors" in result) {
      return { fieldErrors: result.fieldErrors };
    }
    if (result.error === "Conflict") {
      return {
        error:
          "This record was updated by someone else after you opened the form. Please reload to see the latest version before editing.",
      };
    }
    return { error: result.error };
  }

  revalidatePath("/master-data/items");
  revalidatePath(`/master-data/items/${id}`);
  redirect(`/master-data/items/${id}`);
}

// ---------------------------------------------------------------------------
// deactivateItemAction
// ---------------------------------------------------------------------------

export async function deactivateItemAction(
  _prevState: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const resolver = await createPageResolver();
  const id = formData.get("id") as string;

  const result = await deactivateItem(resolver, id);

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/master-data/items");
  revalidatePath(`/master-data/items/${id}`);
  return { ok: true };
}
