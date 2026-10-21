export const WAREHOUSE_MAP_LAYOUT_VERSION = "v4-racking-tab-vertical-a-g";
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
  /** Display the workbook's position run vertically while keeping labels canonical. */
  verticalPositions?: boolean;
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
 * and fifteen positions. The display rotates the position run vertically so
 * the map matches the physical reference: A occupies the full left side,
 * followed by F/B, G/C, and D/E stacked columns. Canonical labels remain
 * level-position labels, so map clicks continue to resolve live locations.
 */
export const WAREHOUSE_RACK_LAYOUT: readonly RackLayout[] = [
  { rack: "A", levels: 4, positions: 30, x: 84, y: 92, width: 164, height: 600, verticalPositions: true },
  { rack: "F", levels: 4, positions: 15, x: 316, y: 92, width: 164, height: 280, verticalPositions: true },
  { rack: "B", levels: 4, positions: 15, x: 316, y: 412, width: 164, height: 280, verticalPositions: true },
  { rack: "G", levels: 4, positions: 15, x: 548, y: 92, width: 164, height: 280, verticalPositions: true },
  { rack: "C", levels: 4, positions: 15, x: 548, y: 412, width: 164, height: 280, verticalPositions: true },
  { rack: "D", levels: 4, positions: 15, x: 780, y: 92, width: 164, height: 280, verticalPositions: true },
  { rack: "E", levels: 4, positions: 15, x: 780, y: 412, width: 164, height: 280, verticalPositions: true },
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

export const WAREHOUSE_MAP_VIEWBOX = { width: 1000, height: 760 } as const;

export function canonicalLocationLabel(rack: string, level: number, position: number): string {
  return `${rack}${level}-${String(position).padStart(2, "0")}`;
}

export function buildWarehouseMapCells(
  layouts: readonly RackLayout[] = WAREHOUSE_RACK_LAYOUT,
): WarehouseMapCell[] {
  return layouts.flatMap((layout) => {
    const cellWidth = layout.width / (layout.verticalPositions ? layout.levels : layout.positions);
    const cellHeight = layout.height / (layout.verticalPositions ? layout.positions : layout.levels);

    return Array.from({ length: layout.verticalPositions ? layout.positions : layout.levels }, (_, rowIndex) => {
      const rowLevel = layout.verticalPositions ? undefined : layout.levels - rowIndex;
      const rowPosition = layout.verticalPositions
        ? (layout.reversePositions ? layout.positions - rowIndex : rowIndex + 1)
        : undefined;
      return Array.from({ length: layout.verticalPositions ? layout.levels : layout.positions }, (_, columnIndex) => {
        const level = layout.verticalPositions ? layout.levels - columnIndex : rowLevel!;
        const position = layout.verticalPositions
          ? rowPosition!
          : layout.reversePositions
            ? layout.positions - columnIndex
            : columnIndex + 1;
        const label = canonicalLocationLabel(layout.rack, level, position);

        return {
          key: label,
          rack: layout.rack,
          level: String(level),
          position: String(position).padStart(2, "0"),
          label,
          x: layout.x + columnIndex * cellWidth,
          y: layout.y + rowIndex * cellHeight,
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

