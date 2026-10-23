import { describe, expect, it } from "vitest";
import {
  buildWarehouseMapCells,
  canonicalLocationLabel,
  WAREHOUSE_MAP_CELLS,
  WAREHOUSE_RACK_LAYOUT,
} from "@/lib/location-map/layout";

describe("warehouse map layout", () => {
  it("uses the canonical Rack+Level-Position label", () => {
    expect(canonicalLocationLabel("A", 1, 1)).toBe("A1-01");
    expect(canonicalLocationLabel("I", 12, 2)).toBe("I12-02");
  });

  it("renders the A-I operating footprint as 540 rack cells", () => {
    expect(WAREHOUSE_MAP_CELLS).toHaveLength(540);
    expect(WAREHOUSE_MAP_CELLS.filter((cell) => cell.rack === "A")).toHaveLength(120);
    for (const rack of ["B", "C", "D", "E"]) {
      expect(WAREHOUSE_MAP_CELLS.filter((cell) => cell.rack === rack)).toHaveLength(60);
    }
    for (const rack of ["F", "G"]) {
      expect(WAREHOUSE_MAP_CELLS.filter((cell) => cell.rack === rack)).toHaveLength(60);
    }
    for (const rack of ["H", "I"]) {
      expect(WAREHOUSE_MAP_CELLS.filter((cell) => cell.rack === rack)).toHaveLength(30);
    }
  });

  it("covers every canonical level-position coordinate exactly once for every rack", () => {
    const labels = new Set(WAREHOUSE_MAP_CELLS.map((cell) => cell.label));

    for (const layout of WAREHOUSE_RACK_LAYOUT) {
      const rackCells = WAREHOUSE_MAP_CELLS.filter((cell) => cell.rack === layout.rack);
      expect(new Set(rackCells.map((cell) => cell.label)).size).toBe(rackCells.length);

      for (let level = 1; level <= layout.levels; level += 1) {
        for (let position = 1; position <= layout.positions; position += 1) {
          expect(labels.has(canonicalLocationLabel(layout.rack, level, position))).toBe(true);
        }
      }
    }
  });

  it("uses the physical column order A, F/G, H/I, B/C, D/E", () => {
    expect(WAREHOUSE_RACK_LAYOUT.map((layout) => layout.rack)).toEqual([
      "A", "F", "G", "H", "I", "B", "C", "D", "E",
    ]);
    expect(WAREHOUSE_RACK_LAYOUT[0]).toMatchObject({ levels: 30, positions: 4, reversePositions: true });
    expect(WAREHOUSE_RACK_LAYOUT[1]).toMatchObject({ levels: 15, positions: 4 });
    expect(WAREHOUSE_RACK_LAYOUT[4]).toMatchObject({ levels: 15, positions: 2, reversePositions: true });
    expect(WAREHOUSE_RACK_LAYOUT.some((layout) => layout.verticalPositions)).toBe(false);
  });

  it("keeps the PDF display orientation linked to canonical level-position labels", () => {
    const rackA = WAREHOUSE_MAP_CELLS.filter((cell) => cell.rack === "A");
    expect(rackA[0]).toMatchObject({ label: "A30-04", level: "30", position: "04" });
    expect(rackA.at(-1)).toMatchObject({ label: "A1-01", level: "1", position: "01" });
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

