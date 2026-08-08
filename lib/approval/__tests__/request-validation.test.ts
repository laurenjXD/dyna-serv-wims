// RED-step unit tests for lib/approval/request-validation.ts (does not exist yet).
//
// Traceability:
//   design.md §4 — policy registry, validateRequest(input) on each policy,
//     fail-closed for unknown types.
//   requirements.md R1.3 — "The request SHALL include a stable idempotency
//     key and correlation ID."
//   requirements.md R1.4 — "The server SHALL validate the request type against
//     a registered approval policy; unknown or unsupported types SHALL be
//     rejected."
//   requirements.md R1.6 — "A duplicate submission with the same idempotency
//     key SHALL return the existing request rather than create a second pending
//     request." (idempotency_key must be present and non-empty to support this)
//   tasks.md §4 — "Implement server request creation with current actor/scope,
//     target/version snapshot, reason, idempotency, and correlation validation."
//   tasks.md Testing matrix — "Policy registration, unknown-type rejection,
//     request validation, and snapshot redaction."
//
// These tests import from @/lib/approval/request-validation which does not
// exist. Every test is expected to fail with "Cannot find module" until the
// backend-builder creates the implementation.
//
// Expected module contract for lib/approval/request-validation.ts:
//   validateCreateRequest(input: unknown)
//     : { ok: true; validated: ValidatedCreateRequest }
//     | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
//
// Where ValidatedCreateRequest contains at minimum:
//   { type: string; idempotency_key: string; reason: string; target_snapshot: unknown }

import { describe, expect, it } from "vitest";

const VALID_FIFO_OVERRIDE_SNAPSHOT = {
  item_id: "550e8400-e29b-41d4-a716-446655440000",
  item_code: "ITM-001",
  lot_id: "550e8400-e29b-41d4-a716-446655440001",
  lot_number: "LOT-2026-001",
  location_id: "550e8400-e29b-41d4-a716-446655440002",
  location_code: "A-01-01",
  requested_qty: "10.500",
  available_qty_at_request: "25.000",
  flow_type: "vmi",
  actor_user_id: "550e8400-e29b-41d4-a716-446655440003",
  reason: "Picking from alternate lot due to FEFO constraint on lot LOT-2026-001.",
  allocation_version: 7,
  requested_at: "2026-08-08T09:00:00.000Z",
};

const VALID_CREATE_REQUEST = {
  type: "fifo_override",
  idempotency_key: "idem-key-abc-001",
  reason: "Picking from alternate lot due to FEFO constraint — warehouse supervisor override.",
  target_snapshot: VALID_FIFO_OVERRIDE_SNAPSHOT,
};

describe("request-validation — valid input passes through (design.md §4, requirements.md R1.4)", () => {
  it("returns { ok: true } for a fully valid fifo_override create request", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const result = validateCreateRequest(VALID_CREATE_REQUEST);

    expect(result.ok).toBe(true);
  });

  it("validated result contains the type, idempotency_key, reason, and target_snapshot", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const result = validateCreateRequest(VALID_CREATE_REQUEST);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validated.type).toBe("fifo_override");
    expect(result.validated.idempotency_key).toBe("idem-key-abc-001");
    expect(typeof result.validated.reason).toBe("string");
    expect(result.validated.target_snapshot).toBeDefined();
  });
});

describe("request-validation — missing idempotency_key returns a validation error (requirements.md R1.3)", () => {
  it("returns { ok: false } when idempotency_key is absent", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const input = { ...VALID_CREATE_REQUEST };
    delete (input as Record<string, unknown>)["idempotency_key"];

    const result = validateCreateRequest(input);

    expect(result.ok).toBe(false);
  });

  it("returns { ok: false } when idempotency_key is an empty string", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const result = validateCreateRequest({
      ...VALID_CREATE_REQUEST,
      idempotency_key: "",
    });

    expect(result.ok).toBe(false);
  });

  it("error result references idempotency_key in fieldErrors when missing", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const input = { ...VALID_CREATE_REQUEST };
    delete (input as Record<string, unknown>)["idempotency_key"];

    const result = validateCreateRequest(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.fieldErrors) {
      expect(Object.keys(result.fieldErrors)).toContain("idempotency_key");
    } else {
      // at minimum the top-level error string must be non-empty
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});

describe("request-validation — unknown policy type returns a closed-failure error (requirements.md R1.4, design.md §4)", () => {
  it("returns { ok: false } for an unregistered type string", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const result = validateCreateRequest({
      ...VALID_CREATE_REQUEST,
      type: "quality_hold",
    });

    expect(result.ok).toBe(false);
  });

  it("returns { ok: false } for an empty type string", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const result = validateCreateRequest({
      ...VALID_CREATE_REQUEST,
      type: "",
    });

    expect(result.ok).toBe(false);
  });

  it("closed-failure error result carries a non-empty error string", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const result = validateCreateRequest({
      ...VALID_CREATE_REQUEST,
      type: "completely_unknown_type",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });
});

describe("request-validation — reason must satisfy policy minimum length (design.md §3 reason ≥10 chars)", () => {
  it("returns { ok: false } when reason is fewer than 10 characters for fifo_override", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const result = validateCreateRequest({
      ...VALID_CREATE_REQUEST,
      reason: "Short",
    });

    expect(result.ok).toBe(false);
  });
});

describe("request-validation — target_snapshot is validated against the policy-specific schema (design.md §4 validateRequest)", () => {
  it("returns { ok: false } when target_snapshot is completely missing", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const input = { ...VALID_CREATE_REQUEST };
    delete (input as Record<string, unknown>)["target_snapshot"];

    const result = validateCreateRequest(input);

    expect(result.ok).toBe(false);
  });

  it("returns { ok: false } when target_snapshot is an empty object (missing all FifoOverrideSnapshot fields)", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const result = validateCreateRequest({
      ...VALID_CREATE_REQUEST,
      target_snapshot: {},
    });

    expect(result.ok).toBe(false);
  });

  it("returns { ok: false } when target_snapshot has an invalid flow_type (not vmi|trading|supplies)", async () => {
    const { validateCreateRequest } = await import(
      "@/lib/approval/request-validation"
    );

    const result = validateCreateRequest({
      ...VALID_CREATE_REQUEST,
      target_snapshot: {
        ...VALID_FIFO_OVERRIDE_SNAPSHOT,
        flow_type: "invalid_flow",
      },
    });

    expect(result.ok).toBe(false);
  });
});

describe("request-validation — never throws on malformed input (fail-closed, not crash-open)", () => {
  it.each([null, undefined, 42, "string", [], true])(
    "does not throw when input is %j",
    async (badInput) => {
      const { validateCreateRequest } = await import(
        "@/lib/approval/request-validation"
      );

      let threw = false;
      try {
        validateCreateRequest(badInput);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
    }
  );
});
