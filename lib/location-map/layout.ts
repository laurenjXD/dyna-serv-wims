export const WAREHOUSE_MAP_LAYOUT_VERSION = "v6-rack-a-i-30-15";
export const WAREHOUSE_MAP_SOURCE = "DSGC PALLET POSITION.pdf / RACK A-I operating range";

export type RackLayout = {
  rack: string;
  levels: number;
  positions: number;
  x: number;
  y: number;
  width: number;
  height: number;
  reversePositions?: boolean;
  /** Display the physical position run vertically while keeping labels canonical. */
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
 * The supplied warehouse position drawing is the current geometry reference:
 * Rack A has thirty levels and four positions; racks B-G have fifteen levels
 * and four positions; and racks H-I have fifteen levels and two positions. The layout follows the
 * drawing's physical arrangement: A occupies the full left side, followed by
 * F/G and H/I above B/C and D/E. Canonical labels remain level-position
 * labels, so map clicks continue to resolve live locations.
 */
export const WAREHOUSE_RACK_LAYOUT: readonly RackLayout[] = [
  // Keep the first rack title below the warehouse subtitle with a clear gap.
  { rack: "A", levels: 30, positions: 4, x: 84, y: 150, width: 168, height: 600, reversePositions: true },
  { rack: "F", levels: 15, positions: 4, x: 332, y: 150, width: 180, height: 270 },
  { rack: "G", levels: 15, positions: 4, x: 580, y: 150, width: 180, height: 270, reversePositions: true },
  { rack: "H", levels: 15, positions: 2, x: 828, y: 150, width: 128, height: 270 },
  { rack: "I", levels: 15, positions: 2, x: 1024, y: 150, width: 128, height: 270, reversePositions: true },
  { rack: "B", levels: 15, positions: 4, x: 332, y: 510, width: 180, height: 270 },
  { rack: "C", levels: 15, positions: 4, x: 580, y: 510, width: 180, height: 270, reversePositions: true },
  { rack: "D", levels: 15, positions: 4, x: 828, y: 510, width: 180, height: 270 },
  { rack: "E", levels: 15, positions: 4, x: 1024, y: 510, width: 180, height: 270, reversePositions: true },
];

export const WAREHOUSE_RACK_LIMITS = {
  A: { levels: 30, positions: 4 },
  B: { levels: 15, positions: 4 },
  C: { levels: 15, positions: 4 },
  D: { levels: 15, positions: 4 },
  E: { levels: 15, positions: 4 },
  F: { levels: 15, positions: 4 },
  G: { levels: 15, positions: 4 },
  H: { levels: 15, positions: 2 },
  I: { levels: 15, positions: 2 },
} as const;

export const WAREHOUSE_MAP_VIEWBOX = { width: 1200, height: 820 } as const;

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
        ? (layout.reversePositions ? rowIndex + 1 : layout.positions - rowIndex)
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

