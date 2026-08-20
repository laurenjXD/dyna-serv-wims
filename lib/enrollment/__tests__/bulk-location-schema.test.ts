// RED-step unit tests for the bulk location generator pure functions added to
// lib/enrollment/location-schema.ts (do not exist yet).
//
// Traceability:
//   specs/00-steering/per page specs.md §8 — "Locations: Office-only view
//     containing a bulk location generator. Features naming-convention config,
//     capacity limits, and duplicate/error reporting."
//   specs/00-steering/multi-agent-work-division.md — Track B Milestone 2
//     punch-list item 5 (Master Data)
//   specs/00-steering/revision-log.md (2026-08-17) — "Track B Milestone 2
//     scope calls" entry: bulk location generator confirmed not to exist,
//     scoped as a bounded addition reusing generateLocationLabel/
//     parseLocationInput, not a from-scratch subsystem.
//   lib/enrollment/location-schema.ts — generateLocationLabel (existing,
//     reused unchanged), parseLocationInput (existing, same validation rules
//     for the shared fields: zone, locationType, maxCbmCapacity)
//
// Naming-convention config: a Zone + comma-separated Rack list + numeric
// Level range + numeric Position range (zero-padded) — generates the
// cartesian product of rack x level x position, each label computed via the
// EXISTING generateLocationLabel (rack + level + "-" + position), so a
// single-location "A1-01" and a bulk-generated "A1-01" are byte-identical.
//
// Capacity limit: BULK_LOCATION_MAX_CANDIDATES caps the batch size — this is
// distinct from max_cbm_capacity (the per-location storage capacity field,
// already validated by the reused parseLocationInput rules).
//
// ---------------------------------------------------------------------------
// Expected module contract added to lib/enrollment/location-schema.ts:
//
//   export const BULK_LOCATION_MAX_CANDIDATES = 500;
//
//   export type BulkLocationGeneratorInput = {
//     zone: string;
//     locationType: LocationInput["locationType"];
//     maxCbmCapacity: string;
//     racks: string;           // comma-separated, e.g. "A,B,C"
//     levelStart: string;      // positive integer string
//     levelEnd: string;
//     positionStart: string;   // positive integer string
//     positionEnd: string;
//     positionPadding?: string; // digit width; defaults from positionEnd's length
//   };
//
//   export type GeneratedLocationCandidate = {
//     zone: string;
//     rack: string;
//     level: string;
//     position: string;
//     label: string;
//     locationType: LocationInput["locationType"];
//     maxCbmCapacity: string;
//     isActive: true;
//   };
//
//   export function parseBulkLocationGeneratorInput(
//     input: unknown,
//   ): ParseResult<BulkLocationGeneratorInput>;
//
//   export function expandBulkLocationCandidates(
//     data: BulkLocationGeneratorInput,
//   ):
//     | { success: true; candidates: GeneratedLocationCandidate[] }
//     | { success: false; errors: FieldError[] };
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  BULK_LOCATION_MAX_CANDIDATES,
  expandBulkLocationCandidates,
  parseBulkLocationGeneratorInput,
} from "@/lib/enrollment/location-schema";

const BASE_VALID = {
  zone: "ZONE-A",
  locationType: "storage",
  maxCbmCapacity: "10.0000",
  racks: "A,B",
  levelStart: "1",
  levelEnd: "2",
  positionStart: "1",
  positionEnd: "3",
};

// ---------------------------------------------------------------------------
// parseBulkLocationGeneratorInput — validation
// ---------------------------------------------------------------------------

