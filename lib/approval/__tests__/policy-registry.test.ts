// RED-step unit tests for lib/approval/policy-registry.ts (does not exist yet).
//
// Traceability:
//   design.md §4 — ApprovalPolicy type, policy registry, fifo_override policy
//     definition, fail-closed unknown type, duplicate registration behavior.
//   requirements.md §3 — v1 supports exactly one approval type: fifo_override;
//     server SHALL reject any type not explicitly registered.
//   requirements.md R1.4 — server SHALL validate request type against a
//     registered approval policy; unknown/unsupported types SHALL be rejected.
//   tasks.md §4 — "Implement policy registry with fail-closed
//     unknown-type/version behavior."
//   tasks.md Testing matrix — "Policy registration, unknown-type rejection,
//     request validation, and snapshot redaction."
//
// Backing acceptance criteria (requirements.md §6):
//   AC: "The queue server SHALL reject any approval type that is not explicitly
//       registered in the server-side policy registry."
//
// These tests import from @/lib/approval/policy-registry which does not exist.
// Every test is expected to fail with "Cannot find module" until the
// backend-builder creates the implementation.

import { describe, expect, it } from "vitest";

describe("policy-registry — unknown approval type fails closed (design.md §4, requirements.md R1.4)", () => {
  it("returns an error result (not throw) for an unregistered type string", async () => {
    const { policyRegistry } = await import("@/lib/approval/policy-registry");

    let threw = false;
    let result: unknown;
    try {
      result = policyRegistry.get("unknown_type_that_does_not_exist");
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    // must return a discriminated union with kind:'error' or undefined — never authorize
    expect(result).toBeDefined();
    if (
      typeof result === "object" &&
      result !== null &&
      "kind" in result
    ) {
      expect((result as { kind: string }).kind).toBe("error");
    } else {
      // acceptable if registry returns undefined / null for unknown type
      expect(result == null || result === undefined).toBe(true);
    }
  });

  it("returns an error result for an empty string type (AC: fail-closed)", async () => {
    const { policyRegistry } = await import("@/lib/approval/policy-registry");

    let threw = false;
    let result: unknown;
    try {
      result = policyRegistry.get("");
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).not.toMatchObject({ kind: "success" });
  });
});

describe("policy-registry — fifo_override policy is registered and retrievable (design.md §4)", () => {
  it("can retrieve a policy for the 'fifo_override' type string", async () => {
    const { policyRegistry } = await import("@/lib/approval/policy-registry");

    const result = policyRegistry.get("fifo_override");

    expect(result).toBeDefined();
    // must resolve to a success/found result — not null or an error kind
    if (
      typeof result === "object" &&
      result !== null &&
      "kind" in result
    ) {
      expect((result as { kind: string }).kind).toBe("success");
    } else {
      // if registry returns the policy object directly (no wrapper), it must
      // at minimum have 'type' equal to 'fifo_override'
      expect(result).toMatchObject({ type: "fifo_override" });
    }
  });

  it("fifo_override policy has requesterCapability 'fifo_override.request' (design.md §4)", async () => {
    const { policyRegistry } = await import("@/lib/approval/policy-registry");

    const result = policyRegistry.get("fifo_override");
    if ("kind" in result) throw new Error(result.message);

    expect(result.requesterCapability).toBe("fifo_override.request");
  });

  it("fifo_override policy has reviewerCapability 'fifo_override.approve' (design.md §4)", async () => {
    const { policyRegistry } = await import("@/lib/approval/policy-registry");

    const result = policyRegistry.get("fifo_override");
    if ("kind" in result) throw new Error(result.message);

    expect(result.reviewerCapability).toBe("fifo_override.approve");
  });

  it("fifo_override policy has selfApproval: 'blocked' (design.md §4 — always blocked in v1)", async () => {
    const { policyRegistry } = await import("@/lib/approval/policy-registry");

    const result = policyRegistry.get("fifo_override");
    if ("kind" in result) throw new Error(result.message);

    expect(result.selfApproval).toBe("blocked");
  });

  it("fifo_override policy has expiry: 'required' (design.md §4 — fifo_override always has a 30-min expiry)", async () => {
    const { policyRegistry } = await import("@/lib/approval/policy-registry");

    const result = policyRegistry.get("fifo_override");
    if ("kind" in result) throw new Error(result.message);

    expect(result.expiry).toBe("required");
  });

  it("fifo_override policy has requiresReason: true (design.md §3 — reason ≥10 chars required for snapshot)", async () => {
    const { policyRegistry } = await import("@/lib/approval/policy-registry");

    const result = policyRegistry.get("fifo_override");
    if ("kind" in result) throw new Error(result.message);

    expect(result.requiresReason).toBe(true);
  });
});

describe("policy-registry — duplicate type registration is rejected (design.md §4 fail-closed contract)", () => {
  it("throws or returns an error when registering the same type twice", async () => {
    const { policyRegistry } = await import("@/lib/approval/policy-registry");

    // Build a minimal valid policy object to re-register
    const duplicate = {
      type: "fifo_override",
      requestedAction: "override_fifo_allocation",
      requesterCapability: "fifo_override.request",
      reviewerCapability: "fifo_override.approve",
      targetVersion: "v1",
      requiresReason: true,
      selfApproval: "blocked" as const,
      expiry: "required" as const,
      validateRequest: (_input: unknown) => ({ ok: false as const, error: "not implemented" }),
      canReview: (_ctx: unknown, _req: unknown) => ({ ok: false as const, error: "not implemented" }),
      canConsume: (_dec: unknown, _target: unknown) => ({ ok: false as const, error: "not implemented" }),
    };

    let threw = false;
    let errorResult: unknown;
    try {
      errorResult = policyRegistry.register(duplicate);
    } catch {
      threw = true;
    }

    const rejected =
      threw ||
      (errorResult !== null &&
        errorResult !== undefined &&
        typeof errorResult === "object" &&
        "kind" in errorResult &&
        (errorResult as { kind: string }).kind === "error");

    expect(rejected).toBe(true);
  });
});
