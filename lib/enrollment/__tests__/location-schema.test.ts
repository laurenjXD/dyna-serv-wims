// RED-step unit tests for lib/enrollment/location-schema.ts (does not exist yet).
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md §4 R3.1-R3.8
//   specs/06-party-and-item-enrollment/design.md §2 (canonical `locations` fields)
//   specs/06-party-and-item-enrollment/design.md §6a (Location model and workflows)
//   specs/06-party-and-item-enrollment/tasks.md §4a, Testing Matrix §Unit tests
//   specs/01-core-data-model/design.md §1.2 `locations` table canonical fields
//
// Acceptance criteria covered (requirements.md §5):
//   AC-10 (added 2026-08-07): "An authorized administrator can create, search,
//     edit, and deactivate a `locations` record with an auto-generated, unique
//     `Rack+Level-Position` label and a validated `max_cbm_capacity`."
//
// Expected module contract for lib/enrollment/location-schema.ts (for backend-builder):
//
//   export type LocationInput = {
//     zone: string;
//     rack: string;
//     level: string;
//     position: string;
//     locationType?: "receiving_bay" | "inspection" | "storage" | "picking" | "dispatch";
//     maxCbmCapacity: string; // stored as decimal(10,4); validated as positive decimal
//     isActive?: boolean;
//   }
//
//   export type FieldError = { field: string; message: string }
//
//   export type ParseResult<T> =
//     | { success: true; data: T }
//     | { success: false; errors: FieldError[] }
//
//   export function parseLocationInput(input: unknown): ParseResult<LocationInput>
//   // Validates all fields. locationType defaults to "storage". isActive defaults to true.
//   // The `label` field is NOT accepted in the input — it is always server-computed.
//
//   export function generateLocationLabel(
//     rack: string,
//     level: string,
//     position: string
//   ): string
//   // Produces the canonical "Rack+Level-Position" label per design.md §6a.
//   // Example: rack="A", level="1", position="01" → "A1-01"
//   // The label is: rack + level + "-" + position

import { describe, expect, it } from "vitest";
import {
  generateLocationLabel,
  parseLocationInput,
} from "@/lib/enrollment/location-schema";

// ---------------------------------------------------------------------------
// R3.2 — generateLocationLabel: Rack+Level-Position format
// ---------------------------------------------------------------------------

describe("generateLocationLabel — label format (R3.2, design.md §6a Create step 3)", () => {
  it("produces 'A1-01' from rack='A', level='1', position='01'", () => {
    expect(generateLocationLabel("A", "1", "01")).toBe("A1-01");
  });

  it("produces 'B2-12' from rack='B', level='2', position='12'", () => {
    expect(generateLocationLabel("B", "2", "12")).toBe("B2-12");
  });

  it("produces 'C3-99' from rack='C', level='3', position='99'", () => {
    expect(generateLocationLabel("C", "3", "99")).toBe("C3-99");
  });

  it("preserves position zero-padding from the submitted position string", () => {
    // If position is supplied as '01', the label must include '01', not '1'
    expect(generateLocationLabel("A", "1", "01")).toBe("A1-01");
    expect(generateLocationLabel("A", "1", "1")).toBe("A1-1");
  });

  it("concatenates multi-character rack identifiers correctly", () => {
    // rack='AA', level='10', position='05' → 'AA10-05'
    expect(generateLocationLabel("AA", "10", "05")).toBe("AA10-05");
  });

  it("uses a hyphen separator between level and position (not slash or underscore)", () => {
    const label = generateLocationLabel("A", "1", "01");
    expect(label).toContain("-");
    expect(label).not.toContain("/");
    expect(label).not.toContain("_");
  });
});

// ---------------------------------------------------------------------------
// R3.2 — server-computed label: client-supplied label is NOT accepted as input
// ---------------------------------------------------------------------------

