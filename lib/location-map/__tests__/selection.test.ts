import { describe, expect, it } from "vitest";
import { toggleMapSelection } from "@/lib/location-map/selection";

describe("toggleMapSelection", () => {
  it("replaces the selection on a normal click", () => {
    expect(toggleMapSelection(["A4-01", "A4-02"], "A4-03", false)).toEqual(["A4-03"]);
  });

  it("adds a cell on shift-click", () => {
    expect(toggleMapSelection(["A4-01"], "A4-02", true)).toEqual(["A4-01", "A4-02"]);
  });

  it("removes a cell when shift-clicking an already selected cell", () => {
    expect(toggleMapSelection(["A4-01", "A4-02"], "A4-01", true)).toEqual(["A4-02"]);
  });
});

