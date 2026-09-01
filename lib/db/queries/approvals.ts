// Approval request query helpers.
//
// Traceability:
//   specs/09-approval-queue/requirements.md R3 (Queue review and filtering),
//     R4 (Decision recording), R2 (Queue states and transitions)
//   specs/09-approval-queue/design.md §3 (Persistence model), §5 (State machine)
//   specs/09-approval-queue/tasks.md Testing Matrix §Unit tests

import { eq, and, asc, desc, sql, isNull, isNotNull } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm/alias";
import { approvalRequests, approvalDecisions } from "@/lib/db/schema/approvals";
import { userProfiles } from "@/lib/db/schema/rbac";

const requesterProfiles = aliasedTable(userProfiles, "approval_requester_profiles");
const reviewerProfiles = aliasedTable(userProfiles, "approval_reviewer_profiles");

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ApprovalRequestRow = {
  id: string;
  requestNumber: string;
  approvalType: string;
  reason: string;
  status: string;
  expiryAt: Date;
  createdAt: Date;
  requesterUserId: string;
  requesterDisplayName?: string | null;
  targetSnapshot: unknown;
  deletedAt?: Date | null;
  deletedByUserId?: string | null;
};

export type RequesterFifoOverrideRow = {
  id: string;
  requestNumber: string;
  status: string;
  reason: string;
  partyId: string | null;
  expiryAt: Date;
  createdAt: Date;
  targetSnapshot: unknown;
  decisionId: string | null;
  consumedAt: Date | null;
};

/** Recent FIFO override requests owned by one requester. The caller supplies
 * the authenticated user id; database RLS independently enforces the same
 * requester boundary when this query runs through an RLS transaction. */
export async function listRequesterFifoOverrides(
  db: DbLike,
  requesterUserId: string,
  limit = 10,
): Promise<RequesterFifoOverrideRow[]> {
  return (await db
    .select({
      id: approvalRequests.id,
      requestNumber: approvalRequests.requestNumber,
      status: approvalRequests.status,
      reason: approvalRequests.reason,
      partyId: approvalRequests.partyId,
      expiryAt: approvalRequests.expiryAt,
      createdAt: approvalRequests.createdAt,
      targetSnapshot: approvalRequests.targetSnapshot,
      decisionId: approvalDecisions.id,
      consumedAt: approvalDecisions.consumedAt,
    })
    .from(approvalRequests)
    .leftJoin(approvalDecisions, eq(approvalDecisions.requestId, approvalRequests.id))
    .where(and(
      eq(approvalRequests.requesterUserId, requesterUserId),
      eq(approvalRequests.approvalType, "fifo_override"),
    ))
    .orderBy(desc(approvalRequests.createdAt))
    .limit(limit)) as RequesterFifoOverrideRow[];
}

export type ApprovalDecisionRow = {
  id: string;
  reviewerUserId: string;
  reviewerDisplayName?: string | null;
  outcome: string;
  reason: string | null;
  decidedAt: Date;
  consumedAt: Date | null;
};

export type ApprovalRequestWithDecisions = ApprovalRequestRow & {
  decisions: ApprovalDecisionRow[];
};

// ---------------------------------------------------------------------------
// Internal raw join row type for getApprovalRequest
// ---------------------------------------------------------------------------

type RawJoinRow = {
  id: string;
  requestNumber: string;
  approvalType: string;
  reason: string;
  status: string;
  expiryAt: Date;
  createdAt: Date;
  requesterUserId: string;
  requesterDisplayName: string | null;
  targetSnapshot: unknown;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  decisionId: string | null;
  reviewerUserId: string | null;
  reviewerDisplayName: string | null;
  outcome: string | null;
  decisionReason: string | null;
  decidedAt: Date | null;
  consumedAt: Date | null;
};

// ---------------------------------------------------------------------------
// listPendingApprovalRequests
// ---------------------------------------------------------------------------

/**
 * Returns paginated approval_requests rows with status='pending', ordered by
 * createdAt ASC (oldest first). Optionally filters by approvalType.
 * Returns { rows, total } where total is the unpaginated count.
 *
 * Authorization is enforced at the call site (fifo_override.approve capability
 * per design.md §4) — not re-checked here.
 */
