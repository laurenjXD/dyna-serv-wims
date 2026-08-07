// RED-step schema tests for lib/db/schema/enums.ts
// Traceability: specs/01-core-data-model/requirements.md Acceptance Criteria 2, 3, 7, 11
// (entity/enum terminology, party role set, SPQ partition enforcement, FIFO/FEFO status gate)
// and design.md §1.1 (Enumerations) — current 2026-08-07 amended state.
//
// These tests assert against the imported enum objects' `enumValues` arrays,
// which is how Drizzle's `pgEnum()` exposes its value set without a live
// Postgres connection — satisfying testing.md's unit-test (no real DB) stage.
import { describe, expect, it } from "vitest";

describe("enums.ts — schema enum definitions (Req 2, 3, 7, 11)", () => {
  it("exports partyRoleEnum with the full party role set (Req 3)", async () => {
    const { partyRoleEnum } = await import("../enums");
    expect(partyRoleEnum.enumValues).toEqual([
      "vendor",
      "supplier",
      "customer",
      "end_customer",
      "internal_warehouse",
    ]);
  });

  it("exports flowTypeEnum with vmi/trading/supplies partitions (Req 7)", async () => {
    const { flowTypeEnum } = await import("../enums");
    expect(flowTypeEnum.enumValues).toEqual(["vmi", "trading", "supplies"]);
  });

  it("exports locationTypeEnum with all five physical location types", async () => {
    const { locationTypeEnum } = await import("../enums");
    expect(locationTypeEnum.enumValues).toEqual([
      "receiving_bay",
      "inspection",
      "storage",
      "picking",
      "dispatch",
    ]);
  });

  it("exports lotStatusEnum including 'available' as the FIFO/FEFO eligibility gate (Req 11)", async () => {
    const { lotStatusEnum } = await import("../enums");
    expect(lotStatusEnum.enumValues).toEqual([
      "staged",
      "available",
      "quarantined",
      "depleted",
      "expired",
    ]);
  });

  it("exports wrrStatusEnum with the staged-through-confirmed lifecycle", async () => {
    const { wrrStatusEnum } = await import("../enums");
    expect(wrrStatusEnum.enumValues).toEqual([
      "staged_pending_arrival",
      "receiving_in_progress",
      "confirmed",
      "cancelled",
    ]);
  });

  it("exports pickListStatusEnum with allocated/picked/dispatched", async () => {
    const { pickListStatusEnum } = await import("../enums");
    expect(pickListStatusEnum.enumValues).toEqual([
      "allocated",
      "picked",
      "dispatched",
    ]);
  });

  it("exports movementTypeEnum with all five movement types (Req 12)", async () => {
    const { movementTypeEnum } = await import("../enums");
    expect(movementTypeEnum.enumValues).toEqual([
      "receiving",
      "putaway",
      "pick",
      "transfer",
      "inventory_reconciliation",
    ]);
  });

  it("exports conformanceStatusEnum with pending/conformance/non_conformance", async () => {
    const { conformanceStatusEnum } = await import("../enums");
    expect(conformanceStatusEnum.enumValues).toEqual([
      "pending",
      "conformance",
      "non_conformance",
    ]);
  });

  it("exports nonConformanceReasonEnum with all six reason codes", async () => {
    const { nonConformanceReasonEnum } = await import("../enums");
    expect(nonConformanceReasonEnum.enumValues).toEqual([
      "tdc_defect",
      "quantity_mismatch",
      "damaged_carton",
      "wrong_item_code",
      "missing_paperwork",
      "other",
    ]);
  });

  it("exports commitmentStatusEnum with the full Stage 1/Stage 2 reservation lifecycle (Req 15)", async () => {
    const { commitmentStatusEnum } = await import("../enums");
    expect(commitmentStatusEnum.enumValues).toEqual([
      "active",
      "inspection_pending",
      "executed",
      "released",
      "expired",
      "cancelled",
    ]);
  });
});
