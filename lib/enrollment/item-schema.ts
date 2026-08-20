// Item input validation helpers.
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R4.1-R4.4, R6.1
//   specs/06-party-and-item-enrollment/design.md §6 (Item model, Packaging/
//     dimensional validation, Price boundary, Barcode immutability)
//   lib/db/schema/items.ts — items table
//   lib/db/schema/enums.ts — uom is a varchar (piece/roll/meter), currency varchar

export type ItemInput = {
  code: string;
  name: string;
  barcode: string;
  // Nullable cross-reference identifiers
  supplierItemCode?: string | null;
  customerItemCode?: string | null;
  dsgcItemNumber?: string | null;
  description?: string | null;
  itemType?: string | null;
  categoryId?: string | null;
  defaultSupplierPartyId?: string | null;
  // UOM / packaging
  uom: "piece" | "roll" | "meter";
  currency: "USD" | "PHP";
  spq: number;                  // positive integer ≥ 1
  spqMeter?: string | null;     // decimal string; required and positive when uom='roll'
  // Dimensions (all-or-nothing)
  lengthCm?: string | null;
  widthCm?: string | null;
  heightCm?: string | null;
  // Volumes
  volumeCm3?: string | null;    // computed when dimensions present; otherwise null
  volumeCbm: string;            // NOT NULL in schema; required when dimensions absent
  // Packaging
  boxesPerPallet?: number | null;
  weightKg?: string | null;
  // Inventory
  minReorderLevel: number;
  isPerishable?: boolean;
  isActive?: boolean;
  // Reference prices (nullable; never used to finalize Trading prices or VMI billing)
  buyingPrice?: string | null;
  sellingPrice?: string | null;
};

export type FieldError = { field: string; message: string };

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: FieldError[] };

const VALID_UOM = ["piece", "roll", "meter"] as const;
const VALID_CURRENCY = ["USD", "PHP"] as const;

/**
 * Computes volumeCm3 and volumeCbm from dimensions.
 * volumeCm3 = length × width × height, rounded to 2 dp
 * volumeCbm = length × width × height / 1_000_000, rounded to 4 dp
 */
export function computeItemVolumes(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
): { volumeCm3: number; volumeCbm: number } {
  const raw = lengthCm * widthCm * heightCm;
  const volumeCm3 = Math.round(raw * 100) / 100;
  const volumeCbm = Math.round((raw / 1_000_000) * 10000) / 10000;
  return { volumeCm3, volumeCbm };
}

export type BarcodeUpdateCheck =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Returns { allowed: false, reason } if the item has any operational records
 * that would be broken by a barcode change.
 * design.md §6 Barcode immutability.
 */
export function checkBarcodeUpdate(item: {
  hasRelatedLots: boolean;
  hasRelatedWrrItems: boolean;
  hasRelatedInventoryTransactions: boolean;
}): BarcodeUpdateCheck {
  const blockers: string[] = [];
  if (item.hasRelatedLots) blockers.push("existing lots");
  if (item.hasRelatedWrrItems) blockers.push("WRR receiving records");
  if (item.hasRelatedInventoryTransactions) blockers.push("inventory transactions");

  if (blockers.length > 0) {
    return {
      allowed: false,
      reason: `Barcode cannot be changed because this item is referenced by ${blockers.join(", ")}. Changing the barcode after operational use would break historical traceability.`,
    };
  }
  return { allowed: true };
}

function isPositiveDecimalString(value: string): boolean {
  const n = parseFloat(value);
  return !isNaN(n) && n > 0;
}

function isNonNegativeDecimalString(value: string): boolean {
  const n = parseFloat(value);
  return !isNaN(n) && n >= 0;
}

/**
 * Validates all item fields including conditional UOM/dimension rules.
 * Defaults: isActive = true, isPerishable = false, spq = 1,
 *           minReorderLevel = 0, uom = "piece", currency = "USD".
 */
