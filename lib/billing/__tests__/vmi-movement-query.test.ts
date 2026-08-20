// RED-step unit tests for lib/billing/vmi-movement-query.ts (does not exist yet).
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
//     lots.owner_party_id = :party_id).
//   specs/12-vmi-billing/requirements.md FR-2.1, FR-2.2 ("Category is
//     informational/reporting only — it never changes the applicable rate.")
//   specs/12-vmi-billing/tasks.md Task Group G, G.1 rows:
//     "Two VMI parties share the warehouse | Each sees only their own lots'
//     movements" and "transfer/inventory_reconciliation movement types |
//     Excluded from IN/OUT entirely, per design.md §2.1".
//
// Acceptance criteria covered (requirements.md §5):
//   "Daily balance ledger replays inventory_transactions correctly for both
//   billing_timing modes and matches real June fixture data exactly." — this
//   file covers the movement-shaping layer that FR-2's replay is built on top
//   of (C.2, a separate module, owns the day-by-day replay itself).
//
// ---------------------------------------------------------------------------
// SCHEMA VERIFICATION PERFORMED BEFORE WRITING THIS FILE (per assignment):
//
//   lib/db/schema/transactions.ts (inventoryTransactions):
//     movementType: movementTypeEnum("movement_type")   <- real column
//     qty: integer("qty")                                <- real column
//     lotId / itemId / flowType (own copy, NOT used for the vmi filter —
//       see below) all present.
//
//   lib/db/schema/enums.ts (movementTypeEnum):
//     ["receiving", "putaway", "pick", "transfer", "inventory_reconciliation"]
//     — confirms the exact 5 values design.md §2.1 names, spelled exactly
//     as design.md pseudocode uses them.
//
//   lib/db/schema/lots.ts (lots):
//     flowType: flowTypeEnum("flow_type")                <- real column,
//       this is what C.1 filters on ("flow_type = 'vmi'"), NOT
//       inventory_transactions.flowType (both tables carry a flowType column;
//       design.md §2.2 step 3 is explicit that the filter is on
//       `lots.flow_type`, not the transaction's own copy).
//     ownerPartyId: uuid("owner_party_id").references(() => parties.id)
//                                                          <- real column
//
//   lib/db/schema/items.ts (items):
//     volumeCbm: decimal("volume_cbm", ...).notNull()     <- real column,
//       "CBM per box" — this is movementCbm's multiplicand per design.md
//       §2.1 ("movementCbm = qty × items.volume_cbm").
//
//   lib/db/schema/items.ts / lib/db/schema/enums.ts (vmiMovementCategoryEnum,
//   items.vmiMovementCategory):
//     A schema gap was originally found here (design.md §2.1's FG/
//     RAW_MATERIAL/FOR_PROCESS/REJECT/RE_INSPECT classification had no
//     backing column) and has since been resolved: `items.vmi_movement_category`
//     is now a real, nullable enum column — `supabase/migrations/
//     0033_items_vmi_movement_category.sql`, db-migration-verifier-passed,
//     documented in specs/01-core-data-model/design.md §1.1/§1.2 and
//     specs/00-steering/revision-log.md (2026-08-19), specs/12-vmi-billing/
//     tasks.md B.11. Real enum values are lowercase snake_case:
//     'fg' | 'raw_material' | 'for_process' | 'reject' | 're_inspect'
//     (`vmiMovementCategoryEnum` in lib/db/schema/enums.ts). The category
//     tests below now assert against this real column/enum, not a placeholder.
//
//   lib/db/queries/ledgers.ts / __tests__/ledgers.test.ts is this codebase's
//   existing precedent for a "query function accepting a `db` dependency"
//   unit test (DbLike mock + fluent chain), matched here in style.
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/vmi-movement-query.ts (for
// backend-builder):
//
//   export type VmiMovementDirection = "IN" | "OUT";
//
//   // Backed by the real items.vmi_movement_category enum column
//   // (migration 0033; lib/db/schema/enums.ts vmiMovementCategoryEnum).
//   export type VmiMovementCategory =
//     | "fg" | "raw_material" | "for_process" | "reject" | "re_inspect"
//     | null;
//
//   export type VmiMovementRow = {
//     id: string;
//     direction: VmiMovementDirection;
//     category: VmiMovementCategory;
//     cbm: number;
//     partyId: string;
//     movementType: string;
//     qty: number;
//     createdAt: Date;
//   };
//
//   // Pure function — no DB access. 'receiving'/'putaway' -> 'IN';
//   // 'pick' -> 'OUT'; 'transfer'/'inventory_reconciliation' -> null
//   // (caller excludes null-direction rows entirely from the party CBM
//   // balance — design.md §2.1).
//   export function resolveMovementDirection(
//     movementType: string,
//   ): VmiMovementDirection | null;
//
//   export type DbLike = { select: (...args: any[]) => any };
//
//   // Joins inventory_transactions -> lots -> items, filtered by
//   // lots.flow_type = 'vmi' AND lots.owner_party_id = partyId. Returns only
//   // shaped IN/OUT rows — transfer/inventory_reconciliation rows are
//   // resolved to a null direction and dropped from the returned array
//   // entirely (never present as IN, OUT, or any other bucket).
//   export async function getVmiPartyMovements(
//     db: DbLike,
//     partyId: string,
//   ): Promise<VmiMovementRow[]>;
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
  getVmiPartyMovements,
  resolveMovementDirection,
} from "../vmi-movement-query";

