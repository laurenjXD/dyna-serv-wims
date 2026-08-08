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
