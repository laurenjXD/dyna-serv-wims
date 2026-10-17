import { describe, expect, it } from "vitest";
import { validateRbeSelection } from "@/lib/enrollment/rbe";

describe("RBE enrollment validation", () => {
  it("accepts zero, one, and three classifications", () => {
    expect(validateRbeSelection([], true)).toEqual({ valid: true, values: [] });
    expect(validateRbeSelection(["EE"], true)).toEqual({ valid: true, values: ["ee"] });
    expect(validateRbeSelection(["EE", "ELSE", "ETC"], true)).toEqual({
      valid: true,
      values: ["ee", "else", "etc"],
    });
  });

  it("rejects duplicate and invalid values", () => {
    expect(validateRbeSelection(["EE", "ee"], true)).toEqual({ valid: true, values: ["ee"] });
    expect(validateRbeSelection(["unknown"], true).valid).toBe(false);
  });

  it("rejects RBE values for non-Customers", () => {
    expect(validateRbeSelection(["EE"], false)).toEqual({
      valid: false,
      reason: "RBE classifications are available only for Customer enrollment.",
    });
  });

  it("rejects more than three submitted values", () => {
    expect(validateRbeSelection(["EE", "ELSE", "ETC", "EE"], true)).toEqual({
      valid: true,
      values: ["ee", "else", "etc"],
    });
  });
});
