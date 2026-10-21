import { describe, expect, it } from "vitest";
import {
  buildWarehouseMapCells,
  canonicalLocationLabel,
  WAREHOUSE_MAP_CELLS,
} from "@/lib/location-map/layout";

describe("warehouse map layout", () => {
  it("uses the canonical Rack+Level-Position label", () => {
    expect(canonicalLocationLabel("A", 1, 1)).toBe("A1-01");
    expect(canonicalLocationLabel("G", 14, 4)).toBe("G14-04");
  });

  it("renders the Excel Racking ID footprint as 776 rack cells", () => {
    expect(WAREHOUSE_MAP_CELLS).toHaveLength(776);
    expect(WAREHOUSE_MAP_CELLS.filter((cell) => cell.rack === "F")).toHaveLength(120);
    expect(WAREHOUSE_MAP_CELLS.filter((cell) => cell.rack === "G")).toHaveLength(120);
    expect(WAREHOUSE_MAP_CELLS.filter((cell) => cell.rack === "H")).toHaveLength(112);
    expect(WAREHOUSE_MAP_CELLS.filter((cell) => cell.rack === "I")).toHaveLength(112);
  });

  it("keeps level one at the bottom of a rack", () => {
    const cells = buildWarehouseMapCells([{
      rack: "A",
      levels: 3,
      positions: 2,
      x: 0,
      y: 0,
      width: 20,
      height: 30,
    }]);

    expect(cells.filter((cell) => cell.position === "01").map((cell) => cell.label)).toEqual([
      "A3-01",
      "A2-01",
      "A1-01",
    ]);
    expect(cells.find((cell) => cell.label === "A1-01")?.y).toBe(20);
  });

  it("reverses the physical position order without changing canonical labels", () => {
    const cells = buildWarehouseMapCells([{
      rack: "G",
      levels: 1,
      positions: 4,
      x: 0,
      y: 0,
      width: 40,
      height: 10,
      reversePositions: true,
    }]);

    expect(cells.map((cell) => cell.label)).toEqual(["G1-04", "G1-03", "G1-02", "G1-01"]);
  });
});

