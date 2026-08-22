// RED-step tests for lib/billing/vmi-forex-lock.ts (does not exist yet —
// Task D.5, from-scratch module).
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.5 — "Implement forex rate
//     locking — Fetch forex_rates where effective_date = generation_date.
//     Block period close with a clear error if absent. Store immutably on
//     vmi_billing_periods."
//   specs/12-vmi-billing/design.md §2.6 step 1 — "Validate: forex_rates row
//     exists for today (generation date); block with a clear error if
//     absent."
//   specs/12-vmi-billing/design.md §2.6 step 6 — "Lock forex:
//     locked_exchange_rate_php = forex_rates.usd_to_php_rate WHERE
//     effective_date = today."
//   specs/12-vmi-billing/requirements.md FR-6.2 — "Forex rate
//     (usd_to_php_rate) is fetched from forex_rates and locked permanently
//     at period-close time. Missing rate blocks period close with a clear
//     error."
//   specs/12-vmi-billing/requirements.md FR-9.1 — a period close snapshots
//     immutable values; the locked rate is one of them (never re-read at
//     display/report time).
//   specs/12-vmi-billing/tasks.md Task Group G, G.10 — "Period closed with
//     rate 61.71 | locked_exchange_rate_php = 61.71 stored immutably";
//     "Retroactive forex_rates update | Already-issued period's locked rate
//     unchanged"; "No forex rate for close date | Period close blocked,
//     clear error."
//
// Acceptance criterion under test (requirements.md FR-6.2, design.md §2.6
// steps 1/6, tasks.md D.5/G.10): the locked rate used by a period close is
// EXACTLY the forex_rates row whose effective_date equals the generation
// (close) date — never any other date's row, and never a silent fallback to
// "whatever the latest row happens to be" when today's row is missing. A
// missing row for the generation date is a hard, clearly-named block, not a
// stale-rate substitution.
//
// ---------------------------------------------------------------------------
// SCHEMA/DEPENDENCY VERIFICATION PERFORMED BEFORE WRITING THIS FILE:
//
//   lib/db/schema/forex.ts (already implemented, 01-core-data-model):
//     forexRates: effectiveDate (date, UNIQUE — so a query filtered to one
//       effective_date can return at most one row), usdToPhpRate (decimal,
//       serializes as a string from the DB, per this codebase's established
//       decimal-column convention — see every other lib/billing/*.ts raw-row
//       mapper), source (varchar, unused by this module).
//     NOTE the real column name is `effective_date` (camelCase
//     `effectiveDate` in Drizzle) — NOT `generation_date`; "generation_date"
//     in design.md §2.6/tasks.md D.5 is the CALLER's concept (the period
//     close's own today-date), matched against forex_rates.effective_date,
//     not a column name on forex_rates itself. Confirmed by reading
//     lib/db/schema/forex.ts directly rather than guessing.
//
//   lib/db/schema/vmi_billing.ts: vmiBillingPeriods.lockedExchangeRatePhp
//     (decimal(10,4)) / lockedExchangeRateDate (date) — this module's
//     output shape is designed to be written directly onto those two
//     columns by D.8's period-close command, per design.md §1.6's own
//     column comment ("this is the value storage_amount_usd was actually
//     priced against" — the analogous precedent for "locked, not re-read").
//
//   lib/billing/vmi-charge-aggregation.ts / vmi-recurring-fee-aggregation.ts
//     (Task D.3/D.4, already implemented) — mirrored for module shape: a
//     pure resolve function over already-typed rows, plus a thin
//     `db`-injected DB-facing orchestration function. This module has no
//     "period scope" to filter by (a single-date lookup, not a date-range
//     sum), so the pure layer is a *resolve*, not a *sum*.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/vmi-forex-lock.ts (for
// backend-builder), established by this RED step:
//
//   export type ForexRateRowForLock = {
//     effectiveDate: string; // 'YYYY-MM-DD'
//     usdToPhpRate: number;
//   };
//
//   export type VmiLockedForexRate = {
//     lockedExchangeRatePhp: number;
//     lockedExchangeRateDate: string; // 'YYYY-MM-DD', always === generationDate
//   };
//
//   // Pure. Finds the row whose effectiveDate === generationDate. Throws a
//   // clear Error naming the missing generationDate if no such row exists —
//   // NEVER falls back to "the latest available row" or "the closest prior
//   // date" or any other substitution.
//   export function resolveLockedForexRate(
//     rates: ForexRateRowForLock[],
//     generationDate: string,
//   ): VmiLockedForexRate;
//
//   // DB-facing, thin orchestration layer (same "db injected explicitly"
//   // precedent as every other lib/billing/*.ts module):
//   //   1. db.select(...).from(forexRates).where(eq(forexRates.effectiveDate,
//   //      generationDate)) -> raw forex_rates row(s) (0 or 1, given the
//   //      column's own UNIQUE constraint).
//   //   2. Map decimal-string usdToPhpRate -> number.
//   //   3. resolveLockedForexRate(mappedRows, generationDate).
//   export type VmiForexLockDbLike = { select: (...args: any[]) => any };
//   export async function getLockedForexRateForClose(
//     db: VmiForexLockDbLike,
//     generationDate: string,
//   ): Promise<VmiLockedForexRate>;
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
  resolveLockedForexRate,
  getLockedForexRateForClose,
  type ForexRateRowForLock,
} from "../vmi-forex-lock";
import { forexRates } from "@/lib/db/schema/forex";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const GENERATION_DATE = "2026-07-01"; // the period-close date, i.e. "today" when close runs

