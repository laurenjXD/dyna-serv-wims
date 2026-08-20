// RED-step schema tests for lib/db/schema/items.ts
// Traceability: specs/01-core-data-model/requirements.md Acceptance Criteria 4
// (item identifiers: dsgc_item_number, customer_item_code, code, barcode) and
// design.md §1.2 (`item_categories` & `items`, amended 2026-08-07 full column
// list at ~line 241-271).
import { describe, expect, it } from "vitest";
import { column, hasColumn, referencesTable, tableName } from "./helpers";

describe("items.ts — item_categories table", () => {
  it("is named 'item_categories'", async () => {
    const { itemCategories } = await import("../items");
    expect(tableName(itemCategories)).toBe("item_categories");
  });

  it("has notNull name, nullable flowType/parentId/description", async () => {
    const { itemCategories } = await import("../items");
    expect(column(itemCategories, "name").notNull).toBe(true);
    expect(hasColumn(itemCategories, "flowType")).toBe(true);
    expect(column(itemCategories, "flowType").notNull).toBe(false);
    expect(hasColumn(itemCategories, "parentId")).toBe(true);
    expect(column(itemCategories, "parentId").notNull).toBe(false);
    expect(hasColumn(itemCategories, "description")).toBe(true);
  });
});

describe("items.ts — items table (Req 4)", () => {
  it("is named 'items'", async () => {
    const { items } = await import("../items");
    expect(tableName(items)).toBe("items");
  });

  it("has code as notNull + unique (internal Dyna-Serv item code)", async () => {
    const { items } = await import("../items");
    const code = column(items, "code");
    expect(code.notNull).toBe(true);
    expect(code.isUnique).toBe(true);
  });

  it("has barcode as notNull + unique", async () => {
    const { items } = await import("../items");
    const barcode = column(items, "barcode");
    expect(barcode.notNull).toBe(true);
    expect(barcode.isUnique).toBe(true);
  });

  it("has dsgc_item_number and customer_item_code present and nullable (Req 4)", async () => {
    const { items } = await import("../items");
    for (const key of ["dsgcItemNumber", "customerItemCode"]) {
      expect(hasColumn(items, key)).toBe(true);
      expect(column(items, key).notNull).toBe(false);
    }
  });

  it("has supplierItemCode present and nullable", async () => {
    const { items } = await import("../items");
    expect(hasColumn(items, "supplierItemCode")).toBe(true);
    expect(column(items, "supplierItemCode").notNull).toBe(false);
  });

  it("has notNull name; nullable description", async () => {
    const { items } = await import("../items");
    expect(column(items, "name").notNull).toBe(true);
    expect(hasColumn(items, "description")).toBe(true);
    expect(column(items, "description").notNull).toBe(false);
  });

  it("has itemType notNull with default 'standard'", async () => {
    const { items } = await import("../items");
    const itemType = column(items, "itemType");
    expect(itemType.notNull).toBe(true);
    expect(itemType.hasDefault).toBe(true);
  });

  it("has categoryId referencing item_categories.id, nullable", async () => {
    const { items, itemCategories } = await import("../items");
    expect(hasColumn(items, "categoryId")).toBe(true);
    expect(column(items, "categoryId").notNull).toBe(false);
    expect(
      referencesTable(items, "category_id", tableName(itemCategories), "id"),
    ).toBe(true);
  });

  it("has defaultSupplierPartyId referencing parties.id, nullable", async () => {
    const { items } = await import("../items");
    expect(hasColumn(items, "defaultSupplierPartyId")).toBe(true);
    expect(column(items, "defaultSupplierPartyId").notNull).toBe(false);
    expect(
      referencesTable(items, "default_supplier_party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has uom notNull default 'piece' and currency notNull default 'USD'", async () => {
    const { items } = await import("../items");
    const uom = column(items, "uom");
    const currency = column(items, "currency");
    expect(uom.notNull).toBe(true);
    expect(uom.hasDefault).toBe(true);
    expect(currency.notNull).toBe(true);
    expect(currency.hasDefault).toBe(true);
  });

  it("has nullable buyingPrice and sellingPrice", async () => {
    const { items } = await import("../items");
    for (const key of ["buyingPrice", "sellingPrice"]) {
      expect(hasColumn(items, key)).toBe(true);
      expect(column(items, key).notNull).toBe(false);
    }
  });

  it("has spq notNull with default 1", async () => {
    const { items } = await import("../items");
    const spq = column(items, "spq");
    expect(spq.notNull).toBe(true);
    expect(spq.hasDefault).toBe(true);
  });

  it("has nullable spqMeter, lengthCm, widthCm, heightCm, volumeCm3, boxesPerPallet, weightKg", async () => {
    const { items } = await import("../items");
    for (const key of [
      "spqMeter",
      "lengthCm",
      "widthCm",
      "heightCm",
      "volumeCm3",
      "boxesPerPallet",
      "weightKg",
    ]) {
      expect(hasColumn(items, key)).toBe(true);
      expect(column(items, key).notNull).toBe(false);
    }
  });

  it("has volumeCbm as notNull (CBM per box)", async () => {
    const { items } = await import("../items");
    expect(column(items, "volumeCbm").notNull).toBe(true);
  });

  it("has minReorderLevel notNull default 0", async () => {
    const { items } = await import("../items");
    const min = column(items, "minReorderLevel");
    expect(min.notNull).toBe(true);
    expect(min.hasDefault).toBe(true);
  });

  it("has isPerishable and isActive as notNull booleans with defaults", async () => {
    const { items } = await import("../items");
    for (const key of ["isPerishable", "isActive"]) {
      const col = column(items, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });

  it("has createdAt and updatedAt notNull timestamps with defaults", async () => {
    const { items } = await import("../items");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(items, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});

// RED-step tests for the 12-vmi-billing B.11 amendment (2026-08-19).
// Traceability: specs/12-vmi-billing/tasks.md B.11, requirements.md FR-2.2
// ("Sourced from items.vmi_movement_category ... Nullable; items with no
// category set contribute to an 'Uncategorized' bucket"), and
// specs/01-core-data-model/design.md §1.1 (new `vmiMovementCategoryEnum`)
// and §1.2 (`items.vmiMovementCategory`) — both added as a dated amendment,
// not yet present in lib/db/schema/enums.ts or lib/db/schema/items.ts as of
// this test's authoring. See specs/00-steering/revision-log.md's
// "`01-core-data-model` amendment: `items.vmi_movement_category` added
// (2026-08-19)" entry for the full reasoning.
describe("items.ts — vmi_movement_category amendment (12-vmi-billing B.11 / Req FR-2.2)", () => {
  it("enums.ts exports vmiMovementCategoryEnum with exactly the 5 VMI category values", async () => {
    const { vmiMovementCategoryEnum } = await import("../enums");
    expect(vmiMovementCategoryEnum.enumValues).toEqual([
      "fg",
      "raw_material",
      "for_process",
      "reject",
      "re_inspect",
    ]);
  });

  it("has vmiMovementCategory column backed by the vmi_movement_category enum type, correctly named, nullable", async () => {
    const { items } = await import("../items");
    const { vmiMovementCategoryEnum } = await import("../enums");
    expect(hasColumn(items, "vmiMovementCategory")).toBe(true);
    const vmiCategory = column(items, "vmiMovementCategory");
    expect(vmiCategory.name).toBe("vmi_movement_category");
    expect(vmiCategory.enumValues).toEqual(vmiMovementCategoryEnum.enumValues);
    expect(vmiCategory.notNull).toBe(false); // nullable — not every item is VMI-classified
  });

  it("is a distinct column from the pre-existing free-text itemType/item_type field", async () => {
    const { items } = await import("../items");
    expect(hasColumn(items, "itemType")).toBe(true);
    expect(hasColumn(items, "vmiMovementCategory")).toBe(true);
    const itemType = column(items, "itemType");
    const vmiCategory = column(items, "vmiMovementCategory");
    expect(itemType.name).toBe("item_type");
    expect(vmiCategory.name).toBe("vmi_movement_category");
    // itemType stays required-with-default (unchanged by this amendment);
    // vmiMovementCategory is the new, independently nullable column.
    expect(itemType.notNull).toBe(true);
    expect(vmiCategory.notNull).toBe(false);
  });
});
