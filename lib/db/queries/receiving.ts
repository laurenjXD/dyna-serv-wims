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

import { eq, asc, desc, sql } from "drizzle-orm";
import { wrrDocuments, wrrItems } from "@/lib/db/schema/wrr";
// Aliased: getWrrDocument's own `items` local (the mapped WrrItemRow[]
// result) would otherwise shadow this schema table within the same
// function scope.
import { items as itemsTable } from "@/lib/db/schema/items";
// Aliased for the same shadowing reason as itemsTable above — this file's
// `parties` local (vendor name/code on the returned document) would
// otherwise collide with the schema table.
import { parties as partiesTable } from "@/lib/db/schema/parties";
import { userProfiles } from "@/lib/db/schema/rbac";

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
  // Resolved vendor party name via join — null if vendor party not found (edge case).
  vendorPartyName: string | null;
  stagedByUserId: string;
  createdAt: Date;
  confirmedAt: Date | null;
};

// Extended header fields consumed by getWrrDocument's print-contract callers
// (design.md §5.3: commercial invoice/CIPL, PEZA/IP/MAWB numbers, resolved
// vendor party name+code) — kept out of WrrDocumentRow/listWrrDocuments'
// select on purpose, since the queue/ledger list views never render these.
export type WrrDocumentDetailFields = {
  commercialInvoiceNo: string | null;
  ciplFileUrl: string | null;
  pezaNumber: string | null;
  ipNumber: string | null;
  mawbMblNumber: string | null;
  vendorPartyName: string | null;
  vendorPartyCode: string | null;
  // Resolved via join on user_profiles — null if the staging user's profile
  // row is missing (edge case), never the raw stagedByUserId as a fallback.
  stagedByDisplayName: string | null;
};

export type WrrItemRow = {
  id: string;
  wrrId: string;
  lotNumber: string;
  expectedQty: number;
  scannedQty: number;
  disposition: string;
  itemId: string | null;
  // The item's human-readable Dyna-Serv Item Code (items.code) — resolved
  // via a join on wrr_items.item_id. Null when the line's item is not yet
  // enrolled, matching the itemId nullability pattern above.
  itemCode: string | null;
  // items.name — resolved via the same join as itemCode above. Required by
  // design.md §5.3's printed per-line field contract ("item name/description").
  itemName: string | null;
  supplierItemCode: string | null;
  customerItemCode: string | null;
  manufactureDate: string | null;
  remarks: string | null;
  // wrr_items.uom — not resolved via a join, a native column on this table.
  uom: string;
  unitCbm: number;
  putawayLocationId: string | null;
  committedAt: Date | null;
};

