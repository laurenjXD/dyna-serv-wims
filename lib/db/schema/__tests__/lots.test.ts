// RED-step schema tests for lib/db/schema/lots.ts
// Traceability: specs/01-core-data-model/requirements.md Acceptance Criteria
// 5 (peza_number/commercial_invoice_no/ip_number on lots), 6 (WRR-sourced
// lot_number, wrr_item_id link, no system generation), 11 (status = FIFO/FEFO
// gate) and design.md §1.2 (`lots`).
import { describe, expect, it } from "vitest";
import { column, hasColumn, referencesTable, tableName } from "./helpers";

describe("lots.ts — lots table (Req 5, 6, 11)", () => {
  it("is named 'lots'", async () => {
    const { lots } = await import("../lots");
    expect(tableName(lots)).toBe("lots");
  });

  it("has lotNumber notNull, copied from the WRR item, not globally unique (Req 6)", async () => {
    const { lots } = await import("../lots");
    const lotNumber = column(lots, "lotNumber");
    expect(lotNumber.notNull).toBe(true);
    // Req 6: lot_number must NOT be globally unique (may recur across WRRs).
    expect(lotNumber.isUnique).toBe(false);
  });

  it("has wrrItemId notNull referencing wrr_items.id (Req 6)", async () => {
    const { lots } = await import("../lots");
    expect(column(lots, "wrrItemId").notNull).toBe(true);
    expect(referencesTable(lots, "wrr_item_id", "wrr_items", "id")).toBe(
      true,
    );
  });

  it("has itemId notNull referencing items.id", async () => {
    const { lots } = await import("../lots");
    expect(column(lots, "itemId").notNull).toBe(true);
    expect(referencesTable(lots, "item_id", "items", "id")).toBe(true);
  });

  it("has flowType notNull typed as flowTypeEnum", async () => {
    const { lots } = await import("../lots");
    const flowType = column(lots, "flowType");
    expect(flowType.notNull).toBe(true);
    expect(flowType.enumValues).toEqual(["vmi", "trading", "supplies"]);
  });

  it("has ownerPartyId nullable, referencing parties.id", async () => {
    const { lots } = await import("../lots");
    expect(hasColumn(lots, "ownerPartyId")).toBe(true);
    expect(column(lots, "ownerPartyId").notNull).toBe(false);
    expect(referencesTable(lots, "owner_party_id", "parties", "id")).toBe(
      true,
    );
  });

  it("has status notNull default 'staged' typed as lotStatusEnum (Req 11)", async () => {
    const { lots } = await import("../lots");
    const status = column(lots, "status");
    expect(status.notNull).toBe(true);
    expect(status.hasDefault).toBe(true);
    expect(status.enumValues).toEqual([
      "staged",
      "available",
      "quarantined",
      "depleted",
      "expired",
    ]);
  });

  it("has nullable pezaNumber, commercialInvoiceNo, ipNumber (Req 5)", async () => {
    const { lots } = await import("../lots");
    for (const key of ["pezaNumber", "commercialInvoiceNo", "ipNumber"]) {
      expect(hasColumn(lots, key)).toBe(true);
      expect(column(lots, key).notNull).toBe(false);
    }
  });

  it("has nullable manufactureDate, expiryDate, unitCost", async () => {
    const { lots } = await import("../lots");
    for (const key of ["manufactureDate", "expiryDate", "unitCost"]) {
      expect(hasColumn(lots, key)).toBe(true);
      expect(column(lots, key).notNull).toBe(false);
    }
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { lots } = await import("../lots");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(lots, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});
