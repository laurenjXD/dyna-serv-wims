import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("VMI period server actions", () => {
  it("requires an Administrator for both draft close and payment recording", () => {
    const source = fs.readFileSync(path.join(__dirname, "_actions.ts"), "utf8");
    const administratorChecks = source.match(/activeRoleKeys\.includes\("administrator"\)/g) ?? [];

    expect(administratorChecks).toHaveLength(2);
    expect(source).toContain("Only an Administrator can create VMI billing drafts.");
  });
});
