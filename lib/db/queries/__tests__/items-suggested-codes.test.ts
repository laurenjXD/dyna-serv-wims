import { describe, it, expect } from "vitest";
import { getNextSuggestedItemCodes } from "../items";

describe("getNextSuggestedItemCodes", () => {
  it("returns default DSGC-TRD-0001 and ITM-00001 when database has no matching items", async () => {
    const mockDb = {
      select: () => ({
        from: async () => [],
      }),
    };

    const result = await getNextSuggestedItemCodes(mockDb as any);
    expect(result).toEqual({
      nextDsgcCode: "DSGC-TRD-0001",
      nextGenericCode: "ITM-00001",
    });
  });

  it("increments to the next sequential DSGC-TRD number when existing items are present", async () => {
    const mockDb = {
      select: () => ({
        from: async () => [
          { code: "DSGC-TRD-0001", dsgcItemNumber: "DSGC-TRD-0001" },
          { code: "DSGC-TRD-0002", dsgcItemNumber: "DSGC-TRD-0002" },
          { code: "OTHER-ITEM", dsgcItemNumber: "DSGC-TRD-0005" },
        ],
      }),
    };

    const result = await getNextSuggestedItemCodes(mockDb as any);
    expect(result.nextDsgcCode).toBe("DSGC-TRD-0006");
  });

  it("increments to the next sequential ITM number when existing generic items are present", async () => {
    const mockDb = {
      select: () => ({
        from: async () => [
          { code: "ITM-00001", dsgcItemNumber: null },
          { code: "ITM-00015", dsgcItemNumber: null },
          { code: "DSGC-TRD-0003", dsgcItemNumber: null },
        ],
      }),
    };

    const result = await getNextSuggestedItemCodes(mockDb as any);
    expect(result.nextGenericCode).toBe("ITM-00016");
    expect(result.nextDsgcCode).toBe("DSGC-TRD-0004");
  });

  it("handles empty or malformed database rows gracefully", async () => {
    const mockDb = {
      select: () => ({
        from: async () => [
          { code: null, dsgcItemNumber: null },
          { code: "CUSTOM_PART", dsgcItemNumber: "INVALID" },
        ],
      }),
    };

    const result = await getNextSuggestedItemCodes(mockDb as any);
    expect(result).toEqual({
      nextDsgcCode: "DSGC-TRD-0001",
      nextGenericCode: "ITM-00001",
    });
  });
});
