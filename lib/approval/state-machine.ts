// ---------------------------------------------------------------------------
// Approval request state machine (design.md §5)
// ---------------------------------------------------------------------------

export type ApprovalRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "superseded"
  | "consumed";

export type ApprovalEvent =
  | "approve"
  | "reject"
  | "cancel"
  | "expire"
  | "supersede"
  | "consume";

export type TransitionResult =
  | { ok: true; nextStatus: ApprovalRequestStatus }
  | { ok: false; error: string };

/**
 * Valid state transitions per design.md §5:
 *
 *   pending  → approve  → approved
 *   pending  → reject   → rejected
 *   pending  → cancel   → cancelled
 *   pending  → expire   → expired
 *   pending  → supersede→ superseded
 *   approved → consume  → consumed
 *
 * All terminal states (rejected, cancelled, expired, superseded, consumed)
 * accept no further transitions. approved only accepts consume.
 *
 * Never throws — invalid transitions return { ok: false, error: string }.
 */

type TransitionMap = Partial<Record<ApprovalEvent, ApprovalRequestStatus>>;

const TRANSITIONS: Partial<Record<ApprovalRequestStatus, TransitionMap>> = {
  pending: {
    approve: "approved",
    reject: "rejected",
    cancel: "cancelled",
    expire: "expired",
    supersede: "superseded",
  },
  approved: {
    consume: "consumed",
  },
  // Terminal states have no entries — any event against them is invalid.
};

export function transitionRequest(
  currentStatus: ApprovalRequestStatus,
  event: ApprovalEvent,
): TransitionResult {
  const allowed = TRANSITIONS[currentStatus];
  if (!allowed) {
    return {
      ok: false,
      error: `State '${currentStatus}' is terminal and accepts no further transitions (event: '${event}').`,
    };
  }
  const nextStatus = allowed[event];
  if (nextStatus === undefined) {
    return {
      ok: false,
      error: `Event '${event}' is not a valid transition from state '${currentStatus}'.`,
    };
  }
  return { ok: true, nextStatus };
}
