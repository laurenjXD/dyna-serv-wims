import { describe, expect, it } from "vitest";
import { resolveBillingSection, resolveBillingTab } from "./navigation";

describe("Billing & Pricing navigation", () => {
  it("defaults to overview section", () => {
    expect(resolveBillingSection()).toBe("overview");
    expect(resolveBillingTab("overview")).toBe("overview");
  });

  it("maps existing tabs into the 4 core sections", () => {
    expect(resolveBillingSection(undefined, "ledger")).toBe("ledger");
    expect(resolveBillingSection(undefined, "vmi")).toBe("ledger");
    expect(resolveBillingSection(undefined, "trading")).toBe("ledger");
    expect(resolveBillingSection(undefined, "soa")).toBe("soa");
    expect(resolveBillingSection(undefined, "vmi-contracts")).toBe("configuration");
    expect(resolveBillingSection(undefined, "logistics-rates")).toBe("configuration");
  });

  it("allows explicit section links to control the landing surface", () => {
    expect(resolveBillingSection("overview")).toBe("overview");
    expect(resolveBillingSection("ledger")).toBe("ledger");
    expect(resolveBillingSection("soa")).toBe("soa");
    expect(resolveBillingSection("configuration")).toBe("configuration");
  });
});

