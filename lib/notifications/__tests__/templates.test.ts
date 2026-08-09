// lib/notifications/__tests__/templates.test.ts
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
    eventPartyId: "party-1",
  };
  const context = { templateVersion: "v1", recipientPartyId: "party-1" };

  it("includes cost/margin fields for the internal audience", () => {
    const result = projectSafeTemplate(raw, "internal", context);
    expect(result.body).toContain("45.50");
    expect(result.body).toContain("22.3");
  });

  it("excludes cost/margin fields entirely for the party-safe audience, never nulls them", () => {
    const result = projectSafeTemplate(raw, "party_safe", context);
    expect(result.body).not.toContain("45.50");
    expect(result.body).not.toContain("22.3");
    expect(result.body).not.toMatch(/unitCost/i);
    expect(result.body).not.toMatch(/marginPercent/i);
  });

  it("includes item identity and quantity for both audiences", () => {
    const internal = projectSafeTemplate(raw, "internal", context);
    const partySafe = projectSafeTemplate(raw, "party_safe", context);
    for (const result of [internal, partySafe]) {
      expect(result.body).toContain("ITM-001");
      expect(result.body).toContain("Widget A");
      expect(result.body).toContain("12");
    }
  });

  it("produces title and templateVersion alongside body", () => {
    const result = projectSafeTemplate(raw, "internal", context);
    expect(result.title).toContain("ITM-001");
    expect(result.title).toContain("Widget A");
    expect(result.templateVersion).toBe("v1");
  });

  it("includes partyName for party_safe audience when the event's party matches the recipient's own party", () => {
    const result = projectSafeTemplate(raw, "party_safe", context);
    expect(result.body).toContain("Acme Corp");
  });

  it("omits partyName entirely for party_safe audience when the event's party does not match the recipient's own party", () => {
    const mismatched: RawTemplateInput = { ...raw, eventPartyId: "party-2" };
    const result = projectSafeTemplate(mismatched, "party_safe", context);
    expect(result.body).not.toContain("Acme Corp");
  });

  it("omits partyName entirely for party_safe audience when either party id is unresolved", () => {
    const noEventParty: RawTemplateInput = { ...raw, eventPartyId: undefined };
    const result = projectSafeTemplate(noEventParty, "party_safe", { templateVersion: "v1" });
    expect(result.body).not.toContain("Acme Corp");
  });
});
