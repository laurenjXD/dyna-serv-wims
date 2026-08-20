// RED-step unit tests for lib/enrollment/item-schema.ts (does not exist yet).
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md §4 R4.1-R4.4, R6.1
//   specs/06-party-and-item-enrollment/design.md §6 (Item model, Packaging and
//     dimensional validation, Price boundary, Barcode immutability)
//   specs/01-core-data-model/design.md §1.2 `items` table canonical fields
//   specs/06-party-and-item-enrollment/tasks.md Testing Matrix §Unit tests
//
// Acceptance criteria covered (requirements.md §5):
//   AC: "An authorized administrator can create, search, edit, and deactivate
//       an item using validated canonical party/category references."
//   AC: "Invalid packaging/dimension/UOM combinations are rejected with
//       actionable field-level feedback." (R4.3)
//   AC: "Duplicate party codes, item codes, and barcodes are prevented both
//       before submit and by the authoritative database constraint." (R4.2)
//   AC: "Historical references remain valid after deactivation, and destructive
//       deletion is blocked when references exist." — barcode immutability rule
//
// Expected module contract for lib/enrollment/item-schema.ts (for backend-builder):
//
//   export type ItemInput = { ... all item fields ... }
//
//   export type FieldError = { field: string; message: string }
//
//   export type ParseResult<T> =
//     | { success: true; data: T }
//     | { success: false; errors: FieldError[] }
//
//   export function parseItemInput(input: unknown): ParseResult<ItemInput>
//   // Validates all item fields including conditional UOM/dimension rules.
//   // Defaults: isActive = true, isPerishable = false, spq = 1,
//   //           minReorderLevel = 0, uom = "piece", currency = "USD".
//
//   export function computeItemVolumes(
//     lengthCm: number,
//     widthCm: number,
//     heightCm: number
//   ): { volumeCm3: number; volumeCbm: number }
//   // volumeCm3 = length * width * height, rounded to 2 dp
//   // volumeCbm = length * width * height / 1_000_000, rounded to 4 dp
//
//   export type BarcodeUpdateCheck =
//     | { allowed: true }
//     | { allowed: false; reason: string }
//
//   export function checkBarcodeUpdate(item: {
//     hasRelatedLots: boolean;
//     hasRelatedWrrItems: boolean;
//     hasRelatedInventoryTransactions: boolean;
//   }): BarcodeUpdateCheck
//   // Returns { allowed: false, reason: ... } if any of the three flags is true.
//   // The reason must be a non-empty human-readable string (for error feedback).

import { describe, expect, it } from "vitest";
import {
  parseItemInput,
  computeItemVolumes,
  checkBarcodeUpdate,
} from "@/lib/enrollment/item-schema";

// ---------------------------------------------------------------------------
// Minimal valid item to reuse across tests
// ---------------------------------------------------------------------------
const VALID_BASE: Record<string, unknown> = {
  code: "ITEM-001",
  name: "Test Widget",
  barcode: "1234567890123",
  defaultSupplierPartyId: "party-uuid-1",
  volumeCbm: "0.0120",  // explicit when no dimensions provided
};

// ---------------------------------------------------------------------------
// R4.2 — code and name required + length limits
// ---------------------------------------------------------------------------

