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
  const spqRaw = nullableInt(formData.get("spq"));
  const boxesPerPalletRaw = nullableInt(formData.get("boxesPerPallet"));
  const minReorderLevelRaw = nullableInt(formData.get("minReorderLevel"));

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
    defaultSupplierPartyId: nullableString(
      formData.get("defaultSupplierPartyId"),
    ),
    uom: formData.get("uom") ?? "piece",
    currency: formData.get("currency") ?? "USD",
    spq: spqRaw ?? 1,
    spqMeter: nullableString(formData.get("spqMeter")),
    lengthCm: nullableString(formData.get("lengthCm")),
    widthCm: nullableString(formData.get("widthCm")),
    heightCm: nullableString(formData.get("heightCm")),
    volumeCbm: formData.get("volumeCbm") ?? "0",
    boxesPerPallet: boxesPerPalletRaw,
    weightKg: nullableString(formData.get("weightKg")),
    minReorderLevel: minReorderLevelRaw ?? 0,
    isPerishable: formData.get("isPerishable") === "true",
    isActive: formData.get("isActive") !== "false",
    buyingPrice: nullableString(formData.get("buyingPrice")),
    sellingPrice: nullableString(formData.get("sellingPrice")),
    vmiMovementCategory: nullableString(formData.get("vmiMovementCategory")) as "fg" | "raw_material" | "for_process" | "reject" | "re_inspect" | null,
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
  let result: Awaited<ReturnType<typeof createItem>>;
  try {
    result = await createItem(resolver, input);
  } catch (error) {
    console.error("Item enrollment failed", error);
    return {
      error:
        "The item could not be saved. Verify the selected Organization and required item fields, then try again.",
    };
  }

  if (!result.ok) {
    if ("fieldErrors" in result) {
      return { fieldErrors: result.fieldErrors };
    }
    return { error: result.error };
  }

  revalidatePath("/master-data/items");
  revalidatePath("/enrollment");
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
  revalidatePath("/enrollment");
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
  revalidatePath("/enrollment");
  revalidatePath(`/master-data/items/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Category Management Actions (Add & Edit on the fly)
// ---------------------------------------------------------------------------

export async function createCategoryAction(data: {
  name: string;
  flowType?: string | null;
  parentId?: string | null;
  description?: string | null;
}) {
  const resolver = await createPageResolver();
  const { requirePermission } = await import("@/lib/rbac/guard");
  const perm = await requirePermission(resolver, "items.manage");
  if (perm.kind !== "authorized") {
    return { ok: false, error: "You do not have permission to manage categories." };
  }

  const trimmed = data.name.trim();
  if (!trimmed) {
    return { ok: false, error: "Category name is required." };
  }

  try {
    const { itemCategories } = await import("@/lib/db/schema/items");
    const [created] = await _db
      .insert(itemCategories)
      .values({
        name: trimmed,
        flowType: (data.flowType as "vmi" | "trading" | "supplies" | null) || null,
        parentId: data.parentId || null,
        description: data.description || null,
      })
      .returning({
        id: itemCategories.id,
        name: itemCategories.name,
        flowType: itemCategories.flowType,
        parentId: itemCategories.parentId,
      });

    revalidatePath("/master-data/items");
    revalidatePath("/enrollment");

    return { ok: true, category: created };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to create category: ${errorMsg}` };
  }
}

export async function updateCategoryAction(data: {
  id: string;
  name: string;
  flowType?: string | null;
}) {
  const resolver = await createPageResolver();
  const { requirePermission } = await import("@/lib/rbac/guard");
  const perm = await requirePermission(resolver, "items.manage");
  if (perm.kind !== "authorized") {
    return { ok: false, error: "You do not have permission to manage categories." };
  }

  const trimmed = data.name.trim();
  if (!trimmed) {
    return { ok: false, error: "Category name is required." };
  }

  try {
    const { itemCategories } = await import("@/lib/db/schema/items");
    const { eq } = await import("drizzle-orm");
    const [updated] = await _db
      .update(itemCategories)
      .set({
        name: trimmed,
        flowType: (data.flowType as "vmi" | "trading" | "supplies" | null) || null,
      })
      .where(eq(itemCategories.id, data.id))
      .returning({
        id: itemCategories.id,
        name: itemCategories.name,
        flowType: itemCategories.flowType,
        parentId: itemCategories.parentId,
      });

    revalidatePath("/master-data/items");
    revalidatePath("/enrollment");

    return { ok: true, category: updated };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to update category: ${errorMsg}` };
  }
}
