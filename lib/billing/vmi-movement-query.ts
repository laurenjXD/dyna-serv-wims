// VMI movement-shaping query — specs/12-vmi-billing Task C.1.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group C, C.1 — "Implement the
//     movement-shaping query over inventory_transactions ... Joins
//     inventory_transactions -> lots -> items, filtered by flow_type = 'vmi'
//     and lots.owner_party_id, resolving direction from movement_type
//     (receiving/putaway -> IN, pick -> OUT; transfer/inventory_reconciliation
//     excluded per design.md §2.1) and category from the lot/item's
//     classification. Unit-testable in isolation (accepts a `db` dependency)."
//   specs/12-vmi-billing/design.md §2.1 (movementDirection/movementCategory/
//     movementCbm/movementParty pseudocode) and §2.2 step 3 (the WHERE clause
//     this query implements: lots.flow_type = 'vmi' AND
//     lots.owner_party_id = :party_id — NOT inventory_transactions.flow_type,
//     which is a separate column that also exists on the table).
//   specs/12-vmi-billing/requirements.md FR-2.1, FR-2.2 ("Category is
//     informational/reporting only — it never changes the applicable rate.")
//
// This is the movement-shaping layer only. The day-by-day replay (beginning/
// ending CBM per day) is a separate module (C.2, lib/billing/vmi-daily-balance.ts).

import { and, eq } from "drizzle-orm";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { lots } from "@/lib/db/schema/lots";
import { items } from "@/lib/db/schema/items";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VmiMovementDirection = "IN" | "OUT";

// Backed by the real items.vmi_movement_category enum column (migration
// 0035_items_vmi_movement_category.sql; lib/db/schema/enums.ts
// vmiMovementCategoryEnum).
export type VmiMovementCategory =
  | "fg"
  | "raw_material"
  | "for_process"
  | "reject"
  | "re_inspect"
  | null;

export type VmiMovementRow = {
  id: string;
  direction: VmiMovementDirection;
  category: VmiMovementCategory;
  cbm: number;
  partyId: string;
  movementType: string;
  qty: number;
  createdAt: Date;
};

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy, matching lib/db/queries/ledgers.ts's existing precedent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Internal raw-row type (what the DB/mock returns before mapping)
// ---------------------------------------------------------------------------

type RawMovementRow = {
  id: string;
  movement_type: string;
  qty: number;
  volume_cbm: number | string;
  owner_party_id: string;
  vmi_movement_category: VmiMovementCategory;
  created_at: Date;
};

// ---------------------------------------------------------------------------
// resolveMovementDirection — pure function (design.md §2.1)
// ---------------------------------------------------------------------------

/**
 * Resolves an IN/OUT direction from a raw movement_type value.
 * 'receiving'/'putaway' -> 'IN'; 'pick' -> 'OUT';
 * 'transfer'/'inventory_reconciliation' -> null (excluded entirely from the
 * party CBM balance — design.md §2.1).
 */
export function resolveMovementDirection(
  movementType: string,
): VmiMovementDirection | null {
  switch (movementType) {
    case "receiving":
    case "putaway":
      return "IN";
    case "pick":
      return "OUT";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// getVmiPartyMovements
// ---------------------------------------------------------------------------

/**
 * Fetches inventory_transactions rows for a single VMI party, joined to
 * lots and items, filtered by lots.flow_type = 'vmi' AND
 * lots.owner_party_id = partyId (design.md §2.2 step 3 — the filter belongs
 * on lots.flow_type, not inventory_transactions' own copy of the column).
 *
 * Shapes each row with:
 *   - direction, resolved via resolveMovementDirection (transfer/
 *     inventory_reconciliation rows are dropped from the returned array
 *     entirely, not returned as any bucket)
 *   - cbm = qty * items.volume_cbm
 *   - partyId = lots.owner_party_id
 *   - category = items.vmi_movement_category (nullable; informational only,
 *     per FR-2.2 — never affects cbm or the applicable rate)
 */
export async function getVmiPartyMovements(
  db: DbLike,
  partyId: string,
): Promise<VmiMovementRow[]> {
  const rawRows: RawMovementRow[] = await db
    .select({
      id: inventoryTransactions.id,
      movement_type: inventoryTransactions.movementType,
      qty: inventoryTransactions.qty,
      volume_cbm: items.volumeCbm,
      owner_party_id: lots.ownerPartyId,
      vmi_movement_category: items.vmiMovementCategory,
      created_at: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .innerJoin(lots, eq(lots.id, inventoryTransactions.lotId))
    .innerJoin(items, eq(items.id, inventoryTransactions.itemId))
    .where(and(eq(lots.flowType, "vmi"), eq(lots.ownerPartyId, partyId)));

  const rows: VmiMovementRow[] = [];
  for (const raw of rawRows) {
    const direction = resolveMovementDirection(raw.movement_type);
    if (direction === null) {
      // transfer / inventory_reconciliation — excluded entirely, per
      // design.md §2.1.
      continue;
    }
    rows.push({
      id: raw.id,
      direction,
      category: raw.vmi_movement_category ?? null,
      cbm: Number(raw.qty) * Number(raw.volume_cbm),
      partyId: raw.owner_party_id,
      movementType: raw.movement_type,
      qty: Number(raw.qty),
      createdAt: raw.created_at,
    });
  }

  return rows;
}
