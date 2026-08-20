// RED-step tests for lib/billing/vmi-handling.ts (does not exist yet —
// Task D.1, from-scratch module).
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.1 — "Implement handling
//     aggregation — File: lib/billing/vmi-handling.ts. For each
//     vmi_daily_balance_ledger row in the period, resolve the
//     vmi_contract_terms version effective on that row's ledger_date and
//     price that day's IN/OUT CBM against it, then sum across the period —
//     per design.md §2.3 (not a flat total_cbm × current contract rate; see
//     A.9 for why). Verified against the June fixture (single contract
//     version active all period, so this reduces to the simple form):
//     157.18 × 1.40 = 220.05; 262.96 × 1.40 = 368.14."
//   specs/12-vmi-billing/design.md §2.3 (corrected 2026-08-19 as part of the
//     A.9 rate-versioning fix) — the exact algorithm under test:
//       "For each vmi_daily_balance_ledger row in the period (grouped by
//       ledger_date):
//         day_contract = vmi_contract_terms WHERE party_id = :party_id
//           AND effective_from <= ledger_date AND (effective_to IS NULL OR
//           effective_to > ledger_date)
//         daily_handling_in_usd  = (in_fg + in_raw)   × day_contract.handling_in_rate_per_cbm
//         daily_handling_out_usd = (out_fg + out_raw) × day_contract.handling_out_rate_per_cbm
//       handling_in_usd  = SUM(daily_handling_in_usd)  across the period
//       handling_out_usd = SUM(daily_handling_out_usd) across the period
//       When no rate change occurs within a period, day_contract resolves to
//       the same single version for every day and this reduces exactly to
//       total_cbm × rate — which is what the June fixture exercises, since
//       no rate change occurred that month."
//   specs/12-vmi-billing/requirements.md FR-4.1 — "Handling is computed
//     directly from movement replay, aggregated over the period, priced
//     day-by-day against whichever vmi_contract_terms version was effective
//     on that specific day (per FR-1.3) then summed ... Not an
//     individually-entered charge line per shipment ... the real statement's
//     Handling total is a period aggregate ... not a sum of manual per-DR
//     entries." This is the acceptance criterion this whole file protects.
//   specs/12-vmi-billing/requirements.md FR-1.3 / tasks.md A.9 — the
//     point-in-time rate-versioning model Handling must honor exactly like
//     Storage (C.3) already does: "a rate edit never overwrites ... history
//     ... this is what keeps a mid-period or after-the-fact rate change from
//     ever retroactively repricing a day that already happened, for
//     storage, handling, and the documentation default alike."
//   specs/12-vmi-billing/tasks.md Task Group G, G.4 — "June fixture handling
//     totals | handling_in_usd = $220.05, handling_out_usd = $368.14
//     exactly"; "Different in/out rates configured | Each direction prices
//     independently"; "Handling rate changed mid-period | Days before the
//     change price at the old handling rate, days on/after at the new rate
//     — the exact regression case this rewrite's A.9 decision exists to
//     cover"; "Handling never appears as a vmi_charge_lines row | No query
//     in the handling calculation path reads vmi_charge_lines."
//
// Acceptance criterion under test (requirements.md FR-4.1, tasks.md D.1/G.4):
// handling is a period-aggregate computed from movement replay, priced
// DAY-BY-DAY against whichever vmi_contract_terms version was effective on
// that specific ledger_date, then summed — never a flat
// total_cbm × current/latest contract rate, and never sourced from
// vmi_charge_lines at all.
//
// ---------------------------------------------------------------------------
// SCHEMA/DEPENDENCY VERIFICATION PERFORMED BEFORE WRITING THIS FILE:
//
//   lib/billing/vmi-daily-balance.ts (Task C.2/C.3, already implemented):
//     resolveContractTermsForDate(versions, ledgerDate) is THE point-in-time
//     rate resolver ("WHERE effective_from <= X AND (effective_to IS NULL OR
//     effective_to > X)", never "the current row") — this module must reuse
//     it, not reimplement date-boundary logic a second time (per the task
//     brief). VmiContractTermsVersion there has no handling-rate fields
//     (storageRatePerCbmDay/billingTiming/threshold fields only), so this
//     module's own contract-version type carries handlingInRatePerCbm/
//     handlingOutRatePerCbm alongside the same effectiveFrom/effectiveTo
//     shape resolveContractTermsForDate operates on structurally.
//
//   lib/db/schema/vmi_billing.ts:
//     vmiDailyBalanceLedger: partyId, ledgerDate (date, 'YYYY-MM-DD'),
//       inboundCbmFg, inboundCbmRawMaterial, outboundCbmFg,
//       outboundCbmRawMaterial (all decimal — serialize as strings from the
//       DB, same convention as vmi-daily-balance-backfill.ts's raw-row
//       mapping).
//     vmiContractTerms: handlingInRatePerCbm, handlingOutRatePerCbm (decimal,
//       independently configurable per §1.1), effectiveFrom/effectiveTo
//       (version-history boundaries).
//     vmiChargeLines: the table this module's DB-facing query path must
//       NEVER touch (requirements.md FR-4.1: "Not an individually-entered
//       charge line per shipment").
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/vmi-handling.ts (for
// backend-builder), established by this RED step:
//
//   export type VmiHandlingContractVersion = {
//     handlingInRatePerCbm: number;
//     handlingOutRatePerCbm: number;
//     effectiveFrom: Date;
//     effectiveTo: Date | null; // null = currently open-ended
//   };
//
//   export type VmiHandlingLedgerDay = {
//     ledgerDate: string; // 'YYYY-MM-DD'
//     inboundCbmFg: number;
//     inboundCbmRawMaterial: number;
//     outboundCbmFg: number;
//     outboundCbmRawMaterial: number;
//   };
//
//   export type VmiDailyHandlingResult = {
//     ledgerDate: string;
//     dailyHandlingInUsd: number;
//     dailyHandlingOutUsd: number;
//   };
//
//   export type VmiHandlingPeriodResult = {
//     handlingInUsd: number;
//     handlingOutUsd: number;
//     days: VmiDailyHandlingResult[];
//   };
//
//   // Pure — resolves the contract version effective ON day.ledgerDate (by
//   // reusing resolveContractTermsForDate from ./vmi-daily-balance, not a
//   // reimplementation) and prices that single day's IN/OUT CBM against it.
//   // Throws if no version covers day.ledgerDate (mirrors
//   // computeVmiDailyBalance's own precedent — appliedStorageRateUsd-style
//   // NOT NULL columns have no valid value to produce without a resolvable
//   // rate).
//   export function computeDailyHandling(
//     day: VmiHandlingLedgerDay,
//     contractVersions: VmiHandlingContractVersion[],
//   ): VmiDailyHandlingResult;
//
//   // Pure — calls computeDailyHandling for every row, sums.
//   export function computeVmiHandlingForPeriod(
//     ledgerRows: VmiHandlingLedgerDay[],
//     contractVersions: VmiHandlingContractVersion[],
//   ): VmiHandlingPeriodResult;
//
//   // DB-facing, thin orchestration layer (same "db injected explicitly"
//   // precedent as vmi-daily-balance-backfill.ts's backfillVmiDailyBalance):
//   //   1. db.select(...).from(vmiDailyBalanceLedger).where(partyId,
//   //      ledgerDate BETWEEN periodStartDate/periodEndDate) -> ledger rows.
//   //   2. db.select(...).from(vmiContractTerms).where(partyId)
//   //      .orderBy(effectiveFrom) -> the party's FULL version history
//   //      (never filtered to effective_to IS NULL only — same reasoning as
//   //      C.6's backfill divergence from C.4a: a period may span a rate
//   //      change).
//   //   3. computeVmiHandlingForPeriod(mappedLedgerRows, mappedVersions).
//   //   NEVER selects from vmiChargeLines — requirements.md FR-4.1.
//   export type VmiHandlingDbLike = { select: (...args: any[]) => any };
//   export async function getVmiHandlingForPeriod(
//     db: VmiHandlingDbLike,
//     partyId: string,
//     periodStartDate: string,
//     periodEndDate: string,
//   ): Promise<VmiHandlingPeriodResult>;
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
  computeDailyHandling,
  computeVmiHandlingForPeriod,
  getVmiHandlingForPeriod,
  type VmiHandlingContractVersion,
  type VmiHandlingLedgerDay,
} from "../vmi-handling";
import { vmiChargeLines } from "@/lib/db/schema/vmi_billing";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function ledgerDay(overrides: Partial<VmiHandlingLedgerDay> = {}): VmiHandlingLedgerDay {
  return {
    ledgerDate: "2026-06-01",
    inboundCbmFg: 0,
    inboundCbmRawMaterial: 0,
    outboundCbmFg: 0,
    outboundCbmRawMaterial: 0,
    ...overrides,
  };
}

