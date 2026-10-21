export const WAREHOUSE_MAP_LAYOUT_VERSION = "v2-excel-racking-id-a-i";
export const WAREHOUSE_MAP_SOURCE = "V2_UBOT HK_VMI System_Billing - Full Setup.xlsx / Racking ID";

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
 * The workbook's Racking ID sheet is the current geometry reference. Its
 * position-first labels are normalized into WIMS's canonical level-position
 * labels before they reach this map. Capacity and inventory never come from
 * the workbook. Non-rack areas stay in Table View until they have a canonical
 * geometry decision.
 */
export const WAREHOUSE_RACK_LAYOUT: readonly RackLayout[] = [
  { rack: "A", levels: 30, positions: 4, x: 24, y: 92, width: 152, height: 620 },
  { rack: "F", levels: 30, positions: 4, x: 238, y: 92, width: 152, height: 620 },
  { rack: "G", levels: 30, positions: 4, x: 420, y: 92, width: 152, height: 620 },
  { rack: "H", levels: 28, positions: 4, x: 718, y: 92, width: 152, height: 580 },
  { rack: "I", levels: 28, positions: 4, x: 892, y: 92, width: 152, height: 580 },
  { rack: "B", levels: 12, positions: 4, x: 238, y: 760, width: 152, height: 238 },
  { rack: "C", levels: 12, positions: 4, x: 420, y: 760, width: 152, height: 238 },
  { rack: "D", levels: 12, positions: 4, x: 634, y: 760, width: 152, height: 238 },
  { rack: "E", levels: 12, positions: 4, x: 816, y: 760, width: 152, height: 238 },
];

export const WAREHOUSE_MAP_VIEWBOX = { width: 1100, height: 1050 } as const;

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

