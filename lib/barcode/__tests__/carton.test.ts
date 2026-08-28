import { describe, expect, it } from "vitest";
import { cartonIdFromUnitId, isCartonId } from "../carton";

describe("carton identity", () => {
  it("derives a stable human-readable Carton ID from a unit UUID", () => {
    expect(cartonIdFromUnitId("01234567-89ab-cdef-0123-456789abcdef")).toBe(
      "DSGC-CTN-0123456789abcdef0123456789abcdef",
    );
  });

  it("accepts supplier and warehouse carton identifiers", () => {
    expect(isCartonId("CTN-2026-000001")).toBe(true);
    expect(isCartonId("DSGC-CTN-20260828-000001")).toBe(true);
    expect(isCartonId("item-code-001")).toBe(false);
  });

  it("rejects malformed UUIDs instead of producing an ambiguous identity", () => {
    expect(() => cartonIdFromUnitId("not-a-uuid")).toThrow("invalid_unit_id");
  });
});
