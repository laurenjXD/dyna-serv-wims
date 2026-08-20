// Location input validation helpers.
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R3.1-R3.8
//   specs/06-party-and-item-enrollment/design.md §2 (canonical locations fields), §6a
//   lib/db/schema/locations.ts — locations table
//   lib/db/schema/enums.ts — locationTypeEnum

export type LocationInput = {
  zone: string;
  rack: string;
  level: string;
  position: string;
  locationType: "receiving_bay" | "inspection" | "storage" | "picking" | "dispatch";
  maxCbmCapacity: string;
  isActive: boolean;
};

export type FieldError = { field: string; message: string };

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: FieldError[] };

const VALID_LOCATION_TYPES = [
  "receiving_bay",
  "inspection",
  "storage",
  "picking",
  "dispatch",
] as const;

/**
 * Produces the canonical Rack+Level-Position label.
 * Format: rack + level + "-" + position
 * Example: rack="A", level="1", position="01" → "A1-01"
 * design.md §6a Create step 3.
 */
export function generateLocationLabel(
  rack: string,
  level: string,
  position: string,
): string {
  return `${rack}${level}-${position}`;
}

/**
 * Validates raw location input. Returns a structured LocationInput on success.
 * The `label` field is NOT accepted in the input — it is always server-computed.
 * Ignores any client-supplied `label` value without treating it as an error.
 * locationType defaults to "storage". isActive defaults to true.
 */
