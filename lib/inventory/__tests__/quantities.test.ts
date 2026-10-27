import { describe, expect, it } from "vitest";
import { boxesToPieces, exactCartonCount, piecesToBoxes, piecesToPalletEquivalent, positiveInteger } from "../quantities";

describe("inventory quantity conversions", () => {
  it("uses safe defaults for missing or invalid SPQ", () => {
    expect(positiveInteger(null)).toBe(1);
    expect(positiveInteger(0)).toBe(1);
    expect(positiveInteger(50)).toBe(50);
  });

  it("converts authoritative pieces to boxes and back", () => {
    expect(piecesToBoxes(500, 50)).toBe(10);
    expect(boxesToPieces(10, 50)).toBe(500);
    expect(piecesToBoxes(30, 50)).toBe(0.6);
  });

  it("returns pallet equivalents only when pallet capacity is known", () => {
    expect(piecesToPalletEquivalent(500, 50, 10)).toBe(1);
    expect(piecesToPalletEquivalent(500, 50, null)).toBeNull();
  });

  it("derives only complete carton counts from total units and SPQ", () => {
    expect(exactCartonCount(800, 8)).toBe(100);
    expect(exactCartonCount(801, 8)).toBeNull();
    expect(exactCartonCount(800, null)).toBeNull();
  });
});
