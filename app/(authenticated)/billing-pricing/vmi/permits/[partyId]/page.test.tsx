import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("VMI permits route", () => {
  it("uses the approved permit command and displays permit history", () => {
    const source = fs.readFileSync(path.join(__dirname, "page.tsx"), "utf8");
    expect(source).toContain("listVmiPermits");
    expect(source).toContain("PermitForm");
    expect(source).toContain("reporting.financial_read");
  });
});
