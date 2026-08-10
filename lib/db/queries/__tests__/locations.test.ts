// RED-step unit tests for suggestPutawayLocations() in lib/db/queries/locations.ts
// (function does not exist yet at time of writing).
//
// Traceability:
//   specs/01-core-data-model/design.md §5 item 10 (Smart Dispersed Putaway
//     Location Recommendation — "queries available storage slots
//     (max_cbm_capacity - occupied_cbm), filtering locations that fit the
//     item's box CBM (volume_cbm)")
//   specs/07-incoming-receiving/design.md §6.2 (store-disposition sequence:
//     "system computes and displays a suggested location using the §10
//     location/capacity suggestion interface (remaining CBM vs. candidate
//     locations)"), §10 (consumes the approved interface, does not create a
//     second capacity calculation)
//
// Scope note: this is the minimal query the floor scan screen needs — one
// best-fit suggestion plus override candidates. It deliberately does NOT
// implement multi-location dispersed split, the inventory preview panel, or
// CBM-utilization-% UI (01 design.md §5 item 10's fuller feature) — those are
// out of scope for this pass.
//
// Drizzle chain mock pattern used in this file:
//
// The production query will look like:
//   const rows = await db.select({...}).from(locations)
//     .leftJoin(lotLocationBalances, ...).where(...).groupBy(...).orderBy(...);
//
// makeSelectChain(rows) — fluent chain where the last call in the production
// chain resolves to `rows` when awaited.

import { describe, expect, it, vi } from "vitest";
import { suggestPutawayLocations } from "../locations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// Fluent chain covering: db.select().from().leftJoin().where().groupBy().orderBy()
// The chain itself is awaitable (thenable) so callers can `await` right after
// the last chain method without a dedicated terminal call.
function makeSelectChain(resolvedRows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "leftJoin", "innerJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  const resolved = Promise.resolve(resolvedRows);
  chain["then"] = resolved.then.bind(resolved) as AnyFn;
  chain["catch"] = resolved.catch.bind(resolved) as AnyFn;
  chain["finally"] = resolved.finally.bind(resolved) as AnyFn;
  return chain;
}

function makeDb(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnValue(makeSelectChain(rows)),
  };
}

function rawLocationRow(overrides: {
  id?: string;
  label?: string;
  locationType?: string;
  maxCbmCapacity?: string;
  occupiedCbm?: string | null;
}) {
  return {
    id: "loc-1",
    label: "A1-01",
    locationType: "storage",
    maxCbmCapacity: "10.0000",
    occupiedCbm: "0.0000",
    ...overrides,
  };
}

describe("suggestPutawayLocations (01 design.md §5 item 10, 07 design.md §6.2/§10)", () => {
  it("returns candidate locations with remainingCbm computed from max_cbm_capacity - occupied_cbm", async () => {
    const db = makeDb([
      rawLocationRow({ id: "loc-1", maxCbmCapacity: "10.0000", occupiedCbm: "3.0000" }),
    ]);

    const result = await suggestPutawayLocations(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { itemUnitCbm: 1, requestedQty: 2 },
    );

    expect(result[0]).toMatchObject({ id: "loc-1", remainingCbm: 7 });
  });

  it("orders candidates best-fit-first (tightest remaining CBM that still satisfies the requirement first)", async () => {
    const db = makeDb([
      rawLocationRow({ id: "loomy", maxCbmCapacity: "20.0000", occupiedCbm: "0.0000" }), // remaining 20
      rawLocationRow({ id: "tight", maxCbmCapacity: "5.0000", occupiedCbm: "2.0000" }), // remaining 3
    ]);

    const result = await suggestPutawayLocations(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { itemUnitCbm: 1, requestedQty: 2 }, // needs 2 cbm; both qualify
    );

    expect(result.map((r) => r.id)).toEqual(["tight", "loomy"]);
  });

  it("excludes a location whose remaining capacity is below the requested CBM", async () => {
    const db = makeDb([
      rawLocationRow({ id: "too-small", maxCbmCapacity: "5.0000", occupiedCbm: "4.5000" }), // remaining 0.5
    ]);

    const result = await suggestPutawayLocations(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { itemUnitCbm: 1, requestedQty: 1 }, // needs 1 cbm, only 0.5 remaining
    );

    expect(result).toHaveLength(0);
  });

  it("treats a location with no lot_location_balances rows (null occupied_cbm) as fully empty", async () => {
    const db = makeDb([
      rawLocationRow({ id: "empty", maxCbmCapacity: "6.0000", occupiedCbm: null }),
    ]);

    const result = await suggestPutawayLocations(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { itemUnitCbm: 2, requestedQty: 3 }, // needs 6 cbm exactly
    );

    expect(result[0]).toMatchObject({ id: "empty", remainingCbm: 6 });
  });

  it("respects the optional limit for how many candidates are returned", async () => {
    const db = makeDb([
      rawLocationRow({ id: "loc-a", maxCbmCapacity: "10.0000", occupiedCbm: "0.0000" }),
      rawLocationRow({ id: "loc-b", maxCbmCapacity: "10.0000", occupiedCbm: "0.0000" }),
      rawLocationRow({ id: "loc-c", maxCbmCapacity: "10.0000", occupiedCbm: "0.0000" }),
    ]);

    const result = await suggestPutawayLocations(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { itemUnitCbm: 1, requestedQty: 1, limit: 2 },
    );

    expect(result).toHaveLength(2);
  });

  it("queries only active storage locations (asserts a where() filter is applied, not a full-table scan)", async () => {
    const dataChain = makeSelectChain([]);
    const db = { select: vi.fn().mockReturnValue(dataChain) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await suggestPutawayLocations(db as any, { itemUnitCbm: 1, requestedQty: 1 });

    const whereFn = dataChain["where"] as ReturnType<typeof vi.fn>;
    expect(whereFn).toHaveBeenCalled();
  });
});
