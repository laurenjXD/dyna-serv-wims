// VMI CBM ledger summary query — office `/billing-pricing` page (VMI tab).
//
// Reads exclusively from the nightly-computed `vmi_daily_balance_ledger`
// (lib/billing/vmi-daily-balance.ts's pipeline output — see
// lib/db/schema/vmi_billing.ts §1.3) and the currently-effective
// `vmi_contract_terms` row per party (§1.1, `effective_to IS NULL`). This
// module performs no billing computation of its own — `avgDailyCbm` is a
// display-only average of the ledger's already-computed `billed_balance_cbm`
// per day, and `subtotal` is the real reference total (a straight SUM of
// `storage_amount_usd`, never recomputed as avg * rate — threshold rules
// mean per-day amounts aren't always a flat multiply, per design.md §2.4/§1.1
// cbm_threshold_type handling).
//
// `lotsInStorage` is a LIVE snapshot (current count of that party's
// `available` lots), not a historical count for the queried month — the
// month/year parameters only scope the ledger/rate lookups.
//
// Cross-party by design: this is an office (`reporting.financial_read`)
// surface, not a party-scoped portal read. No party-scoping filter is
// applied here; the caller's own party never narrows this query. The page
// gates access before calling this module.
//
// Aggregation (avg/sum) is done in application code, not SQL, deliberately:
// it keeps the per-day math unit-testable against a mocked db without a real
// Postgres connection (this codebase's established convention — see
// lib/db/queries/ledgers.ts, lib/billing/vmi-movement-query.ts).

import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  vmiBillingPeriods,
  vmiChargeLines,
  vmiContractTerms,
  vmiDailyBalanceLedger,
  vmiManpowerHoursLog,
  vmiRecurringFeeLines,
} from "@/lib/db/schema/vmi_billing";
import { parties } from "@/lib/db/schema/parties";
import { lots } from "@/lib/db/schema/lots";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VmiCbmLedgerRow = {
  id: string; // partyId — stable React list key
  party: string;
  lotsInStorage: number;
  avgDailyCbm: number;
  ratePerCbm: number;
  subtotal: number;
};

// Minimal structural type the real Drizzle db instance and test stubs both
// satisfy (matches lib/db/queries/ledgers.ts's DbLike precedent).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Internal raw-row types
// ---------------------------------------------------------------------------

type RawLedgerRow = {
  party_id: string;
  party_name: string;
  billed_balance_cbm: string;
  storage_amount_usd: string;
};

// ---------------------------------------------------------------------------
// monthDateBounds — pure helper. `month` is 0-indexed (matches
// `Date.getMonth()` / the page's `MONTHS` array). Returns the calendar
// month's [start, end) boundary as 'YYYY-MM-DD' strings, comparable
// lexicographically against the `date`-typed `ledger_date` column.
// ---------------------------------------------------------------------------

export function monthDateBounds(month: number, year: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const endMonth = month === 11 ? 0 : month + 1;
  const endYear = month === 11 ? year + 1 : year;
  return {
    start: `${year}-${pad(month + 1)}-01`,
    end: `${endYear}-${pad(endMonth + 1)}-01`,
  };
}

// ---------------------------------------------------------------------------
// getVmiCbmLedgerSummary
// ---------------------------------------------------------------------------

export async function getVmiCbmLedgerSummary(
  month: number,
  year: number,
  database: DbLike = db,
): Promise<VmiCbmLedgerRow[]> {
  try {
    const { start, end } = monthDateBounds(month, year);

    const rawRows: RawLedgerRow[] = await database
      .select({
        party_id: vmiDailyBalanceLedger.partyId,
        party_name: parties.name,
        billed_balance_cbm: vmiDailyBalanceLedger.billedBalanceCbm,
        storage_amount_usd: vmiDailyBalanceLedger.storageAmountUsd,
      })
      .from(vmiDailyBalanceLedger)
      .innerJoin(parties, eq(parties.id, vmiDailyBalanceLedger.partyId))
      .where(
        and(
          gte(vmiDailyBalanceLedger.ledgerDate, start),
          lt(vmiDailyBalanceLedger.ledgerDate, end),
        ),
      );

    type Accum = { partyName: string; cbmSum: number; dayCount: number; subtotal: number };
    const byParty = new Map<string, Accum>();
    for (const raw of rawRows) {
      const existing = byParty.get(raw.party_id) ?? {
        partyName: raw.party_name,
        cbmSum: 0,
        dayCount: 0,
        subtotal: 0,
      };
      existing.cbmSum += Number(raw.billed_balance_cbm);
      existing.dayCount += 1;
      existing.subtotal += Number(raw.storage_amount_usd);
      byParty.set(raw.party_id, existing);
    }

    const rows: VmiCbmLedgerRow[] = [];
    for (const [partyId, accum] of byParty) {
      const [rateRow] = (await database
        .select({ rate: vmiContractTerms.storageRatePerCbmDay })
        .from(vmiContractTerms)
        .where(and(eq(vmiContractTerms.partyId, partyId), isNull(vmiContractTerms.effectiveTo)))
        .limit(1)) as { rate: string }[];

      const [lotCountRow] = (await database
        .select({ count: sql<string>`count(*)` })
        .from(lots)
        .where(
          and(
            eq(lots.ownerPartyId, partyId),
            inArray(lots.flowType, ["vmi", "trading"]),
            eq(lots.status, "available"),
          ),
        )) as { count: string }[];

      rows.push({
        id: partyId,
        party: accum.partyName,
        lotsInStorage: Number(lotCountRow?.count ?? 0),
        avgDailyCbm: accum.dayCount > 0 ? accum.cbmSum / accum.dayCount : 0,
        ratePerCbm: rateRow ? Number(rateRow.rate) : 0,
        subtotal: accum.subtotal,
      });
    }

    return rows;
  } catch (error) {
    console.error("Error in getVmiCbmLedgerSummary:", error);
    return [];
  }
}

