// RED-step unit tests for lib/approval/self-approval.ts (does not exist yet).
//
// Traceability:
//   design.md §5 — "The server command that records a decision checks that
//     the invoking user's auth.uid() does not match the requester_user_id on
//     the approval request before allowing the operation. This is a
//     server-side authorization requirement, not a UI constraint."
//   design.md §4 — fifo_override policy: "the actor who submitted the request
//     cannot be the reviewer regardless of their capabilities (02 §3.4)".
//   requirements.md R4.5 — "The system SHALL support the approved
//     separation-of-duties rule; self-approval SHALL be blocked if that rule
//     is selected."
//   tasks.md §5 — "Revalidate pending state, target version, request expiry,
//     reviewer eligibility, self-approval, and policy reason requirements."
//   tasks.md Testing matrix — "State transitions, expiry/supersession/
//     cancellation, self-approval, and reason rules."
//
// These tests import from @/lib/approval/self-approval which does not exist.
// Every test is expected to fail with "Cannot find module" until the
// backend-builder creates the implementation.
//
// Expected module contract for lib/approval/self-approval.ts:
//   checkSelfApproval(reviewerUserId: string | null | undefined,
//                     requesterUserId: string | null | undefined)
//     : { blocked: true; reason: string } | { blocked: false }

import { describe, expect, it } from "vitest";

describe("self-approval — blocked when reviewer === requester (design.md §5, requirements.md R4.5)", () => {
  it("returns { blocked: true } when reviewer userId exactly matches requester userId", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    const result = checkSelfApproval("user-abc-123", "user-abc-123");

    expect(result.blocked).toBe(true);
  });

  it("blocks even when both ids look like valid UUIDs and are identical", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    const userId = "550e8400-e29b-41d4-a716-446655440000";
    const result = checkSelfApproval(userId, userId);

    expect(result.blocked).toBe(true);
  });
});

describe("self-approval — allowed when reviewer !== requester (design.md §5)", () => {
  it("returns { blocked: false } when reviewer userId differs from requester userId", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    const result = checkSelfApproval(
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440002",
    );

    expect(result.blocked).toBe(false);
  });

  it("returns { blocked: false } for two distinct non-UUID string identifiers", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    const result = checkSelfApproval("reviewer-user", "requester-user");

    expect(result.blocked).toBe(false);
  });
});

describe("self-approval — fail-closed when either userId is null or undefined (design.md §5 server-side safety)", () => {
  it("returns { blocked: true } when reviewer userId is null", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    const result = checkSelfApproval(null, "requester-user-id");

    expect(result.blocked).toBe(true);
  });

  it("returns { blocked: true } when reviewer userId is undefined", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    const result = checkSelfApproval(undefined, "requester-user-id");

    expect(result.blocked).toBe(true);
  });

  it("returns { blocked: true } when requester userId is null", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    const result = checkSelfApproval("reviewer-user-id", null);

    expect(result.blocked).toBe(true);
  });

  it("returns { blocked: true } when requester userId is undefined", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    const result = checkSelfApproval("reviewer-user-id", undefined);

    expect(result.blocked).toBe(true);
  });

  it("returns { blocked: true } when both userIds are null", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    const result = checkSelfApproval(null, null);

    expect(result.blocked).toBe(true);
  });
});

describe("self-approval — blocked result carries a non-empty reason string", () => {
  it("blocked result includes a non-empty reason explaining the block", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    const result = checkSelfApproval("same-id", "same-id");

    expect(result.blocked).toBe(true);
    if (!result.blocked) return;
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("blocked-due-to-null result also carries a non-empty reason string", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    const result = checkSelfApproval(null, "requester-id");

    expect(result.blocked).toBe(true);
    if (!result.blocked) return;
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe("self-approval — never throws (server-side guard must not crash on unexpected input)", () => {
  it("does not throw when given an empty string for reviewer userId", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    let threw = false;
    try {
      checkSelfApproval("", "requester-id");
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });

  it("does not throw when given empty strings for both ids", async () => {
    const { checkSelfApproval } = await import("@/lib/approval/self-approval");

    let threw = false;
    try {
      checkSelfApproval("", "");
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });
});
