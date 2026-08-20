// VMI daily balance historical backfill utility — specs/12-vmi-billing
// Task C.6.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group C, C.6 — "Implement backfill
//     utility ... Accepts party_id + date_range; reconstructs historical
//     balances by replaying inventory_transactions history (not a
//     lot_inventory_totals-style current-state read), resolving the
//     applicable vmi_contract_terms version for each backfilled date the
//     same way C.3 does ... Manual admin tool, requires explicit
//     confirmation and a notes field."
//   specs/12-vmi-billing/tasks.md A.9 — vmi_contract_terms rate versioning;
//     the nightly job and this backfill utility both resolve "the rate in
//     effect" by date against the party's full version history, never "the
//     current row" — the one deliberate divergence from
//     app/api/internal/vmi-daily-balance/route.ts's (C.4a) active-parties
//     query, which only ever loads the single currently-open version.
//   specs/12-vmi-billing/design.md §1.1, §2.2 step 6.
//   specs/12-vmi-billing/requirements.md FR-1.3, FR-2.1.
//
// This module is a thin DB-facing orchestration layer over the pure C.2/C.3
// compute layer (lib/billing/vmi-daily-balance.ts), mirroring C.1's
// getVmiPartyMovements(db, ...) precedent: db is injected explicitly, not
// imported from @/lib/db/client, so this stays unit-testable without a real
// Postgres connection.

import { and, eq, gte, lte } from "drizzle-orm";
import { vmiContractTerms, vmiDailyBalanceLedger } from "@/lib/db/schema/vmi_billing";
import { resolveManilaDayBoundsUtc } from "@/lib/billing/vmi-manila-time";
// getVmiPartyMovements is imported lazily (dynamic import), inside the
// function body below, not statically at module top level. This is
// deliberate, not stylistic: this module is itself statically imported at
// the top of lib/billing/__tests__/vmi-daily-balance-backfill.test.ts, and
// vitest's vi.mock hoisting transform rewrites that static top-level import
// into a top-level `await import(...)` positioned BEFORE the test file's
// own `const mockGetVmiPartyMovements = vi.fn(); vi.mock(...)` lines (mock
// factories are hoisted to the very top of the file; a plain `const`
// declaration referenced only inside the factory is not). A static
// top-level `import { getVmiPartyMovements } from "@/lib/billing/vmi-movement-query"`
// here would force that mocked module to load — and its factory to run,
// referencing `mockGetVmiPartyMovements` — before that const's declaration
// statement has executed, throwing "Cannot access 'mockGetVmiPartyMovements'
// before initialization". Deferring the import to inside
// backfillVmiDailyBalance's function body (invoked only from within an
// `it(...)` callback, well after the test file's top-level code has fully
// run) avoids the TDZ hazard entirely, without changing the test file.
import type { DbLike, VmiMovementRow } from "@/lib/billing/vmi-movement-query";
import {
  computeVmiDailyBalance,
  type VmiContractTermsVersion,
  type VmiDailyBalanceResult,
} from "@/lib/billing/vmi-daily-balance";

// ---------------------------------------------------------------------------
// Public types (per the RED-step test file's documented contract)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VmiBackfillDbLike = DbLike & { insert: (...args: any[]) => any };

export type VmiBackfillRequest = {
  partyId: string;
  startDate: string; // 'YYYY-MM-DD', Asia/Manila calendar date, inclusive
  endDate: string; // 'YYYY-MM-DD', inclusive
  notes: string; // REQUIRED, non-empty after trim (tasks.md C.6)
  requestedByUserId: string;
};

export type VmiBackfillDayResult = {
  ledgerDate: string;
  status: "inserted" | "skipped_existing";
  balance?: VmiDailyBalanceResult; // present only when status === "inserted"
};

export type VmiBackfillResult = {
  partyId: string;
  days: VmiBackfillDayResult[]; // one entry per date in the range, chronological order
};

