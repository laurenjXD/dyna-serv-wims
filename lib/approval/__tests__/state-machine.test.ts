// RED-step unit tests for lib/approval/state-machine.ts (does not exist yet).
//
// Traceability:
//   design.md §5 — full state machine:
//     pending → approved → consumed
//     pending → rejected
//     pending → cancelled
//     pending → expired
//     pending → superseded
//   requirements.md R2.1 — "Only the valid transition for the current state
//     may be applied by the server."
//   requirements.md R2.2 — "A terminal request SHALL not be approved,
//     rejected, or cancelled again without an explicit new request."
//   tasks.md §4 — "Implement valid state transitions for pending, approved,
//     rejected, cancelled, expired, and superseded."
//   tasks.md Testing matrix — "State transitions, expiry/supersession/
//     cancellation, self-approval, and reason rules."
//
// These tests import from @/lib/approval/state-machine which does not exist.
// Every test is expected to fail with "Cannot find module" until the
// backend-builder creates the implementation.

import { describe, expect, it } from "vitest";

// The state-machine module is expected to export a pure function:
//   transitionRequest(currentStatus: ApprovalRequestStatus, event: ApprovalEvent)
//     : { ok: true; nextStatus: ApprovalRequestStatus }
//     | { ok: false; error: string }
//
// Where:
//   type ApprovalRequestStatus =
//     | 'pending' | 'approved' | 'rejected' | 'cancelled'
//     | 'expired' | 'superseded' | 'consumed'
//   type ApprovalEvent =
//     | 'approve' | 'reject' | 'cancel' | 'expire' | 'supersede' | 'consume'

describe("state-machine — valid transitions from pending (design.md §5, requirements.md R2.1)", () => {
  it("pending → approved is valid (approve event)", async () => {
    const { transitionRequest } = await import("@/lib/approval/state-machine");

    const result = transitionRequest("pending", "approve");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextStatus).toBe("approved");
  });

  it("pending → rejected is valid (reject event)", async () => {
    const { transitionRequest } = await import("@/lib/approval/state-machine");

    const result = transitionRequest("pending", "reject");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextStatus).toBe("rejected");
  });

  it("pending → cancelled is valid (cancel event)", async () => {
    const { transitionRequest } = await import("@/lib/approval/state-machine");

    const result = transitionRequest("pending", "cancel");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextStatus).toBe("cancelled");
  });

  it("pending → expired is valid (expire event)", async () => {
    const { transitionRequest } = await import("@/lib/approval/state-machine");

    const result = transitionRequest("pending", "expire");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextStatus).toBe("expired");
  });

  it("pending → superseded is valid (supersede event)", async () => {
    const { transitionRequest } = await import("@/lib/approval/state-machine");

    const result = transitionRequest("pending", "supersede");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextStatus).toBe("superseded");
  });
});

describe("state-machine — valid transition from approved (design.md §5)", () => {
  it("approved → consumed is valid (consume event)", async () => {
    const { transitionRequest } = await import("@/lib/approval/state-machine");

    const result = transitionRequest("approved", "consume");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextStatus).toBe("consumed");
  });
});

describe("state-machine — invalid reverse transitions never throw, always return error (requirements.md R2.1, R2.2)", () => {
  it("approved → pending is invalid (returns error, does not throw)", async () => {
    const { transitionRequest } = await import("@/lib/approval/state-machine");

    let threw = false;
    let result: ReturnType<typeof transitionRequest> | undefined;
    try {
      result = transitionRequest("approved", "approve");
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeDefined();
    expect(result!.ok).toBe(false);
  });

  it("rejected → approved is invalid (rejected is terminal, requirements.md R2.2)", async () => {
    const { transitionRequest } = await import("@/lib/approval/state-machine");

    let threw = false;
    let result: ReturnType<typeof transitionRequest> | undefined;
    try {
      result = transitionRequest("rejected", "approve");
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result!.ok).toBe(false);
  });

  it("expired → approved is invalid (expired is terminal, requirements.md R2.2)", async () => {
    const { transitionRequest } = await import("@/lib/approval/state-machine");

    let threw = false;
    let result: ReturnType<typeof transitionRequest> | undefined;
    try {
      result = transitionRequest("expired", "approve");
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result!.ok).toBe(false);
  });

  it("consumed → approved is invalid (consumed is terminal, design.md §5 one-time consumption)", async () => {
    const { transitionRequest } = await import("@/lib/approval/state-machine");

    let threw = false;
    let result: ReturnType<typeof transitionRequest> | undefined;
    try {
      result = transitionRequest("consumed", "approve");
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result!.ok).toBe(false);
  });
});

describe("state-machine — every terminal state to any other state is invalid (requirements.md R2.2)", () => {
  const terminalStates = [
    "rejected",
    "cancelled",
    "expired",
    "superseded",
    "consumed",
  ] as const;

  const allEvents = [
    "approve",
    "reject",
    "cancel",
    "expire",
    "supersede",
    "consume",
  ] as const;

  for (const terminalStatus of terminalStates) {
    for (const event of allEvents) {
      it(`${terminalStatus} + ${event} event is always invalid (never produces ok:true)`, async () => {
        const { transitionRequest } = await import("@/lib/approval/state-machine");

        let threw = false;
        let result: ReturnType<typeof transitionRequest> | undefined;
        try {
          result = transitionRequest(terminalStatus, event);
        } catch {
          threw = true;
        }

        expect(threw).toBe(false);
        expect(result).toBeDefined();
        expect(result!.ok).toBe(false);
      });
    }
  }
});

describe("state-machine — invalid transition error has a descriptive error string (not undefined/empty)", () => {
  it("returns a non-empty error string when the transition is invalid", async () => {
    const { transitionRequest } = await import("@/lib/approval/state-machine");

    const result = transitionRequest("rejected", "approve");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });
});