export function parseLocationInput(input: unknown): ParseResult<LocationInput> {
  const errors: FieldError[] = [];

  if (typeof input !== "object" || input === null) {
    return {
      success: false,
      errors: [{ field: "input", message: "Input must be a non-null object." }],
    };
  }

  const raw = input as Record<string, unknown>;

  // zone — varchar(50) NOT NULL
  const zone = raw["zone"];
  if (zone === undefined || zone === null || zone === "") {
    errors.push({ field: "zone", message: "Zone is required." });
  } else if (typeof zone !== "string") {
    errors.push({ field: "zone", message: "Zone must be a string." });
  }

  // rack — varchar(50) NOT NULL
  const rack = raw["rack"];
  if (rack === undefined || rack === null || rack === "") {
    errors.push({ field: "rack", message: "Rack is required." });
  } else if (typeof rack !== "string") {
    errors.push({ field: "rack", message: "Rack must be a string." });
  }

  // level — varchar(50) NOT NULL
  const level = raw["level"];
  if (level === undefined || level === null || level === "") {
    errors.push({ field: "level", message: "Level is required." });
  } else if (typeof level !== "string") {
    errors.push({ field: "level", message: "Level must be a string." });
  }

  // position — varchar(50) NOT NULL
  const position = raw["position"];
  if (position === undefined || position === null || position === "") {
    errors.push({ field: "position", message: "Position is required." });
  } else if (typeof position !== "string") {
    errors.push({ field: "position", message: "Position must be a string." });
  }

  // locationType — enum, defaults to 'storage'
  const locationType = raw["locationType"];
  let resolvedLocationType: LocationInput["locationType"] = "storage";
  if (locationType !== undefined && locationType !== null) {
    if (
      typeof locationType !== "string" ||
      !(VALID_LOCATION_TYPES as readonly string[]).includes(locationType)
    ) {
      errors.push({
        field: "locationType",
        message: `Location type must be one of: ${VALID_LOCATION_TYPES.join(", ")}.`,
      });
    } else {
      resolvedLocationType = locationType as LocationInput["locationType"];
    }
  }

  // maxCbmCapacity — decimal(10,4) NOT NULL, must be positive
  const maxCbmCapacity = raw["maxCbmCapacity"];
  if (maxCbmCapacity === undefined || maxCbmCapacity === null || maxCbmCapacity === "") {
    errors.push({
      field: "maxCbmCapacity",
      message: "Maximum CBM capacity is required.",
    });
  } else if (typeof maxCbmCapacity !== "string") {
    errors.push({
      field: "maxCbmCapacity",
      message: "Maximum CBM capacity must be a decimal string.",
    });
  } else {
    const parsed = parseFloat(maxCbmCapacity);
    if (isNaN(parsed) || parsed <= 0) {
      errors.push({
        field: "maxCbmCapacity",
        message: "Maximum CBM capacity must be a positive decimal value.",
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const data: LocationInput = {
    zone: (zone as string).trim(),
    rack: (rack as string).trim(),
    level: (level as string).trim(),
    position: (position as string).trim(),
    locationType: resolvedLocationType,
    maxCbmCapacity: maxCbmCapacity as string,
    isActive: typeof raw["isActive"] === "boolean" ? raw["isActive"] : true,
  };

  return { success: true, data };
}

// ---------------------------------------------------------------------------
// Bulk location generator
//
// specs/00-steering/per page specs.md §8: "Locations: Office-only view
// containing a bulk location generator. Features naming-convention config,
// capacity limits, and duplicate/error reporting."
//
// Naming-convention config: Zone + comma-separated Rack list + numeric Level
// range + numeric Position range (zero-padded). Generates the cartesian
// product, reusing generateLocationLabel unchanged so a bulk-generated label
// is byte-identical to what the single-location form would produce for the
// same rack/level/position. Shared fields (zone, locationType,
// maxCbmCapacity) reuse the exact same validation rules as
// parseLocationInput above.
// ---------------------------------------------------------------------------

// Capacity limit distinct from max_cbm_capacity (the per-location storage
// field) — this caps the batch size itself so a mistyped range can't
// silently attempt thousands of inserts.
export const BULK_LOCATION_MAX_CANDIDATES = 500;

export type BulkLocationGeneratorInput = {
  zone: string;
  locationType: LocationInput["locationType"];
  maxCbmCapacity: string;
  racks: string;
  levelStart: string;
  levelEnd: string;
  positionStart: string;
  positionEnd: string;
  positionPadding?: string;
};

export type GeneratedLocationCandidate = {
  zone: string;
  rack: string;
  level: string;
  position: string;
  label: string;
  locationType: LocationInput["locationType"];
  maxCbmCapacity: string;
  isActive: true;
};

function parsePositiveInt(
  raw: unknown,
  field: string,
  errors: FieldError[],
): number | null {
  if (raw === undefined || raw === null || raw === "") {
    errors.push({ field, message: `${field} is required.` });
    return null;
  }
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) {
    errors.push({ field, message: `${field} must be a positive whole number.` });
    return null;
  }
  const n = parseInt(raw.trim(), 10);
  if (n <= 0) {
    errors.push({ field, message: `${field} must be greater than zero.` });
    return null;
  }
  return n;
}

export function parseBulkLocationGeneratorInput(
  input: unknown,
): ParseResult<BulkLocationGeneratorInput> {
  const errors: FieldError[] = [];

  if (typeof input !== "object" || input === null) {
    return {
      success: false,
      errors: [{ field: "input", message: "Input must be a non-null object." }],
    };
  }

  const raw = input as Record<string, unknown>;

  const zone = raw["zone"];
  if (zone === undefined || zone === null || zone === "" || typeof zone !== "string") {
    errors.push({ field: "zone", message: "Zone is required." });
  }

  const racks = raw["racks"];
  const rackList =
    typeof racks === "string"
      ? [...new Set(racks.split(",").map((r) => r.trim()).filter(Boolean))]
      : [];
  if (rackList.length === 0) {
    errors.push({ field: "racks", message: "At least one rack is required (comma-separated)." });
  }

  const locationType = raw["locationType"];
  let resolvedLocationType: LocationInput["locationType"] = "storage";
  if (locationType !== undefined && locationType !== null) {
    if (
      typeof locationType !== "string" ||
      !(VALID_LOCATION_TYPES as readonly string[]).includes(locationType)
    ) {
      errors.push({
        field: "locationType",
        message: `Location type must be one of: ${VALID_LOCATION_TYPES.join(", ")}.`,
      });
    } else {
      resolvedLocationType = locationType as LocationInput["locationType"];
    }
  }

  const maxCbmCapacity = raw["maxCbmCapacity"];
  if (maxCbmCapacity === undefined || maxCbmCapacity === null || maxCbmCapacity === "") {
    errors.push({ field: "maxCbmCapacity", message: "Maximum CBM capacity is required." });
  } else if (typeof maxCbmCapacity !== "string") {
    errors.push({ field: "maxCbmCapacity", message: "Maximum CBM capacity must be a decimal string." });
  } else {
    const parsed = parseFloat(maxCbmCapacity);
    if (isNaN(parsed) || parsed <= 0) {
      errors.push({
        field: "maxCbmCapacity",
        message: "Maximum CBM capacity must be a positive decimal value.",
      });
    }
  }

  const levelStart = parsePositiveInt(raw["levelStart"], "levelStart", errors);
  const levelEnd = parsePositiveInt(raw["levelEnd"], "levelEnd", errors);
  if (levelStart !== null && levelEnd !== null && levelStart > levelEnd) {
    errors.push({ field: "levelEnd", message: "levelEnd must be greater than or equal to levelStart." });
  }

  const positionStart = parsePositiveInt(raw["positionStart"], "positionStart", errors);
  const positionEnd = parsePositiveInt(raw["positionEnd"], "positionEnd", errors);
  if (positionStart !== null && positionEnd !== null && positionStart > positionEnd) {
    errors.push({ field: "positionEnd", message: "positionEnd must be greater than or equal to positionStart." });
  }

  const positionPaddingRaw = raw["positionPadding"];
  let positionPadding: string | undefined;
  if (positionPaddingRaw !== undefined && positionPaddingRaw !== null && positionPaddingRaw !== "") {
    if (typeof positionPaddingRaw !== "string" || !/^\d+$/.test(positionPaddingRaw)) {
      errors.push({ field: "positionPadding", message: "positionPadding must be a whole number." });
    } else {
      positionPadding = positionPaddingRaw;
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      zone: (zone as string).trim(),
      locationType: resolvedLocationType,
      maxCbmCapacity: maxCbmCapacity as string,
      racks: rackList.join(","),
      levelStart: String(levelStart),
      levelEnd: String(levelEnd),
      positionStart: String(positionStart),
      positionEnd: String(positionEnd),
      positionPadding,
    },
  };
}

/**
 * Generates the cartesian product of racks x levels x positions from a
 * validated BulkLocationGeneratorInput. Each candidate's label is computed
 * via the existing generateLocationLabel — identical format to a
 * single-location create for the same rack/level/position.
 */
export function expandBulkLocationCandidates(
  data: BulkLocationGeneratorInput,
): { success: true; candidates: GeneratedLocationCandidate[] } | { success: false; errors: FieldError[] } {
  const racks = data.racks.split(",").filter(Boolean);
  const levelStart = parseInt(data.levelStart, 10);
  const levelEnd = parseInt(data.levelEnd, 10);
  const positionStart = parseInt(data.positionStart, 10);
  const positionEnd = parseInt(data.positionEnd, 10);
  const padding = data.positionPadding
    ? parseInt(data.positionPadding, 10)
    : Math.max(2, String(positionEnd).length);

  const levelCount = levelEnd - levelStart + 1;
  const positionCount = positionEnd - positionStart + 1;
  const total = racks.length * levelCount * positionCount;

  if (total > BULK_LOCATION_MAX_CANDIDATES) {
    return {
      success: false,
      errors: [
        {
          field: "racks",
          message: `This range would generate ${total} locations, which exceeds the ${BULK_LOCATION_MAX_CANDIDATES} batch limit. Narrow the rack/level/position ranges.`,
        },
      ],
    };
  }

  const candidates: GeneratedLocationCandidate[] = [];
  for (const rack of racks) {
    for (let level = levelStart; level <= levelEnd; level++) {
      for (let position = positionStart; position <= positionEnd; position++) {
        const levelStr = String(level);
        const positionStr = String(position).padStart(padding, "0");
        candidates.push({
          zone: data.zone,
          rack,
          level: levelStr,
          position: positionStr,
          label: generateLocationLabel(rack, levelStr, positionStr),
          locationType: data.locationType,
          maxCbmCapacity: data.maxCbmCapacity,
          isActive: true,
        });
      }
    }
  }

  return { success: true, candidates };
}
