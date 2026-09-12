import { describe, expect, it } from "vitest";
import { resolveBillingSection, resolveBillingTab } from "./navigation";

describe("Billing & Pricing navigation", () => {
  it("defaults legacy URLs to VMI Billing", () => {
    expect(resolveBillingSection()).toBe("vmi");
    expect(resolveBillingTab("vmi")).toBe("vmi");
  });

  it("maps existing tabs into the new top-level sections", () => {
    expect(resolveBillingSection(undefined, "trading")).toBe("trading");
    expect(resolveBillingSection(undefined, "policies")).toBe("trading");
    expect(resolveBillingSection(undefined, "vmi-contracts")).toBe("configuration");
    expect(resolveBillingSection(undefined, "logistics-rates")).toBe("configuration");
  });

  it("allows explicit section links to control the landing surface", () => {
    expect(resolveBillingSection("overview", "trading")).toBe("overview");
    expect(resolveBillingTab("trading", "policies")).toBe("policies");
    expect(resolveBillingTab("configuration", "vmi-contracts")).toBe("vmi-contracts");
  });
});
