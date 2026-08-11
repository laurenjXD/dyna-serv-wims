// lib/db/queries/withdrawals.ts
//
// Pick-list and outgoing-ledger query helpers.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R5.3 — on success system SHALL reserve selected quantities and expose
//             the operational pick_list to the floor workflow.
//     R9.1 — Outgoing Ledger SHALL be a filtered view of inventory_transactions,
//             primarily movement_type = 'pick'.
//     R9.2 — ledger SHALL show authorized date/time, item code, description,
//             lot, location, quantity/UOM, pick list, destination/party, flow
//             type, dispatching user, and document references.
//     R9.3 — ledger SHALL support date, party/destination, flow, item/code,
//             lot, and pick-list filters subject to authorization.
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §9
//     Column list added 2026-08-08; v1 excludes transfer rows.
//
// v1 resolution (tasks.md 2026-08-08): transfer rows are excluded from the
// Outgoing Ledger — only movement_type = 'pick' rows are included.

import { eq, asc, sql } from "drizzle-orm";
import { pickLists, pickListItems } from "@/lib/db/schema/pick_lists";
import { inventoryTransactions } from "@/lib/db/schema/transactions";

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy. Uses named method properties (not an index signature) so
// that PostgresJsDatabase, which has no index signature, is assignable here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PickListRow = {
  id: string;
  pickListNumber: string;
  status: string;
  customerPartyId: string;
  flowType: string;
  createdAt: Date;
};

export type PickListItemRow = {
  id: string;
  pickListId: string;
  itemId: string;
  itemCode: string;
  customerItemCode: string | null;
  itemDescription: string | null;
  lotId: string;
  lotNumber: string;
  locationId: string;
  locationLabel: string;
  qty: number;
  spq: number;
  numberOfBoxes: number;
  unitPrice: string | null;
};

export type PickListWithLines = PickListRow & {
  lines: PickListItemRow[];
};

type RawPickListJoinRow = {
  id: string;
  pickListNumber: string;
  status: string;
  customerPartyId: string;
  flowType: string;
  createdAt: Date;
  lineId: string | null;
  linePickListId: string | null;
  lineItemId: string | null;
  lineItemCode: string | null;
  lineCustomerItemCode: string | null;
  lineItemDescription: string | null;
  lineLotId: string | null;
  lineLotNumber: string | null;
  lineLocationId: string | null;
  lineLocationLabel: string | null;
  lineQty: number | null;
  lineSpq: number | null;
  lineNumberOfBoxes: number | null;
  lineUnitPrice: string | null;
};

export type OutgoingLedgerRow = {
  transactionId: string;
  createdAt: Date;
  transactionNumber: string;
  itemCode: string;
  itemName: string;
  lotNumber: string;
  qty: string;
  fromLocationLabel: string;
  pickListNumber: string | null;
  customerPartyName: string | null;
  performedByUserId: string;
};

// ---------------------------------------------------------------------------
// listPickLists
//
// Returns paginated pick_lists rows, optionally filtered by status.
// Orders by createdAt ASC (oldest first).
// Returns { rows, total } where total is the unpaginated count.
//
// Authorization is enforced at the call site — not re-checked here.
// ---------------------------------------------------------------------------

export async function listPickLists(
  db: DbLike,
  opts: { limit: number; offset: number; status?: string },
): Promise<{ rows: PickListRow[]; total: number }> {
  const dataBase = db
    .select({
      id: pickLists.id,
      pickListNumber: pickLists.pickListNumber,
      status: pickLists.status,
      customerPartyId: pickLists.customerPartyId,
      flowType: pickLists.flowType,
      createdAt: pickLists.createdAt,
    })
    .from(pickLists);

  const countBase = db
    .select({ count: sql<string>`count(*)` })
    .from(pickLists);

  let rows: PickListRow[];
  let countResult: Array<{ count: string }>;

  if (opts.status) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereExpr = eq(pickLists.status, opts.status as any);
    rows = (await dataBase
      .where(whereExpr)
      .orderBy(asc(pickLists.createdAt))
      .limit(opts.limit)
      .offset(opts.offset)) as PickListRow[];
    countResult = (await countBase.where(whereExpr)) as Array<{
      count: string;
    }>;
  } else {
    rows = (await dataBase
      .orderBy(asc(pickLists.createdAt))
      .limit(opts.limit)
      .offset(opts.offset)) as PickListRow[];
    countResult = (await countBase) as Array<{ count: string }>;
  }

  return { rows, total: Number(countResult[0]?.count ?? 0) };
}