export async function listPendingApprovalRequests(
  db: DbLike,
  opts: { limit: number; offset: number; approvalType?: string },
): Promise<{ rows: ApprovalRequestRow[]; total: number }> {
  const whereClause = opts.approvalType
    ? and(
        eq(approvalRequests.status, "pending"),
        eq(approvalRequests.approvalType, opts.approvalType),
      )
    : eq(approvalRequests.status, "pending");

  // Data query — paginated, oldest first
  const rows: ApprovalRequestRow[] = await db
    .select({
      id: approvalRequests.id,
      requestNumber: approvalRequests.requestNumber,
      approvalType: approvalRequests.approvalType,
      reason: approvalRequests.reason,
      status: approvalRequests.status,
      expiryAt: approvalRequests.expiryAt,
      createdAt: approvalRequests.createdAt,
      requesterUserId: approvalRequests.requesterUserId,
      requesterDisplayName: requesterProfiles.displayName,
      targetSnapshot: approvalRequests.targetSnapshot,
    })
    .from(approvalRequests)
    .leftJoin(requesterProfiles, eq(requesterProfiles.id, approvalRequests.requesterUserId))
    .where(whereClause)
    .orderBy(asc(approvalRequests.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);

  // Count query — same WHERE; no pagination
  const [countRow] = await db
    .select({ count: sql<string>`count(*)` })
    .from(approvalRequests)
    .where(whereClause);

  return { rows, total: Number(countRow.count) };
}

/** Open or soft-archived approval queue rows for the reviewer UI. */
export async function listApprovalQueueRequests(
  db: DbLike,
  opts: { limit: number; offset: number; approvalType?: string; deleted?: boolean },
): Promise<{ rows: ApprovalRequestRow[]; total: number }> {
  const deletedClause = opts.deleted
    ? isNotNull(approvalRequests.deletedAt)
    : isNull(approvalRequests.deletedAt);
  const statusClause = opts.deleted
    ? isNotNull(approvalRequests.deletedAt)
    : eq(approvalRequests.status, "pending");
  const whereClause = opts.approvalType
    ? and(deletedClause, statusClause, eq(approvalRequests.approvalType, opts.approvalType))
    : and(deletedClause, statusClause);
  const rows = (await db
    .select({
      id: approvalRequests.id,
      requestNumber: approvalRequests.requestNumber,
      approvalType: approvalRequests.approvalType,
      reason: approvalRequests.reason,
      status: approvalRequests.status,
      expiryAt: approvalRequests.expiryAt,
      createdAt: approvalRequests.createdAt,
      requesterUserId: approvalRequests.requesterUserId,
      requesterDisplayName: requesterProfiles.displayName,
      targetSnapshot: approvalRequests.targetSnapshot,
      deletedAt: approvalRequests.deletedAt,
      deletedByUserId: approvalRequests.deletedByUserId,
    })
    .from(approvalRequests)
    .leftJoin(requesterProfiles, eq(requesterProfiles.id, approvalRequests.requesterUserId))
    .where(whereClause)
    .orderBy(asc(approvalRequests.createdAt))
    .limit(opts.limit)
    .offset(opts.offset)) as ApprovalRequestRow[];
  const [countRow] = await db.select({ count: sql<string>`count(*)` }).from(approvalRequests).where(whereClause);
  return { rows, total: Number(countRow.count) };
}

// ---------------------------------------------------------------------------
// getApprovalRequest
// ---------------------------------------------------------------------------

/**
 * Fetches one approval_request by id, left-joined to its approval_decisions.
 * Returns null if no request matches the id.
 * Returns { ...requestFields, decisions: [] } when the request exists but has
 * no decisions yet (the left join returns one row with null decision fields).
 */
export async function getApprovalRequest(
  db: DbLike,
  requestId: string,
): Promise<ApprovalRequestWithDecisions | null> {
  const joinedRows: RawJoinRow[] = await db
    .select({
      // Request fields
      id: approvalRequests.id,
      requestNumber: approvalRequests.requestNumber,
      approvalType: approvalRequests.approvalType,
      reason: approvalRequests.reason,
      status: approvalRequests.status,
      expiryAt: approvalRequests.expiryAt,
      createdAt: approvalRequests.createdAt,
      requesterUserId: approvalRequests.requesterUserId,
      requesterDisplayName: requesterProfiles.displayName,
      targetSnapshot: approvalRequests.targetSnapshot,
      deletedAt: approvalRequests.deletedAt,
      deletedByUserId: approvalRequests.deletedByUserId,
      // Decision fields — aliased to avoid collision with request fields
      decisionId: approvalDecisions.id,
      reviewerUserId: approvalDecisions.reviewerUserId,
      reviewerDisplayName: reviewerProfiles.displayName,
      outcome: approvalDecisions.outcome,
      decisionReason: approvalDecisions.reason,
      decidedAt: approvalDecisions.decidedAt,
      consumedAt: approvalDecisions.consumedAt,
    })
    .from(approvalRequests)
    .leftJoin(requesterProfiles, eq(requesterProfiles.id, approvalRequests.requesterUserId))
    .where(eq(approvalRequests.id, requestId))
    .leftJoin(
      approvalDecisions,
      eq(approvalDecisions.requestId, approvalRequests.id),
    )
    .leftJoin(reviewerProfiles, eq(reviewerProfiles.id, approvalDecisions.reviewerUserId));

  if (joinedRows.length === 0) return null;

  const first = joinedRows[0];

  // Collect decision rows — filter out the null-decision left-join row when
  // the request has no decisions yet.
  const decisions: ApprovalDecisionRow[] = joinedRows
    .filter((row) => row.decisionId !== null)
    .map((row) => ({
      id: row.decisionId!,
      reviewerUserId: row.reviewerUserId!,
      reviewerDisplayName: row.reviewerDisplayName,
      outcome: row.outcome!,
      reason: row.decisionReason,
      decidedAt: row.decidedAt!,
      consumedAt: row.consumedAt,
    }));

  return {
    id: first.id,
    requestNumber: first.requestNumber,
    approvalType: first.approvalType,
    reason: first.reason,
    status: first.status,
    expiryAt: first.expiryAt,
    createdAt: first.createdAt,
    requesterUserId: first.requesterUserId,
    requesterDisplayName: first.requesterDisplayName,
    targetSnapshot: first.targetSnapshot,
    deletedAt: first.deletedAt,
    deletedByUserId: first.deletedByUserId,
    decisions,
  };
}
