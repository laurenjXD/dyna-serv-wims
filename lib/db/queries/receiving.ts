// WRR document query helpers.
//
// Traceability:
//   specs/07-incoming-receiving/requirements.md R2.5 — floor flow shows WRR,
//     expected lines, scanned quantities, remaining quantities, exceptions.
//   specs/07-incoming-receiving/requirements.md R3.1 — scan matched against
//     WRR's expected item/line.
//   specs/07-incoming-receiving/design.md §4 — state model and command boundaries.
//   specs/07-incoming-receiving/design.md §5.1 — expected line fields.
//   specs/07-incoming-receiving/design.md §5.2 — scan-line state and discrepancy.

import { eq, asc, sql } from "drizzle-orm";
import { wrrDocuments, wrrItems } from "@/lib/db/schema/wrr";

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WrrDocumentRow = {
  id: string;
  wrrNumber: string;
  status: string;
  flowType: string;
  vendorPartyId: string;
  stagedByUserId: string;
  createdAt: Date;
};

export type WrrItemRow = {
  id: string;
  wrrId: string;
  lotNumber: string;
  expectedQty: number;
  scannedQty: number;
  disposition: string;
  itemId: string | null;
  unitCbm: number;
  putawayLocationId: string | null;
  committedAt: Date | null;
};

export type WrrDocumentWithItems = WrrDocumentRow & {
  items: WrrItemRow[];
};

// ---------------------------------------------------------------------------
// Internal raw join row type for getWrrDocument
// ---------------------------------------------------------------------------

type RawJoinRow = {
  id: string;
  wrrNumber: string;
  status: string;
  flowType: string;
  vendorPartyId: string;
  stagedByUserId: string;
  createdAt: Date;
  // Prefixed item fields — null when left join finds no matching wrr_items row
  itemRowId: string | null;
  itemWrrId: string | null;
  itemLotNumber: string | null;
  itemExpectedQty: number | null;
  itemScannedQty: number | null;
  itemDisposition: string | null;
  itemItemId: string | null;
  itemUnitCbm: string | number | null;
  itemPutawayLocationId: string | null;
  itemCommittedAt: Date | null;
};

// ---------------------------------------------------------------------------
// listWrrDocuments
// ---------------------------------------------------------------------------

/**
 * Returns paginated wrr_documents rows, optionally filtered by status.
 * Orders by createdAt ASC (oldest first).
 * Returns { rows, total } where total is the unpaginated count.
 *
 * Authorization is enforced at the call site — not re-checked here.
 */
export async function listWrrDocuments(
  db: DbLike,
  opts: { limit: number; offset: number; status?: string },
): Promise<{ rows: WrrDocumentRow[]; total: number }> {
  const dataBase = db
    .select({
      id: wrrDocuments.id,
      wrrNumber: wrrDocuments.wrrNumber,
      status: wrrDocuments.status,
      flowType: wrrDocuments.flowType,
      vendorPartyId: wrrDocuments.vendorPartyId,
      stagedByUserId: wrrDocuments.stagedByUserId,
      createdAt: wrrDocuments.createdAt,
    })
    .from(wrrDocuments);

  const countBase = db
    .select({ count: sql<string>`count(*)` })
    .from(wrrDocuments);

  let rows: WrrDocumentRow[];
  let countResult: Array<{ count: string }>;

  if (opts.status) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereExpr = eq(wrrDocuments.status, opts.status as any);
    rows = (await dataBase
      .where(whereExpr)
      .orderBy(asc(wrrDocuments.createdAt))
      .limit(opts.limit)
      .offset(opts.offset)) as WrrDocumentRow[];
    countResult = (await countBase.where(whereExpr)) as Array<{ count: string }>;
  } else {
    rows = (await dataBase
      .orderBy(asc(wrrDocuments.createdAt))
      .limit(opts.limit)
      .offset(opts.offset)) as WrrDocumentRow[];
    countResult = (await countBase) as Array<{ count: string }>;
  }

  return { rows, total: Number(countResult[0].count) };
}

// ---------------------------------------------------------------------------
// getWrrDocument
// ---------------------------------------------------------------------------

/**
 * Fetches one wrr_document by id, left-joined to its wrr_items.
 * Returns null if no document matches the id.
 * Returns { ...docFields, items: [] } when the document exists but has no
 * wrr_items rows (the left join returns one row with null item fields).
 */
export async function getWrrDocument(
  db: DbLike,
  wrrId: string,
): Promise<WrrDocumentWithItems | null> {
  const joinedRows = (await db
    .select({
      // Document fields
      id: wrrDocuments.id,
      wrrNumber: wrrDocuments.wrrNumber,
      status: wrrDocuments.status,
      flowType: wrrDocuments.flowType,
      vendorPartyId: wrrDocuments.vendorPartyId,
      stagedByUserId: wrrDocuments.stagedByUserId,
      createdAt: wrrDocuments.createdAt,
      // Item fields — aliased with "item" prefix to avoid collision
      itemRowId: wrrItems.id,
      itemWrrId: wrrItems.wrrId,
      itemLotNumber: wrrItems.lotNumber,
      itemExpectedQty: wrrItems.expectedQty,
      itemScannedQty: wrrItems.scannedQty,
      itemDisposition: wrrItems.disposition,
      itemItemId: wrrItems.itemId,
      itemUnitCbm: wrrItems.unitCbm,
      itemPutawayLocationId: wrrItems.putawayLocationId,
      itemCommittedAt: wrrItems.committedAt,
    })
    .from(wrrDocuments)
    .where(eq(wrrDocuments.id, wrrId))
    .leftJoin(wrrItems, eq(wrrItems.wrrId, wrrDocuments.id))) as RawJoinRow[];

  if (joinedRows.length === 0) return null;

  const first = joinedRows[0];

  // Collect item rows — filter out the null-item left-join row when the
  // document has no wrr_items yet. itemWrrId is the discriminator: it is
  // non-null exactly when a matching wrr_items row exists.
  const items: WrrItemRow[] = joinedRows
    .filter((row) => row.itemWrrId != null)
    .map((row) => ({
      id: row.itemRowId!,
      wrrId: row.itemWrrId!,
      lotNumber: row.itemLotNumber!,
      expectedQty: row.itemExpectedQty!,
      scannedQty: row.itemScannedQty!,
      disposition: row.itemDisposition!,
      itemId: row.itemItemId,
      unitCbm: Number(row.itemUnitCbm ?? 0),
      putawayLocationId: row.itemPutawayLocationId,
      committedAt: row.itemCommittedAt,
    }));

  return {
    id: first.id,
    wrrNumber: first.wrrNumber,
    status: first.status,
    flowType: first.flowType,
    vendorPartyId: first.vendorPartyId,
    stagedByUserId: first.stagedByUserId,
    createdAt: first.createdAt,
    items,
  };
}
