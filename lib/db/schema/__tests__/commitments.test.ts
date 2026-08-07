// RED-step schema tests for lib/db/schema/commitments.ts
// Traceability: specs/01-core-data-model/requirements.md Acceptance Criteria 15
// (durable Stage 1 outbound reservation: inventory_commitments /
// inventory_commitment_lines) and design.md §1.2.
import { describe, expect, it } from "vitest";
import {
  checkConstraints,
  column,
  hasColumn,
  referencesTable,
  tableName,
} from "./helpers";

describe("commitments.ts — inventory_commitments table (Req 15)", () => {
  it("is named 'inventory_commitments'", async () => {
    const { inventoryCommitments } = await import("../commitments");
    expect(tableName(inventoryCommitments)).toBe("inventory_commitments");
  });

  it("has commitmentNumber notNull + unique", async () => {
    const { inventoryCommitments } = await import("../commitments");
    const commitmentNumber = column(inventoryCommitments, "commitmentNumber");
    expect(commitmentNumber.notNull).toBe(true);
    expect(commitmentNumber.isUnique).toBe(true);
  });

  it("has pickListId notNull + unique referencing pick_lists.id (exactly one commitment per pick list)", async () => {
    const { inventoryCommitments } = await import("../commitments");
    const pickListId = column(inventoryCommitments, "pickListId");
    expect(pickListId.notNull).toBe(true);
    expect(pickListId.isUnique).toBe(true);
    expect(
      referencesTable(inventoryCommitments, "pick_list_id", "pick_lists", "id"),
    ).toBe(true);
  });

  it("has status notNull default 'active' typed as commitmentStatusEnum", async () => {
    const { inventoryCommitments } = await import("../commitments");
    const status = column(inventoryCommitments, "status");
    expect(status.notNull).toBe(true);
    expect(status.hasDefault).toBe(true);
    expect(status.enumValues).toEqual([
      "active",
      "inspection_pending",
      "executed",
      "released",
      "expired",
      "cancelled",
    ]);
  });

  it("has nullable expiresAt, releasedAt, completedAt", async () => {
    const { inventoryCommitments } = await import("../commitments");
    for (const key of ["expiresAt", "releasedAt", "completedAt"]) {
      expect(hasColumn(inventoryCommitments, key)).toBe(true);
      expect(column(inventoryCommitments, key).notNull).toBe(false);
    }
  });

  it("has createdByUserId as notNull", async () => {
    const { inventoryCommitments } = await import("../commitments");
    expect(column(inventoryCommitments, "createdByUserId").notNull).toBe(
      true,
    );
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { inventoryCommitments } = await import("../commitments");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(inventoryCommitments, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});

describe("commitments.ts — inventory_commitment_lines table (Req 15)", () => {
  it("is named 'inventory_commitment_lines'", async () => {
    const { inventoryCommitmentLines } = await import("../commitments");
    expect(tableName(inventoryCommitmentLines)).toBe(
      "inventory_commitment_lines",
    );
  });

  it("has commitmentId notNull referencing inventory_commitments.id", async () => {
    const { inventoryCommitmentLines } = await import("../commitments");
    expect(column(inventoryCommitmentLines, "commitmentId").notNull).toBe(
      true,
    );
    expect(
      referencesTable(
        inventoryCommitmentLines,
        "commitment_id",
        "inventory_commitments",
        "id",
      ),
    ).toBe(true);
  });

  it("has pickListItemId notNull referencing pick_list_items.id", async () => {
    const { inventoryCommitmentLines } = await import("../commitments");
    expect(column(inventoryCommitmentLines, "pickListItemId").notNull).toBe(
      true,
    );
    expect(
      referencesTable(
        inventoryCommitmentLines,
        "pick_list_item_id",
        "pick_list_items",
        "id",
      ),
    ).toBe(true);
  });

  it("has lotLocationBalanceId notNull referencing lot_location_balances.id", async () => {
    const { inventoryCommitmentLines } = await import("../commitments");
    expect(
      column(inventoryCommitmentLines, "lotLocationBalanceId").notNull,
    ).toBe(true);
    expect(
      referencesTable(
        inventoryCommitmentLines,
        "lot_location_balance_id",
        "lot_location_balances",
        "id",
      ),
    ).toBe(true);
  });

  it("has qtyCommitted notNull and qtyExecuted notNull default 0", async () => {
    const { inventoryCommitmentLines } = await import("../commitments");
    expect(column(inventoryCommitmentLines, "qtyCommitted").notNull).toBe(
      true,
    );
    const qtyExecuted = column(inventoryCommitmentLines, "qtyExecuted");
    expect(qtyExecuted.notNull).toBe(true);
    expect(qtyExecuted.hasDefault).toBe(true);
  });

  it("has status notNull default 'active' typed as commitmentStatusEnum", async () => {
    const { inventoryCommitmentLines } = await import("../commitments");
    const status = column(inventoryCommitmentLines, "status");
    expect(status.notNull).toBe(true);
    expect(status.hasDefault).toBe(true);
    expect(status.enumValues).toEqual([
      "active",
      "inspection_pending",
      "executed",
      "released",
      "expired",
      "cancelled",
    ]);
  });

  it("declares qty_committed_positive and qty_executed_within_committed CHECK constraints", async () => {
    const { inventoryCommitmentLines } = await import("../commitments");
    const checks = checkConstraints(inventoryCommitmentLines);
    expect(checks).toContain("qty_committed_positive");
    expect(checks).toContain("qty_executed_within_committed");
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { inventoryCommitmentLines } = await import("../commitments");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(inventoryCommitmentLines, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});
