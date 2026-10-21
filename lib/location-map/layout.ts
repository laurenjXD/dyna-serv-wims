export const WAREHOUSE_MAP_LAYOUT_VERSION = "v1-pdf-racks-a-i";
export const WAREHOUSE_MAP_SOURCE = "DSGC PALLET POSITION.pdf";

export type RackLayout = {
  rack: string;
  levels: number;
  positions: number;
  x: number;
  y: number;
  width: number;
  height: number;
  reversePositions?: boolean;
};

export type WarehouseMapCell = {
  key: string;
  rack: string;
  level: string;
  position: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * The PDF is a visual reference only. Capacity and inventory never come from
 * this fixture. Rack A-I is the first mapped footprint; non-rack areas stay in
 * Table View until they have a canonical geometry decision.
 */
export const WAREHOUSE_RACK_LAYOUT: readonly RackLayout[] = [
  { rack: "A", levels: 30, positions: 4, x: 24, y: 92, width: 152, height: 620 },
  { rack: "F", levels: 14, positions: 4, x: 238, y: 92, width: 152, height: 270 },
  { rack: "G", levels: 14, positions: 4, x: 420, y: 92, width: 152, height: 270, reversePositions: true },
  { rack: "H", levels: 12, positions: 2, x: 718, y: 112, width: 92, height: 230 },
  { rack: "I", levels: 12, positions: 2, x: 844, y: 112, width: 92, height: 230 },
  { rack: "B", levels: 12, positions: 4, x: 238, y: 456, width: 152, height: 238 },
  { rack: "C", levels: 12, positions: 4, x: 420, y: 456, width: 152, height: 238 },
  { rack: "D", levels: 12, positions: 4, x: 634, y: 456, width: 152, height: 238 },
  { rack: "E", levels: 12, positions: 4, x: 816, y: 456, width: 152, height: 238 },
];

export const WAREHOUSE_MAP_VIEWBOX = { width: 1000, height: 760 } as const;

export function canonicalLocationLabel(rack: string, level: number, position: number): string {
  return `${rack}${level}-${String(position).padStart(2, "0")}`;
}

export function buildWarehouseMapCells(
  layouts: readonly RackLayout[] = WAREHOUSE_RACK_LAYOUT,
): WarehouseMapCell[] {
  return layouts.flatMap((layout) => {
    const cellWidth = layout.width / layout.positions;
    const cellHeight = layout.height / layout.levels;

    return Array.from({ length: layout.levels }, (_, levelIndex) => {
      const level = layout.levels - levelIndex;
      return Array.from({ length: layout.positions }, (_, positionIndex) => {
        const position = layout.reversePositions
          ? layout.positions - positionIndex
          : positionIndex + 1;
        const label = canonicalLocationLabel(layout.rack, level, position);

        return {
          key: label,
          rack: layout.rack,
          level: String(level),
          position: String(position).padStart(2, "0"),
          label,
          x: layout.x + positionIndex * cellWidth,
          y: layout.y + levelIndex * cellHeight,
          width: cellWidth,
          height: cellHeight,
        };
      });
    }).flat();
  });
}

export const WAREHOUSE_MAP_CELLS = buildWarehouseMapCells();

export function rackLabelsForMap(
  layouts: readonly RackLayout[] = WAREHOUSE_RACK_LAYOUT,
): string[] {
  return layouts.map((layout) => layout.rack);
}

