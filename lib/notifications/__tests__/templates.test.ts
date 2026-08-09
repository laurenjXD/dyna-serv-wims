import { describe, expect, it } from "vitest";
import { projectSafeTemplate } from "../templates";
import type { RawTemplateInput } from "../templates";

describe("projectSafeTemplate (design.md §5: separate internal and party-safe templates)", () => {
  const raw: RawTemplateInput = {
    itemCode: "ITM-001",
    itemName: "Widget A",
    quantity: 12,
    unitCost: "45.50",
    marginPercent: "22.3",
    partyName: "Acme Corp",
  };

  it("includes cost/margin fields for the internal audience", () => {
    const result = projectSafeTemplate(raw, "internal");
    expect(result.body).toContain("45.50");
    expect(result.body).toContain("22.3");
  });

  it("excludes cost/margin fields entirely for the party-safe audience, never nulls them", () => {
    const result = projectSafeTemplate(raw, "party_safe");
    expect(result.body).not.toContain("45.50");
    expect(result.body).not.toContain("22.3");
    expect(result.body).not.toMatch(/unitCost/i);
    expect(result.body).not.toMatch(/marginPercent/i);
  });

  it("includes item identity and quantity for both audiences", () => {
    const internal = projectSafeTemplate(raw, "internal");
    const partySafe = projectSafeTemplate(raw, "party_safe");
    for (const result of [internal, partySafe]) {
      expect(result.body).toContain("ITM-001");
      expect(result.body).toContain("Widget A");
      expect(result.body).toContain("12");
    }
  });
});