describe("parseBulkLocationGeneratorInput — required/shared fields", () => {
  it("accepts a fully valid input", () => {
    const result = parseBulkLocationGeneratorInput(BASE_VALID);
    expect(result.success).toBe(true);
  });

  it("rejects missing zone", () => {
    const result = parseBulkLocationGeneratorInput({ ...BASE_VALID, zone: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "zone")).toBeDefined();
    }
  });

  it("rejects missing racks", () => {
    const result = parseBulkLocationGeneratorInput({ ...BASE_VALID, racks: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "racks")).toBeDefined();
    }
  });

  it("rejects an invalid locationType (same enum as single-location create)", () => {
    const result = parseBulkLocationGeneratorInput({
      ...BASE_VALID,
      locationType: "cold-storage",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "locationType")).toBeDefined();
    }
  });

  it("defaults locationType to 'storage' when omitted", () => {
    const { locationType: _drop, ...withoutType } = BASE_VALID;
    const result = parseBulkLocationGeneratorInput(withoutType);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locationType).toBe("storage");
    }
  });

  it("rejects non-positive maxCbmCapacity (same rule as single-location create)", () => {
    const result = parseBulkLocationGeneratorInput({
      ...BASE_VALID,
      maxCbmCapacity: "0",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "maxCbmCapacity")).toBeDefined();
    }
  });

  it("rejects levelStart > levelEnd", () => {
    const result = parseBulkLocationGeneratorInput({
      ...BASE_VALID,
      levelStart: "5",
      levelEnd: "1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "levelEnd")).toBeDefined();
    }
  });

  it("rejects positionStart > positionEnd", () => {
    const result = parseBulkLocationGeneratorInput({
      ...BASE_VALID,
      positionStart: "9",
      positionEnd: "2",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "positionEnd")).toBeDefined();
    }
  });

  it("rejects non-integer level bounds", () => {
    const result = parseBulkLocationGeneratorInput({
      ...BASE_VALID,
      levelStart: "one",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "levelStart")).toBeDefined();
    }
  });

  it("rejects zero or negative level/position bounds", () => {
    const result = parseBulkLocationGeneratorInput({
      ...BASE_VALID,
      positionStart: "0",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.find((e) => e.field === "positionStart")).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// expandBulkLocationCandidates — naming-convention generation
// ---------------------------------------------------------------------------

describe("expandBulkLocationCandidates — cartesian generation over racks x levels x positions", () => {
  it("generates rack-count x level-count x position-count candidates", () => {
    const parsed = parseBulkLocationGeneratorInput(BASE_VALID);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = expandBulkLocationCandidates(parsed.data);
    expect(result.success).toBe(true);
    if (result.success) {
      // racks: A,B (2) x levels: 1-2 (2) x positions: 1-3 (3) = 12
      expect(result.candidates).toHaveLength(12);
    }
  });

  it("produces labels identical in format to the single-location generateLocationLabel output", () => {
    const parsed = parseBulkLocationGeneratorInput({
      ...BASE_VALID,
      racks: "A",
      levelStart: "1",
      levelEnd: "1",
      positionStart: "1",
      positionEnd: "1",
      positionPadding: "2",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = expandBulkLocationCandidates(parsed.data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].label).toBe("A1-01");
    }
  });

  it("zero-pads position per positionPadding", () => {
    const parsed = parseBulkLocationGeneratorInput({
      ...BASE_VALID,
      racks: "A",
      levelStart: "1",
      levelEnd: "1",
      positionStart: "9",
      positionEnd: "10",
      positionPadding: "3",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = expandBulkLocationCandidates(parsed.data);
    expect(result.success).toBe(true);
    if (result.success) {
      const labels = result.candidates.map((c) => c.label).sort();
      expect(labels).toEqual(["A1-009", "A1-010"]);
    }
  });

  it("dedupes repeated racks in the comma-separated list", () => {
    const parsed = parseBulkLocationGeneratorInput({
      ...BASE_VALID,
      racks: "A,A,B",
      levelStart: "1",
      levelEnd: "1",
      positionStart: "1",
      positionEnd: "1",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = expandBulkLocationCandidates(parsed.data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.candidates).toHaveLength(2); // A and B only, not 3
    }
  });

  it("every candidate carries the shared zone/locationType/maxCbmCapacity and isActive: true", () => {
    const parsed = parseBulkLocationGeneratorInput({
      ...BASE_VALID,
      racks: "A",
      levelStart: "1",
      levelEnd: "1",
      positionStart: "1",
      positionEnd: "1",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = expandBulkLocationCandidates(parsed.data);
    expect(result.success).toBe(true);
    if (result.success) {
      const [candidate] = result.candidates;
      expect(candidate.zone).toBe("ZONE-A");
      expect(candidate.locationType).toBe("storage");
      expect(candidate.maxCbmCapacity).toBe("10.0000");
      expect(candidate.isActive).toBe(true);
    }
  });

  it("rejects a batch exceeding BULK_LOCATION_MAX_CANDIDATES as a capacity-limit error, not a silent truncation", () => {
    const parsed = parseBulkLocationGeneratorInput({
      ...BASE_VALID,
      racks: Array.from({ length: 10 }, (_, i) => `R${i}`).join(","),
      levelStart: "1",
      levelEnd: "10",
      positionStart: "1",
      positionEnd: "10", // 10 racks x 10 levels x 10 positions = 1000 > 500 cap
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = expandBulkLocationCandidates(parsed.data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.errors.find((e) => e.message.includes(String(BULK_LOCATION_MAX_CANDIDATES))),
      ).toBeDefined();
    }
  });
});
