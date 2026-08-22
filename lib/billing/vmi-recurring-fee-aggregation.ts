// VMI recurring-fee aggregation — specs/12-vmi-billing Task D.4.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.4 — "Implement
//     recurring-fee aggregation — Sums active vmi_recurring_fee_lines, with
//     manpower requiring an hours-logged entry for the period, sourced from
//     the new vmi_manpower_hours_log table (B.12) — hours ×
//     manpower_rate_per_hour, converted to USD; $0/omitted when no matching
//     row exists for the period (matching the real June statement's
//     treatment, never an error)."
//   specs/12-vmi-billing/design.md §2.5 — the exact algorithm under test:
//       "recurring_fees_usd = SUM(vmi_recurring_fee_lines.flat_amount_usd
//         WHERE is_active AND fee_type != 'manpower')
//                    + (manpower_hours_logged_this_period ×
//                       manpower_rate_per_hour converted to USD, or 0 if no
//                       hours logged this period)"
//
// This module deliberately never reads/joins vmi_permits — a LOA fee line's
// flat_amount_usd is already kept in sync elsewhere (a future UI concern,
// not this aggregation's job); see the test file's traceability note.
//
// Mirrors lib/billing/vmi-charge-aggregation.ts's shape: a pure compute
// function over already-typed rows, plus a thin `db`-injected DB-facing
// orchestration function issuing two separate db.select() queries before
// calling into the pure layer (the same shape vmi-handling.ts established).

import { and, eq } from "drizzle-orm";
import { vmiRecurringFeeLines, vmiManpowerHoursLog } from "@/lib/db/schema/vmi_billing";

// ---------------------------------------------------------------------------
// Public types (per the RED-step test file's documented contract)
// ---------------------------------------------------------------------------

export type VmiRecurringFeeLineForAggregation = {
  id: string;
  partyId: string;
  feeType: string; // trusted string, not narrowed to the DB enum
  isActive: boolean;
  flatAmountUsd: number | null; // non-manpower types
  manpowerRatePerHour: number | null; // manpower only
  manpowerCurrency: string | null; // manpower only, e.g. 'PHP'
};

export type VmiManpowerHoursLogEntryForAggregation = {
  recurringFeeLineId: string;
  periodStartDate: string; // 'YYYY-MM-DD'
  periodEndDate: string; // 'YYYY-MM-DD'
  hours: number;
};

export type VmiRecurringFeeAggregationScope = {
  partyId: string;
  periodStartDate: string;
  periodEndDate: string;
  lockedExchangeRatePhp: number;
};

export type VmiRecurringFeeLineContribution = {
  recurringFeeLineId: string;
  feeType: string;
  amountUsd: number;
};

export type VmiRecurringFeeAggregationResult = {
  recurringFeesUsd: number;
  lines: VmiRecurringFeeLineContribution[];
};

// ---------------------------------------------------------------------------
// Converts a manpower amount to USD given its native currency and the
// period's locked FX rate.
// ---------------------------------------------------------------------------

function toUsd(amount: number, currency: string | null, lockedExchangeRatePhp: number): number {
  if (currency === "PHP") {
    return amount / lockedExchangeRatePhp;
  }
  return amount;
}

function findMatchingHoursEntry(
  feeLine: VmiRecurringFeeLineForAggregation,
  hoursLogEntries: VmiManpowerHoursLogEntryForAggregation[],
  scope: VmiRecurringFeeAggregationScope,
): VmiManpowerHoursLogEntryForAggregation | undefined {
  return hoursLogEntries.find(
    (entry) =>
      entry.recurringFeeLineId === feeLine.id &&
      entry.periodStartDate === scope.periodStartDate &&
      entry.periodEndDate === scope.periodEndDate,
  );
}

// ---------------------------------------------------------------------------
// computeVmiRecurringFeeAggregation — pure filter + sum layer (design.md §2.5).
// ---------------------------------------------------------------------------

