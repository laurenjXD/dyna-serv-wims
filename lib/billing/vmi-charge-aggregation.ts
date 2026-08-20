// VMI documentation/delivery/ad-hoc charge aggregation — specs/12-vmi-billing
// Task D.3.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.3 — "Implement
//     documentation/delivery aggregation — Sums vmi_charge_lines by type
//     within the period; converts delivery PHP total to USD via the
//     period's locked FX rate. Verified: ₱40,896.00 / 61.71 = $662.71."
//   specs/12-vmi-billing/design.md §2.4 — the exact algorithm under test:
//       "documentation_usd = SUM(vmi_charge_lines.amount WHERE charge_type
//         = 'documentation' AND charge_date within period)
//       delivery_php = SUM(vmi_charge_lines.amount WHERE charge_type =
//         'delivery' AND currency = 'PHP' AND charge_date within period)
//       delivery_usd = delivery_php / period.locked_exchange_rate_php"
//   specs/12-vmi-billing/design.md §2.5 — ad-hoc charge aggregation:
//       "ad_hoc_charges_usd = SUM(vmi_charge_lines.amount WHERE charge_type
//         IN ('handling_and_stripping','cargo_transfer_fee','rtv',
//         'admin_fee','insurance','other') AND charge_date within period,
//         converted to USD)"
//
// This module NEVER queries anything but vmi_charge_lines — Warehousing and
// Handling are always movement-replay aggregates (see ./vmi-handling.ts),
// never charge lines (requirements.md FR-4.1/4.4).
//
// Mirrors lib/billing/vmi-handling.ts's shape: a pure compute function over
// already-typed rows, plus a thin `db`-injected DB-facing orchestration
// function.

import { and, between, eq } from "drizzle-orm";
import { vmiChargeLines } from "@/lib/db/schema/vmi_billing";

// ---------------------------------------------------------------------------
// Ad-hoc charge types — the open list from design.md §2.5 / the
// vmi_charge_type enum, excluding 'documentation' and 'delivery'.
// ---------------------------------------------------------------------------

export const AD_HOC_VMI_CHARGE_TYPES = [
  "handling_and_stripping",
  "cargo_transfer_fee",
  "rtv",
  "admin_fee",
  "insurance",
  "other",
] as const;

type AdHocVmiChargeType = (typeof AD_HOC_VMI_CHARGE_TYPES)[number];

function isAdHocChargeType(value: string): value is AdHocVmiChargeType {
  return (AD_HOC_VMI_CHARGE_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Public types (per the RED-step test file's documented contract)
// ---------------------------------------------------------------------------

export type VmiChargeLineForAggregation = {
  partyId: string;
  chargeType: string;
  amount: number;
  currency: string; // 'USD' | 'PHP'
  chargeDate: string; // 'YYYY-MM-DD'
};

export type VmiChargeAggregationScope = {
  partyId: string;
  periodStartDate: string; // 'YYYY-MM-DD', inclusive
  periodEndDate: string; // 'YYYY-MM-DD', inclusive
  lockedExchangeRatePhp: number;
};

export type VmiChargeAggregationResult = {
  documentationUsd: number;
  deliveryPhp: number;
  deliveryUsd: number;
  adHocChargesUsd: number;
};

// ---------------------------------------------------------------------------
// Converts a single charge-line's amount to USD, given its own currency and
// the period's locked FX rate. Applied defensively per-row rather than
// hardcoding "this bucket is always USD" — see the test file's documented
// reasoning (D.2 currently always writes ad-hoc as USD, but this function
// must not assume that as an invariant baked into the SUM itself).
// ---------------------------------------------------------------------------

function toUsd(amount: number, currency: string, lockedExchangeRatePhp: number): number {
  if (currency === "PHP") {
    return amount / lockedExchangeRatePhp;
  }
  return amount;
}

function isWithinScope(
  line: VmiChargeLineForAggregation,
  scope: VmiChargeAggregationScope,
): boolean {
  return (
    line.partyId === scope.partyId &&
    line.chargeDate >= scope.periodStartDate &&
    line.chargeDate <= scope.periodEndDate
  );
}

// ---------------------------------------------------------------------------
// computeVmiChargeAggregation — pure filter + sum layer (design.md §2.4/§2.5).
// ---------------------------------------------------------------------------

export function computeVmiChargeAggregation(
  chargeLines: VmiChargeLineForAggregation[],
  scope: VmiChargeAggregationScope,
): VmiChargeAggregationResult {
  let documentationUsd = 0;
  let deliveryPhp = 0;
  let deliveryUsd = 0;
  let adHocChargesUsd = 0;

  for (const line of chargeLines) {
    if (!isWithinScope(line, scope)) continue;

    if (line.chargeType === "documentation") {
      documentationUsd += line.amount;
    } else if (line.chargeType === "delivery") {
      deliveryPhp += line.amount;
      deliveryUsd += toUsd(line.amount, line.currency, scope.lockedExchangeRatePhp);
    } else if (isAdHocChargeType(line.chargeType)) {
      adHocChargesUsd += toUsd(line.amount, line.currency, scope.lockedExchangeRatePhp);
    }
    // Any other chargeType (e.g. a hypothetical future 'warehousing'/
    // 'handling' value) is deliberately excluded from every bucket —
    // requirements.md FR-4.1/4.4.
  }

  return { documentationUsd, deliveryPhp, deliveryUsd, adHocChargesUsd };
}

// ---------------------------------------------------------------------------
// getVmiChargeAggregationForPeriod — DB-facing, thin orchestration layer
// (same "db injected explicitly" precedent as vmi-handling.ts's
// getVmiHandlingForPeriod).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VmiChargeAggregationDbLike = { select: (...args: any[]) => any };

type RawChargeLineRow = {
  partyId: string;
  chargeType: string;
  amount: string;
  currency: string;
  chargeDate: string;
};

function mapChargeLineRow(raw: RawChargeLineRow): VmiChargeLineForAggregation {
  return {
    partyId: raw.partyId,
    chargeType: raw.chargeType,
    amount: Number(raw.amount),
    currency: raw.currency,
    chargeDate: raw.chargeDate,
  };
}

export async function getVmiChargeAggregationForPeriod(
  db: VmiChargeAggregationDbLike,
  scope: VmiChargeAggregationScope,
): Promise<VmiChargeAggregationResult> {
  const rawRows: RawChargeLineRow[] = await db
    .select({
      partyId: vmiChargeLines.partyId,
      chargeType: vmiChargeLines.chargeType,
      amount: vmiChargeLines.amount,
      currency: vmiChargeLines.currency,
      chargeDate: vmiChargeLines.chargeDate,
    })
    .from(vmiChargeLines)
    .where(
      and(
        eq(vmiChargeLines.partyId, scope.partyId),
        between(vmiChargeLines.chargeDate, scope.periodStartDate, scope.periodEndDate),
      ),
    );

  const chargeLines = rawRows.map(mapChargeLineRow);

  return computeVmiChargeAggregation(chargeLines, scope);
}