export type VmiDailyBalanceRow = {
  id: string;
  ledgerDate: string;
  beginningCbm: number;
  inFgCbm: number;
  inRawCbm: number;
  outFgCbm: number;
  outRawCbm: number;
  endingCbm: number;
  billedBalanceCbm: number;
  appliedStorageRateUsd: number;
  storageAmountUsd: number;
};

export async function getVmiDailyBalanceRows(
  partyId: string,
  month: number,
  year: number,
  database: DbLike = db,
): Promise<VmiDailyBalanceRow[]> {
  try {
    const { start, end } = monthDateBounds(month, year);

    const rawRows = (await database
      .select({
        id: vmiDailyBalanceLedger.id,
        ledgerDate: vmiDailyBalanceLedger.ledgerDate,
        beginningCbm: vmiDailyBalanceLedger.beginningCbm,
        inFgCbm: vmiDailyBalanceLedger.inboundCbmFg,
        inRawCbm: vmiDailyBalanceLedger.inboundCbmRawMaterial,
        outFgCbm: vmiDailyBalanceLedger.outboundCbmFg,
        outRawCbm: vmiDailyBalanceLedger.outboundCbmRawMaterial,
        endingCbm: vmiDailyBalanceLedger.endingCbm,
        billedBalanceCbm: vmiDailyBalanceLedger.billedBalanceCbm,
        appliedStorageRateUsd: vmiDailyBalanceLedger.appliedStorageRateUsd,
        storageAmountUsd: vmiDailyBalanceLedger.storageAmountUsd,
      })
      .from(vmiDailyBalanceLedger)
      .where(
        and(
          eq(vmiDailyBalanceLedger.partyId, partyId),
          gte(vmiDailyBalanceLedger.ledgerDate, start),
          lt(vmiDailyBalanceLedger.ledgerDate, end),
        ),
      )) as Record<string, string>[];

    return rawRows.map((r) => ({
      id: r.id,
      ledgerDate: r.ledgerDate,
      beginningCbm: Number(r.beginningCbm),
      inFgCbm: Number(r.inFgCbm),
      inRawCbm: Number(r.inRawCbm),
      outFgCbm: Number(r.outFgCbm),
      outRawCbm: Number(r.outRawCbm),
      endingCbm: Number(r.endingCbm),
      billedBalanceCbm: Number(r.billedBalanceCbm),
      appliedStorageRateUsd: Number(r.appliedStorageRateUsd),
      storageAmountUsd: Number(r.storageAmountUsd),
    }));
  } catch (error) {
    console.error("Error in getVmiDailyBalanceRows:", error);
    return [];
  }
}

export type VmiBillingPeriodRow = {
  id: string;
  periodNumber: string;
  partyId: string;
  partyName: string;
  partyCode: string;
  periodStartDate: string;
  periodEndDate: string;
  status: string;
  billingStatementTotalUsd: number;
  soaClosingBalanceUsd: number;
  lockedExchangeRatePhp: number | null;
  createdAt: string;
};