describe("parseItemInput — code field (R4.2, design.md §2 items.code varchar 100 NOT NULL UNIQUE)", () => {
  it("rejects missing code", () => {
    const result = parseItemInput({ ...VALID_BASE, code: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "code")).toBeDefined();
    }
  });

  it("rejects empty string code", () => {
    const result = parseItemInput({ ...VALID_BASE, code: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "code")).toBeDefined();
    }
  });

  it("rejects code exceeding 100 characters (design.md §2 varchar 100)", () => {
    const result = parseItemInput({ ...VALID_BASE, code: "X".repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "code")).toBeDefined();
    }
  });

  it("accepts code exactly at 100 characters", () => {
    const result = parseItemInput({ ...VALID_BASE, code: "X".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = parseItemInput({ ...VALID_BASE, name: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "name")).toBeDefined();
    }
  });

  it("rejects name exceeding 255 characters (design.md §2 varchar 255)", () => {
    const result = parseItemInput({ ...VALID_BASE, name: "N".repeat(256) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "name")).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// R4.2 — barcode required
// ---------------------------------------------------------------------------

describe("parseItemInput — barcode field (R4.2, design.md §2 items.barcode varchar 100 NOT NULL UNIQUE)", () => {
  it("rejects missing barcode", () => {
    const result = parseItemInput({ ...VALID_BASE, barcode: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "barcode")).toBeDefined();
    }
  });

  it("rejects empty string barcode", () => {
    const result = parseItemInput({ ...VALID_BASE, barcode: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "barcode")).toBeDefined();
    }
  });

  it("accepts valid barcode string", () => {
    const result = parseItemInput({ ...VALID_BASE, barcode: "9780201633610" });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R4.3 — spq must be positive integer ≥ 1 (design.md §6 Packaging)
// ---------------------------------------------------------------------------

describe("parseItemInput — spq (R4.3, design.md §6 spq ≥ 1 positive integer)", () => {
  it("defaults spq to 1 when omitted", () => {
    const result = parseItemInput({ ...VALID_BASE });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.spq).toBe(1);
    }
  });

  it("rejects spq = 0 (must be ≥ 1)", () => {
    const result = parseItemInput({ ...VALID_BASE, spq: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "spq")).toBeDefined();
    }
  });

  it("rejects spq = -1 (must be ≥ 1)", () => {
    const result = parseItemInput({ ...VALID_BASE, spq: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "spq")).toBeDefined();
    }
  });

  it("rejects spq = 1.5 (must be integer)", () => {
    const result = parseItemInput({ ...VALID_BASE, spq: 1.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "spq")).toBeDefined();
    }
  });

  it("accepts spq = 1 (minimum valid)", () => {
    const result = parseItemInput({ ...VALID_BASE, spq: 1 });
    expect(result.success).toBe(true);
  });

  it("accepts spq = 24 (typical carton quantity)", () => {
    const result = parseItemInput({ ...VALID_BASE, spq: 24 });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R4.3 — uom must be one of ['piece', 'roll', 'meter'] (design.md §6)
// ---------------------------------------------------------------------------

describe("parseItemInput — uom (R4.3, design.md §6 uom enum)", () => {
  it("defaults uom to 'piece' when omitted", () => {
    const result = parseItemInput({ ...VALID_BASE });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.uom).toBe("piece");
    }
  });

  it("accepts uom = 'piece'", () => {
    const result = parseItemInput({ ...VALID_BASE, uom: "piece" });
    expect(result.success).toBe(true);
  });

  it("accepts uom = 'roll'", () => {
    const result = parseItemInput({
      ...VALID_BASE,
      uom: "roll",
      spqMeter: "25.50",   // required when uom='roll'
    });
    expect(result.success).toBe(true);
  });

  it("accepts uom = 'meter'", () => {
    const result = parseItemInput({ ...VALID_BASE, uom: "meter" });
    expect(result.success).toBe(true);
  });

  it("rejects uom = 'box' (not in approved enum)", () => {
    const result = parseItemInput({ ...VALID_BASE, uom: "box" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "uom")).toBeDefined();
    }
  });

  it("rejects uom = '' (empty)", () => {
    const result = parseItemInput({ ...VALID_BASE, uom: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "uom")).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// R4.3 — spqMeter: required and positive when uom='roll', null otherwise
// ---------------------------------------------------------------------------

describe("parseItemInput — spqMeter conditional (R4.3, design.md §6 spq_meter)", () => {
  it("rejects uom='roll' with spqMeter absent (required for roll)", () => {
    const result = parseItemInput({ ...VALID_BASE, uom: "roll" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "spqMeter")).toBeDefined();
    }
  });

  it("rejects uom='roll' with spqMeter = 0 (must be positive)", () => {
    const result = parseItemInput({ ...VALID_BASE, uom: "roll", spqMeter: "0" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "spqMeter")).toBeDefined();
    }
  });

  it("rejects uom='roll' with spqMeter negative (must be positive)", () => {
    const result = parseItemInput({ ...VALID_BASE, uom: "roll", spqMeter: "-5" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "spqMeter")).toBeDefined();
    }
  });

  it("accepts uom='roll' with positive spqMeter", () => {
    const result = parseItemInput({ ...VALID_BASE, uom: "roll", spqMeter: "25.50" });
    expect(result.success).toBe(true);
  });

  it("rejects uom='piece' with spqMeter provided (must be null for non-roll)", () => {
    const result = parseItemInput({ ...VALID_BASE, uom: "piece", spqMeter: "10.00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "spqMeter")).toBeDefined();
    }
  });

  it("rejects uom='meter' with spqMeter provided (must be null for non-roll)", () => {
    const result = parseItemInput({ ...VALID_BASE, uom: "meter", spqMeter: "10.00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "spqMeter")).toBeDefined();
    }
  });

  it("accepts uom='piece' with spqMeter null (valid omission for non-roll)", () => {
    const result = parseItemInput({ ...VALID_BASE, uom: "piece", spqMeter: null });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R4.3 — currency must be one of ['USD', 'PHP'] (design.md §6)
// ---------------------------------------------------------------------------

describe("parseItemInput — currency (R4.3, design.md §2 currency varchar 10 NOT NULL)", () => {
  it("defaults currency to 'USD' when omitted", () => {
    const result = parseItemInput({ ...VALID_BASE });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("USD");
    }
  });

  it("accepts currency = 'USD'", () => {
    const result = parseItemInput({ ...VALID_BASE, currency: "USD" });
    expect(result.success).toBe(true);
  });

  it("accepts currency = 'PHP'", () => {
    const result = parseItemInput({ ...VALID_BASE, currency: "PHP" });
    expect(result.success).toBe(true);
  });

  it("rejects currency = 'EUR' (not in approved enum)", () => {
    const result = parseItemInput({ ...VALID_BASE, currency: "EUR" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "currency")).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// R4.3 — dimensions: all-or-nothing rule (design.md §6)
// ---------------------------------------------------------------------------

describe("parseItemInput — dimensions all-or-nothing (R4.3, design.md §6)", () => {
  it("accepts all three dimensions absent with explicit volumeCbm", () => {
    const result = parseItemInput({
      ...VALID_BASE,
      lengthCm: undefined,
      widthCm: undefined,
      heightCm: undefined,
      volumeCbm: "0.0050",
    });
    expect(result.success).toBe(true);
  });

  it("rejects providing lengthCm without widthCm and heightCm", () => {
    const result = parseItemInput({
      ...VALID_BASE,
      lengthCm: "30.00",
      widthCm: undefined,
      heightCm: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dimErrors = result.errors.filter((e) =>
        ["widthCm", "heightCm"].includes(e.field)
      );
      expect(dimErrors.length).toBeGreaterThan(0);
    }
  });

  it("rejects providing widthCm without lengthCm and heightCm", () => {
    const result = parseItemInput({
      ...VALID_BASE,
      lengthCm: undefined,
      widthCm: "20.00",
      heightCm: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dimErrors = result.errors.filter((e) =>
        ["lengthCm", "heightCm"].includes(e.field)
      );
      expect(dimErrors.length).toBeGreaterThan(0);
    }
  });

  it("rejects providing heightCm without lengthCm and widthCm", () => {
    const result = parseItemInput({
      ...VALID_BASE,
      lengthCm: undefined,
      widthCm: undefined,
      heightCm: "10.00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dimErrors = result.errors.filter((e) =>
        ["lengthCm", "widthCm"].includes(e.field)
      );
      expect(dimErrors.length).toBeGreaterThan(0);
    }
  });

  it("rejects any dimension value ≤ 0 (each must be positive)", () => {
    const result = parseItemInput({
      ...VALID_BASE,
      lengthCm: "0",
      widthCm: "20.00",
      heightCm: "10.00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "lengthCm")).toBeDefined();
    }
  });

  it("rejects negative dimension value", () => {
    const result = parseItemInput({
      ...VALID_BASE,
      lengthCm: "30.00",
      widthCm: "-20.00",
      heightCm: "10.00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "widthCm")).toBeDefined();
    }
  });

  it("accepts all three positive dimensions", () => {
    const result = parseItemInput({
      ...VALID_BASE,
      lengthCm: "30.00",
      widthCm: "20.00",
      heightCm: "10.00",
      // volumeCbm is computed from dimensions; passing explicitly too is valid
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R4.3 / R4.4 — volumeCbm NOT NULL; volumeCm3 and volumeCbm computed values
// ---------------------------------------------------------------------------

describe("parseItemInput — volumeCbm required when dimensions absent (R4.3/R4.4, design.md §6)", () => {
  it("rejects when dimensions absent AND volumeCbm not provided (volumeCbm is NOT NULL)", () => {
    const { volumeCbm: _, ...withoutVolume } = VALID_BASE as {
      volumeCbm: unknown;
      [k: string]: unknown;
    };
    const result = parseItemInput(withoutVolume);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "volumeCbm")).toBeDefined();
    }
  });
});

describe("computeItemVolumes — volume calculation (R4.3/R4.4, design.md §6)", () => {
  it("computes volumeCm3 = length × width × height, rounded to 2 dp", () => {
    const { volumeCm3 } = computeItemVolumes(30, 20, 10);
    expect(volumeCm3).toBe(6000.00);
  });

  it("computes volumeCbm = length × width × height / 1_000_000, rounded to 4 dp", () => {
    const { volumeCbm } = computeItemVolumes(30, 20, 10);
    expect(volumeCbm).toBe(0.0060);
  });

  it("rounds volumeCm3 to 2 decimal places (precision check)", () => {
    // 31.1 * 21.3 * 11.7 = 7751.001 ... ensure 2dp rounding
    const { volumeCm3 } = computeItemVolumes(31.1, 21.3, 11.7);
    const expected = Math.round(31.1 * 21.3 * 11.7 * 100) / 100;
    expect(volumeCm3).toBe(expected);
  });

  it("rounds volumeCbm to 4 decimal places (precision check)", () => {
    const { volumeCbm } = computeItemVolumes(31.1, 21.3, 11.7);
    const raw = (31.1 * 21.3 * 11.7) / 1_000_000;
    const expected = Math.round(raw * 10000) / 10000;
    expect(volumeCbm).toBe(expected);
  });

  it("computes correctly for a 1cm × 1cm × 1cm item", () => {
    const { volumeCm3, volumeCbm } = computeItemVolumes(1, 1, 1);
    expect(volumeCm3).toBe(1.00);
    expect(volumeCbm).toBe(0.0000);
  });
});

// ---------------------------------------------------------------------------
// R4.3 — boxes_per_pallet: positive integer when provided (design.md §6)
// ---------------------------------------------------------------------------

describe("parseItemInput — boxesPerPallet (R4.3, design.md §6 positive integer or null)", () => {
  it("accepts boxesPerPallet absent (null is permitted)", () => {
    const result = parseItemInput({ ...VALID_BASE, boxesPerPallet: null });
    expect(result.success).toBe(true);
  });

  it("accepts boxesPerPallet = 48 (valid positive integer)", () => {
    const result = parseItemInput({ ...VALID_BASE, boxesPerPallet: 48 });
    expect(result.success).toBe(true);
  });

  it("rejects boxesPerPallet = 0 (must be positive when provided)", () => {
    const result = parseItemInput({ ...VALID_BASE, boxesPerPallet: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "boxesPerPallet")).toBeDefined();
    }
  });

  it("rejects boxesPerPallet = 1.5 (must be integer when provided)", () => {
    const result = parseItemInput({ ...VALID_BASE, boxesPerPallet: 1.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "boxesPerPallet")).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// R4.3 — weight_kg: non-negative decimal when provided (design.md §6)
// ---------------------------------------------------------------------------

describe("parseItemInput — weightKg (R4.3, design.md §6 non-negative or null)", () => {
  it("accepts weightKg absent (null is permitted)", () => {
    const result = parseItemInput({ ...VALID_BASE, weightKg: null });
    expect(result.success).toBe(true);
  });

  it("accepts weightKg = '0.000' (zero is non-negative)", () => {
    const result = parseItemInput({ ...VALID_BASE, weightKg: "0.000" });
    expect(result.success).toBe(true);
  });

  it("accepts weightKg = '12.500'", () => {
    const result = parseItemInput({ ...VALID_BASE, weightKg: "12.500" });
    expect(result.success).toBe(true);
  });

  it("rejects weightKg negative value", () => {
    const result = parseItemInput({ ...VALID_BASE, weightKg: "-1.000" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "weightKg")).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// R4.3 — min_reorder_level: non-negative integer, default 0 (design.md §6)
// ---------------------------------------------------------------------------

describe("parseItemInput — minReorderLevel (R4.3, design.md §6 non-negative integer default 0)", () => {
  it("defaults minReorderLevel to 0 when omitted", () => {
    const result = parseItemInput({ ...VALID_BASE });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minReorderLevel).toBe(0);
    }
  });

  it("accepts minReorderLevel = 0", () => {
    const result = parseItemInput({ ...VALID_BASE, minReorderLevel: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts minReorderLevel = 100", () => {
    const result = parseItemInput({ ...VALID_BASE, minReorderLevel: 100 });
    expect(result.success).toBe(true);
  });

  it("rejects minReorderLevel negative (must be non-negative)", () => {
    const result = parseItemInput({ ...VALID_BASE, minReorderLevel: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "minReorderLevel")).toBeDefined();
    }
  });

  it("rejects minReorderLevel = 1.5 (must be integer)", () => {
    const result = parseItemInput({ ...VALID_BASE, minReorderLevel: 1.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "minReorderLevel")).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// R4.3 — buying_price and selling_price: nullable decimals (design.md §6)
// ---------------------------------------------------------------------------

describe("parseItemInput — buyingPrice / sellingPrice (R4.3/design.md §6 Price boundary, nullable decimal 12,4)", () => {
  it("accepts both absent (nullable per schema)", () => {
    const result = parseItemInput({ ...VALID_BASE });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buyingPrice ?? null).toBeNull();
      expect(result.data.sellingPrice ?? null).toBeNull();
    }
  });

  it("accepts buyingPrice as a decimal string", () => {
    const result = parseItemInput({ ...VALID_BASE, buyingPrice: "12.5000" });
    expect(result.success).toBe(true);
  });

  it("accepts sellingPrice as a decimal string", () => {
    const result = parseItemInput({ ...VALID_BASE, sellingPrice: "15.0000" });
    expect(result.success).toBe(true);
  });

  it("accepts both null explicitly", () => {
    const result = parseItemInput({ ...VALID_BASE, buyingPrice: null, sellingPrice: null });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// design.md §6 Barcode immutability — checkBarcodeUpdate helper
// ---------------------------------------------------------------------------

describe("checkBarcodeUpdate — barcode immutability rule (design.md §6 Barcode immutability)", () => {
  it("allows barcode update when item has no related lots, wrr_items, or inventory_transactions", () => {
    const result = checkBarcodeUpdate({
      hasRelatedLots: false,
      hasRelatedWrrItems: false,
      hasRelatedInventoryTransactions: false,
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks barcode update when item has related lots (AC: barcode immutable after operational use)", () => {
    const result = checkBarcodeUpdate({
      hasRelatedLots: true,
      hasRelatedWrrItems: false,
      hasRelatedInventoryTransactions: false,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("blocks barcode update when item has related wrr_items", () => {
    const result = checkBarcodeUpdate({
      hasRelatedLots: false,
      hasRelatedWrrItems: true,
      hasRelatedInventoryTransactions: false,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("blocks barcode update when item has related inventory_transactions", () => {
    const result = checkBarcodeUpdate({
      hasRelatedLots: false,
      hasRelatedWrrItems: false,
      hasRelatedInventoryTransactions: true,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("blocks barcode update when all three operational record types exist", () => {
    const result = checkBarcodeUpdate({
      hasRelatedLots: true,
      hasRelatedWrrItems: true,
      hasRelatedInventoryTransactions: true,
    });
    expect(result.allowed).toBe(false);
  });
});
