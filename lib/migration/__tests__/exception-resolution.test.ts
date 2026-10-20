import { describe, expect, it } from "vitest";
import { isMigrationResolutionCategory, MIGRATION_RESOLUTION_CATEGORIES } from "../exception-resolution";

describe("migration exception resolution categories", () => {
  it("exposes a controlled category list", () => {
    expect(MIGRATION_RESOLUTION_CATEGORIES.map((category) => category.value)).toEqual([
      "fallback_accepted",
      "accepted_as_is",
      "other",
    ]);
  });

  it("rejects arbitrary values", () => {
    expect(isMigrationResolutionCategory("made_up_reason")).toBe(false);
    expect(isMigrationResolutionCategory("fallback_accepted")).toBe(true);
  });
});
