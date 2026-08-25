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

import { eq, asc, desc, sql, and, gte, lte } from "drizzle-orm";
import { pickLists, pickListItems } from "@/lib/db/schema/pick_lists";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { items } from "@/lib/db/schema/items";
import { lots } from "@/lib/db/schema/lots";
import { locations } from "@/lib/db/schema/locations";
import { lots } from "@/lib/db/schema/lots";
import { locations } from "@/lib/db/schema/locations";
import { parties } from "@/lib/db/schema/parties";
import { inventoryUnits } from "@/lib/db/schema/inventory_units";

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
  customerPartyName?: string | null;
  flowType: string;
  createdAt: Date;
};

export type PickListItemRow = {
  id: string;
  itemId: string;
  itemCode: string;
  itemBarcode: string | null;
  customerItemCode: string | null;
  itemDescription: string | null;
  lotId: string;
  lotNumber: string;
  locationId: string;
  locationLabel: string;
  qty: number;
  spq: number;
  spqMeter?: string | number | null;
  numberOfBoxes: number;
  manufactureDate?: string | null;
  unitPrice: string | null;
};

export type PickUnitSelectionRow = {
  pickListItemId: string;
  unitId: string;
  unitIndex: number;
  locationId: string;
  status: string;
};

export type PickUnitCandidateRow = {
  pickListItemId: string;
  unitId: string;
  unitIndex: number;
  locationId: string;
};

export type OutgoingLedgerRow = {
  transactionId: string;
  createdAt: Date;
  transactionNumber: string;
  itemCode: string;
  itemName: string;
  lotNumber: string;
  qty: number;
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
      customerPartyName: parties.name,
      flowType: pickLists.flowType,
      createdAt: pickLists.createdAt,
    })
    .from(pickLists)
    .leftJoin(parties, eq(parties.id, pickLists.customerPartyId));

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
// listRecentPickLists
//
// Genuinely-recent pick lists (createdAt DESC), for "Recent Activity" feeds.
// listPickLists above orders ASC (oldest-first, work-queue prioritization)
// so it cannot be reused for a recency-sorted feed — see
// specs/00-steering/ui-ux-design-plan.md data-honesty fix
// (design-system-auditor finding, 2026-08-16).
//
// Authorization is enforced at the call site — not re-checked here.
// ---------------------------------------------------------------------------

export async function listRecentPickLists(
  db: DbLike,
  opts: { limit: number },
): Promise<PickListRow[]> {
  return (await db
    .select({
      id: pickLists.id,
      pickListNumber: pickLists.pickListNumber,
      status: pickLists.status,
      customerPartyId: pickLists.customerPartyId,
      customerPartyName: parties.name,
      flowType: pickLists.flowType,
      createdAt: pickLists.createdAt,
    })
    .from(pickLists)
    .leftJoin(parties, eq(parties.id, pickLists.customerPartyId))
    .orderBy(desc(pickLists.createdAt))
    .limit(opts.limit)) as PickListRow[];
}

// ---------------------------------------------------------------------------
// listPartyPickLists
//
// Party Portal — pick_lists read scoped to the caller's own party.
//
// Traceability: specs/22-parties-portal/design.md §6, tasks.md Task 4 —
// "Build the pick_lists read filtered to customer_party_id, using
// can_access_party_resource('pick_list', 'read', customer_party_id,
// flow_type)." The caller MUST have already authorized `pick_list.read`
// scoped to this exact partyId/flowType via requirePermission before
// invoking this; this function applies the customer_party_id filter at the
// query-shape level as the data-access-side half of that same boundary.
//
// itemsCount is derived from a count of pick_list_items — never a live
// join to lots (requirements.md R3.3: snapshot fields only).
// ---------------------------------------------------------------------------

export type PartyPickListRow = {
  id: string;
  pickListNumber: string;
  status: string;
  createdAt: Date;
  itemsCount: number;
};