// ---------------------------------------------------------------------------
// Asia/Manila calendar-date helpers — shared with
// app/api/internal/vmi-daily-balance/route.ts via lib/billing/vmi-manila-
// time.ts (previously a local duplicate here; consolidated 2026-08-20 to
// remove the drift risk of two independent implementations of the same
// UTC+8 boundary math).
// ---------------------------------------------------------------------------

function addDaysToLedgerDate(ledgerDate: string, days: number): string {
  const d = new Date(`${ledgerDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// computeVmiDailyBalance deliberately performs no display-scale rounding —
// storage_amount_usd is a real USD amount, rounded to cents here at the
// persistence boundary, matching C.4a's own precedent.
function roundToCents(amountUsd: number): number {
  return Math.round(amountUsd * 100) / 100;
}

// ---------------------------------------------------------------------------
// enumerateLedgerDates — pure helper. Enumerates every 'YYYY-MM-DD' calendar
// date from startDate to endDate inclusive, chronological order.
// ---------------------------------------------------------------------------

export function enumerateLedgerDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cursor = startDate;
  const endMs = new Date(`${endDate}T00:00:00.000Z`).getTime();

  while (new Date(`${cursor}T00:00:00.000Z`).getTime() <= endMs) {
    dates.push(cursor);
    cursor = addDaysToLedgerDate(cursor, 1);
  }

  return dates;
}

// ---------------------------------------------------------------------------
// Raw vmi_contract_terms row shape as returned by the DB (decimal columns
// serialize as strings) — mirrors route.ts's own raw-row shape.
// ---------------------------------------------------------------------------

type RawContractVersionRow = {
  id: string;
  partyId: string;
  storageRatePerCbmDay: string;
  billingTiming: VmiContractTermsVersion["billingTiming"];
  cbmThresholdType: VmiContractTermsVersion["cbmThresholdType"];
  cbmThreshold: string | null;
  overThresholdRate: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

function mapContractVersionRow(
  raw: RawContractVersionRow,
): VmiContractTermsVersion {
  return {
    id: raw.id,
    partyId: raw.partyId,
    storageRatePerCbmDay: Number(raw.storageRatePerCbmDay),
    billingTiming: raw.billingTiming,
    cbmThresholdType: raw.cbmThresholdType,
    cbmThreshold: raw.cbmThreshold !== null ? Number(raw.cbmThreshold) : null,
    overThresholdRate:
      raw.overThresholdRate !== null ? Number(raw.overThresholdRate) : null,
    effectiveFrom: raw.effectiveFrom,
    effectiveTo: raw.effectiveTo,
  };
}

// ---------------------------------------------------------------------------
// backfillVmiDailyBalance — orchestration (tasks.md C.6).
// ---------------------------------------------------------------------------

export async function backfillVmiDailyBalance(
  db: VmiBackfillDbLike,
  request: VmiBackfillRequest,
): Promise<VmiBackfillResult> {
  // 1. Validate `notes` FIRST — before any db call at all.
  if (!request.notes || !request.notes.trim()) {
    throw new Error(
      "backfillVmiDailyBalance: a non-empty `notes` field is required " +
        "(tasks.md C.6: manual admin tool, requires explicit confirmation " +
        "and a notes field).",
    );
  }

  const { partyId, startDate, endDate } = request;

  // 2. Existing rows in range — gap-filling only, never overwrite.
  const existingRows: { ledgerDate: string; endingCbm: string }[] = await db
    .select({
      ledgerDate: vmiDailyBalanceLedger.ledgerDate,
      endingCbm: vmiDailyBalanceLedger.endingCbm,
    })
    .from(vmiDailyBalanceLedger)
    .where(
      and(
        eq(vmiDailyBalanceLedger.partyId, partyId),
        gte(vmiDailyBalanceLedger.ledgerDate, startDate),
        lte(vmiDailyBalanceLedger.ledgerDate, endDate),
      ),
    );

  const existingByDate = new Map<string, number>();
  for (const row of existingRows) {
    existingByDate.set(row.ledgerDate, Number(row.endingCbm));
  }

  // 3. Prior-day (day before startDate) ending_cbm seed.
  const dayBeforeStart = addDaysToLedgerDate(startDate, -1);
  const priorRows: { endingCbm: string }[] = await db
    .select({ endingCbm: vmiDailyBalanceLedger.endingCbm })
    .from(vmiDailyBalanceLedger)
    .where(
      and(
        eq(vmiDailyBalanceLedger.partyId, partyId),
        eq(vmiDailyBalanceLedger.ledgerDate, dayBeforeStart),
      ),
    )
    .limit(1);

  let previousEndingCbm: number | null =
    priorRows.length > 0 ? Number(priorRows[0].endingCbm) : null;

  // 4. Party's FULL vmi_contract_terms version history — never filtered to
  // effective_to IS NULL only (the one deliberate divergence from C.4a).
  const rawContractVersions: RawContractVersionRow[] = await db
    .select({
      id: vmiContractTerms.id,
      partyId: vmiContractTerms.partyId,
      storageRatePerCbmDay: vmiContractTerms.storageRatePerCbmDay,
      billingTiming: vmiContractTerms.billingTiming,
      cbmThresholdType: vmiContractTerms.cbmThresholdType,
      cbmThreshold: vmiContractTerms.cbmThreshold,
      overThresholdRate: vmiContractTerms.overThresholdRate,
      effectiveFrom: vmiContractTerms.effectiveFrom,
      effectiveTo: vmiContractTerms.effectiveTo,
    })
    .from(vmiContractTerms)
    .where(eq(vmiContractTerms.partyId, partyId))
    .orderBy(vmiContractTerms.effectiveFrom);

  const contractVersions: VmiContractTermsVersion[] = rawContractVersions.map(
    mapContractVersionRow,
  );

  // 5. Movement history — fetched once, filtered per day below. Lazily
  // imported — see the top-of-file note on why this can't be a static
  // top-level import.
  const { getVmiPartyMovements } = await import("@/lib/billing/vmi-movement-query");
  const allMovements: VmiMovementRow[] = await getVmiPartyMovements(db, partyId);

  // 6. Walk each date in the range, in order.
  const days: VmiBackfillDayResult[] = [];

  for (const ledgerDate of enumerateLedgerDates(startDate, endDate)) {
    const existingEndingCbm = existingByDate.get(ledgerDate);

    if (existingEndingCbm !== undefined) {
      days.push({ ledgerDate, status: "skipped_existing" });
      previousEndingCbm = existingEndingCbm;
      continue;
    }

    const { startUtc, endUtc } = resolveManilaDayBoundsUtc(ledgerDate);
    const dayMovements = allMovements.filter(
      (movement) => movement.createdAt >= startUtc && movement.createdAt < endUtc,
    );

    const balance = computeVmiDailyBalance({
      partyId,
      ledgerDate,
      previousEndingCbm,
      movements: dayMovements,
      contractVersions,
    });

    await db
      .insert(vmiDailyBalanceLedger)
      .values({
        partyId: balance.partyId,
        ledgerDate: balance.ledgerDate,
        beginningCbm: String(balance.beginningCbm),
        inboundCbmFg: String(balance.inboundCbmFg),
        inboundCbmRawMaterial: String(balance.inboundCbmRawMaterial),
        outboundCbmFg: String(balance.outboundCbmFg),
        outboundCbmRawMaterial: String(balance.outboundCbmRawMaterial),
        endingCbm: String(balance.endingCbm),
        billedBalanceCbm: String(balance.billedBalanceCbm),
        appliedStorageRateUsd: String(balance.appliedStorageRateUsd),
        storageAmountUsd: String(roundToCents(balance.storageAmountUsd)),
        calculatedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [vmiDailyBalanceLedger.partyId, vmiDailyBalanceLedger.ledgerDate],
      });

    days.push({ ledgerDate, status: "inserted", balance });
    previousEndingCbm = balance.endingCbm;
  }

  return { partyId, days };
}
