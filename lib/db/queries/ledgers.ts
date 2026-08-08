// Movement Ledger and Transaction Ledger query helpers.
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R2.6 (Transaction Ledger),
//     R3.10 (Movement Ledger)
//   specs/06-party-and-item-enrollment/design.md §5b (Transaction Ledger),
//     §6a (Movement Ledger)
//   specs/01-core-data-model/design.md §3 item 4 (location_transaction_ledger and
//     party_transaction_ledger derived read models)
//
// Direction logic (location ledger):
//   to_location_id === locationId  → "in"   (goods arriving)
//   from_location_id === locationId → "out"  (goods leaving)
//
// Reference resolution:
//   Location "in"  → commercial_invoice_no (from WRR)
//   Location "out" → ar_reference_no        (from pick list)
//   Party vendor   → commercial_invoice_no
//   Party customer → ar_reference_no
//   Party vmi_owner→ commercial_invoice_no (owner linked through lot receipt)

import { eq, or, desc, sql } from "drizzle-orm";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { wrrDocuments } from "@/lib/db/schema/wrr";
import { pickLists } from "@/lib/db/schema/pick_lists";
import { lots } from "@/lib/db/schema/lots";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LedgerDirection = "in" | "out";

export type LocationLedgerRow = {
  id: string;
  direction: LedgerDirection;
  reference: string | null;
  movementType: string;
  quantity: string;
  itemId: string | null;
  lotId: string | null;
  performedByUserId: string | null;
  createdAt: Date;
};

export type PartyLedgerRow = {
  id: string;
  partyRole: "vendor" | "customer" | "vmi_owner";
  reference: string | null;
  movementType: string;
  quantity: string;
  itemId: string | null;
  lotId: string | null;
  performedByUserId: string | null;
  createdAt: Date;
};

export type LedgerResult<T> = {
  rows: T[];
  total: number;
};

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy. The actual Drizzle postgres client matches { select: Function }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Internal raw-row types (what the DB/mock returns before mapping)
// ---------------------------------------------------------------------------

type RawLocationRow = {
  id: string;
  from_location_id: string | null;
  to_location_id: string | null;
  commercial_invoice_no: string | null;
  ar_reference_no: string | null;
  movement_type: string;
  quantity: string | number;
  item_id: string | null;
  lot_id: string | null;
  performed_by_user_id: string | null;
  created_at: Date;
};

type RawPartyRow = {
  id: string;
  partyRole: "vendor" | "customer" | "vmi_owner";
  commercial_invoice_no: string | null;
  ar_reference_no: string | null;
  movement_type: string;
  quantity: string | number;
  item_id: string | null;
  lot_id: string | null;
  performed_by_user_id: string | null;
  created_at: Date;
};

// ---------------------------------------------------------------------------
// getLocationTransactionLedger
// ---------------------------------------------------------------------------

/**
 * Fetches paginated inventory_transactions rows connected to locationId
 * (either from_location_id or to_location_id matches), ordered by created_at DESC.
 * Returns { rows, total } where total is the unpaginated match count.
 *
 * Gated by the page's existing locations.read capability at the call site —
 * no new gate here.
 */
