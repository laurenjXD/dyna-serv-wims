export const WAREHOUSE_MAP_LAYOUT_VERSION = "v3-racking-tab-a-g";
export const WAREHOUSE_MAP_SOURCE = "V2_UBOT HK_VMI System_Billing - Full Setup.xlsx / RACKING";

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
 * The workbook's visible RACKING sheet is the current geometry reference:
 * Rack A has four levels and thirty positions; Racks B-G have four levels
 * and fifteen positions. Capacity and inventory never come from the
 * workbook. Non-rack areas stay in Table View until they have a canonical
 * geometry decision.
 */
export const WAREHOUSE_RACK_LAYOUT: readonly RackLayout[] = [
  { rack: "A", levels: 4, positions: 30, x: 24, y: 168, width: 720, height: 192 },
  { rack: "F", levels: 4, positions: 15, x: 816, y: 110, width: 360, height: 160 },
  { rack: "B", levels: 4, positions: 15, x: 816, y: 390, width: 360, height: 160 },
  { rack: "G", levels: 4, positions: 15, x: 1248, y: 110, width: 360, height: 160 },
  { rack: "C", levels: 4, positions: 15, x: 1248, y: 390, width: 360, height: 160 },
  { rack: "D", levels: 4, positions: 15, x: 1680, y: 110, width: 360, height: 160 },
  { rack: "E", levels: 4, positions: 15, x: 1680, y: 390, width: 360, height: 160 },
];

export const WAREHOUSE_RACK_LIMITS = {
  A: { levels: 4, positions: 30 },
  B: { levels: 4, positions: 15 },
  C: { levels: 4, positions: 15 },
  D: { levels: 4, positions: 15 },
  E: { levels: 4, positions: 15 },
  F: { levels: 4, positions: 15 },
  G: { levels: 4, positions: 15 },
} as const;

export const WAREHOUSE_MAP_VIEWBOX = { width: 2070, height: 610 } as const;

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