export async function listVmiBillingPeriods(
  partyId?: string,
  limit = 50,
  database: DbLike = db,
): Promise<VmiBillingPeriodRow[]> {
  try {
    const query = database
      .select({
        id: vmiBillingPeriods.id,
        periodNumber: vmiBillingPeriods.periodNumber,
        partyId: vmiBillingPeriods.partyId,
        partyName: parties.name,
        partyCode: parties.code,
        periodStartDate: vmiBillingPeriods.periodStartDate,
        periodEndDate: vmiBillingPeriods.periodEndDate,
        status: vmiBillingPeriods.status,
        billingStatementTotalUsd: vmiBillingPeriods.billingStatementTotalUsd,
        soaClosingBalanceUsd: vmiBillingPeriods.soaClosingBalanceUsd,
        lockedExchangeRatePhp: vmiBillingPeriods.lockedExchangeRatePhp,
        createdAt: vmiBillingPeriods.createdAt,
      })
      .from(vmiBillingPeriods)
      .innerJoin(parties, eq(parties.id, vmiBillingPeriods.partyId))
      .orderBy(desc(vmiBillingPeriods.createdAt))
      .limit(limit);

    if (partyId) {
      query.where(eq(vmiBillingPeriods.partyId, partyId));
    }

    const rawRows = (await query) as Record<string, any>[];

    return rawRows.map((r) => ({
      id: r.id,
      periodNumber: r.periodNumber,
      partyId: r.partyId,
      partyName: r.partyName,
      partyCode: r.partyCode,
      periodStartDate: r.periodStartDate,
      periodEndDate: r.periodEndDate,
      status: r.status,
      billingStatementTotalUsd: Number(r.billingStatementTotalUsd ?? 0),
      soaClosingBalanceUsd: Number(r.soaClosingBalanceUsd ?? 0),
      lockedExchangeRatePhp: r.lockedExchangeRatePhp ? Number(r.lockedExchangeRatePhp) : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
  } catch (error) {
    console.error("Error in listVmiBillingPeriods:", error);
    return [];
  }
}

export type VmiChargeLineRow = {
  id: string;
  partyId: string;
  chargeType: string;
  amount: number;
  currency: string;
  source: string;
  notes: string | null;
  createdAt: string;
};

export async function getVmiChargeLinesForPeriod(
  partyId: string,
  startDate: string,
  endDate: string,
  database: DbLike = db,
): Promise<VmiChargeLineRow[]> {
  try {
    const rawRows = (await database
      .select({
        id: vmiChargeLines.id,
        partyId: vmiChargeLines.partyId,
        chargeType: vmiChargeLines.chargeType,
        amount: vmiChargeLines.amount,
        currency: vmiChargeLines.currency,
        source: vmiChargeLines.source,
        notes: vmiChargeLines.notes,
        createdAt: vmiChargeLines.createdAt,
      })
      .from(vmiChargeLines)
      .where(
        and(
          eq(vmiChargeLines.partyId, partyId),
          gte(vmiChargeLines.createdAt, new Date(startDate)),
          lte(vmiChargeLines.createdAt, new Date(endDate + "T23:59:59.999Z")),
        ),
      )
      .orderBy(vmiChargeLines.createdAt)) as Record<string, any>[];

    return rawRows.map((r) => ({
      id: r.id,
      partyId: r.partyId,
      chargeType: r.chargeType,
      amount: Number(r.amount ?? 0),
      currency: r.currency,
      source: r.source,
      notes: r.notes,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
  } catch (error) {
    console.error("Error in getVmiChargeLinesForPeriod:", error);
    return [];
  }
}

export type VmiManpowerSummary = {
  hours: number;
  ratePerHour: number;
  totalAmountUsd: number;
  notes: string | null;
};

export async function getVmiManpowerForPeriod(
  partyId: string,
  startDate: string,
  endDate: string,
  database: DbLike = db,
): Promise<VmiManpowerSummary> {
  try {
    const logs = (await database
      .select({
        hours: vmiManpowerHoursLog.hours,
        notes: vmiManpowerHoursLog.notes,
        recurringFeeLineId: vmiManpowerHoursLog.recurringFeeLineId,
      })
      .from(vmiManpowerHoursLog)
      .where(
        and(
          eq(vmiManpowerHoursLog.partyId, partyId),
          eq(vmiManpowerHoursLog.periodStartDate, startDate),
          eq(vmiManpowerHoursLog.periodEndDate, endDate),
        ),
      )
      .limit(1)) as Record<string, any>[];

    if (logs.length === 0) {
      return { hours: 0, ratePerHour: 10, totalAmountUsd: 0, notes: null };
    }

    const log = logs[0];
    const hours = Number(log.hours ?? 0);

    // Get rate from recurring fee line
    const feeLine = (await database
      .select({ rate: vmiRecurringFeeLines.manpowerRatePerHour })
      .from(vmiRecurringFeeLines)
      .where(eq(vmiRecurringFeeLines.id, log.recurringFeeLineId))
      .limit(1)) as Record<string, any>[];

    const ratePerHour = feeLine.length > 0 && feeLine[0].rate ? Number(feeLine[0].rate) : 10;
    const totalAmountUsd = hours * ratePerHour;

    return {
      hours,
      ratePerHour,
      totalAmountUsd,
      notes: log.notes ?? null,
    };
  } catch (error) {
    console.error("Error in getVmiManpowerForPeriod:", error);
    return { hours: 0, ratePerHour: 10, totalAmountUsd: 0, notes: null };
  }
}