function contractVersion(
  overrides: Partial<VmiHandlingContractVersion> = {},
): VmiHandlingContractVersion {
  return {
    handlingInRatePerCbm: 1.4,
    handlingOutRatePerCbm: 1.4,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    ...overrides,
  };
}

// Raw DB row shapes (decimal columns serialize as strings) — mirrors
// vmi-daily-balance-backfill.ts's rawContractVersion()/mapContractVersionRow
// precedent exactly.
function rawLedgerRow(overrides: Record<string, unknown> = {}) {
  return {
    ledgerDate: "2026-06-01",
    inboundCbmFg: "0",
    inboundCbmRawMaterial: "0",
    outboundCbmFg: "0",
    outboundCbmRawMaterial: "0",
    ...overrides,
  };
}

function rawHandlingContractVersion(overrides: Record<string, unknown> = {}) {
  return {
    handlingInRatePerCbm: "1.40",
    handlingOutRatePerCbm: "1.40",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    ...overrides,
  };
}

// Minimal chainable mock query builder — same call-order-based pattern as
// vmi-daily-balance-backfill.test.ts's makeChain.
function makeChain(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
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
// computeDailyHandling — the per-day primitive (design.md §2.3's inner loop
// body).
// ---------------------------------------------------------------------------

describe("computeDailyHandling (D.1, pure per-day primitive)", () => {
  it(
    "(AC: FR-4.1/design.md §2.3) resolves the vmi_contract_terms version " +
      "effective on the row's OWN ledger_date and prices that day's " +
      "(in_fg + in_raw) and (out_fg + out_raw) independently against " +
      "handling_in_rate_per_cbm / handling_out_rate_per_cbm",
    () => {
      const day = ledgerDay({
        ledgerDate: "2026-06-05",
        inboundCbmFg: 6,
        inboundCbmRawMaterial: 4,
        outboundCbmFg: 3,
        outboundCbmRawMaterial: 2,
      });

      const result = computeDailyHandling(day, [
        contractVersion({ handlingInRatePerCbm: 2, handlingOutRatePerCbm: 5 }),
      ]);

      expect(result.ledgerDate).toBe("2026-06-05");
      // (6 + 4) * 2 = 20
      expect(result.dailyHandlingInUsd).toBeCloseTo(20, 6);
      // (3 + 2) * 5 = 25
      expect(result.dailyHandlingOutUsd).toBeCloseTo(25, 6);
    },
  );

  it(
    "(AC: FR-1.3/A.9 point-in-time safety) throws when no vmi_contract_terms " +
      "version covers the row's ledger_date, rather than silently falling " +
      "back to some other version",
    () => {
      const day = ledgerDay({ ledgerDate: "2025-01-01" }); // before any version starts

      expect(() =>
        computeDailyHandling(day, [
          contractVersion({ effectiveFrom: new Date("2026-01-01T00:00:00.000Z") }),
        ]),
      ).toThrow();
    },
  );
});

// ---------------------------------------------------------------------------
// computeVmiHandlingForPeriod — the period aggregate (design.md §2.3's outer
// sum).
// ---------------------------------------------------------------------------

describe("computeVmiHandlingForPeriod (D.1, pure period aggregate)", () => {
  // -------------------------------------------------------------------
  // THE REAL JUNE FIXTURE REGRESSION CASE (tasks.md D.1's own citation,
  // G.4's exact pass condition).
  // -------------------------------------------------------------------
  it(
    "(AC: tasks.md D.1/G.4 — real June fixture) with a single contract " +
      "version active for the whole period, reproduces " +
      "handling_in_usd = $220.05 (157.18 x 1.40) and " +
      "handling_out_usd = $368.14 (262.96 x 1.40) exactly, matching the " +
      "reduced simple form design.md §2.3 describes",
    () => {
      const ledgerRows: VmiHandlingLedgerDay[] = [
        ledgerDay({
          ledgerDate: "2026-06-01",
          inboundCbmFg: 100,
          inboundCbmRawMaterial: 57.18, // in total = 157.18
          outboundCbmFg: 200,
          outboundCbmRawMaterial: 62.96, // out total = 262.96
        }),
      ];

      const result = computeVmiHandlingForPeriod(ledgerRows, [
        contractVersion({ handlingInRatePerCbm: 1.4, handlingOutRatePerCbm: 1.4 }),
      ]);

      expect(result.handlingInUsd).toBeCloseTo(220.05, 2);
      expect(result.handlingOutUsd).toBeCloseTo(368.14, 2);
    },
  );

  // -------------------------------------------------------------------
  // THE LOAD-BEARING NEW CASE — a mid-period handling-rate change. This is
  // the exact regression this A.9-driven rewrite of §2.3 exists to cover
  // (tasks.md D.1, G.4: "Handling rate changed mid-period | Days before the
  // change price at the old handling rate, days on/after at the new rate").
  // -------------------------------------------------------------------
  it(
    "(AC: THE A.9/§2.3 load-bearing case — mid-period handling rate change) " +
      "days before the change price at the OLD rate, days on/after price at " +
      "the NEW rate, and the period sum is the BLENDED total — never the " +
      "old rate applied to everything, and never the new/current rate " +
      "applied to everything (the exact 'flat total_cbm x current_rate' bug " +
      "this rewrite exists to prevent)",
    () => {
      const oldVersion = contractVersion({
        handlingInRatePerCbm: 1.0,
        handlingOutRatePerCbm: 2.0,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-06-15T00:00:00.000Z"),
      });
      const newVersion = contractVersion({
        handlingInRatePerCbm: 3.0,
        handlingOutRatePerCbm: 4.0,
        effectiveFrom: new Date("2026-06-15T00:00:00.000Z"),
        effectiveTo: null,
      });

      const ledgerRows: VmiHandlingLedgerDay[] = [
        // Before the change: prices at the OLD rate.
        ledgerDay({
          ledgerDate: "2026-06-01",
          inboundCbmFg: 50,
          outboundCbmFg: 30,
        }),
        // On/after the change: prices at the NEW rate.
        ledgerDay({
          ledgerDate: "2026-06-20",
          inboundCbmFg: 50,
          outboundCbmFg: 30,
        }),
      ];

      const result = computeVmiHandlingForPeriod(ledgerRows, [oldVersion, newVersion]);

      // Per-day breakdown proves each day resolved its OWN version.
      expect(result.days).toEqual([
        expect.objectContaining({
          ledgerDate: "2026-06-01",
          dailyHandlingInUsd: 50, // 50 * 1.00 (old)
          dailyHandlingOutUsd: 60, // 30 * 2.00 (old)
        }),
        expect.objectContaining({
          ledgerDate: "2026-06-20",
          dailyHandlingInUsd: 150, // 50 * 3.00 (new)
          dailyHandlingOutUsd: 120, // 30 * 4.00 (new)
        }),
      ]);

      // Blended period sum: 50 + 150 = 200 (IN), 60 + 120 = 180 (OUT).
      expect(result.handlingInUsd).toBeCloseTo(200, 6);
      expect(result.handlingOutUsd).toBeCloseTo(180, 6);

      // Explicitly NOT a flat rate applied to the whole period's total CBM
      // (100 total IN, 60 total OUT):
      //   flat-OLD-rate would give 100*1.00=100 (IN) / 60*2.00=120 (OUT)
      //   flat-NEW/current-rate would give 100*3.00=300 (IN) / 60*4.00=240 (OUT)
      expect(result.handlingInUsd).not.toBeCloseTo(100, 6); // flat old
      expect(result.handlingInUsd).not.toBeCloseTo(300, 6); // flat new/current
      expect(result.handlingOutUsd).not.toBeCloseTo(120, 6); // flat old
      expect(result.handlingOutUsd).not.toBeCloseTo(240, 6); // flat new/current
    },
  );

  it(
    "(AC: version-history boundary) a ledger day exactly ON the new " +
      "version's effective_from date resolves to the NEW rate, matching " +
      "resolveContractTermsForDate's inclusive-start/exclusive-end " +
      "semantics (design.md §1.1)",
    () => {
      const oldVersion = contractVersion({
        handlingInRatePerCbm: 1.0,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-06-15T00:00:00.000Z"),
      });
      const newVersion = contractVersion({
        handlingInRatePerCbm: 9.0,
        effectiveFrom: new Date("2026-06-15T00:00:00.000Z"),
        effectiveTo: null,
      });

      const result = computeVmiHandlingForPeriod(
        [ledgerDay({ ledgerDate: "2026-06-15", inboundCbmFg: 10 })],
        [oldVersion, newVersion],
      );

      expect(result.handlingInUsd).toBeCloseTo(90, 6); // 10 * 9.0 (new), not 10 * 1.0 (old)
    },
  );

  // -------------------------------------------------------------------
  // Different in/out rates configured — independently priced (tasks.md
  // D.1/G.4). June's real contract evidences equal $1.40/$1.40, but nothing
  // requires that (design.md §1.1); this proves the two directions never
  // share one rate internally.
  // -------------------------------------------------------------------
  it(
    "(AC: tasks.md D.1/G.4 — different in/out rates) prices IN and OUT " +
      "independently against genuinely different handling_in_rate_per_cbm " +
      "and handling_out_rate_per_cbm values, not a single shared rate",
    () => {
      const result = computeVmiHandlingForPeriod(
        [
          ledgerDay({
            ledgerDate: "2026-06-01",
            inboundCbmFg: 10,
            outboundCbmRawMaterial: 20,
          }),
        ],
        [contractVersion({ handlingInRatePerCbm: 2.5, handlingOutRatePerCbm: 5.0 })],
      );

      expect(result.handlingInUsd).toBeCloseTo(25, 6); // 10 * 2.5
      expect(result.handlingOutUsd).toBeCloseTo(100, 6); // 20 * 5.0
      expect(result.handlingInUsd).not.toBeCloseTo(result.handlingOutUsd, 6);
    },
  );
});

// ---------------------------------------------------------------------------
// getVmiHandlingForPeriod — DB-facing orchestration. Proves (a) it wires the
// two real queries + the pure compute layer correctly end-to-end, and (b)
// it NEVER reads vmi_charge_lines (requirements.md FR-4.1, tasks.md G.4).
// ---------------------------------------------------------------------------

describe("getVmiHandlingForPeriod (D.1, DB-facing orchestration)", () => {
  it(
    "(AC: FR-4.1 end-to-end) queries vmi_daily_balance_ledger for the " +
      "period and the party's full vmi_contract_terms version history, and " +
      "returns the correctly computed period aggregate",
    async () => {
      const db = createMockDb();

      db.select
        .mockImplementationOnce(() =>
          makeChain([
            rawLedgerRow({
              ledgerDate: "2026-06-01",
              inboundCbmFg: "100",
              inboundCbmRawMaterial: "57.18",
              outboundCbmFg: "200",
              outboundCbmRawMaterial: "62.96",
            }),
          ]),
        )
        .mockImplementationOnce(() => makeChain([rawHandlingContractVersion()]));

      const result = await getVmiHandlingForPeriod(
        db as never,
        "party-a",
        "2026-06-01",
        "2026-06-30",
      );

      expect(result.handlingInUsd).toBeCloseTo(220.05, 2);
      expect(result.handlingOutUsd).toBeCloseTo(368.14, 2);
    },
  );

  it(
    "(AC: requirements.md FR-4.1 / tasks.md G.4 — 'Handling never appears " +
      "as a vmi_charge_lines row: No query in the handling calculation " +
      "path reads vmi_charge_lines') never issues a db.select(...).from(...) " +
      "call targeting the vmi_charge_lines table",
    async () => {
      const db = createMockDb();
      const fromCalls: unknown[] = [];

      db.select.mockImplementation(() => {
        const chain = makeChain([]);
        const originalFrom = chain.from;
        chain.from = vi.fn((table: unknown) => {
          fromCalls.push(table);
          return originalFrom(table);
        });
        return chain;
      });

      await getVmiHandlingForPeriod(db as never, "party-a", "2026-06-01", "2026-06-30");

      expect(fromCalls.length).toBeGreaterThan(0); // sanity: the function did query something
      expect(fromCalls).not.toContain(vmiChargeLines);
    },
  );
});
