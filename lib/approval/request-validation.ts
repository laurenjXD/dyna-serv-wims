import { policyRegistry } from "./policy-registry";
import { FifoOverrideSnapshotSchema } from "./fifo-override-snapshot";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidatedCreateRequest = {
  type: string;
  idempotency_key: string;
  reason: string;
  target_snapshot: unknown;
};

export type ValidationError = {
  field: string;
  message: string;
};

export type CreateRequestResult =
  | { ok: true; validated: ValidatedCreateRequest }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

// ---------------------------------------------------------------------------
// Policy snapshot validators — keyed by policy type
// ---------------------------------------------------------------------------
const SNAPSHOT_VALIDATORS: Record<
  string,
  (snapshot: unknown) => { ok: true } | { ok: false; messages: string[] }
> = {
  fifo_override: (snapshot) => {
    const parsed = FifoOverrideSnapshotSchema.safeParse(snapshot);
    if (!parsed.success) {
      return {
        ok: false,
        messages: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      };
    }
    return { ok: true };
  },
};

// Minimum reason length per policy type
const POLICY_REASON_MIN_LENGTH: Record<string, number> = {
  fifo_override: 10,
};

// ---------------------------------------------------------------------------
// validateCreateRequest
//
// Validates an incoming create-request payload against the policy registry.
// Returns all collected validation errors together (not just the first).
// Never throws — returns { ok: false } for any invalid or malformed input.
// ---------------------------------------------------------------------------
export function validateCreateRequest(input: unknown): CreateRequestResult {
  // Guard: input must be a plain object
  if (
    input === null ||
    input === undefined ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return {
      ok: false,
      error: "Request input must be a non-null object.",
    };
  }

  const raw = input as Record<string, unknown>;
  const fieldErrors: Record<string, string[]> = {};
  const addFieldError = (field: string, message: string) => {
    if (!fieldErrors[field]) fieldErrors[field] = [];
    fieldErrors[field].push(message);
  };

  // Step 1: Validate type
  const rawType = raw["type"];
  if (typeof rawType !== "string" || rawType.length === 0) {
    addFieldError("type", "type must be a non-empty string.");
    // Cannot proceed without a valid type — return early
    return {
      ok: false,
      error: "Validation failed: type must be a non-empty string.",
      fieldErrors,
    };
  }

  const policyResult = policyRegistry.get(rawType);
  const isUnknown =
    "kind" in policyResult &&
    (policyResult as { kind: string }).kind === "error";
  if (isUnknown) {
    addFieldError(
      "type",
      `Unknown approval policy type '${rawType}'. Fail-closed — only registered types are accepted.`,
    );
    return {
      ok: false,
      error: `Unknown approval policy type '${rawType}'.`,
      fieldErrors,
    };
  }

  // Step 2: Validate idempotency_key
  const rawIdempotencyKey = raw["idempotency_key"];
  if (typeof rawIdempotencyKey !== "string" || rawIdempotencyKey.length === 0) {
    addFieldError("idempotency_key", "idempotency_key must be a non-empty string.");
  }

  // Step 3: Validate reason
  const rawReason = raw["reason"];
  const minLength = POLICY_REASON_MIN_LENGTH[rawType] ?? 10;
  if (typeof rawReason !== "string" || rawReason.length < minLength) {
    addFieldError(
      "reason",
      `reason must be at least ${minLength} characters for policy type '${rawType}'.`,
    );
  }

  // Step 4: Validate target_snapshot against policy-specific schema
  const rawSnapshot = raw["target_snapshot"];
  if (rawSnapshot === undefined || rawSnapshot === null) {
    addFieldError("target_snapshot", "target_snapshot is required.");
  } else {
    const validator = SNAPSHOT_VALIDATORS[rawType];
    if (validator) {
      const snapshotResult = validator(rawSnapshot);
      if (!snapshotResult.ok) {
        for (const msg of snapshotResult.messages) {
          addFieldError("target_snapshot", msg);
        }
      }
    }
  }

  // Aggregate and return
  const hasErrors = Object.keys(fieldErrors).length > 0;
  if (hasErrors) {
    const summaryParts = Object.entries(fieldErrors).map(
      ([field, msgs]) => `${field}: ${msgs.join("; ")}`,
    );
    return {
      ok: false,
      error: `Validation failed: ${summaryParts.join(" | ")}`,
      fieldErrors,
    };
  }

  return {
    ok: true,
    validated: {
      type: rawType,
      idempotency_key: rawIdempotencyKey as string,
      reason: rawReason as string,
      target_snapshot: rawSnapshot,
    },
  };
}