function rateRow(overrides: Partial<ForexRateRowForLock> = {}): ForexRateRowForLock {
  return {
    effectiveDate: GENERATION_DATE,
    usdToPhpRate: 61.71,
    ...overrides,
  };
}

// Raw DB row shape (decimal columns serialize as strings) — mirrors every
// other lib/billing/*.ts raw-row precedent (e.g. vmi-charge-aggregation's
// rawChargeLineRow).
function rawForexRateRow(overrides: Record<string, unknown> = {}) {
  return {
    effectiveDate: GENERATION_DATE,
    usdToPhpRate: "61.7100",
    ...overrides,
  };
}

// Minimal chainable mock query builder — same call-order-based pattern as
// vmi-charge-aggregation.test.ts's makeChain.
function makeChain(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  const resolved = Promise.resolve(rows);
  chain.then = resolved.then.bind(resolved);
  chain.catch = resolved.catch.bind(resolved);
  chain.finally = resolved.finally.bind(resolved);
  return chain;
}

function createMockDb() {
  return { select: vi.fn() };
}

// ---------------------------------------------------------------------------
// resolveLockedForexRate — pure resolve layer.
// ---------------------------------------------------------------------------

describe("resolveLockedForexRate (D.5, pure resolve)", () => {
  it(
    "(AC: design.md §2.6 step 6 / FR-6.2 / G.10 'rate 61.71 stored " +
      "immutably') returns the rate for the row whose effectiveDate matches " +
      "generationDate exactly",
    () => {
      const result = resolveLockedForexRate([rateRow({ usdToPhpRate: 61.71 })], GENERATION_DATE);

      expect(result).toEqual({
        lockedExchangeRatePhp: 61.71,
        lockedExchangeRateDate: GENERATION_DATE,
      });
    },
  );

  it(
    "(AC: design.md §2.6 step 1 / FR-6.2 'block with a clear error' / G.10 " +
      "'No forex rate for close date | Period close blocked, clear error') " +
      "throws a clear error naming the missing generationDate when no row " +
      "exists for that date — never a silent fallback",
    () => {
      expect(() => resolveLockedForexRate([], GENERATION_DATE)).toThrow();

      try {
        resolveLockedForexRate([], GENERATION_DATE);
        throw new Error("expected resolveLockedForexRate to throw, it did not");
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        // The error message must name the actual missing date — a generic
        // "not found" message would fail an operator trying to diagnose why
        // period close is blocked.
        expect((err as Error).message).toContain(GENERATION_DATE);
      }
    },
  );

  it(
    "(AC: 'never a silent fallback to a stale/different date's rate' — the " +
      "task's own explicit instruction) a rate existing for a DIFFERENT " +
      "date is NOT accidentally used when generationDate has no matching " +
      "row — the lookup still throws rather than substituting the nearest " +
      "available date",
    () => {
      const rates = [
        rateRow({ effectiveDate: "2026-06-30", usdToPhpRate: 60.0 }), // day before — must not be used
        rateRow({ effectiveDate: "2026-07-02", usdToPhpRate: 62.0 }), // day after — must not be used
      ];

      expect(() => resolveLockedForexRate(rates, GENERATION_DATE)).toThrow();

      try {
        resolveLockedForexRate(rates, GENERATION_DATE);
      } catch (err) {
        expect((err as Error).message).toContain(GENERATION_DATE);
        // Must not silently mention either wrong-date rate as if it were used.
        expect((err as Error).message).not.toContain("60");
        expect((err as Error).message).not.toContain("62");
      }
    },
  );

  it(
    "(AC: exact-date match only) when multiple rows are passed (defensive — " +
      "forex_rates.effective_date is DB-unique so this should never occur in " +
      "practice), the row matching generationDate is used, not the first row " +
      "in array order",
    () => {
      const rates = [
        rateRow({ effectiveDate: "2026-06-15", usdToPhpRate: 59.0 }),
        rateRow({ effectiveDate: GENERATION_DATE, usdToPhpRate: 61.71 }),
        rateRow({ effectiveDate: "2026-07-15", usdToPhpRate: 63.0 }),
      ];

      const result = resolveLockedForexRate(rates, GENERATION_DATE);

      expect(result.lockedExchangeRatePhp).toBe(61.71);
      expect(result.lockedExchangeRateDate).toBe(GENERATION_DATE);
    },
  );
});