export type WrrDocumentWithItems = WrrDocumentRow &
  WrrDocumentDetailFields & {
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
  confirmedAt: Date | null;
  commercialInvoiceNo: string | null;
  ciplFileUrl: string | null;
  pezaNumber: string | null;
  ipNumber: string | null;
  mawbMblNumber: string | null;
  vendorPartyName: string | null;
  vendorPartyCode: string | null;
  stagedByDisplayName: string | null;
  // Prefixed item fields — null when left join finds no matching wrr_items row
  itemRowId: string | null;
  itemWrrId: string | null;
  itemLotNumber: string | null;
  itemExpectedQty: number | null;
  itemScannedQty: number | null;
  itemDisposition: string | null;
  itemItemId: string | null;
  itemItemCode: string | null;
  itemItemName: string | null;
  itemSupplierItemCode: string | null;
  itemCustomerItemCode: string | null;
  itemManufactureDate: string | null;
  itemRemarks: string | null;
  itemUom: string | null;
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
  // Left-join to parties to resolve the human-readable vendor name for the
  // list-view display. getWrrDocument uses the same join for the detail view.
  const dataBase = db
    .select({
      id: wrrDocuments.id,
      wrrNumber: wrrDocuments.wrrNumber,
      status: wrrDocuments.status,
      flowType: wrrDocuments.flowType,
      vendorPartyId: wrrDocuments.vendorPartyId,
      vendorPartyName: partiesTable.name,
      stagedByUserId: wrrDocuments.stagedByUserId,
      createdAt: wrrDocuments.createdAt,
      confirmedAt: wrrDocuments.confirmedAt,
    })
    .from(wrrDocuments)
    .leftJoin(partiesTable, eq(partiesTable.id, wrrDocuments.vendorPartyId));

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
// listRecentWrrDocuments
//
// Genuinely-recent WRR documents (createdAt DESC), for "Recent Activity"
// feeds. listWrrDocuments above orders ASC (oldest-first, work-queue
// prioritization) so it cannot be reused for a recency-sorted feed —
// see specs/00-steering/ui-ux-design-plan.md data-honesty fix
// (design-system-auditor finding, 2026-08-16).
//
// Authorization is enforced at the call site — not re-checked here.
// ---------------------------------------------------------------------------

export async function listRecentWrrDocuments(
  db: DbLike,
  opts: { limit: number },
): Promise<WrrDocumentRow[]> {
  return (await db
    .select({
      id: wrrDocuments.id,
      wrrNumber: wrrDocuments.wrrNumber,
      status: wrrDocuments.status,
      flowType: wrrDocuments.flowType,
      vendorPartyId: wrrDocuments.vendorPartyId,
      vendorPartyName: partiesTable.name,
      stagedByUserId: wrrDocuments.stagedByUserId,
      createdAt: wrrDocuments.createdAt,
      confirmedAt: wrrDocuments.confirmedAt,
    })
    .from(wrrDocuments)
    .leftJoin(partiesTable, eq(partiesTable.id, wrrDocuments.vendorPartyId))
    .orderBy(desc(wrrDocuments.createdAt))
    .limit(opts.limit)) as WrrDocumentRow[];
}

/** Resolve an exact WRR number for the receiving queue's quick-jump control. */
export async function findWrrDocumentByNumber(
  db: DbLike,
  wrrNumber: string,
): Promise<{ id: string; status: string } | null> {
  const rows = (await db
    .select({ id: wrrDocuments.id, status: wrrDocuments.status })
    .from(wrrDocuments)
    .where(eq(wrrDocuments.wrrNumber, wrrNumber.trim()))
    .limit(1)) as Array<{ id: string; status: string }>;

  return rows[0] ?? null;
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
      confirmedAt: wrrDocuments.confirmedAt,
      // design.md §5.3 print-contract header fields.
      commercialInvoiceNo: wrrDocuments.commercialInvoiceNo,
      ciplFileUrl: wrrDocuments.ciplFileUrl,
      pezaNumber: wrrDocuments.pezaNumber,
      ipNumber: wrrDocuments.ipNumber,
      mawbMblNumber: wrrDocuments.mawbMblNumber,
      vendorPartyName: partiesTable.name,
      vendorPartyCode: partiesTable.code,
      stagedByDisplayName: userProfiles.displayName,
      // Item fields — aliased with "item" prefix to avoid collision
      itemRowId: wrrItems.id,
      itemWrrId: wrrItems.wrrId,
      itemLotNumber: wrrItems.lotNumber,
      itemExpectedQty: wrrItems.expectedQty,
      itemScannedQty: wrrItems.scannedQty,
      itemDisposition: wrrItems.disposition,
      itemItemId: wrrItems.itemId,
      itemItemCode: itemsTable.code,
      itemItemName: itemsTable.name,
      itemSupplierItemCode: wrrItems.itemCode,
      itemCustomerItemCode: wrrItems.customerItemCode,
      itemManufactureDate: wrrItems.manufactureDate,
      itemRemarks: wrrItems.remarks,
      itemUom: wrrItems.uom,
      itemUnitCbm: wrrItems.unitCbm,
      itemPutawayLocationId: wrrItems.putawayLocationId,
      itemCommittedAt: wrrItems.committedAt,
    })
    .from(wrrDocuments)
    .where(eq(wrrDocuments.id, wrrId))
    .leftJoin(partiesTable, eq(partiesTable.id, wrrDocuments.vendorPartyId))
    .leftJoin(userProfiles, eq(userProfiles.id, wrrDocuments.stagedByUserId))
    .leftJoin(wrrItems, eq(wrrItems.wrrId, wrrDocuments.id))
    .leftJoin(itemsTable, eq(itemsTable.id, wrrItems.itemId))) as RawJoinRow[];

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
      lotNumber: row.itemLotNumber ?? "",
      expectedQty: Number(row.itemExpectedQty ?? 0),
      scannedQty: Number(row.itemScannedQty ?? 0),
      disposition: row.itemDisposition ?? "store",
      itemId: row.itemItemId,
      itemCode: row.itemItemCode,
      itemName: row.itemItemName,
      supplierItemCode: row.itemSupplierItemCode,
      customerItemCode: row.itemCustomerItemCode,
      manufactureDate: row.itemManufactureDate,
      remarks: row.itemRemarks,
      uom: row.itemUom ?? "",
      unitCbm: Number(row.itemUnitCbm ?? 0),
      putawayLocationId: row.itemPutawayLocationId,
      committedAt: row.itemCommittedAt,
    }));

  return {
    id: first.id,
    wrrNumber: first.wrrNumber,
    status: first.status,
    flowType: first.flowType,
    commercialInvoiceNo: first.commercialInvoiceNo,
    ciplFileUrl: first.ciplFileUrl,
    pezaNumber: first.pezaNumber,
    ipNumber: first.ipNumber,
    mawbMblNumber: first.mawbMblNumber,
    vendorPartyName: first.vendorPartyName,
    vendorPartyCode: first.vendorPartyCode,
    vendorPartyId: first.vendorPartyId,
    stagedByUserId: first.stagedByUserId,
    stagedByDisplayName: first.stagedByDisplayName,
    createdAt: first.createdAt,
    confirmedAt: first.confirmedAt,
    items,
  };
}
