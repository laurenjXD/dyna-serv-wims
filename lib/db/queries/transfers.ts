// Transfer request query helpers.
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md R1.2 — request identifies
//     item, lot, flow type, quantity, source/destination, reason.
//   specs/11-transfer-and-inspection/requirements.md R7.1 — authorized users
//     can review transfer requests, current state, and history.
//   specs/11-transfer-and-inspection/requirements.md R7.2 — search/filter
//     supports status, date, source/destination, item/lot.
//   specs/11-transfer-and-inspection/design.md §2 — transfer_requests and
//     transfer_lines table shapes.
//   specs/11-transfer-and-inspection/design.md §4 — transfer state model.

import { eq, asc, sql } from "drizzle-orm";
import { transferRequests, transferLines } from "@/lib/db/schema/transfers";

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TransferRequestRow = {
  id: string;
  status: string;
  flowType: string;
  fromLocationId: string;
  toLocationId: string;
  requestedBy: string;
  requiresApproval: boolean;
  createdAt: Date;
};

export type TransferLineRow = {
  id: string;
  transferRequestId: string;
  lotId: string;
  itemId: string;
  qtyRequested: string;
  qtyTransferred: string;
  status: string;
};

export type TransferRequestWithLines = TransferRequestRow & {
  lines: TransferLineRow[];
};

// ---------------------------------------------------------------------------
// Internal raw join row type for getTransferRequest
// ---------------------------------------------------------------------------

type RawJoinRow = {
  id: string;
  status: string;
  flowType: string;
  fromLocationId: string;
  toLocationId: string;
  requestedBy: string;
  requiresApproval: boolean;
  createdAt: Date;
  // Prefixed line fields — null when left join finds no matching transfer_lines row
  lineId: string | null;
  lineTransferRequestId: string | null;
  lineLotId: string | null;
  lineItemId: string | null;
  lineQtyRequested: string | null;
  lineQtyTransferred: string | null;
  lineStatus: string | null;
};

// ---------------------------------------------------------------------------
// listTransferRequests
// ---------------------------------------------------------------------------

/**
 * Returns paginated transfer_requests rows, optionally filtered by status.
 * Orders by createdAt ASC (oldest first).
 * Returns { rows, total } where total is the unpaginated count.
 *
 * Authorization is enforced at the call site — not re-checked here.
 */
export async function listTransferRequests(
  db: DbLike,
  opts: { limit: number; offset: number; status?: string },
): Promise<{ rows: TransferRequestRow[]; total: number }> {
  const dataBase = db
    .select({
      id: transferRequests.id,
      status: transferRequests.status,
      flowType: transferRequests.flowType,
      fromLocationId: transferRequests.fromLocationId,
      toLocationId: transferRequests.toLocationId,
      requestedBy: transferRequests.requestedBy,
      requiresApproval: transferRequests.requiresApproval,
      createdAt: transferRequests.createdAt,
    })
    .from(transferRequests);

  const countBase = db
    .select({ count: sql<string>`count(*)` })
    .from(transferRequests);

  let rows: TransferRequestRow[];
  let countResult: Array<{ count: string }>;

  if (opts.status) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereExpr = eq(transferRequests.status, opts.status as any);
    rows = (await dataBase
      .where(whereExpr)
      .orderBy(asc(transferRequests.createdAt))
      .limit(opts.limit)
      .offset(opts.offset)) as TransferRequestRow[];
    countResult = (await countBase.where(whereExpr)) as Array<{ count: string }>;
  } else {
    rows = (await dataBase
      .orderBy(asc(transferRequests.createdAt))
      .limit(opts.limit)
      .offset(opts.offset)) as TransferRequestRow[];
    countResult = (await countBase) as Array<{ count: string }>;
  }

  return { rows, total: Number(countResult[0].count) };
}

// ---------------------------------------------------------------------------
// getTransferRequest
// ---------------------------------------------------------------------------

/**
 * Fetches one transfer_request by id, left-joined to its transfer_lines.
 * Returns null if no request matches the id.
 * Returns { ...requestFields, lines: [] } when the request exists but has no
 * transfer_lines rows (the left join returns one row with null line fields).
 */
export async function getTransferRequest(
  db: DbLike,
  transferId: string,
): Promise<TransferRequestWithLines | null> {
  const joinedRows = (await db
    .select({
      // Request fields
      id: transferRequests.id,
      status: transferRequests.status,
      flowType: transferRequests.flowType,
      fromLocationId: transferRequests.fromLocationId,
      toLocationId: transferRequests.toLocationId,
      requestedBy: transferRequests.requestedBy,
      requiresApproval: transferRequests.requiresApproval,
      createdAt: transferRequests.createdAt,
      // Line fields — aliased with "line" prefix to avoid collision
      lineId: transferLines.id,
      lineTransferRequestId: transferLines.transferRequestId,
      lineLotId: transferLines.lotId,
      lineItemId: transferLines.itemId,
      lineQtyRequested: transferLines.qtyRequested,
      lineQtyTransferred: transferLines.qtyTransferred,
      lineStatus: transferLines.status,
    })
    .from(transferRequests)
    .where(eq(transferRequests.id, transferId))
    .leftJoin(
      transferLines,
      eq(transferLines.transferRequestId, transferRequests.id),
    )) as RawJoinRow[];

  if (joinedRows.length === 0) return null;

  const first = joinedRows[0];

  // Collect line rows — filter out the null-line left-join row when the
  // request has no transfer_lines yet. lineId is the discriminator: it is
  // non-null exactly when a matching transfer_lines row exists.
  const lines: TransferLineRow[] = joinedRows
    .filter((row) => row.lineId != null)
    .map((row) => ({
      id: row.lineId!,
      transferRequestId: row.lineTransferRequestId!,
      lotId: row.lineLotId!,
      itemId: row.lineItemId!,
      qtyRequested: row.lineQtyRequested!,
      qtyTransferred: row.lineQtyTransferred!,
      status: row.lineStatus!,
    }));

  return {
    id: first.id,
    status: first.status,
    flowType: first.flowType,
    fromLocationId: first.fromLocationId,
    toLocationId: first.toLocationId,
    requestedBy: first.requestedBy,
    requiresApproval: first.requiresApproval,
    createdAt: first.createdAt,
    lines,
  };
}
