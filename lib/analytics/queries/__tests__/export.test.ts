import { describe, expect, it } from "vitest";
import { EXPORT_PAGE_SIZE } from "../export";

describe("analytics export contract", () => {
  it("uses the approved 1,000-row maximum page size", () => {
    expect(EXPORT_PAGE_SIZE).toBe(1000);
  });
});
