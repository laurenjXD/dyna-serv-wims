// VMI billing period number generation — specs/12-vmi-billing Task D.7.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.7 — "Implement
//     period-number generation — Format VMI-{YYYY}-{MM}-{PARTY_CODE}
//     (corrections: -R{N}). Verify uniqueness before insert."
//   specs/12-vmi-billing/design.md §3, §2.7.
//   specs/12-vmi-billing/requirements.md FR-9.2.
//   specs/12-vmi-billing/tasks.md Task Group G, G.9.
//
// Mirrors lib/billing/vmi-charge-aggregation.ts's shape: pure format/derive
// functions, plus a thin `db`-injected DB-facing orchestration function.
//
// generateVmiPeriodNumber is DB-facing and determines the next correction
// number N itself, by querying existing vmi_billing_periods.period_number
// rows sharing the same base — never a plain COUNT(*), always
// (highest existing -R{n} suffix) + 1 — and defensively re-checks the
// candidate string isn't already present before returning it. The actual DB
// UNIQUE constraint on period_number remains the final backstop against a
// race between two concurrent close requests.

import { like } from "drizzle-orm";
import { vmiBillingPeriods } from "@/lib/db/schema/vmi_billing";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VmiPeriodNumberRequest = {
  partyCode: string;
  year: number; // e.g. 2026
  month: number; // 1-12
  isCorrection?: boolean; // default false
};

// ---------------------------------------------------------------------------
// formatVmiPeriodNumber — pure format layer (design.md §3).
// 'VMI-{YYYY}-{MM}-{PARTY_CODE}', month zero-padded to 2 digits.
// ---------------------------------------------------------------------------

export function formatVmiPeriodNumber(partyCode: string, year: number, month: number): string {
  const paddedMonth = String(month).padStart(2, "0");
  return `VMI-${year}-${paddedMonth}-${partyCode}`;
}

// ---------------------------------------------------------------------------
// formatVmiCorrectionPeriodNumber — pure format layer (design.md §3, §2.7).
// '{basePeriodNumber}-R{correctionN}'.
// ---------------------------------------------------------------------------

export function formatVmiCorrectionPeriodNumber(
  basePeriodNumber: string,
  correctionN: number,
): string {
  return `${basePeriodNumber}-R${correctionN}`;
}

// ---------------------------------------------------------------------------
// nextVmiCorrectionNumber — pure derive layer.
//
// Given the base period number and the full list of already-existing
// period_number strings for that base (any shape — base, -R1, -R2, or
// unrelated), returns the next correction number: 1 if no correction exists
// yet for this base, else (highest existing -R{n}) + 1.
// ---------------------------------------------------------------------------

export function nextVmiCorrectionNumber(
  existingPeriodNumbers: string[],
  basePeriodNumber: string,
): number {
  const correctionPrefix = `${basePeriodNumber}-R`;
  let highest = 0;

  for (const periodNumber of existingPeriodNumbers) {
    if (!periodNumber.startsWith(correctionPrefix)) continue;

    const suffix = periodNumber.slice(correctionPrefix.length);
    const parsed = Number(suffix);

    if (Number.isInteger(parsed) && parsed > highest) {
      highest = parsed;
    }
  }

  return highest + 1;
}

// ---------------------------------------------------------------------------
// generateVmiPeriodNumber — DB-facing, thin orchestration layer.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VmiPeriodNumberDbLike = { select: (...args: any[]) => any };

type RawPeriodNumberRow = {
  periodNumber: string;
};

export async function generateVmiPeriodNumber(
  db: VmiPeriodNumberDbLike,
  request: VmiPeriodNumberRequest,
): Promise<string> {
  const basePeriodNumber = formatVmiPeriodNumber(request.partyCode, request.year, request.month);

  const rawRows: RawPeriodNumberRow[] = await db
    .select({ periodNumber: vmiBillingPeriods.periodNumber })
    .from(vmiBillingPeriods)
    .where(like(vmiBillingPeriods.periodNumber, `${basePeriodNumber}%`));

  const existingPeriodNumbers = rawRows.map((row) => row.periodNumber);

  if (!request.isCorrection) {
    if (existingPeriodNumbers.includes(basePeriodNumber)) {
      throw new Error(
        `A vmi_billing_periods row with period_number = ${basePeriodNumber} already exists. ` +
          `Period-number collision — refusing to generate a duplicate.`,
      );
    }
    return basePeriodNumber;
  }

  const correctionN = nextVmiCorrectionNumber(existingPeriodNumbers, basePeriodNumber);
  const candidate = formatVmiCorrectionPeriodNumber(basePeriodNumber, correctionN);

  if (existingPeriodNumbers.includes(candidate)) {
    throw new Error(
      `A vmi_billing_periods row with period_number = ${candidate} already exists. ` +
        `Period-number collision — refusing to generate a duplicate.`,
    );
  }

  return candidate;
}
