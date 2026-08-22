// VMI forex rate locking — specs/12-vmi-billing Task D.5.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.5 — "Implement forex rate
//     locking — Fetch forex_rates where effective_date = generation_date.
//     Block period close with a clear error if absent. Store immutably on
//     vmi_billing_periods."
//   specs/12-vmi-billing/design.md §2.6 steps 1/6.
//   specs/12-vmi-billing/requirements.md FR-6.2, FR-9.1.
//   specs/12-vmi-billing/tasks.md Task Group G, G.10.
//
// Mirrors lib/billing/vmi-charge-aggregation.ts's shape: a pure resolve
// function over already-typed rows, plus a thin `db`-injected DB-facing
// orchestration function. Unlike the aggregation modules, this is a
// single-date lookup, not a date-range sum — so the pure layer resolves a
// single row rather than summing a set.

import { eq } from "drizzle-orm";
import { forexRates } from "@/lib/db/schema/forex";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ForexRateRowForLock = {
  effectiveDate: string; // 'YYYY-MM-DD'
  usdToPhpRate: number;
};

export type VmiLockedForexRate = {
  lockedExchangeRatePhp: number;
  lockedExchangeRateDate: string; // 'YYYY-MM-DD', always === generationDate
};

// ---------------------------------------------------------------------------
// resolveLockedForexRate — pure resolve layer (design.md §2.6 step 6).
//
// Finds the row whose effectiveDate === generationDate. Throws a clear Error
// naming the missing generationDate if no such row exists — NEVER falls back
// to "the latest available row" or "the closest prior date" or any other
// substitution.
// ---------------------------------------------------------------------------

export function resolveLockedForexRate(
  rates: ForexRateRowForLock[],
  generationDate: string,
): VmiLockedForexRate {
  const match = rates.find((rate) => rate.effectiveDate === generationDate);

  if (!match) {
    throw new Error(
      `No forex_rates row found for effective_date = ${generationDate}. ` +
        `Period close is blocked until a forex rate is recorded for this date.`,
    );
  }

  return {
    lockedExchangeRatePhp: match.usdToPhpRate,
    lockedExchangeRateDate: generationDate,
  };
}

// ---------------------------------------------------------------------------
// getLockedForexRateForClose — DB-facing, thin orchestration layer (same
// "db injected explicitly" precedent as every other lib/billing/*.ts
// module).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VmiForexLockDbLike = { select: (...args: any[]) => any };

type RawForexRateRow = {
  effectiveDate: string;
  usdToPhpRate: string;
};

function mapForexRateRow(raw: RawForexRateRow): ForexRateRowForLock {
  return {
    effectiveDate: raw.effectiveDate,
    usdToPhpRate: Number(raw.usdToPhpRate),
  };
}

export async function getLockedForexRateForClose(
  db: VmiForexLockDbLike,
  generationDate: string,
): Promise<VmiLockedForexRate> {
  const rawRows: RawForexRateRow[] = await db
    .select({
      effectiveDate: forexRates.effectiveDate,
      usdToPhpRate: forexRates.usdToPhpRate,
    })
    .from(forexRates)
    .where(eq(forexRates.effectiveDate, generationDate));

  const rates = rawRows.map(mapForexRateRow);

  return resolveLockedForexRate(rates, generationDate);
}