// ---------------------------------------------------------------------------
// Mock helpers — DbLike fluent-chain pattern, matching
// lib/db/queries/__tests__/ledgers.test.ts's existing precedent.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// Fluent chain where the LAST call is .where(), which resolves the rows.
// Covers: db.select().from().innerJoin().innerJoin().where()
function makeDataChain(resolvedRows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "innerJoin", "leftJoin"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["where"] = vi.fn().mockResolvedValue(resolvedRows);
  return chain;
}

function makeDb(rows: unknown[]) {
  return {
    select: vi.fn(() => makeDataChain(rows)) as AnyFn,
  };
}

// ---------------------------------------------------------------------------
// Raw row shapes (what the DB/mock returns; direction/category/cbm/party are
// derived by the query function from these fields).
// ---------------------------------------------------------------------------
function rawRow(overrides: {
  id?: string;
  movement_type?: string;
  qty?: number;
  volume_cbm?: number;
  owner_party_id?: string;
  vmi_movement_category?: string | null;
  created_at?: Date;
}) {
  return {
    id: "txn-1",
    movement_type: "receiving",
    qty: 1,
    volume_cbm: 1,
    owner_party_id: "party-a",
    vmi_movement_category: null,
    created_at: new Date("2026-06-01T00:00:00+08:00"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveMovementDirection — pure function (design.md §2.1)
// ---------------------------------------------------------------------------

describe("resolveMovementDirection (C.1, design.md §2.1)", () => {
  it("(AC: receiving -> IN) resolves 'receiving' to 'IN'", () => {
    expect(resolveMovementDirection("receiving")).toBe("IN");
  });

  it("(AC: putaway -> IN) resolves 'putaway' to 'IN'", () => {
    expect(resolveMovementDirection("putaway")).toBe("IN");
  });

  it("(AC: pick -> OUT) resolves 'pick' to 'OUT'", () => {
    expect(resolveMovementDirection("pick")).toBe("OUT");
  });

  it("(AC: transfer excluded) resolves 'transfer' to null (excluded from the party CBM balance)", () => {
    expect(resolveMovementDirection("transfer")).toBeNull();
  });

  it("(AC: inventory_reconciliation excluded) resolves 'inventory_reconciliation' to null (excluded from the party CBM balance)", () => {
    expect(resolveMovementDirection("inventory_reconciliation")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getVmiPartyMovements — direction shaping (design.md §2.1)
// ---------------------------------------------------------------------------

describe("getVmiPartyMovements — direction shaping (C.1, design.md §2.1)", () => {
  it("(AC: receiving row shaped as IN) shapes a 'receiving' row with direction 'IN'", async () => {
    const db = makeDb([rawRow({ id: "txn-in", movement_type: "receiving" })]);

    const result = await getVmiPartyMovements(db as never, "party-a");

    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe("IN");
  });

  it("(AC: putaway row shaped as IN) shapes a 'putaway' row with direction 'IN'", async () => {
    const db = makeDb([rawRow({ id: "txn-putaway", movement_type: "putaway" })]);

    const result = await getVmiPartyMovements(db as never, "party-a");

    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe("IN");
  });

  it("(AC: pick row shaped as OUT) shapes a 'pick' row with direction 'OUT'", async () => {
    const db = makeDb([rawRow({ id: "txn-pick", movement_type: "pick" })]);

    const result = await getVmiPartyMovements(db as never, "party-a");

    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe("OUT");
  });
});

// ---------------------------------------------------------------------------
// getVmiPartyMovements — transfer/inventory_reconciliation exclusion
// (design.md §2.1: "excluded from party CBM balance"; tasks.md G.1)
// ---------------------------------------------------------------------------

describe("getVmiPartyMovements — transfer/inventory_reconciliation exclusion (C.1, design.md §2.1, tasks.md G.1)", () => {
  it("(AC: transfer rows never appear in the shaped output) drops 'transfer' rows entirely, not as IN or OUT", async () => {
    const db = makeDb([
      rawRow({ id: "txn-receiving", movement_type: "receiving" }),
      rawRow({ id: "txn-transfer", movement_type: "transfer" }),
    ]);

    const result = await getVmiPartyMovements(db as never, "party-a");

    expect(result.map((r) => r.id)).toEqual(["txn-receiving"]);
    expect(result.find((r) => r.id === "txn-transfer")).toBeUndefined();
  });

  it("(AC: inventory_reconciliation rows never appear in the shaped output) drops 'inventory_reconciliation' rows entirely, not as IN or OUT", async () => {
    const db = makeDb([
      rawRow({ id: "txn-pick", movement_type: "pick" }),
      rawRow({ id: "txn-recon", movement_type: "inventory_reconciliation" }),
    ]);

    const result = await getVmiPartyMovements(db as never, "party-a");

    expect(result.map((r) => r.id)).toEqual(["txn-pick"]);
    expect(result.find((r) => r.id === "txn-recon")).toBeUndefined();
  });

  it("(AC: mixed batch keeps only receiving/putaway/pick) keeps only IN/OUT-eligible rows out of a mixed batch of all 5 movement types", async () => {
    const db = makeDb([
      rawRow({ id: "txn-receiving", movement_type: "receiving" }),
      rawRow({ id: "txn-putaway", movement_type: "putaway" }),
      rawRow({ id: "txn-pick", movement_type: "pick" }),
      rawRow({ id: "txn-transfer", movement_type: "transfer" }),
      rawRow({ id: "txn-recon", movement_type: "inventory_reconciliation" }),
    ]);

    const result = await getVmiPartyMovements(db as never, "party-a");

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id).sort()).toEqual(
      ["txn-putaway", "txn-pick", "txn-receiving"].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// getVmiPartyMovements — movementCbm = qty x items.volume_cbm (design.md §2.1)
// ---------------------------------------------------------------------------

describe("getVmiPartyMovements — movementCbm = qty x items.volume_cbm (C.1, design.md §2.1)", () => {
  it("(AC: cbm is qty times volume_cbm exactly) computes cbm = 5 x 1.25 = 6.25 from qty and items.volume_cbm", async () => {
    const db = makeDb([rawRow({ id: "txn-cbm", qty: 5, volume_cbm: 1.25 })]);

    const result = await getVmiPartyMovements(db as never, "party-a");

    expect(result[0].cbm).toBeCloseTo(6.25, 6);
  });

  it("(AC: cbm scales with qty) computes a different cbm for a different qty against the same items.volume_cbm", async () => {
    const db = makeDb([rawRow({ id: "txn-cbm-2", qty: 10, volume_cbm: 0.792 })]);

    const result = await getVmiPartyMovements(db as never, "party-a");

    expect(result[0].cbm).toBeCloseTo(7.92, 6);
  });
});

// ---------------------------------------------------------------------------
// getVmiPartyMovements — movementParty = lots.owner_party_id (design.md §2.1)
// ---------------------------------------------------------------------------

describe("getVmiPartyMovements — movementParty = lots.owner_party_id (C.1, design.md §2.1)", () => {
  it("(AC: shaped row carries owner_party_id as partyId) sets partyId to lots.owner_party_id on the shaped row", async () => {
    const db = makeDb([rawRow({ id: "txn-party", owner_party_id: "party-xyz" })]);

    const result = await getVmiPartyMovements(db as never, "party-xyz");

    expect(result[0].partyId).toBe("party-xyz");
  });
});

// ---------------------------------------------------------------------------
// getVmiPartyMovements — flow_type = 'vmi' AND owner_party_id filter
// (design.md §2.2 step 3; tasks.md C.1)
// ---------------------------------------------------------------------------

describe("getVmiPartyMovements — filters by lots.flow_type = 'vmi' and lots.owner_party_id (C.1, design.md §2.2 step 3)", () => {
  it("(AC: filter step is applied, not omitted) calls the Drizzle where() clause when querying a party's movements", async () => {
    const db = makeDb([]);

    await getVmiPartyMovements(db as never, "party-a");

    const dataChain = db.select.mock.results[0].value;
    expect(dataChain.where).toHaveBeenCalled();
  });

  it("(AC: joins lots and items) joins to lots and items via innerJoin, not a bare inventory_transactions scan", async () => {
    const db = makeDb([]);

    await getVmiPartyMovements(db as never, "party-a");

    const dataChain = db.select.mock.results[0].value;
    expect(dataChain.innerJoin).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getVmiPartyMovements — two VMI parties sharing the warehouse: isolation
// (tasks.md G.1: "Each sees only their own lots' movements")
// ---------------------------------------------------------------------------

describe("getVmiPartyMovements — two VMI parties share the warehouse (C.1, tasks.md G.1)", () => {
  it("(AC: querying party A returns only party A's shaped rows) returns rows carrying only the requested party's partyId", async () => {
    const dbForA = makeDb([
      rawRow({ id: "txn-a-1", owner_party_id: "party-a" }),
      rawRow({ id: "txn-a-2", owner_party_id: "party-a" }),
    ]);

    const resultA = await getVmiPartyMovements(dbForA as never, "party-a");

    expect(resultA).toHaveLength(2);
    expect(resultA.every((r) => r.partyId === "party-a")).toBe(true);
  });

  it("(AC: querying party B returns only party B's shaped rows, independent of party A's query) returns a disjoint result set for a second party", async () => {
    const dbForB = makeDb([rawRow({ id: "txn-b-1", owner_party_id: "party-b" })]);

    const resultB = await getVmiPartyMovements(dbForB as never, "party-b");

    expect(resultB).toHaveLength(1);
    expect(resultB[0].partyId).toBe("party-b");
    expect(resultB.some((r) => r.partyId === "party-a")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getVmiPartyMovements — category (FR-2.2: informational/reporting only)
//
// Backed by the real items.vmi_movement_category enum column (migration
// 0033_items_vmi_movement_category.sql; lib/db/schema/enums.ts
// vmiMovementCategoryEnum). Real enum values: 'fg' | 'raw_material' |
// 'for_process' | 'reject' | 're_inspect' — matching design.md §2.1 exactly.
// ---------------------------------------------------------------------------

describe("getVmiPartyMovements — category is present but informational only (C.1/FR-2.2, design.md §2.1)", () => {
  it("(AC: shaped row carries a category field) includes a category field on the shaped output row", async () => {
    const db = makeDb([rawRow({ id: "txn-cat", vmi_movement_category: "fg" })]);

    const result = await getVmiPartyMovements(db as never, "party-a");

    expect(result[0]).toHaveProperty("category");
  });

  it("(AC: category never changes the computed cbm — FR-2.2) computes the identical cbm for two otherwise-identical rows differing only in category", async () => {
    const dbFg = makeDb([
      rawRow({ id: "txn-fg", qty: 4, volume_cbm: 2, vmi_movement_category: "fg" }),
    ]);
    const dbRaw = makeDb([
      rawRow({ id: "txn-raw", qty: 4, volume_cbm: 2, vmi_movement_category: "raw_material" }),
    ]);

    const resultFg = await getVmiPartyMovements(dbFg as never, "party-a");
    const resultRaw = await getVmiPartyMovements(dbRaw as never, "party-a");

    expect(resultFg[0].cbm).toBe(resultRaw[0].cbm);
  });

  it("(AC: unclassified item does not crash the shaping function) returns a row (category null) when items.vmi_movement_category is null, rather than throwing", async () => {
    const db = makeDb([rawRow({ id: "txn-no-cat", vmi_movement_category: null })]);

    const result = await getVmiPartyMovements(db as never, "party-a");

    expect(result).toHaveLength(1);
    expect(result[0].category).toBeNull();
  });
});
