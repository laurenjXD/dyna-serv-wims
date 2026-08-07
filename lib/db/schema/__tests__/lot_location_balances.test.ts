// RED-step schema tests for lib/db/schema/lot_location_balances.ts
// Traceability: specs/01-core-data-model/requirements.md Acceptance Criteria 14
// (distributed lot placement, non-negative/committed-within-remaining
// constraints, derived qty_available) and design.md §1.2
// (`lot_location_balances`).
import { describe, expect, it } from "vitest";
import {
  checkConstraints,
  column,
  hasColumn,
  referencesTable,
  tableName,
  uniqueConstraints,
} from "./helpers";

describe("lot_location_balances.ts (Req 14)", () => {
  it("is named 'lot_location_balances'", async () => {
    const { lotLocationBalances } = await import("../lot_location_balances");
    expect(tableName(lotLocationBalances)).toBe("lot_location_balances");
  });

  it("has lotId notNull referencing lots.id", async () => {
    const { lotLocationBalances } = await import("../lot_location_balances");
    expect(column(lotLocationBalances, "lotId").notNull).toBe(true);
    expect(
      referencesTable(lotLocationBalances, "lot_id", "lots", "id"),
    ).toBe(true);
  });

  it("has locationId notNull referencing locations.id", async () => {
    const { lotLocationBalances } = await import("../lot_location_balances");
    expect(column(lotLocationBalances, "locationId").notNull).toBe(true);
    expect(
      referencesTable(lotLocationBalances, "location_id", "locations", "id"),
    ).toBe(true);
  });

  it("has a unique constraint on (lotId, locationId)", async () => {
    const { lotLocationBalances } = await import("../lot_location_balances");
    const uniques = uniqueConstraints(lotLocationBalances);
    const match = uniques.find(
      (cols) =>
        cols.includes("lot_id") && cols.includes("location_id"),
    );
    expect(match).toBeDefined();
  });

  it("has qtyReceived, qtyRemaining as notNull integers", async () => {
    const { lotLocationBalances } = await import("../lot_location_balances");
    expect(column(lotLocationBalances, "qtyReceived").notNull).toBe(true);
    expect(column(lotLocationBalances, "qtyRemaining").notNull).toBe(true);
  });

  it("has qtyCommitted notNull default 0", async () => {
    const { lotLocationBalances } = await import("../lot_location_balances");
    const qtyCommitted = column(lotLocationBalances, "qtyCommitted");
    expect(qtyCommitted.notNull).toBe(true);
    expect(qtyCommitted.hasDefault).toBe(true);
  });

  it("has version notNull default 1 (optimistic concurrency token)", async () => {
    const { lotLocationBalances } = await import("../lot_location_balances");
    const version = column(lotLocationBalances, "version");
    expect(version.notNull).toBe(true);
    expect(version.hasDefault).toBe(true);
  });

  it("declares non-negative and committed-within-remaining CHECK constraints", async () => {
    const { lotLocationBalances } = await import("../lot_location_balances");
    const checks = checkConstraints(lotLocationBalances);
    expect(checks).toContain("qty_received_non_negative");
    expect(checks).toContain("qty_remaining_non_negative");
    expect(checks).toContain("qty_committed_within_remaining");
  });

  it("does NOT store a qtyAvailable column — must be derived only (Req 14)", async () => {
    const { lotLocationBalances } = await import("../lot_location_balances");
    expect(hasColumn(lotLocationBalances, "qtyAvailable")).toBe(false);
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { lotLocationBalances } = await import("../lot_location_balances");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(lotLocationBalances, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});