// ---------------------------------------------------------------------------
// getLockedForexRateForClose — DB-facing orchestration.
// ---------------------------------------------------------------------------

describe("getLockedForexRateForClose (D.5, DB-facing orchestration)", () => {
  it(
    "(AC: end-to-end wiring) queries forex_rates for generationDate and " +
      "returns the correctly resolved locked rate",
    async () => {
      const db = createMockDb();
      db.select.mockImplementationOnce(() =>
        makeChain([rawForexRateRow({ effectiveDate: GENERATION_DATE, usdToPhpRate: "61.7100" })]),
      );

      const result = await getLockedForexRateForClose(db as never, GENERATION_DATE);

      expect(result).toEqual({
        lockedExchangeRatePhp: 61.71,
        lockedExchangeRateDate: GENERATION_DATE,
      });
    },
  );

  it("queries the forex_rates table (not some other table) via db.select(...).from(...)", async () => {
    const db = createMockDb();
    const fromCalls: unknown[] = [];

    db.select.mockImplementation(() => {
      const chain = makeChain([rawForexRateRow()]);
      const originalFrom = chain.from;
      chain.from = vi.fn((table: unknown) => {
        fromCalls.push(table);
        return originalFrom(table);
      });
      return chain;
    });

    await getLockedForexRateForClose(db as never, GENERATION_DATE);

    expect(fromCalls).toContain(forexRates);
  });

  it(
    "(AC: design.md §2.6 step 1 / G.10) rejects (does not silently resolve) " +
      "when the DB query returns zero rows for generationDate, with a clear " +
      "error naming the date",
    async () => {
      const db = createMockDb();
      db.select.mockImplementationOnce(() => makeChain([]));

      await expect(getLockedForexRateForClose(db as never, GENERATION_DATE)).rejects.toThrow(
        GENERATION_DATE,
      );
    },
  );

  it(
    "(AC: G.10 'Retroactive forex_rates update | Already-issued period's " +
      "locked rate unchanged' — the underlying guarantee this module must " +
      "provide) resolves strictly against generationDate even when the " +
      "mocked query result includes a row for a different date, proving the " +
      "orchestration layer does not just 'use whatever came back'",
    async () => {
      const db = createMockDb();
      db.select.mockImplementationOnce(() =>
        makeChain([rawForexRateRow({ effectiveDate: "2026-06-30", usdToPhpRate: "60.0000" })]),
      );

      await expect(getLockedForexRateForClose(db as never, GENERATION_DATE)).rejects.toThrow(
        GENERATION_DATE,
      );
    },
  );
});