export function parseItemInput(input: unknown): ParseResult<ItemInput> {
  const errors: FieldError[] = [];

  if (typeof input !== "object" || input === null) {
    return {
      success: false,
      errors: [{ field: "input", message: "Input must be a non-null object." }],
    };
  }

  const raw = input as Record<string, unknown>;

  // ── code: varchar(100) NOT NULL UNIQUE ──────────────────────────────────────
  const code = raw["code"];
  if (code === undefined || code === null || code === "") {
    errors.push({ field: "code", message: "Item code is required." });
  } else if (typeof code !== "string") {
    errors.push({ field: "code", message: "Item code must be a string." });
  } else if (code.length > 100) {
    errors.push({ field: "code", message: "Item code must not exceed 100 characters." });
  }

  // ── name: varchar(255) NOT NULL ─────────────────────────────────────────────
  const name = raw["name"];
  if (name === undefined || name === null || name === "") {
    errors.push({ field: "name", message: "Item name is required." });
  } else if (typeof name !== "string") {
    errors.push({ field: "name", message: "Item name must be a string." });
  } else if (name.length > 255) {
    errors.push({ field: "name", message: "Item name must not exceed 255 characters." });
  }

  // ── barcode: varchar(100) NOT NULL UNIQUE ───────────────────────────────────
  const barcode = raw["barcode"];
  if (barcode === undefined || barcode === null || barcode === "") {
    errors.push({ field: "barcode", message: "Barcode is required." });
  } else if (typeof barcode !== "string") {
    errors.push({ field: "barcode", message: "Barcode must be a string." });
  }

  // ── uom: enum ['piece', 'roll', 'meter'], defaults to 'piece' ───────────────
  const rawUom = raw["uom"];
  let uom: ItemInput["uom"] = "piece";
  if (rawUom !== undefined && rawUom !== null) {
    if (typeof rawUom !== "string" || !(VALID_UOM as readonly string[]).includes(rawUom)) {
      errors.push({
        field: "uom",
        message: `UOM must be one of: ${VALID_UOM.join(", ")}.`,
      });
    } else {
      uom = rawUom as ItemInput["uom"];
    }
  }

  // ── spq: positive integer ≥ 1, defaults to 1 ────────────────────────────────
  const rawSpq = raw["spq"];
  let spq = 1;
  if (rawSpq !== undefined && rawSpq !== null) {
    if (typeof rawSpq !== "number" || !Number.isInteger(rawSpq) || rawSpq < 1) {
      errors.push({
        field: "spq",
        message: "SPQ must be a positive integer (≥ 1).",
      });
    } else {
      spq = rawSpq;
    }
  }

  // ── spqMeter: required and positive when uom='roll'; must be null otherwise ──
  const rawSpqMeter = raw["spqMeter"];
  let spqMeter: string | null = null;
  if (uom === "roll") {
    if (rawSpqMeter === undefined || rawSpqMeter === null) {
      errors.push({
        field: "spqMeter",
        message: "SPQ Meter is required and must be a positive value when UOM is 'roll'.",
      });
    } else if (typeof rawSpqMeter !== "string" || !isPositiveDecimalString(rawSpqMeter)) {
      errors.push({
        field: "spqMeter",
        message: "SPQ Meter must be a positive decimal value when UOM is 'roll'.",
      });
    } else {
      spqMeter = rawSpqMeter;
    }
  } else {
    // non-roll: spqMeter must be null/absent
    if (rawSpqMeter !== undefined && rawSpqMeter !== null) {
      errors.push({
        field: "spqMeter",
        message: "SPQ Meter must be null for items with a non-roll UOM.",
      });
    }
  }

  // ── currency: enum ['USD', 'PHP'], defaults to 'USD' ────────────────────────
  const rawCurrency = raw["currency"];
  let currency: ItemInput["currency"] = "USD";
  if (rawCurrency !== undefined && rawCurrency !== null) {
    if (
      typeof rawCurrency !== "string" ||
      !(VALID_CURRENCY as readonly string[]).includes(rawCurrency)
    ) {
      errors.push({
        field: "currency",
        message: `Currency must be one of: ${VALID_CURRENCY.join(", ")}.`,
      });
    } else {
      currency = rawCurrency as ItemInput["currency"];
    }
  }

  // Every enrolled item carries a default Organization reference. It is the
  // item-level default used when downstream workflows need organization
  // context before a received lot has its own owner record.
  if (
    typeof raw["defaultSupplierPartyId"] !== "string" ||
    raw["defaultSupplierPartyId"].trim() === ""
  ) {
    errors.push({
      field: "defaultSupplierPartyId",
      message: "Organization is required.",
    });
  }

  // ── dimensions: all-or-nothing; each must be positive when provided ──────────
  const rawLength = raw["lengthCm"];
  const rawWidth = raw["widthCm"];
  const rawHeight = raw["heightCm"];

  const hasLength = rawLength !== undefined && rawLength !== null;
  const hasWidth = rawWidth !== undefined && rawWidth !== null;
  const hasHeight = rawHeight !== undefined && rawHeight !== null;

  const dimensionCount = [hasLength, hasWidth, hasHeight].filter(Boolean).length;
  const allDimensionsPresent = dimensionCount === 3;
  const anyDimensionPresent = dimensionCount > 0;

  if (anyDimensionPresent && !allDimensionsPresent) {
    if (!hasLength) {
      errors.push({ field: "lengthCm", message: "All three dimensions (length, width, height) must be provided together." });
    }
    if (!hasWidth) {
      errors.push({ field: "widthCm", message: "All three dimensions (length, width, height) must be provided together." });
    }
    if (!hasHeight) {
      errors.push({ field: "heightCm", message: "All three dimensions (length, width, height) must be provided together." });
    }
  }

  if (allDimensionsPresent) {
    if (typeof rawLength !== "string" || !isPositiveDecimalString(rawLength as string)) {
      errors.push({ field: "lengthCm", message: "Length must be a positive decimal value." });
    }
    if (typeof rawWidth !== "string" || !isPositiveDecimalString(rawWidth as string)) {
      errors.push({ field: "widthCm", message: "Width must be a positive decimal value." });
    }
    if (typeof rawHeight !== "string" || !isPositiveDecimalString(rawHeight as string)) {
      errors.push({ field: "heightCm", message: "Height must be a positive decimal value." });
    }
  }

  // ── volumeCbm: NOT NULL; required when dimensions absent ─────────────────────
  const rawVolumeCbm = raw["volumeCbm"];
  if (!allDimensionsPresent) {
    // No dimensions — volumeCbm must be explicitly provided
    if (rawVolumeCbm === undefined || rawVolumeCbm === null || rawVolumeCbm === "") {
      errors.push({
        field: "volumeCbm",
        message: "Volume CBM is required when item dimensions are not provided.",
      });
    }
  }

  // ── boxesPerPallet: positive integer or null ─────────────────────────────────
  const rawBoxesPerPallet = raw["boxesPerPallet"];
  let boxesPerPallet: number | null = null;
  if (rawBoxesPerPallet !== undefined && rawBoxesPerPallet !== null) {
    if (
      typeof rawBoxesPerPallet !== "number" ||
      !Number.isInteger(rawBoxesPerPallet) ||
      rawBoxesPerPallet <= 0
    ) {
      errors.push({
        field: "boxesPerPallet",
        message: "Boxes per pallet must be a positive integer when provided.",
      });
    } else {
      boxesPerPallet = rawBoxesPerPallet;
    }
  }

  // ── weightKg: non-negative decimal string or null ────────────────────────────
  const rawWeightKg = raw["weightKg"];
  let weightKg: string | null = null;
  if (rawWeightKg !== undefined && rawWeightKg !== null) {
    if (typeof rawWeightKg !== "string" || !isNonNegativeDecimalString(rawWeightKg)) {
      errors.push({
        field: "weightKg",
        message: "Weight must be a non-negative decimal value when provided.",
      });
    } else {
      weightKg = rawWeightKg;
    }
  }

  // ── minReorderLevel: non-negative integer, defaults to 0 ─────────────────────
  const rawMinReorder = raw["minReorderLevel"];
  let minReorderLevel = 0;
  if (rawMinReorder !== undefined && rawMinReorder !== null) {
    if (
      typeof rawMinReorder !== "number" ||
      !Number.isInteger(rawMinReorder) ||
      rawMinReorder < 0
    ) {
      errors.push({
        field: "minReorderLevel",
        message: "Minimum reorder level must be a non-negative integer.",
      });
    } else {
      minReorderLevel = rawMinReorder;
    }
  }

  // ── buyingPrice / sellingPrice: nullable decimal strings ─────────────────────
  const rawBuyingPrice = raw["buyingPrice"];
  const rawSellingPrice = raw["sellingPrice"];

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Compute volumeCbm / volumeCm3 from dimensions if all three are present
  let resolvedVolumeCbm: string = rawVolumeCbm as string;
  let resolvedVolumeCm3: string | null = null;
  if (allDimensionsPresent) {
    const { volumeCm3, volumeCbm } = computeItemVolumes(
      parseFloat(rawLength as string),
      parseFloat(rawWidth as string),
      parseFloat(rawHeight as string),
    );
    resolvedVolumeCbm = String(volumeCbm);
    resolvedVolumeCm3 = String(volumeCm3);
  }

  const data: ItemInput = {
    code: (code as string).trim(),
    name: (name as string).trim(),
    barcode: (barcode as string).trim(),
    uom,
    currency,
    spq,
    spqMeter,
    lengthCm: hasLength ? (rawLength as string) : null,
    widthCm: hasWidth ? (rawWidth as string) : null,
    heightCm: hasHeight ? (rawHeight as string) : null,
    volumeCm3: resolvedVolumeCm3,
    volumeCbm: resolvedVolumeCbm,
    boxesPerPallet,
    weightKg,
    minReorderLevel,
    isPerishable: typeof raw["isPerishable"] === "boolean" ? raw["isPerishable"] : false,
    isActive: typeof raw["isActive"] === "boolean" ? raw["isActive"] : true,
    buyingPrice:
      rawBuyingPrice !== undefined && rawBuyingPrice !== null
        ? (rawBuyingPrice as string)
        : null,
    sellingPrice:
      rawSellingPrice !== undefined && rawSellingPrice !== null
        ? (rawSellingPrice as string)
        : null,
    supplierItemCode:
      raw["supplierItemCode"] !== undefined ? (raw["supplierItemCode"] as string | null) : null,
    customerItemCode:
      raw["customerItemCode"] !== undefined ? (raw["customerItemCode"] as string | null) : null,
    dsgcItemNumber:
      raw["dsgcItemNumber"] !== undefined ? (raw["dsgcItemNumber"] as string | null) : null,
    description:
      raw["description"] !== undefined ? (raw["description"] as string | null) : null,
    itemType:
      raw["itemType"] !== undefined ? (raw["itemType"] as string | null) : null,
    categoryId:
      raw["categoryId"] !== undefined ? (raw["categoryId"] as string | null) : null,
    defaultSupplierPartyId:
      raw["defaultSupplierPartyId"] !== undefined
        ? (raw["defaultSupplierPartyId"] as string | null)
        : null,
  };

  return { success: true, data };
}
