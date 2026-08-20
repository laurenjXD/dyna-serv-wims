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
import {
  transferRequests,
  transferLines,
  inspectionCases,
} from "@/lib/db/schema/transfers";
import { wrrItems } from "@/lib/db/schema/wrr";
import { lots } from "@/lib/db/schema/lots";
import { items } from "@/lib/db/schema/items";
import { parties } from "@/lib/db/schema/parties";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { locations } from "@/lib/db/schema/locations";

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

// ---------------------------------------------------------------------------
// Inspection case query helpers
// ---------------------------------------------------------------------------
//
// specs/11-transfer-and-inspection/design.md §6.1 (inbound and transfer
// inspection contexts share the inspection_cases/inspection_evidence/
// inspection_dispositions record model), §6.2 (context isolation),
// §6.3 (disposition table with balance effects), §2 (table shapes).
//
// inspection_cases has no direct location column — lot_location_balances is
// the authoritative placement model (01-core-data-model design.md §1.2), so
// the display location is resolved via a correlated scalar subquery against
// lot_location_balances/locations rather than a LEFT JOIN, which would
// otherwise fan a single case row out into one row per location a lot
// happens to occupy and silently break LIMIT/OFFSET pagination on the list
// query. Ordered by most-recently-updated balance so a lot that has since
// been consolidated to one location resolves to that location.
//
// sourceRefId is a polymorphic reference (wrr_items.id or transfer_lines.id
// depending on sourceRefType; design.md §2 — no DB FK across the two
// possible targets). These queries do not resolve it to a formatted
// business document number (e.g. "TRF-2026-001"/"WRR-2026-00008") — callers
// get the raw sourceRefType/sourceRefId pair, consistent with how
// listTransferRequests already surfaces raw ids (requestedBy, location ids)
// rather than resolving them to display names.

const inspectionLocationLabelSql = sql<string | null>`(
  SELECT ${locations.label}
  FROM ${lotLocationBalances}
  JOIN ${locations} ON ${locations.id} = ${lotLocationBalances.locationId}
  WHERE ${lotLocationBalances.lotId} = ${lots.id}
  ORDER BY ${lotLocationBalances.updatedAt} DESC
  LIMIT 1
)`;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type InspectionCaseListRow = {
  id: string;
  contextType: string;
  sourceRefType: string;
  sourceRefId: string;
  lotNumber: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  partyId: string;
  partyName: string;
  flowType: string;
  status: string;
  openedBy: string;
  openedAt: Date;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  locationLabel: string | null;
};

export type InspectionCaseDetailRow = InspectionCaseListRow & {
  itemUom: string;
  qtyToInspect: number;
};

// ---------------------------------------------------------------------------
// listInspectionCases
// ---------------------------------------------------------------------------

/**
 * Returns paginated inspection_cases rows joined to lots/items/parties for
 * display, optionally filtered by status. Orders by openedAt ASC (oldest
 * open case first — the queue's natural priority order).
 *
 * Authorization (inspection.perform) is enforced at the call site — not
 * re-checked here, matching listTransferRequests' convention.
 */
export async function listInspectionCases(
  db: DbLike,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: InspectionCaseListRow[]; total: number }> {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  const dataBase = db
    .select({
      id: inspectionCases.id,
      contextType: inspectionCases.contextType,
      sourceRefType: inspectionCases.sourceRefType,
      sourceRefId: inspectionCases.sourceRefId,
      lotNumber: lots.lotNumber,
      itemId: items.id,
      itemCode: items.code,
      itemName: items.name,
      partyId: parties.id,
      partyName: parties.name,
      flowType: inspectionCases.flowType,
      status: inspectionCases.status,
      openedBy: inspectionCases.openedBy,
      openedAt: inspectionCases.openedAt,
      resolvedBy: inspectionCases.resolvedBy,
      resolvedAt: inspectionCases.resolvedAt,
      locationLabel: inspectionLocationLabelSql,
    })
    .from(inspectionCases)
    .innerJoin(lots, eq(inspectionCases.lotId, lots.id))
    .innerJoin(items, eq(lots.itemId, items.id))
    .innerJoin(parties, eq(inspectionCases.partyId, parties.id));

  const countBase = db
    .select({ count: sql<string>`count(*)` })
    .from(inspectionCases);

  let rows: InspectionCaseListRow[];
  let countResult: Array<{ count: string }>;

  if (opts.status) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereExpr = eq(inspectionCases.status, opts.status as any);
    rows = (await dataBase
      .where(whereExpr)
      .orderBy(asc(inspectionCases.openedAt))
      .limit(limit)
      .offset(offset)) as InspectionCaseListRow[];
    countResult = (await countBase.where(whereExpr)) as Array<{ count: string }>;
  } else {
    rows = (await dataBase
      .orderBy(asc(inspectionCases.openedAt))
      .limit(limit)
      .offset(offset)) as InspectionCaseListRow[];
    countResult = (await countBase) as Array<{ count: string }>;
  }

  return { rows, total: Number(countResult[0].count) };
}

