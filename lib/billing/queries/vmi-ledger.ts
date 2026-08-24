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

import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { vmiContractTerms, vmiDailyBalanceLedger } from "@/lib/db/schema/vmi_billing";
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
          eq(lots.flowType, "vmi"),
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
}
