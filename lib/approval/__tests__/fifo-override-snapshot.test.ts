// RED-step unit tests for lib/approval/fifo-override-snapshot.ts (does not exist yet).
//
// Traceability:
//   design.md §3 — FifoOverrideSnapshot shape, all field names and constraints.
//   requirements.md R1.2 — request SHALL identify target resource/version
//     snapshot needed for review.
//   requirements.md R5.3 — stale, revoked, mismatched, or already-consumed
//     decision SHALL not authorize a mutation (requires allocation_version to
//     be a verifiable positive integer).
//   tasks.md Testing matrix — "Policy registration, unknown-type rejection,
//     request validation, and snapshot redaction."
//
// These tests import from @/lib/approval/fifo-override-snapshot which does not
// exist. Every test is expected to fail with "Cannot find module" until the
// backend-builder creates the implementation.

import { describe, expect, it } from "vitest";

const VALID_SNAPSHOT = {
  item_id: "550e8400-e29b-41d4-a716-446655440000",
  item_code: "ITM-001",
  lot_id: "550e8400-e29b-41d4-a716-446655440001",
  lot_number: "LOT-2026-001",
  location_id: "550e8400-e29b-41d4-a716-446655440002",
  location_code: "A-01-01",
  requested_qty: "10.500",
  available_qty_at_request: "25.000",
  flow_type: "vmi" as const,
  actor_user_id: "550e8400-e29b-41d4-a716-446655440003",
  reason: "Picking from alternate lot due to FEFO constraint on lot LOT-2026-001.",
  allocation_version: 7,
  requested_at: "2026-08-08T09:00:00.000Z",
};

describe("FifoOverrideSnapshot — valid snapshot passes validation (design.md §3)", () => {
  it("accepts a fully-populated valid snapshot object", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse(VALID_SNAPSHOT);

    expect(result.success).toBe(true);
  });
});

describe("FifoOverrideSnapshot — missing required fields fail with field-level errors (design.md §3)", () => {
  const requiredFields = [
    "item_id",
    "item_code",
    "lot_id",
    "lot_number",
    "location_id",
    "location_code",
    "requested_qty",
    "available_qty_at_request",
    "flow_type",
    "actor_user_id",
    "reason",
    "allocation_version",
    "requested_at",
  ] as const;

  for (const field of requiredFields) {
    it(`fails when '${field}' is omitted`, async () => {
      const { FifoOverrideSnapshotSchema } = await import(
        "@/lib/approval/fifo-override-snapshot"
      );

      const input = { ...VALID_SNAPSHOT };
      delete (input as Record<string, unknown>)[field];

      const result = FifoOverrideSnapshotSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (result.success) return;
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain(field);
    });
  }
});

describe("FifoOverrideSnapshot — reason must be at least 10 characters (design.md §3)", () => {
  it("fails when reason has fewer than 10 characters", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      reason: "Too short",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((i) => i.path[0]);
    expect(paths).toContain("reason");
  });

  it("accepts reason with exactly 10 characters", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      reason: "1234567890",
    });

    expect(result.success).toBe(true);
  });
});

describe("FifoOverrideSnapshot — allocation_version must be a positive integer (design.md §3)", () => {
  it("fails when allocation_version is zero", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      allocation_version: 0,
    });

    expect(result.success).toBe(false);
  });

  it("fails when allocation_version is negative", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      allocation_version: -1,
    });

    expect(result.success).toBe(false);
  });

  it("fails when allocation_version is a decimal (not an integer)", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      allocation_version: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("accepts allocation_version = 1 (minimum valid positive integer)", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      allocation_version: 1,
    });

    expect(result.success).toBe(true);
  });
});

describe("FifoOverrideSnapshot — requested_qty and available_qty_at_request are numeric decimal strings (design.md §3)", () => {
  it("fails when requested_qty is not a numeric string (NaN-like string)", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      requested_qty: "not-a-number",
    });

    expect(result.success).toBe(false);
  });

  it("fails when requested_qty is a negative numeric string", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      requested_qty: "-5.00",
    });

    expect(result.success).toBe(false);
  });

  it("fails when available_qty_at_request is not a numeric string", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      available_qty_at_request: "NaN",
    });

    expect(result.success).toBe(false);
  });

  it("fails when available_qty_at_request is a negative numeric string", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      available_qty_at_request: "-1.000",
    });

    expect(result.success).toBe(false);
  });

  it("accepts positive decimal strings for both quantity fields", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      requested_qty: "0.001",
      available_qty_at_request: "100.000",
    });

    expect(result.success).toBe(true);
  });

  it("fails when a raw JS number is supplied instead of a string for requested_qty (decimal-as-string contract)", async () => {
    const { FifoOverrideSnapshotSchema } = await import(
      "@/lib/approval/fifo-override-snapshot"
    );

    const result = FifoOverrideSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      requested_qty: 10.5,
    });

    expect(result.success).toBe(false);
  });
});

describe("FifoOverrideSnapshot — flow_type must be exactly vmi | trading | supplies (design.md §3)", () => {
  it.each(["vmi", "trading", "supplies"] as const)(
    "accepts flow_type '%s'",
    async (flowType) => {
      const { FifoOverrideSnapshotSchema } = await import(
        "@/lib/approval/fifo-override-snapshot"
      );

      const result = FifoOverrideSnapshotSchema.safeParse({
        ...VALID_SNAPSHOT,
        flow_type: flowType,
      });

      expect(result.success).toBe(true);
    }
  );

  it.each(["VMI", "Trading", "SUPPLIES", "vmi_trading", "", "other"])(
    "rejects flow_type '%s' as invalid",
    async (badFlowType) => {
      const { FifoOverrideSnapshotSchema } = await import(
        "@/lib/approval/fifo-override-snapshot"
      );

      const result = FifoOverrideSnapshotSchema.safeParse({
        ...VALID_SNAPSHOT,
        flow_type: badFlowType,
      });

      expect(result.success).toBe(false);
    }
  );
});