// ---------------------------------------------------------------------------
// getInspectionCase
// ---------------------------------------------------------------------------

/**
 * Fetches one inspection_case by id, joined to lots/items/parties for
 * display, plus a resolved qtyToInspect derived from the polymorphic
 * source line (transfer_lines.qty_requested for context_type = 'transfer',
 * wrr_items.scanned_qty/expected_qty for context_type = 'inbound').
 * Returns null if no case matches the id.
 */
export async function getInspectionCase(
  db: DbLike,
  caseId: string,
): Promise<InspectionCaseDetailRow | null> {
  const qtyToInspectSql = sql<string | null>`(
    CASE ${inspectionCases.sourceRefType}
      WHEN 'transfer_line' THEN (
        SELECT ${transferLines.qtyRequested}
        FROM ${transferLines}
        WHERE ${transferLines.id} = ${inspectionCases.sourceRefId}
      )
      WHEN 'wrr_item' THEN (
        SELECT COALESCE(${wrrItems.scannedQty}, ${wrrItems.expectedQty})
        FROM ${wrrItems}
        WHERE ${wrrItems.id} = ${inspectionCases.sourceRefId}
      )
      ELSE NULL
    END
  )`;

  const rows = (await db
    .select({
      id: inspectionCases.id,
      contextType: inspectionCases.contextType,
      sourceRefType: inspectionCases.sourceRefType,
      sourceRefId: inspectionCases.sourceRefId,
      lotNumber: lots.lotNumber,
      itemId: items.id,
      itemCode: items.code,
      itemName: items.name,
      itemUom: items.uom,
      partyId: parties.id,
      partyName: parties.name,
      flowType: inspectionCases.flowType,
      status: inspectionCases.status,
      openedBy: inspectionCases.openedBy,
      openedAt: inspectionCases.openedAt,
      resolvedBy: inspectionCases.resolvedBy,
      resolvedAt: inspectionCases.resolvedAt,
      locationLabel: inspectionLocationLabelSql,
      qtyToInspect: qtyToInspectSql,
    })
    .from(inspectionCases)
    .innerJoin(lots, eq(inspectionCases.lotId, lots.id))
    .innerJoin(items, eq(lots.itemId, items.id))
    .innerJoin(parties, eq(inspectionCases.partyId, parties.id))
    .where(eq(inspectionCases.id, caseId))) as Array<
    Omit<InspectionCaseDetailRow, "qtyToInspect"> & { qtyToInspect: string | number | null }
  >;

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ...row,
    qtyToInspect: row.qtyToInspect == null ? 0 : Number(row.qtyToInspect),
  };
}

// ---------------------------------------------------------------------------
// listInspectionAndTransferQueue
// ---------------------------------------------------------------------------
//
// specs/11-transfer-and-inspection/requirements.md R1.1, R2.3;
// specs/00-steering/multi-agent-work-division.md "Sidebar structure —
// confirmed target (2026-08-17)"; specs/00-steering/ui-implementation-plan.md
// P4 — merges listTransferRequests + listInspectionCases into one normalized,
// sortable row shape. Each row type is independently capability-gated by the
// CALLER (transfer.view / inspection.perform) — this function performs no
// authorization itself, it only decides which underlying queries to run
// based on the opts it's handed.

export type InspectionAndTransferQueueRow = {
  id: string;
  type: "transfer" | "inspection";
  title: string;
  status: string;
  createdAt: Date;
  href: string;
};

/**
 * Merges listTransferRequests and listInspectionCases into a single
 * work-queue list, sorted oldest-first by createdAt to match both source
 * queries' own ordering.
 *
 * Calls listTransferRequests only when includeTransfers is true, and
 * listInspectionCases only when includeInspections is true (in that order).
 * When both flags are false, returns [] without issuing any db.select()
 * calls — defense against wasted queries when a caller ends up with neither
 * capability.
 */
export async function listInspectionAndTransferQueue(
  db: DbLike,
  opts: {
    limit: number;
    offset: number;
    includeTransfers: boolean;
    includeInspections: boolean;
  },
): Promise<InspectionAndTransferQueueRow[]> {
  const rows: InspectionAndTransferQueueRow[] = [];

  if (opts.includeTransfers) {
    const { rows: transferRows } = await listTransferRequests(db, {
      limit: opts.limit,
      offset: opts.offset,
    });
    for (const t of transferRows) {
      rows.push({
        id: t.id,
        type: "transfer",
        title: `Transfer ${t.fromLocationId} → ${t.toLocationId}`,
        status: t.status,
        createdAt: t.createdAt,
        href: `/transfers/${t.id}`,
      });
    }
  }

  if (opts.includeInspections) {
    const { rows: inspectionRows } = await listInspectionCases(db, {
      limit: opts.limit,
      offset: opts.offset,
    });
    for (const c of inspectionRows) {
      rows.push({
        id: c.id,
        type: "inspection",
        title: `${c.itemName} — Lot ${c.lotNumber}`,
        status: c.status,
        createdAt: c.openedAt,
        href: `/inspection/${c.id}`,
      });
    }
  }

  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return rows;
}
