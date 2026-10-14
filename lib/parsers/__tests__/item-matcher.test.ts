import { describe, expect, it } from "vitest";
import {
  matchItemAgainstCatalog,
  normalizeCode,
  stripPackagingSuffix,
  similarityRatio,
  type MatchableItem,
} from "../item-matcher";

describe("item-matcher engine", () => {
  const sampleCatalog: MatchableItem[] = [
    {
      id: "item-1",
      code: "DSW-ITM-001",
      name: "Capacitor 100uF 25V SMD",
      customerItemCode: "CUST-CAP-100",
      supplierItemCode: "UB-CAP100-25",
      dsgcItemNumber: "DSGC-7788",
      defaultSupplierPartyId: "vendor-ubot",
    },
    {
      id: "item-2",
      code: "DSW-ITM-002",
      name: "Transistor NPN BC547B TO-92",
      customerItemCode: "CUST-BC547B",
      supplierItemCode: "BC547B",
      dsgcItemNumber: "DSGC-9901",
      defaultSupplierPartyId: "vendor-ampleon",
    },
    {
      id: "item-3",
      code: "001245",
      name: "Resistor 10k Ohm 0805",
      customerItemCode: "RES-10K-0805",
      supplierItemCode: "RC0805-10K",
      dsgcItemNumber: "DSGC-1245",
      defaultSupplierPartyId: "vendor-ubot",
    },
  ];

  describe("normalization & suffix utilities", () => {
    it("normalizes codes by removing punctuation and leading zeroes", () => {
      expect(normalizeCode("ABC-123-X")).toBe("abc123x");
      expect(normalizeCode("ABC/123/X")).toBe("abc123x");
      expect(normalizeCode("  ABC 123 X  ")).toBe("abc123x");
      expect(normalizeCode("00421")).toBe("421");
      expect(normalizeCode("0")).toBe("0");
      expect(normalizeCode("000")).toBe("0");
    });

    it("strips electronics packaging and compliance suffixes", () => {
      expect(stripPackagingSuffix("BC547B-TR")).toBe("BC547B");
      expect(stripPackagingSuffix("BC547B-REEL")).toBe("BC547B");
      expect(stripPackagingSuffix("BC547B(ROHS)")).toBe("BC547B");
      expect(stripPackagingSuffix("BC547B-LF")).toBe("BC547B");
      expect(stripPackagingSuffix("7788-G")).toBe("7788");
      expect(stripPackagingSuffix("7788-BULK")).toBe("7788");
    });

    it("calculates similarity ratio correctly", () => {
      expect(similarityRatio("BC547B", "BC547B")).toBe(1.0);
      expect(similarityRatio("BC547B", "BC5478")).toBeCloseTo(5 / 6, 2);
    });
  });

  describe("matchItemAgainstCatalog", () => {
    it("identifies exact case-insensitive matches with 100 score", () => {
      const res = matchItemAgainstCatalog({ itemCode: "dsw-itm-001" }, sampleCatalog);
      expect(res.bestMatch).not.toBeNull();
      expect(res.bestMatch?.item.id).toBe("item-1");
      expect(res.bestMatch?.score).toBe(100);
      expect(res.bestMatch?.tier).toBe("exact");
      expect(res.confidenceLevel).toBe("high");
    });

    it("matches customer item code across case variations", () => {
      const res = matchItemAgainstCatalog({ customerItemCode: "cust-cap-100" }, sampleCatalog);
      expect(res.bestMatch?.item.id).toBe("item-1");
      expect(res.bestMatch?.matchedField).toBe("customerItemCode");
      expect(res.confidenceLevel).toBe("high");
    });

    it("matches normalized code when delimiters or spaces differ (score: 95)", () => {
      const res = matchItemAgainstCatalog({ itemCode: "CUST CAP 100" }, sampleCatalog);
      expect(res.bestMatch?.item.id).toBe("item-1");
      expect(res.bestMatch?.score).toBe(95);
      expect(res.bestMatch?.tier).toBe("canonical");
      expect(res.confidenceLevel).toBe("high");
    });

    it("matches when Excel drops leading zeroes", () => {
      const res = matchItemAgainstCatalog({ itemCode: "1245" }, sampleCatalog);
      expect(res.bestMatch?.item.id).toBe("item-3");
      expect(res.bestMatch?.score).toBe(95);
      expect(res.bestMatch?.tier).toBe("canonical");
    });

    it("matches when vendor attaches packaging suffix (-TR, -REEL)", () => {
      const res = matchItemAgainstCatalog({ itemCode: "BC547B-TR" }, sampleCatalog);
      expect(res.bestMatch?.item.id).toBe("item-2");
      expect(res.bestMatch?.score).toBe(88);
      expect(res.bestMatch?.tier).toBe("stripped_suffix");
      expect(res.confidenceLevel).toBe("high");
    });

    it("matches by code containment (e.g. DSGC-7788 vs 7788)", () => {
      const res = matchItemAgainstCatalog({ itemCode: "7788" }, sampleCatalog);
      expect(res.bestMatch?.item.id).toBe("item-1");
      expect(res.bestMatch?.tier).toBe("stripped_suffix");
    });

    it("matches with typo/edit distance tolerance (score: 80+)", () => {
      const res = matchItemAgainstCatalog({ itemCode: "BC5478" }, sampleCatalog);
      expect(res.bestMatch?.item.id).toBe("item-2");
      expect(res.bestMatch?.tier).toBe("fuzzy");
      expect(res.bestMatch?.score).toBeGreaterThanOrEqual(80);
    });

    it("extracts model part number embedded inside description text", () => {
      const res = matchItemAgainstCatalog(
        { description: "General Purpose Transistor BC547B in Bulk" },
        sampleCatalog
      );
      expect(res.bestMatch?.item.id).toBe("item-2");
      expect(res.bestMatch?.matchedField).toBe("supplierItemCode");
      expect(res.confidenceLevel).toBe("high");
    });

    it("falls back to description token overlap if part code is completely absent", () => {
      const res = matchItemAgainstCatalog(
        { description: "Capacitor 100uF 25V Electrolytic Surface Mount" },
        sampleCatalog
      );
      expect(res.bestMatch?.item.id).toBe("item-1");
      expect(res.bestMatch?.tier).toBe("description");
      expect(res.confidenceLevel).toBe("medium");
    });

    it("applies preferred party ID boost to disambiguate identical codes", () => {
      const ambiguousCatalog: MatchableItem[] = [
        {
          id: "item-a",
          code: "CAP-100",
          name: "Capacitor A",
          defaultSupplierPartyId: "vendor-1",
        },
        {
          id: "item-b",
          code: "CAP-100",
          name: "Capacitor B",
          defaultSupplierPartyId: "vendor-2",
        },
      ];

      const res = matchItemAgainstCatalog(
        { itemCode: "CAP-100" },
        ambiguousCatalog,
        { preferredPartyId: "vendor-2" }
      );
      expect(res.bestMatch?.item.id).toBe("item-b");
    });

    it("returns none confidence when query cannot match anything", () => {
      const res = matchItemAgainstCatalog({ itemCode: "TOTALLY-UNKNOWN-99999" }, sampleCatalog);
      expect(res.confidenceLevel).toBe("none");
      expect(res.bestMatch).toBeNull();
    });
  });
});
