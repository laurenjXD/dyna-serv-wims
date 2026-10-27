export const WAREHOUSE_MAP_LAYOUT_VERSION = "v7-pdf-footprint-canonical-labels";
export const WAREHOUSE_MAP_SOURCE = "DSGC PALLET POSITION.pdf / confirmed RACK A-I footprint";

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
 * The supplied PDF is the current geometry reference. Its physical footprint
 * is represented as positions running vertically: A is 30 positions across 4
 * layers, B-E are 12 positions across 4 layers, F-G are 14 positions across
 * 4 layers, and H-I are 12 positions across 2 layers. Canonical labels remain
 * level-position labels, so map clicks continue to resolve live locations.
 *
 * WAREHOUSE_RACK_LIMITS below is intentionally separate: it describes the
 * location-entry contract (A: 1-30, B-I: 1-15; levels 1-4), while this layout
 * describes only the confirmed PDF drawing footprint.
 */
export const WAREHOUSE_RACK_LAYOUT: readonly RackLayout[] = [
  // Keep the first rack title below the warehouse subtitle with a clear gap.
  { rack: "A", levels: 4, positions: 30, x: 84, y: 150, width: 168, height: 600, reversePositions: true, verticalPositions: true },
  { rack: "F", levels: 4, positions: 14, x: 332, y: 150, width: 180, height: 270, verticalPositions: true },
  { rack: "G", levels: 4, positions: 14, x: 580, y: 150, width: 180, height: 270, reversePositions: true, verticalPositions: true },
  { rack: "H", levels: 2, positions: 12, x: 828, y: 150, width: 128, height: 270, verticalPositions: true },
  { rack: "I", levels: 2, positions: 12, x: 1024, y: 150, width: 128, height: 270, reversePositions: true, verticalPositions: true },
  { rack: "B", levels: 4, positions: 12, x: 332, y: 510, width: 180, height: 270, verticalPositions: true },
  { rack: "C", levels: 4, positions: 12, x: 580, y: 510, width: 180, height: 270, reversePositions: true, verticalPositions: true },
  { rack: "D", levels: 4, positions: 12, x: 828, y: 510, width: 180, height: 270, verticalPositions: true },
  // Keep enough gutter before E's vertical POS labels so D's final level
  // header does not visually merge with them in the horizontally scrollable
  // map view.
  { rack: "E", levels: 4, positions: 12, x: 1048, y: 510, width: 180, height: 270, reversePositions: true, verticalPositions: true },
];

// Form/storage-entry limits. These are broader than the visible PDF footprint
// for B-I and must not be derived from the rendered cell counts above.
export const WAREHOUSE_RACK_LIMITS = {
  A: { levels: 4, positions: 30 },
  B: { levels: 4, positions: 15 },
  C: { levels: 4, positions: 15 },
  D: { levels: 4, positions: 15 },
  E: { levels: 4, positions: 15 },
  F: { levels: 4, positions: 15 },
  G: { levels: 4, positions: 15 },
  H: { levels: 4, positions: 15 },
  I: { levels: 4, positions: 15 },
} as const;

export const WAREHOUSE_MAP_VIEWBOX = { width: 1240, height: 820 } as const;

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