describe("parseLocationInput — client-supplied label is ignored (R3.2, design.md §6a)", () => {
  const BASE_VALID = {
    zone: "ZONE-A",
    rack: "A",
    level: "1",
    position: "01",
    maxCbmCapacity: "12.0000",
  };

  it("succeeds without any label field in the input", () => {
    const result = parseLocationInput(BASE_VALID);
    expect(result.success).toBe(true);
  });

  it("does not include a 'label' key in the parsed output (server computes it separately)", () => {
    const result = parseLocationInput(BASE_VALID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("label" in result.data).toBe(false);
    }
  });

  it("ignores a client-supplied label field without treating it as an error", () => {
    // A client that submits a 'label' field must not cause a parse failure;
    // the value is simply ignored — the server recomputes it.
    const result = parseLocationInput({ ...BASE_VALID, label: "WRONG-LABEL" });
    // The parse still succeeds; the submitted label is discarded.
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)["label"]).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// R3.1 — required fields: zone, rack, level, position
// ---------------------------------------------------------------------------

describe("parseLocationInput — required fields (R3.1, design.md §2 locations schema)", () => {
  const BASE_VALID = {
    zone: "ZONE-A",
    rack: "A",
    level: "1",
    position: "01",
    maxCbmCapacity: "12.0000",
  };

  it("rejects missing zone", () => {
    const result = parseLocationInput({ ...BASE_VALID, zone: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "zone")).toBeDefined();
    }
  });

  it("rejects empty zone", () => {
    const result = parseLocationInput({ ...BASE_VALID, zone: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "zone")).toBeDefined();
    }
  });

  it("rejects missing rack", () => {
    const result = parseLocationInput({ ...BASE_VALID, rack: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "rack")).toBeDefined();
    }
  });

  it("rejects missing level", () => {
    const result = parseLocationInput({ ...BASE_VALID, level: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "level")).toBeDefined();
    }
  });

  it("rejects missing position", () => {
    const result = parseLocationInput({ ...BASE_VALID, position: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "position")).toBeDefined();
    }
  });

  it("accepts all four required string fields", () => {
    const result = parseLocationInput(BASE_VALID);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R3.4 — locationType enum validation (design.md §6a, §2 location_type enum)
// ---------------------------------------------------------------------------

describe("parseLocationInput — locationType enum (R3.4, design.md §2 location_type enum)", () => {
  const BASE_VALID = {
    zone: "ZONE-A",
    rack: "A",
    level: "1",
    position: "01",
    maxCbmCapacity: "12.0000",
  };

  it("defaults locationType to 'storage' when omitted", () => {
    const result = parseLocationInput(BASE_VALID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locationType).toBe("storage");
    }
  });

  it("accepts locationType = 'receiving_bay'", () => {
    const result = parseLocationInput({ ...BASE_VALID, locationType: "receiving_bay" });
    expect(result.success).toBe(true);
  });

  it("accepts locationType = 'inspection'", () => {
    const result = parseLocationInput({ ...BASE_VALID, locationType: "inspection" });
    expect(result.success).toBe(true);
  });

  it("accepts locationType = 'storage'", () => {
    const result = parseLocationInput({ ...BASE_VALID, locationType: "storage" });
    expect(result.success).toBe(true);
  });

  it("accepts locationType = 'picking'", () => {
    const result = parseLocationInput({ ...BASE_VALID, locationType: "picking" });
    expect(result.success).toBe(true);
  });

  it("accepts locationType = 'dispatch'", () => {
    const result = parseLocationInput({ ...BASE_VALID, locationType: "dispatch" });
    expect(result.success).toBe(true);
  });

  it("rejects locationType = 'warehouse' (not in approved enum)", () => {
    const result = parseLocationInput({ ...BASE_VALID, locationType: "warehouse" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "locationType")).toBeDefined();
    }
  });

  it("rejects locationType = '' (empty — not a valid enum value)", () => {
    const result = parseLocationInput({ ...BASE_VALID, locationType: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "locationType")).toBeDefined();
    }
  });

  it("rejects free-text locationType value (R3.4: must not accept unenumerated value)", () => {
    const result = parseLocationInput({ ...BASE_VALID, locationType: "cold-storage" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "locationType")).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// R3.5 — maxCbmCapacity must be a positive decimal (design.md §6a, §2 decimal(10,4))
// ---------------------------------------------------------------------------

describe("parseLocationInput — maxCbmCapacity (R3.5, design.md §2 decimal(10,4) positive)", () => {
  const BASE_VALID = {
    zone: "ZONE-A",
    rack: "A",
    level: "1",
    position: "01",
  };

  it("rejects missing maxCbmCapacity", () => {
    const result = parseLocationInput(BASE_VALID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "maxCbmCapacity")).toBeDefined();
    }
  });

  it("rejects maxCbmCapacity = '0' (must be positive)", () => {
    const result = parseLocationInput({ ...BASE_VALID, maxCbmCapacity: "0" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "maxCbmCapacity")).toBeDefined();
    }
  });

  it("rejects maxCbmCapacity negative", () => {
    const result = parseLocationInput({ ...BASE_VALID, maxCbmCapacity: "-1.0000" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "maxCbmCapacity")).toBeDefined();
    }
  });

  it("accepts maxCbmCapacity as a positive decimal string", () => {
    const result = parseLocationInput({ ...BASE_VALID, maxCbmCapacity: "12.5000" });
    expect(result.success).toBe(true);
  });

  it("accepts maxCbmCapacity with 4 decimal places", () => {
    const result = parseLocationInput({ ...BASE_VALID, maxCbmCapacity: "100.0000" });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R3.6 — isActive lifecycle defaults to true (design.md §2, R3.6)
// ---------------------------------------------------------------------------

describe("parseLocationInput — isActive lifecycle (R3.6, design.md §2 is_active boolean NOT NULL default true)", () => {
  const BASE_VALID = {
    zone: "ZONE-A",
    rack: "A",
    level: "1",
    position: "01",
    maxCbmCapacity: "12.0000",
  };

  it("defaults isActive to true when omitted", () => {
    const result = parseLocationInput(BASE_VALID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it("accepts isActive = false (explicit deactivation input shape is valid)", () => {
    const result = parseLocationInput({ ...BASE_VALID, isActive: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(false);
    }
  });
});
