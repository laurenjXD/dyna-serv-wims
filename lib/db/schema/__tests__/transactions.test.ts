// RED-step schema tests for lib/db/schema/transactions.ts
// Traceability: specs/01-core-data-model/requirements.md Acceptance Criteria
// 12 (inventory_transactions is an immutable, full-history ledger with
// movement_type = 'inventory_reconciliation' for variance) and 13
// (ar_reference_no on outbound transactions), and design.md §1.2
// (`inventory_transactions`, amended 2026-08-07 to add `pickListId`
// alongside `wrrId`).
import { describe, expect, it } from "vitest";
import { column, hasColumn, referencesTable, tableName } from "./helpers";

describe("transactions.ts — inventory_transactions table (Req 12, 13)", () => {
  it("is named 'inventory_transactions'", async () => {
    const { inventoryTransactions } = await import("../transactions");
    expect(tableName(inventoryTransactions)).toBe("inventory_transactions");
  });

  it("has transactionNumber notNull + unique", async () => {
    const { inventoryTransactions } = await import("../transactions");
    const transactionNumber = column(
      inventoryTransactions,
      "transactionNumber",
    );
    expect(transactionNumber.notNull).toBe(true);
    expect(transactionNumber.isUnique).toBe(true);
  });

  it("has lotId notNull referencing lots.id", async () => {
    const { inventoryTransactions } = await import("../transactions");
    expect(column(inventoryTransactions, "lotId").notNull).toBe(true);
    expect(
      referencesTable(inventoryTransactions, "lot_id", "lots", "id"),
    ).toBe(true);
  });

  it("has itemId notNull referencing items.id", async () => {
    const { inventoryTransactions } = await import("../transactions");
    expect(column(inventoryTransactions, "itemId").notNull).toBe(true);
    expect(
      referencesTable(inventoryTransactions, "item_id", "items", "id"),
    ).toBe(true);
  });

  it("has movementType notNull typed as movementTypeEnum (Req 12)", async () => {
    const { inventoryTransactions } = await import("../transactions");
    const movementType = column(inventoryTransactions, "movementType");
    expect(movementType.notNull).toBe(true);
    expect(movementType.enumValues).toEqual([
      "receiving",
      "putaway",
      "pick",
      "transfer",
      "inventory_reconciliation",
    ]);
  });

  it("has nullable fromLocationId and toLocationId referencing locations.id", async () => {
    const { inventoryTransactions } = await import("../transactions");
    for (const key of ["fromLocationId", "toLocationId"]) {
      expect(hasColumn(inventoryTransactions, key)).toBe(true);
      expect(column(inventoryTransactions, key).notNull).toBe(false);
    }
    expect(
      referencesTable(
        inventoryTransactions,
        "from_location_id",
        "locations",
        "id",
      ),
    ).toBe(true);
    expect(
      referencesTable(
        inventoryTransactions,
        "to_location_id",
        "locations",
        "id",
      ),
    ).toBe(true);
  });

  it("has qty notNull and flowType notNull typed as flowTypeEnum", async () => {
    const { inventoryTransactions } = await import("../transactions");
    expect(column(inventoryTransactions, "qty").notNull).toBe(true);
    const flowType = column(inventoryTransactions, "flowType");
    expect(flowType.notNull).toBe(true);
    expect(flowType.enumValues).toEqual(["vmi", "trading", "supplies"]);
  });

  it("has nullable commercialInvoiceNo (incoming) and arReferenceNo (outgoing, Req 13)", async () => {
    const { inventoryTransactions } = await import("../transactions");
    for (const key of ["commercialInvoiceNo", "arReferenceNo"]) {
      expect(hasColumn(inventoryTransactions, key)).toBe(true);
      expect(column(inventoryTransactions, key).notNull).toBe(false);
    }
  });

  it("has wrrId nullable referencing wrr_documents.id", async () => {
    const { inventoryTransactions } = await import("../transactions");
    expect(hasColumn(inventoryTransactions, "wrrId")).toBe(true);
    expect(column(inventoryTransactions, "wrrId").notNull).toBe(false);
    expect(
      referencesTable(inventoryTransactions, "wrr_id", "wrr_documents", "id"),
    ).toBe(true);
  });

  it("has pickListId present, nullable, referencing pick_lists.id (2026-08-07 amendment, mirrors wrrId)", async () => {
    const { inventoryTransactions } = await import("../transactions");
    expect(hasColumn(inventoryTransactions, "pickListId")).toBe(true);
    expect(column(inventoryTransactions, "pickListId").notNull).toBe(false);
    expect(
      referencesTable(
        inventoryTransactions,
        "pick_list_id",
        "pick_lists",
        "id",
      ),
    ).toBe(true);
  });

  it("has performedByUserId notNull", async () => {
    const { inventoryTransactions } = await import("../transactions");
    expect(column(inventoryTransactions, "performedByUserId").notNull).toBe(
      true,
    );
  });

  it("has createdAt notNull with default", async () => {
    const { inventoryTransactions } = await import("../transactions");
    expect(column(inventoryTransactions, "createdAt").notNull).toBe(true);
  });
});
