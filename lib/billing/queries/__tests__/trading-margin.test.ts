// Unit tests for lib/billing/queries/trading-margin.ts.
//
// Mocking convention: this codebase's established DbLike-injection pattern
// (see lib/db/queries/ledgers.ts, lib/db/queries/__tests__/locations.test.ts)
// — the query function accepts an optional `database` parameter satisfying a
// minimal `{ select }` structural type, defaulting to the real
// `@/lib/db/client` export in production. Tests pass a stub db directly
// rather than mocking the module.
//
// Covers: empty month (no rows), margin percentage math including the
// divide-by-zero guard, and the raw-row -> TradingMarginRow mapping.

import { describe, expect, it, vi } from "vitest";
import { computeMarginPct, getTradingMarginLedger, monthDateBounds } from "../trading-margin";
import type { AuthorizationContext } from "@/lib/rbac/session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

const internalVisibilityContext = {
  grants: [{ resource: "trading_prices", action: "read_internal", scopeKind: "global" }],
} as unknown as AuthorizationContext;

const noInternalVisibilityContext = {
  grants: [{ resource: "reporting", action: "financial_read", scopeKind: "global" }],
} as unknown as AuthorizationContext;

function makeSelectChain(resolvedRows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
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
    select: vi.fn(() => makeSelectChain(rows)),
  };
}

describe("monthDateBounds (lib/billing/queries/trading-margin.ts)", () => {
  it("returns the [start, end) calendar-month boundary as UTC Date instances (0-indexed month)", () => {
    const { start, end } = monthDateBounds(7, 2026); // August, 0-indexed
    expect(start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rolls over into the next year for December (month=11)", () => {
    const { start, end } = monthDateBounds(11, 2026);
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("computeMarginPct (specs/13-trading-orders-and-pricing)", () => {
  it("computes (sellPrice - cogs) / sellPrice * 100", () => {
    expect(computeMarginPct(48, 32)).toBeCloseTo(33.333, 2);
  });

  it("(AC: divide-by-zero guard) returns 0, never Infinity/NaN, when sellPrice is 0", () => {
    expect(computeMarginPct(0, 32)).toBe(0);
    expect(Number.isFinite(computeMarginPct(0, 32))).toBe(true);
  });

  it("returns 0 margin when sellPrice === cogs", () => {
    expect(computeMarginPct(50, 50)).toBe(0);
  });

  it("returns a negative margin when cogs exceeds sellPrice (a booked loss, not clamped to 0)", () => {
    expect(computeMarginPct(50, 60)).toBeCloseTo(-20, 5);
  });
});

describe("getTradingMarginLedger (specs/13-trading-orders-and-pricing)", () => {
  it("(AC: empty month) returns an empty array when no trading_invoice_lines sale rows fall in the requested month", async () => {
    const database = makeDb([]);

    const result = await getTradingMarginLedger(7, 2026, internalVisibilityContext, database);

    expect(result).toEqual([]);
  });

  it("maps a raw sale-line row to the mock's field shape, converting decimal-string columns to numbers and deriving marginPct", async () => {
    const database = makeDb([
      {
        id: "til-1",
        order_number: "PL-2026-002",
        party_name: "Nexus Distribution Ltd.",
        item_name: "Hydraulic Seal Kit 75mm",
        lot_number: "LOT-2026-003",
        qty: "12.0000",
        sell_price: "48.0000",
        buy_cost: "32.0000",
      },
    ]);

    const result = await getTradingMarginLedger(7, 2026, internalVisibilityContext, database);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "til-1",
        orderNumber: "PL-2026-002",
        party: "Nexus Distribution Ltd.",
        item: "Hydraulic Seal Kit 75mm",
        lot: "LOT-2026-003",
        qty: 12,
        sellPrice: 48,
        cogs: 32,
      }),
    );
    expect(result[0].marginPct).toBeCloseTo(33.333, 2);
  });

  it("(AC: margin visibility, design.md §5/§7a) omits cogs/marginPct entirely — not nulled — for a caller without trading_prices.read_internal/override", async () => {
    const database = makeDb([
      {
        id: "til-1",
        order_number: "PL-2026-002",
        party_name: "Nexus Distribution Ltd.",
        item_name: "Hydraulic Seal Kit 75mm",
        lot_number: "LOT-2026-003",
        qty: "12.0000",
        sell_price: "48.0000",
        buy_cost: "32.0000",
      },
    ]);

    const result = await getTradingMarginLedger(7, 2026, noInternalVisibilityContext, database);

    expect(result).toHaveLength(1);
    expect(result[0].sellPrice).toBe(48);
    expect("cogs" in result[0]).toBe(false);
    expect("marginPct" in result[0]).toBe(false);
  });

  it("falls back to an empty string for orderNumber/lot when the pick-list join has no match, and to 0 for a null sell_price", async () => {
    const database = makeDb([
      {
        id: "til-2",
        order_number: null,
        party_name: "Nexus Distribution Ltd.",
        item_name: "Widget",
        lot_number: null,
        qty: "5.0000",
        sell_price: null,
        buy_cost: "10.0000",
      },
    ]);

    const result = await getTradingMarginLedger(7, 2026, internalVisibilityContext, database);

    expect(result[0].orderNumber).toBe("");
    expect(result[0].lot).toBe("");
    expect(result[0].sellPrice).toBe(0);
    expect(result[0].marginPct).toBe(0); // divide-by-zero guard, sellPrice=0
  });
});
