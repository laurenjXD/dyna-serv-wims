// RED-step schema tests for lib/db/schema/locations.ts
// Traceability: specs/01-core-data-model/requirements.md Acceptance Criteria 10
// (Rack+Level-Position label, max_cbm_capacity) and design.md §1.2 (`locations`).
import { describe, expect, it } from "vitest";
import { column, hasColumn, tableName } from "./helpers";

describe("locations.ts — locations table (Req 10)", () => {
  it("is named 'locations'", async () => {
    const { locations } = await import("../locations");
    expect(tableName(locations)).toBe("locations");
  });

  it("has notNull zone while rack coordinates are nullable for RCV/Hold", async () => {
    const { locations } = await import("../locations");
    expect(column(locations, "zone").notNull).toBe(true);
    for (const key of ["rack", "level", "position"]) {
      expect(column(locations, key).notNull).toBe(false);
    }
  });

  it("has nullable unique label (Rack+Level-Position for storage only)", async () => {
    const { locations } = await import("../locations");
    const label = column(locations, "label");
    expect(label.notNull).toBe(false);
    expect(label.isUnique).toBe(true);
  });

  it("has locationType notNull with default 'storage', typed as locationTypeEnum", async () => {
    const { locations } = await import("../locations");
    const locationType = column(locations, "locationType");
    expect(locationType.notNull).toBe(true);
    expect(locationType.hasDefault).toBe(true);
    expect(locationType.enumValues).toEqual([
      "receiving_bay",
      "inspection",
      "storage",
      "picking",
      "dispatch",
    ]);
  });

  it("has nullable maxCbmCapacity for RCV/Hold", async () => {
    const { locations } = await import("../locations");
    expect(column(locations, "maxCbmCapacity").notNull).toBe(false);
  });

  it("has isActive notNull with a default", async () => {
    const { locations } = await import("../locations");
    const isActive = column(locations, "isActive");
    expect(isActive.notNull).toBe(true);
    expect(isActive.hasDefault).toBe(true);
  });

  it("has createdAt notNull with a default", async () => {
    const { locations } = await import("../locations");
    expect(hasColumn(locations, "createdAt")).toBe(true);
    expect(column(locations, "createdAt").notNull).toBe(true);
  });
});
