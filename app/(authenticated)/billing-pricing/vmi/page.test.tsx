import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("VMI billing workspace route", () => {
  it("provides a direct E.1 entry point into the canonical VMI section", () => {
    const source = fs.readFileSync(path.join(__dirname, "page.tsx"), "utf8");
    expect(source).toContain('section: "vmi"');
    expect(source).toContain('tab: "vmi"');
    expect(source).toContain("BillingPricingPage");
  });
});
