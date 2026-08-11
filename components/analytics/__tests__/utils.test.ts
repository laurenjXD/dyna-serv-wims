import { describe, expect, it } from "vitest";
import { heatmapLevel, statusClass, trendLabel, trendSymbol } from "../utils";

describe("analytics component helpers", () => {
  it("maps heatmap counts to the five approved density tiers", () => {
    expect([0, 1, 10, 11, 50, 51, 100, 101].map(heatmapLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it("keeps trend indicators textual as well as symbolic", () => {
    expect(trendSymbol("up")).toBe("↑");
    expect(trendLabel({ direction: "down", pct: 12 })).toBe("down 12% from prior period");
  });
  it("maps every status to a semantic token class", () => {
    expect(statusClass("available")).toContain("status-success");
    expect(statusClass("expired")).toContain("secondary");
  });
});