export async function getLocationTransactionLedger(
  db: DbLike,
  locationId: string,
  opts: { limit: number; offset: number },
): Promise<LedgerResult<LocationLedgerRow>> {
  // WHERE clause shared between data and count queries
  const whereClause = or(
    eq(inventoryTransactions.toLocationId, locationId),
    eq(inventoryTransactions.fromLocationId, locationId),
  );

  // Data query — joined to WRR and pick-list documents for reference fields
  const rawRows: RawLocationRow[] = await db
    .select({
      id: inventoryTransactions.id,
      from_location_id: inventoryTransactions.fromLocationId,
      to_location_id: inventoryTransactions.toLocationId,
      commercial_invoice_no: inventoryTransactions.commercialInvoiceNo,
      ar_reference_no: inventoryTransactions.arReferenceNo,
      movement_type: inventoryTransactions.movementType,
      quantity: inventoryTransactions.qty,
      item_id: inventoryTransactions.itemId,
      lot_id: inventoryTransactions.lotId,
      performed_by_user_id: inventoryTransactions.performedByUserId,
      created_at: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .leftJoin(wrrDocuments, eq(wrrDocuments.id, inventoryTransactions.wrrId))
    .leftJoin(pickLists, eq(pickLists.id, inventoryTransactions.pickListId))
    .where(whereClause)
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);

  // Count query — same WHERE; no pagination
  const [countRow] = await db
    .select({ count: sql<string>`count(*)` })
    .from(inventoryTransactions)
    .where(whereClause);

  // Map raw rows to typed output
  const rows: LocationLedgerRow[] = rawRows.map((raw) => {
    const direction: LedgerDirection =
      raw.to_location_id === locationId ? "in" : "out";
    const reference =
      direction === "in"
        ? (raw.commercial_invoice_no ?? null)
        : (raw.ar_reference_no ?? null);
    return {
      id: raw.id,
      direction,
      reference,
      movementType: raw.movement_type,
      quantity: String(raw.quantity),
      itemId: raw.item_id ?? null,
      lotId: raw.lot_id ?? null,
      performedByUserId: raw.performed_by_user_id ?? null,
      createdAt: raw.created_at,
    };
  });

  return { rows, total: Number(countRow.count) };
}

// ---------------------------------------------------------------------------
// getPartyTransactionLedger
// ---------------------------------------------------------------------------

/**
 * Fetches paginated inventory_transactions rows connected to partyId as
 * vendor (via wrr_documents.vendor_party_id), customer (via
 * pick_lists.customer_party_id), or VMI owner (via lots.owner_party_id).
 * Ordered by created_at DESC. Returns { rows, total } where total is the
 * unpaginated count.
 *
 * Gated by the page's existing parties.read capability at the call site —
 * no new gate here.
 */
export async function getPartyTransactionLedger(
  db: DbLike,
  partyId: string,
  opts: { limit: number; offset: number },
): Promise<LedgerResult<PartyLedgerRow>> {
  // WHERE: union of all three party-connection roles
  const whereClause = or(
    eq(wrrDocuments.vendorPartyId, partyId),
    eq(pickLists.customerPartyId, partyId),
    eq(lots.ownerPartyId, partyId),
  );

  // Data query — compute partyRole via a CASE expression driven by the JOINs
  const rawRows: RawPartyRow[] = await db
    .select({
      id: inventoryTransactions.id,
      partyRole: sql<"vendor" | "customer" | "vmi_owner">`
        CASE
          WHEN ${wrrDocuments.vendorPartyId} = ${partyId} THEN 'vendor'
          WHEN ${pickLists.customerPartyId} = ${partyId} THEN 'customer'
          ELSE 'vmi_owner'
        END
      `.as("partyRole"),
      commercial_invoice_no: inventoryTransactions.commercialInvoiceNo,
      ar_reference_no: inventoryTransactions.arReferenceNo,
      movement_type: inventoryTransactions.movementType,
      quantity: inventoryTransactions.qty,
      item_id: inventoryTransactions.itemId,
      lot_id: inventoryTransactions.lotId,
      performed_by_user_id: inventoryTransactions.performedByUserId,
      created_at: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .leftJoin(wrrDocuments, eq(wrrDocuments.id, inventoryTransactions.wrrId))
    .leftJoin(pickLists, eq(pickLists.id, inventoryTransactions.pickListId))
    .leftJoin(lots, eq(lots.id, inventoryTransactions.lotId))
    .where(whereClause)
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);

  // Count query — same WHERE; no pagination
  const [countRow] = await db
    .select({ count: sql<string>`count(*)` })
    .from(inventoryTransactions)
    .leftJoin(wrrDocuments, eq(wrrDocuments.id, inventoryTransactions.wrrId))
    .leftJoin(pickLists, eq(pickLists.id, inventoryTransactions.pickListId))
    .leftJoin(lots, eq(lots.id, inventoryTransactions.lotId))
    .where(whereClause);

  // Map raw rows to typed output.
  // Reference resolution: vendor → commercial_invoice_no;
  //   customer → ar_reference_no; vmi_owner → commercial_invoice_no (receipt).
  // Using coalesce to handle either field being present on the row.
  const rows: PartyLedgerRow[] = rawRows.map((raw) => {
    const reference =
      raw.partyRole === "customer"
        ? (raw.ar_reference_no ?? null)
        : (raw.commercial_invoice_no ?? null);
    return {
      id: raw.id,
      partyRole: raw.partyRole,
      reference,
      movementType: raw.movement_type,
      quantity: String(raw.quantity),
      itemId: raw.item_id ?? null,
      lotId: raw.lot_id ?? null,
      performedByUserId: raw.performed_by_user_id ?? null,
      createdAt: raw.created_at,
    };
  });

  return { rows, total: Number(countRow.count) };
}