export async function listPartyPickLists(
  db: DbLike,
  customerPartyId: string,
): Promise<PartyPickListRow[]> {
  const rows = (await db
    .select({
      id: pickLists.id,
      pickListNumber: pickLists.pickListNumber,
      status: pickLists.status,
      createdAt: pickLists.createdAt,
      itemsCount: sql<string>`count(${pickListItems.id})`,
    })
    .from(pickLists)
    .leftJoin(pickListItems, eq(pickListItems.pickListId, pickLists.id))
    .where(eq(pickLists.customerPartyId, customerPartyId))
    .groupBy(pickLists.id)
    .orderBy(desc(pickLists.createdAt))) as Array<{
    id: string;
    pickListNumber: string;
    status: string;
    createdAt: Date;
    itemsCount: string;
  }>;

  return rows.map((row) => ({
    ...row,
    itemsCount: Number(row.itemsCount),
  }));
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
): Promise<PickListRow | null> {
  const rows = (await db
    .select({
      id: pickLists.id,
      pickListNumber: pickLists.pickListNumber,
      status: pickLists.status,
      customerPartyId: pickLists.customerPartyId,
      flowType: pickLists.flowType,
      createdAt: pickLists.createdAt,
    })
    .from(pickLists)
    .where(eq(pickLists.id, pickListId))
    .limit(1)) as PickListRow[];

  return rows.length > 0 ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// getPickListItems
//
// Fetches the committed line items for one pick_list, ordered by createdAt
// ASC (insertion order from Stage 1 commitWithdrawal). Used by the Stage 1
// pick-execution floor screen and the Stage 2 dispatch confirmation screen
// as the real data source for line items — replaces prior hardcoded mocks.
//
// Authorization is enforced at the call site — not re-checked here.
// ---------------------------------------------------------------------------

export async function getPickListItems(
  db: DbLike,
  pickListId: string,
): Promise<PickListItemRow[]> {
  const rows = (await db
    .select({
      id: pickListItems.id,
      itemId: pickListItems.itemId,
      itemCode: pickListItems.itemCode,
      itemBarcode: items.barcode,
      customerItemCode: pickListItems.customerItemCode,
      itemDescription: pickListItems.itemDescription,
      lotId: pickListItems.lotId,
      lotNumber: pickListItems.lotNumber,
      locationId: pickListItems.locationId,
      locationLabel: pickListItems.locationLabel,
      qty: pickListItems.qty,
      spq: pickListItems.spq,
      spqMeter: items.spqMeter,
      numberOfBoxes: pickListItems.numberOfBoxes,
      manufactureDate: lots.manufactureDate,
      unitPrice: pickListItems.unitPrice,
    })
    .from(pickListItems)
    .leftJoin(items, eq(items.id, pickListItems.itemId))
    .leftJoin(lots, eq(lots.id, pickListItems.lotId))
    .where(eq(pickListItems.pickListId, pickListId))
    .orderBy(asc(pickListItems.createdAt))) as PickListItemRow[];

  return rows;
}

/** Physical boxes already selected for a pick list, grouped by their exact line. */
export async function getPickUnitSelections(
  db: DbLike,
  pickListId: string,
): Promise<PickUnitSelectionRow[]> {
  return (await db
    .select({
      pickListItemId: inventoryUnits.pickListItemId,
      unitId: inventoryUnits.unitId,
      unitIndex: inventoryUnits.unitIndex,
      locationId: inventoryUnits.locationId,
      status: inventoryUnits.status,
    })
    .from(inventoryUnits)
    .innerJoin(pickListItems, eq(pickListItems.id, inventoryUnits.pickListItemId))
    .where(eq(pickListItems.pickListId, pickListId))
    .orderBy(asc(inventoryUnits.unitIndex))) as PickUnitSelectionRow[];
}

/** Available physical boxes for each committed line, grouped by exact source location. */
export async function getPickUnitCandidates(
  db: DbLike,
  pickListId: string,
): Promise<PickUnitCandidateRow[]> {
  return (await db
    .select({
      pickListItemId: pickListItems.id,
      unitId: inventoryUnits.unitId,
      unitIndex: inventoryUnits.unitIndex,
      locationId: inventoryUnits.locationId,
    })
    .from(inventoryUnits)
    .innerJoin(
      pickListItems,
      and(
        eq(pickListItems.lotId, inventoryUnits.lotId),
        eq(pickListItems.locationId, inventoryUnits.locationId),
      ),
    )
    .where(and(
      eq(pickListItems.pickListId, pickListId),
      eq(inventoryUnits.status, "available"),
    ))
    .orderBy(asc(inventoryUnits.unitIndex))) as PickUnitCandidateRow[];
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

export type LedgerDateRange = { startDate: Date; endDate: Date };

// R9.3: "ledger SHALL support date... filters" — v1 shipped without it;
// added 2026-08-19 (user request: date-range filter on read-only pages).
function buildPickLedgerFilter(dateRange?: LedgerDateRange) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pickFilter = eq(inventoryTransactions.movementType, "pick" as any);
  if (!dateRange) return pickFilter;
  return and(
    pickFilter,
    gte(inventoryTransactions.createdAt, dateRange.startDate),
    lte(inventoryTransactions.createdAt, dateRange.endDate),
  );
}

export async function listOutgoingLedger(
  db: DbLike,
  opts: { limit: number; offset: number; dateRange?: LedgerDateRange },
): Promise<{ rows: OutgoingLedgerRow[]; total: number }> {
  // movement_type = 'pick' filter — required by R9.1 and verified by the
  // test suite (where() call is expected on the data chain).
  const pickFilter = buildPickLedgerFilter(opts.dateRange);

  const rows = (await db
    .select({
      transactionId: inventoryTransactions.id,
      createdAt: inventoryTransactions.createdAt,
      transactionNumber: inventoryTransactions.transactionNumber,
      itemCode: items.code,
      itemName: items.name,
      lotNumber: lots.lotNumber,
      itemCode: items.code,
      itemName: items.name,
      lotNumber: lots.lotNumber,
      qty: inventoryTransactions.qty,
      fromLocationLabel: locations.label,
      performedByUserId: inventoryTransactions.performedByUserId,
      pickListNumber: pickLists.pickListNumber,
      customerPartyName: parties.name,
    })
    .from(inventoryTransactions)
    .leftJoin(items, eq(items.id, inventoryTransactions.itemId))
    .leftJoin(lots, eq(lots.id, inventoryTransactions.lotId))
    .leftJoin(locations, eq(locations.id, inventoryTransactions.fromLocationId))
    .leftJoin(pickLists, eq(pickLists.id, inventoryTransactions.pickListId))
    .leftJoin(parties, eq(parties.id, pickLists.customerPartyId))
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

export type OutgoingLedgerSummary = {
  totalQty: number;
  totalTransactions: number;
  byFlowType: { vmi: number; trading: number; supplies: number };
};

// Overview cards data source (2026-08-19 user request: "each incoming and
// outgoing ledger... should have an overview card at the top, just simple
// data analytics like how much went in or out, or how many what inventory
// model"). Respects the same date-range filter as the ledger rows above.
export async function getOutgoingLedgerSummary(
  db: DbLike,
  dateRange?: LedgerDateRange,
): Promise<OutgoingLedgerSummary> {
  const pickFilter = buildPickLedgerFilter(dateRange);

  const rows = (await db
    .select({
      flowType: inventoryTransactions.flowType,
      totalQty: sql<string>`coalesce(sum(${inventoryTransactions.qty}), 0)`,
      count: sql<string>`count(*)`,
    })
    .from(inventoryTransactions)
    .where(pickFilter)
    .groupBy(inventoryTransactions.flowType)) as Array<{
    flowType: string;
    totalQty: string;
    count: string;
  }>;

  const byFlowType = { vmi: 0, trading: 0, supplies: 0 };
  let totalQty = 0;
  let totalTransactions = 0;
  for (const row of rows) {
    const qty = Number(row.totalQty);
    const count = Number(row.count);
    if (row.flowType === "vmi" || row.flowType === "trading" || row.flowType === "supplies") {
      byFlowType[row.flowType] = qty;
    }
    totalQty += qty;
    totalTransactions += count;
  }

  return { totalQty, totalTransactions, byFlowType };
}
