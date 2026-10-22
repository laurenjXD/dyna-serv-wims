/**
 * Inventory quantities are authoritative in the item's base UOM (normally
 * pieces). Boxes and pallets are derived display/occupancy measures:
 *
 *   boxes = pieces / spq
 *   pallets = boxes / boxesPerPallet
 *
 * Keep these conversions in one place so stock pages, exports, and analytics
 * cannot silently apply different packaging math.
 */

export function positiveInteger(value: number | null | undefined, fallback = 1): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

export function piecesToBoxes(pieces: number, spq: number | null | undefined): number {
  return pieces / positiveInteger(spq);
}

export function boxesToPieces(boxes: number, spq: number | null | undefined): number {
  return boxes * positiveInteger(spq);
}

export function piecesToPalletEquivalent(
  pieces: number,
  spq: number | null | undefined,
  boxesPerPallet: number | null | undefined,
): number | null {
  if (!Number.isFinite(boxesPerPallet) || Number(boxesPerPallet) <= 0) return null;
  return piecesToBoxes(pieces, spq) / Number(boxesPerPallet);
}