export function computeVmiRecurringFeeAggregation(
  feeLines: VmiRecurringFeeLineForAggregation[],
  hoursLogEntries: VmiManpowerHoursLogEntryForAggregation[],
  scope: VmiRecurringFeeAggregationScope,
): VmiRecurringFeeAggregationResult {
  let recurringFeesUsd = 0;
  const lines: VmiRecurringFeeLineContribution[] = [];

  for (const feeLine of feeLines) {
    if (!feeLine.isActive || feeLine.partyId !== scope.partyId) continue;

    let amountUsd: number;

    if (feeLine.feeType === "manpower") {
      const matchingEntry = findMatchingHoursEntry(feeLine, hoursLogEntries, scope);
      if (matchingEntry && feeLine.manpowerRatePerHour !== null) {
        const nativeAmount = matchingEntry.hours * feeLine.manpowerRatePerHour;
        amountUsd = toUsd(nativeAmount, feeLine.manpowerCurrency, scope.lockedExchangeRatePhp);
      } else {
        amountUsd = 0;
      }
    } else {
      amountUsd = feeLine.flatAmountUsd ?? 0;
    }

    recurringFeesUsd += amountUsd;
    lines.push({
      recurringFeeLineId: feeLine.id,
      feeType: feeLine.feeType,
      amountUsd,
    });
  }

  return { recurringFeesUsd, lines };
}

// ---------------------------------------------------------------------------
// getVmiRecurringFeeAggregationForPeriod — DB-facing, thin orchestration
// layer. Queries vmi_recurring_fee_lines and vmi_manpower_hours_log; never
// queries vmi_permits (see the traceability note above).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VmiRecurringFeeAggregationDbLike = { select: (...args: any[]) => any };

type RawFeeLineRow = {
  id: string;
  partyId: string;
  feeType: string;
  isActive: boolean;
  flatAmountUsd: string | null;
  manpowerRatePerHour: string | null;
  manpowerCurrency: string | null;
};

type RawHoursLogRow = {
  recurringFeeLineId: string;
  periodStartDate: string;
  periodEndDate: string;
  hours: string;
};

function mapFeeLineRow(raw: RawFeeLineRow): VmiRecurringFeeLineForAggregation {
  return {
    id: raw.id,
    partyId: raw.partyId,
    feeType: raw.feeType,
    isActive: raw.isActive,
    flatAmountUsd: raw.flatAmountUsd === null ? null : Number(raw.flatAmountUsd),
    manpowerRatePerHour:
      raw.manpowerRatePerHour === null ? null : Number(raw.manpowerRatePerHour),
    manpowerCurrency: raw.manpowerCurrency,
  };
}

function mapHoursLogRow(raw: RawHoursLogRow): VmiManpowerHoursLogEntryForAggregation {
  return {
    recurringFeeLineId: raw.recurringFeeLineId,
    periodStartDate: raw.periodStartDate,
    periodEndDate: raw.periodEndDate,
    hours: Number(raw.hours),
  };
}

export async function getVmiRecurringFeeAggregationForPeriod(
  db: VmiRecurringFeeAggregationDbLike,
  scope: VmiRecurringFeeAggregationScope,
): Promise<VmiRecurringFeeAggregationResult> {
  const rawFeeLineRows: RawFeeLineRow[] = await db
    .select({
      id: vmiRecurringFeeLines.id,
      partyId: vmiRecurringFeeLines.partyId,
      feeType: vmiRecurringFeeLines.feeType,
      isActive: vmiRecurringFeeLines.isActive,
      flatAmountUsd: vmiRecurringFeeLines.flatAmountUsd,
      manpowerRatePerHour: vmiRecurringFeeLines.manpowerRatePerHour,
      manpowerCurrency: vmiRecurringFeeLines.manpowerCurrency,
    })
    .from(vmiRecurringFeeLines)
    .where(eq(vmiRecurringFeeLines.partyId, scope.partyId));

  const rawHoursLogRows: RawHoursLogRow[] = await db
    .select({
      recurringFeeLineId: vmiManpowerHoursLog.recurringFeeLineId,
      periodStartDate: vmiManpowerHoursLog.periodStartDate,
      periodEndDate: vmiManpowerHoursLog.periodEndDate,
      hours: vmiManpowerHoursLog.hours,
    })
    .from(vmiManpowerHoursLog)
    .where(
      and(
        eq(vmiManpowerHoursLog.partyId, scope.partyId),
        eq(vmiManpowerHoursLog.periodStartDate, scope.periodStartDate),
        eq(vmiManpowerHoursLog.periodEndDate, scope.periodEndDate),
      ),
    );

  const feeLines = rawFeeLineRows.map(mapFeeLineRow);
  const hoursLogEntries = rawHoursLogRows.map(mapHoursLogRow);

  return computeVmiRecurringFeeAggregation(feeLines, hoursLogEntries, scope);
}