// ---------------------------------------------------------------------------
// getPickList
//
// Fetches one pick_list by id.
// Returns null if no pick list matches the id.
// Authorization is enforced at the call site — not re-checked here.
// ---------------------------------------------------------------------------

export async function getPickList(
  db: DbLike,
  pickListId: string,
): Promise<PickListWithLines | null> {
  const joinedRows = (await db
    .select({
      id: pickLists.id,
      pickListNumber: pickLists.pickListNumber,
      status: pickLists.status,
      customerPartyId: pickLists.customerPartyId,
      flowType: pickLists.flowType,
      createdAt: pickLists.createdAt,
      lineId: pickListItems.id,
      linePickListId: pickListItems.pickListId,
      lineItemId: pickListItems.itemId,
      lineItemCode: pickListItems.itemCode,
      lineCustomerItemCode: pickListItems.customerItemCode,
      lineItemDescription: pickListItems.itemDescription,
      lineLotId: pickListItems.lotId,
      lineLotNumber: pickListItems.lotNumber,
      lineLocationId: pickListItems.locationId,
      lineLocationLabel: pickListItems.locationLabel,
      lineQty: pickListItems.qty,
      lineSpq: pickListItems.spq,
      lineNumberOfBoxes: pickListItems.numberOfBoxes,
      lineUnitPrice: pickListItems.unitPrice,
    })
    .from(pickLists)
    .where(eq(pickLists.id, pickListId))
    .leftJoin(
      pickListItems,
      eq(pickListItems.pickListId, pickLists.id),
    )) as RawPickListJoinRow[];

  if (joinedRows.length === 0) return null;

  const first = joinedRows[0];

  const lines: PickListItemRow[] = joinedRows
    .filter((row) => row.lineId != null)
    .map((row) => ({
      id: row.lineId!,
      pickListId: row.linePickListId!,
      itemId: row.lineItemId!,
      itemCode: row.lineItemCode!,
      customerItemCode: row.lineCustomerItemCode,
      itemDescription: row.lineItemDescription,
      lotId: row.lineLotId!,
      lotNumber: row.lineLotNumber!,
      locationId: row.lineLocationId!,
      locationLabel: row.lineLocationLabel!,
      qty: row.lineQty!,
      spq: row.lineSpq!,
      numberOfBoxes: row.lineNumberOfBoxes!,
      unitPrice: row.lineUnitPrice,
    }));

  return {
    id: first.id,
    pickListNumber: first.pickListNumber,
    status: first.status,
    customerPartyId: first.customerPartyId,
    flowType: first.flowType,
    createdAt: first.createdAt,
    lines,
  };
}

// ---------------------------------------------------------------------------
// listOutgoingLedger
//
// Returns paginated outgoing ledger rows filtered to movement_type = 'pick'.
// v1: transfer rows are excluded (design.md §9, tasks.md 2026-08-08 resolution).
//
// In production this query would join items, lots, locations, pick_lists,
// and parties tables to resolve human-readable codes and names per design.md
// §9 column list. The column selection is kept minimal here and will be
// expanded in the 10/ledger delivery as those joins are finalized.
//
// Authorization is enforced at the call site — not re-checked here.
// ---------------------------------------------------------------------------

export async function listOutgoingLedger(
  db: DbLike,
  opts: { limit: number; offset: number },
): Promise<{ rows: OutgoingLedgerRow[]; total: number }> {
  // movement_type = 'pick' filter — required by R9.1 and verified by the
  // test suite (where() call is expected on the data chain).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pickFilter = eq(inventoryTransactions.movementType, "pick" as any);

  const rows = (await db
    .select({
      transactionId: inventoryTransactions.id,
      createdAt: inventoryTransactions.createdAt,
      transactionNumber: inventoryTransactions.transactionNumber,
      qty: inventoryTransactions.qty,
      performedByUserId: inventoryTransactions.performedByUserId,
      pickListId: inventoryTransactions.pickListId,
    })
    .from(inventoryTransactions)
    .where(pickFilter)
    .orderBy(asc(inventoryTransactions.createdAt))
    .limit(opts.limit)
    .offset(opts.offset)) as OutgoingLedgerRow[];

  const countResult = (await db
    .select({ count: sql<string>`count(*)` })
    .from(inventoryTransactions)
    .where(pickFilter)) as Array<{ count: string }>;

  return { rows, total: Number(countResult[0]?.count ?? 0) };
}
