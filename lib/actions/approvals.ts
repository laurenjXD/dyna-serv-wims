"use server";
// Approval reviewer server actions — approve and reject.
//
// Traceability:
//   specs/09-approval-queue/requirements.md R4 (Decision recording),
//     R2 (Queue states and transitions), R4.4 (reviewer capability),
//     R4.5 (self-approval prohibition)
//   specs/09-approval-queue/design.md §4 (Policy registry / capability:
//     fifo_override.approve), §5 (State machine and concurrency), §6 (Auth)
//   specs/00-steering/tech.md — RBAC always from session, never client params
//
// Capability required: fifo_override.approve (supervisor, global scope).
// These actions are online-only; excluded from the offline queue per
// design.md §5 and tasks.md Non-negotiable boundaries.

import { eq, and, lte, or, isNull } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { isExpired } from "@/lib/approval/expiry";
import { checkSelfApproval } from "@/lib/approval/self-approval";
import { transitionRequest } from "@/lib/approval/state-machine";
import type { ApprovalEvent } from "@/lib/approval/state-machine";
import { approvalRequests, approvalDecisions } from "@/lib/db/schema/approvals";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";

const defaultRlsDeps: RlsTransactionDeps = {
  getAuthenticatedSession,
  pool: rlsPool,
};

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy. Uses named method properties (not an index signature) so that
// PostgresJsDatabase, which has no index signature, is assignable here.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ApprovalActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Shared guard: checks the resolver has the fifo_override.approve capability.
 * Returns `{ ok: false, error }` when unauthorized/unauthenticated, or
 * `{ ok: true, userId }` when authorized.
 */
async function checkApproveCapability(
  resolver: RequestAuthorizationResolver,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const perm = await requirePermission(resolver, "fifo_override.approve");
  if (perm.kind !== "authorized") {
    return { ok: false, error: "Forbidden" };
  }
  return { ok: true, userId: perm.context.userId };
}

/**
 * Shared logic: load request, validate expiry/self-approval/state-transition,
 * then INSERT a decision row and UPDATE the request status.
 *
 * `event` is 'approve' or 'reject'; `outcome` is the string written to the
 * approval_decisions row so that downstream workflows can act on it.
 */
async function recordDecision(
  db: DbLike,
  requestId: string,
  reviewerUserId: string,
  reason: string,
  event: ApprovalEvent,
  outcome: "approved" | "rejected",
): Promise<ApprovalActionResult> {
  // Load request from DB
  const rows = await db
    .select({
      id: approvalRequests.id,
      status: approvalRequests.status,
      expiryAt: approvalRequests.expiryAt,
      createdAt: approvalRequests.createdAt,
      requesterUserId: approvalRequests.requesterUserId,
    })
    .from(approvalRequests)
    .where(eq(approvalRequests.id, requestId));

  const request = (rows as unknown[])[0] as
    | {
        id: string;
        status: string;
        expiryAt: Date;
        createdAt: Date;
        requesterUserId: string;
      }
    | undefined;

  if (!request) {
    return { ok: false, error: "Not found" };
  }

  // Expiry check — fail-closed (null expiryAt → expired per expiry.ts contract)
  const expiryResult = isExpired({
    createdAt: request.createdAt,
    expiryAt: request.expiryAt,
    now: new Date(),
  });
  if (expiryResult.expired) {
    return { ok: false, error: "Request has expired" };
  }

  // Self-approval prohibition (design.md §5, requirements.md R4.5)
  const selfCheck = checkSelfApproval(reviewerUserId, request.requesterUserId);
  if (selfCheck.blocked) {
    return { ok: false, error: selfCheck.reason };
  }

  // State-machine transition — rejects terminal or invalid transitions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transition = transitionRequest(request.status as any, event);
  if (!transition.ok) {
    return { ok: false, error: transition.error };
  }

  // INSERT decision row (append-only — no UPDATE path for ordinary sessions)
  await db.insert(approvalDecisions).values({
    requestId,
    reviewerUserId,
    outcome,
    reason,
  });

  // UPDATE request status to the next state
  await db
    .update(approvalRequests)
    .set({ status: transition.nextStatus })
    .where(eq(approvalRequests.id, requestId));

  return { ok: true };
}

// ---------------------------------------------------------------------------
// approveRequest
// ---------------------------------------------------------------------------

/**
 * Records an 'approved' decision on a pending, non-expired, non-self request.
 * Requires fifo_override.approve capability.
 * Inserts an approval_decisions row (outcome='approved') and updates request
 * status to 'approved'.
 */
export async function approveRequest(
  resolver: RequestAuthorizationResolver,
  requestId: string,
  reason: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ApprovalActionResult> {
  const authResult = await checkApproveCapability(resolver);
  if (!authResult.ok) return authResult;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    return recordDecision(
      db,
      requestId,
      authResult.userId,
      reason,
      "approve",
      "approved",
    );
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// rejectRequest
// ---------------------------------------------------------------------------

/**
 * Records a 'rejected' decision on a pending, non-expired request.
 * Requires fifo_override.approve capability.
 * Inserts an approval_decisions row (outcome='rejected') and updates request
 * status to 'rejected'.
 */
export async function rejectRequest(
  resolver: RequestAuthorizationResolver,
  requestId: string,
  reason: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ApprovalActionResult> {
  const authResult = await checkApproveCapability(resolver);
  if (!authResult.ok) return authResult;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    return recordDecision(
      db,
      requestId,
      authResult.userId,
      reason,
      "reject",
      "rejected",
    );
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}

/** Soft-archives an expired pending approval for audit monitoring. */
export async function archiveExpiredApprovalRequest(
  resolver: RequestAuthorizationResolver,
  requestId: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ApprovalActionResult> {
  try {
    const authResult = await checkApproveCapability(resolver);
    if (!authResult.ok) return authResult;
    const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
      const db = tx.db as DbLike;
      const [archived] = await db
        .update(approvalRequests)
        .set({ status: "expired", deletedAt: new Date(), deletedByUserId: authResult.userId })
        .where(and(
          eq(approvalRequests.id, requestId),
          isNull(approvalRequests.deletedAt),
          or(
            eq(approvalRequests.status, "expired"),
            and(eq(approvalRequests.status, "pending"), lte(approvalRequests.expiryAt, new Date())),
          ),
        ))
        .returning({ id: approvalRequests.id });
      if (archived) return { ok: true } as const;
      return { ok: false, error: "Only expired pending requests can be deleted" } as const;
    });
    if (rlsResult.kind === "unauthenticated") return { ok: false, error: "Forbidden" };
    return rlsResult.value;
  } catch {
    // A missing migration, RLS denial, or database failure must not turn a
    // reviewer action into a Next.js error page.
    return {
      ok: false,
      error: "Delete is temporarily unavailable. Please verify the approval archive database migration, then try again.",
    };
  }
}
