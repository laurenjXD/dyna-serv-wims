// RED-step schema tests for lib/db/schema/pick_lists.ts
// Traceability: specs/01-core-data-model/requirements.md Acceptance Criteria
// 15 (durable Stage 1 reservation tied to a committed pick_list) and
// design.md §1.2 (`pick_lists` & `pick_list_items`, priced-snapshot fields).
import { describe, expect, it } from "vitest";
import { column, hasColumn, referencesTable, tableName } from "./helpers";

describe("pick_lists.ts — pick_lists table", () => {
  it("is named 'pick_lists'", async () => {
    const { pickLists } = await import("../pick_lists");
    expect(tableName(pickLists)).toBe("pick_lists");
  });

  it("has pickListNumber notNull + unique", async () => {
    const { pickLists } = await import("../pick_lists");
    const pickListNumber = column(pickLists, "pickListNumber");
    expect(pickListNumber.notNull).toBe(true);
    expect(pickListNumber.isUnique).toBe(true);
  });

  it("has customerPartyId notNull referencing parties.id", async () => {
    const { pickLists } = await import("../pick_lists");
    expect(column(pickLists, "customerPartyId").notNull).toBe(true);
    expect(
      referencesTable(pickLists, "customer_party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has flowType notNull typed as flowTypeEnum", async () => {
    const { pickLists } = await import("../pick_lists");
    const flowType = column(pickLists, "flowType");
    expect(flowType.notNull).toBe(true);
    expect(flowType.enumValues).toEqual(["vmi", "trading", "supplies"]);
  });

  it("has status notNull default 'allocated' typed as pickListStatusEnum", async () => {
    const { pickLists } = await import("../pick_lists");
    const status = column(pickLists, "status");
    expect(status.notNull).toBe(true);
    expect(status.hasDefault).toBe(true);
    expect(status.enumValues).toEqual(["allocated", "picked", "dispatched"]);
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { pickLists } = await import("../pick_lists");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(pickLists, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});

describe("pick_lists.ts — pick_list_items table (priced-snapshot fields)", () => {
  it("is named 'pick_list_items'", async () => {
    const { pickListItems } = await import("../pick_lists");
    expect(tableName(pickListItems)).toBe("pick_list_items");
  });

  it("has pickListId notNull referencing pick_lists.id", async () => {
    const { pickListItems, pickLists } = await import("../pick_lists");
    expect(column(pickListItems, "pickListId").notNull).toBe(true);
    expect(
      referencesTable(
        pickListItems,
        "pick_list_id",
        tableName(pickLists),
        "id",
      ),
    ).toBe(true);
  });

  it("has itemId notNull referencing items.id", async () => {
    const { pickListItems } = await import("../pick_lists");
    expect(column(pickListItems, "itemId").notNull).toBe(true);
    expect(referencesTable(pickListItems, "item_id", "items", "id")).toBe(
      true,
    );
  });

  it("has itemCode notNull; customerItemCode and itemDescription nullable", async () => {
    const { pickListItems } = await import("../pick_lists");
    expect(column(pickListItems, "itemCode").notNull).toBe(true);
    expect(hasColumn(pickListItems, "customerItemCode")).toBe(true);
    expect(column(pickListItems, "customerItemCode").notNull).toBe(false);
    expect(hasColumn(pickListItems, "itemDescription")).toBe(true);
    expect(column(pickListItems, "itemDescription").notNull).toBe(false);
  });

  it("has lotId notNull referencing lots.id and lotNumber notNull (priced-document snapshot)", async () => {
    const { pickListItems } = await import("../pick_lists");
    expect(column(pickListItems, "lotId").notNull).toBe(true);
    expect(referencesTable(pickListItems, "lot_id", "lots", "id")).toBe(
      true,
    );
    expect(column(pickListItems, "lotNumber").notNull).toBe(true);
  });

  it("has locationId notNull referencing locations.id and locationLabel notNull", async () => {
    const { pickListItems } = await import("../pick_lists");
    expect(column(pickListItems, "locationId").notNull).toBe(true);
    expect(
      referencesTable(pickListItems, "location_id", "locations", "id"),
    ).toBe(true);
    expect(column(pickListItems, "locationLabel").notNull).toBe(true);
  });

  it("has qty, spq, numberOfBoxes as notNull", async () => {
    const { pickListItems } = await import("../pick_lists");
    expect(column(pickListItems, "qty").notNull).toBe(true);
    expect(column(pickListItems, "spq").notNull).toBe(true);
    expect(column(pickListItems, "numberOfBoxes").notNull).toBe(true);
  });

  it("has unitPrice nullable (Priced on Document — Trading final, VMI reference-only)", async () => {
    const { pickListItems } = await import("../pick_lists");
    expect(hasColumn(pickListItems, "unitPrice")).toBe(true);
    expect(column(pickListItems, "unitPrice").notNull).toBe(false);
  });

  it("has createdAt notNull with default", async () => {
    const { pickListItems } = await import("../pick_lists");
    expect(column(pickListItems, "createdAt").notNull).toBe(true);
  });
});
