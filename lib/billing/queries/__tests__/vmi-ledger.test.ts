// Unit tests for lib/billing/queries/vmi-ledger.ts.
//
// Mocking convention: this codebase's established DbLike-injection pattern
// (see lib/db/queries/ledgers.ts, lib/db/queries/__tests__/locations.test.ts,
// lib/billing/vmi-movement-query.ts) — the query function accepts an
// optional `database` parameter satisfying a minimal `{ select }` structural
// type, defaulting to the real `@/lib/db/client` export in production. Tests
// pass a stub db directly rather than mocking the module, so no
// `vi.mock("@/lib/db/client")` is needed here.
//
// Covers: empty month (no rows), a party with multiple days averaged
// correctly, and the live lots/contract-terms lookups per party.

import { describe, expect, it, vi } from "vitest";
import { getVmiCbmLedgerSummary, monthDateBounds } from "../vmi-ledger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// Fluent chain covering: db.select().from().innerJoin().where().limit()
// The chain itself is awaitable (thenable) so callers can `await` right
// after the last chain method without a dedicated terminal call.
function makeSelectChain(resolvedRows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  const resolved = Promise.resolve(resolvedRows);
  chain["then"] = resolved.then.bind(resolved) as AnyFn;
  chain["catch"] = resolved.catch.bind(resolved) as AnyFn;
  chain["finally"] = resolved.finally.bind(resolved) as AnyFn;
  return chain;
}

/**
 * Builds a stub db whose `.select()` calls resolve in the order queued via
 * `queue`. The production function calls select() once for the ledger rows,
 * then once per distinct party for the contract-rate lookup and once per
 * distinct party for the live lot count — callers must queue results in
 * that exact order.
 */
function makeDb(queue: unknown[][]) {
  let call = 0;
  return {
    select: vi.fn(() => {
      const rows = queue[call] ?? [];
      call += 1;
      return makeSelectChain(rows);
    }),
  };
}

describe("monthDateBounds (lib/billing/queries/vmi-ledger.ts)", () => {
  it("returns the [start, end) calendar-month boundary for a mid-year month (0-indexed)", () => {
    // month=7 (August, 0-indexed) 2026 -> [2026-08-01, 2026-09-01)
    expect(monthDateBounds(7, 2026)).toEqual({ start: "2026-08-01", end: "2026-09-01" });
  });

  it("rolls over into the next year for December (month=11)", () => {
    expect(monthDateBounds(11, 2026)).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
});

describe("getVmiCbmLedgerSummary (specs/12-vmi-billing)", () => {
  it("(AC: empty month) returns an empty array when no vmi_daily_balance_ledger rows fall in the requested month", async () => {
    const database = makeDb([[]]); // ledger query returns no rows

    const result = await getVmiCbmLedgerSummary(7, 2026, database);

    expect(result).toEqual([]);
    // No per-party follow-up queries should fire when there are no parties.
    expect(database.select).toHaveBeenCalledTimes(1);
  });

  it("(AC: multiple days averaged correctly) averages billed_balance_cbm across a party's ledger days and sums storage_amount_usd as the real subtotal, not avg*rate", async () => {
    const database = makeDb([
      // 1. ledger rows for the month — three days for one party
      [
        { party_id: "party-a", party_name: "Acme Logistics Co.", billed_balance_cbm: "10.0000", storage_amount_usd: "45.0000" },
        { party_id: "party-a", party_name: "Acme Logistics Co.", billed_balance_cbm: "20.0000", storage_amount_usd: "90.0000" },
        { party_id: "party-a", party_name: "Acme Logistics Co.", billed_balance_cbm: "30.0000", storage_amount_usd: "135.0000" },
      ],
      // 2. currently-effective contract rate for party-a
      [{ rate: "4.5000" }],
      // 3. live count of party-a's currently-available lots
      [{ count: "3" }],
    ]);

    const result = await getVmiCbmLedgerSummary(7, 2026, database);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "party-a",
      party: "Acme Logistics Co.",
      lotsInStorage: 3,
      // (10 + 20 + 30) / 3 = 20
      avgDailyCbm: 20,
      ratePerCbm: 4.5,
      // 45 + 90 + 135 = 270 — a real SUM, not avgDailyCbm(20) * rate(4.5) = 90
      subtotal: 270,
    });
  });

  it("(AC: multiple parties handled independently) two parties in the same month each get their own averaged row", async () => {
    const database = makeDb([
      [
        { party_id: "party-a", party_name: "Acme Logistics Co.", billed_balance_cbm: "10.0000", storage_amount_usd: "10.0000" },
        { party_id: "party-b", party_name: "Global Parts Inc.", billed_balance_cbm: "40.0000", storage_amount_usd: "80.0000" },
        { party_id: "party-b", party_name: "Global Parts Inc.", billed_balance_cbm: "60.0000", storage_amount_usd: "120.0000" },
      ],
      [{ rate: "4.5000" }], // party-a rate
      [{ count: "1" }], // party-a lots
      [{ rate: "2.0000" }], // party-b rate
      [{ count: "5" }], // party-b lots
    ]);

    const result = await getVmiCbmLedgerSummary(7, 2026, database);

    expect(result).toHaveLength(2);
    const partyA = result.find((r) => r.id === "party-a");
    const partyB = result.find((r) => r.id === "party-b");
    expect(partyA).toEqual({
      id: "party-a",
      party: "Acme Logistics Co.",
      lotsInStorage: 1,
      avgDailyCbm: 10,
      ratePerCbm: 4.5,
      subtotal: 10,
    });
    expect(partyB).toEqual({
      id: "party-b",
      party: "Global Parts Inc.",
      lotsInStorage: 5,
      avgDailyCbm: 50, // (40 + 60) / 2
      ratePerCbm: 2,
      subtotal: 200,
    });
  });

  it("(AC: no currently-effective contract row) defaults ratePerCbm to 0 rather than throwing when a party has no open vmi_contract_terms row", async () => {
    const database = makeDb([
      [{ party_id: "party-a", party_name: "Acme Logistics Co.", billed_balance_cbm: "10.0000", storage_amount_usd: "10.0000" }],
      [], // no currently-effective contract terms row found
      [{ count: "0" }],
    ]);

    const result = await getVmiCbmLedgerSummary(7, 2026, database);

    expect(result[0].ratePerCbm).toBe(0);
    expect(result[0].lotsInStorage).toBe(0);
  });
});
