import { describe, expect, it } from "vitest";
import { selectEffectiveUbotRates } from "../rate-selection";
import type { UbotRateDraft } from "../types";

function rate(overrides: Partial<UbotRateDraft>): UbotRateDraft {
  return {
    sourceRow: 1,
    partyName: "UBoT Incorporated Limited",
    chargeType: "Documentation",
    rate: 10,
    currency: "USD",
    active: true,
    ...overrides,
  };
}

describe("UBoT migration rate selection", () => {
  it("keeps only rates effective on the opening date", () => {
    const selected = selectEffectiveUbotRates([
      rate({ rate: 8, effectiveFrom: "2024-01-01", effectiveTo: "2025-12-31" }),
      rate({ rate: 10, effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" }),
      rate({ rate: 12, effectiveFrom: "2027-01-01" }),
    ], "2026-10-09");

    expect(selected).toHaveLength(1);
    expect(selected[0].rate).toBe(10);
  });

  it("uses the latest overlapping effective rate for one charge type", () => {
    const selected = selectEffectiveUbotRates([
      rate({ rate: 8, effectiveFrom: "2026-01-01" }),
      rate({ rate: 10, effectiveFrom: "2026-06-01" }),
    ], "2026-10-09");

    expect(selected).toHaveLength(1);
    expect(selected[0].rate).toBe(10);
  });

  it("keeps separate parties and charge types independent", () => {
    const selected = selectEffectiveUbotRates([
      rate({ partyName: "UBoT Incorporated Limited", chargeType: "Warehousing Charge", rate: 0.38 }),
      rate({ partyName: "UBoT Philippines Incorporated", chargeType: "Warehousing Charge", rate: 0.4 }),
      rate({ partyName: "UBoT Incorporated Limited", chargeType: "Man Power", rate: 10 }),
    ], "2026-10-09");

    expect(selected.map((item) => `${item.partyName}:${item.chargeType}`)).toEqual([
      "UBoT Incorporated Limited:Warehousing Charge",
      "UBoT Philippines Incorporated:Warehousing Charge",
      "UBoT Incorporated Limited:Man Power",
    ]);
  });
});
