// RED-step tests for lib/billing/vmi-daily-balance-backfill.ts (does not
// exist yet — Task C.6, from-scratch module).
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group C, C.6 — "Implement backfill
//     utility — File: lib/billing/vmi-daily-balance-backfill.ts. Accepts
//     party_id + date_range; reconstructs historical balances by replaying
//     inventory_transactions history (not a lot_inventory_totals-style
//     current-state read), resolving the applicable vmi_contract_terms
//     version for each backfilled date the same way C.3 does — this is the
//     exact scenario the version-history model (A.9) exists for: a day
//     backfilled after a later rate change must price at the rate that was
//     actually in effect on that date, never today's rate. Manual admin
//     tool, requires explicit confirmation and a notes field."
//   specs/12-vmi-billing/tasks.md Task Group A, A.9 — "vmi_contract_terms
//     rate versioning ... even a 'snapshot nightly' approach alone doesn't
//     correctly handle *backfilling* a day after a later rate change, since
//     there'd be nowhere to look up what the rate actually was on the
//     backfilled date. Versioning the contract table fixes both: the nightly
//     job and the backfill utility (C.6) both resolve 'the rate in effect'
//     by date against this history."
//   specs/12-vmi-billing/design.md §1.1 — "This shape exists because a
//     single mutable row can't answer 'what rate was in effect on date X'
//     for any date but today — and both the nightly snapshot job (§2.2) and
//     the backfill utility (vmi-daily-balance-backfill.ts, Task C.6) need
//     exactly that answer for historical dates" and "Any lookup that needs
//     'the rate in effect on date X' ... queries WHERE party_id = :p AND
//     effective_from <= X AND (effective_to IS NULL OR effective_to > X) —
//     never 'the current row,' even when X happens to be today."
//   specs/12-vmi-billing/design.md §2.2 step 6 — "It only diverges from
//     [the normal forward-running nightly job] for backfill (§ C.6): a day
//     backfilled after a later rate change resolves to the rate that was
//     actually in effect on the backfilled date, not today's rate."
//   specs/12-vmi-billing/requirements.md FR-1.3 — "A rate edit never
//     overwrites an existing vmi_contract_terms row's values ... Both the
//     nightly balance-replay job (FR-2) and any historical backfill resolve
//     'the rate in effect' by date against this version history, not
//     against 'whatever the contract currently says'."
//   specs/12-vmi-billing/requirements.md FR-2.1 — daily balance is
//     "replayed from the existing inventory_transactions ledger", never a
//     current-state snapshot read.
//   specs/12-vmi-billing/tasks.md Task Group G, G.1 — "Backfill a day after
//     a later rate change | Backfilled day resolves the vmi_contract_terms
//     version effective on *its own* date, not the current/latest version
//     — proves the version-history model (A.9), not just 'snapshot nightly,'
//     is what makes this correct." G.2 — "Backfill for a past date | Inserts
//     correct historical row; does not overwrite an existing row."
//   specs/00-steering/revision-log.md, "12-vmi-billing and
//     13-trading-orders-and-pricing — full rewrite approved (2026-08-19)" —
//     records why vmi_contract_terms became a version history in the first
//     place: "a snapshot-only fix doesn't solve backfilling a day after a
//     later rate change (there'd be nowhere to look up what the rate
//     actually was on that date), while versioning fixes both the
//     mid-period and the backfill case with one mechanism."
//
// Acceptance criterion under test (requirements.md FR-1.3 / FR-2.1, tasks.md
// A.9/C.6/G.1/G.2): a manual backfill of a historical (party, date) gap must
// (a) replay real inventory_transactions history day-by-day, not read a
// current-state table, (b) resolve the vmi_contract_terms version that was
// actually open on the backfilled date — even when a later version already
// exists at the time the backfill is run, (c) never overwrite an
// already-populated vmi_daily_balance_ledger row, only fill genuine gaps,
// and (d) require an explicit, non-empty `notes` field before any
// computation or write occurs (tasks.md C.6: "Manual admin tool, requires
// explicit confirmation and a notes field").
//
// ---------------------------------------------------------------------------
// SCHEMA/DEPENDENCY VERIFICATION PERFORMED BEFORE WRITING THIS FILE:
//
//   lib/billing/vmi-movement-query.ts (Task C.1, already implemented):
//     getVmiPartyMovements(db: DbLike, partyId: string): Promise<VmiMovementRow[]>
//     — returns full, unfiltered-by-date history for the party. This module
//     must do its own per-day date filtering (same as C.4a's route does for
//     "today"), not rely on C.1 to filter.
//
//   lib/billing/vmi-daily-balance.ts (Task C.2/C.3, already implemented):
//     computeVmiDailyBalance(input: VmiDailyBalanceInput): VmiDailyBalanceResult
//     — pure. resolveContractTermsForDate(versions, ledgerDate) resolves
//     "WHERE effective_from <= X AND (effective_to IS NULL OR
//     effective_to > X)", never "the current row" — this backfill utility
//     REUSES this function (by passing the full multi-version
//     contractVersions array into computeVmiDailyBalance), it does not
//     reimplement the lookup.
//
//   app/api/internal/vmi-daily-balance/route.ts (Task C.4a, already
//     implemented): establishes the nightly job's own orchestration shape
//     this backfill utility mirrors (load party's contract data, call
//     getVmiPartyMovements, call computeVmiDailyBalance, insert with
//     ON CONFLICT DO NOTHING) — but C.4a's active-parties query only ever
//     fetches the single currently-open (effective_to IS NULL) contract
//     version, which is INSUFFICIENT for backfill: this module must fetch
//     the party's FULL vmi_contract_terms version history, not just the
//     open one, or it could never resolve a pre-change rate for a backfilled
//     date. This is the one deliberate divergence from C.4a's query shape.
//
//   lib/db/schema/vmi_billing.ts: vmiContractTerms (storageRatePerCbmDay,
//     billingTiming, cbmThresholdType, cbmThreshold, overThresholdRate,
//     effectiveFrom, effectiveTo — decimal columns serialize as strings, as
//     modeled in route.ts's own raw-row shape) and vmiDailyBalanceLedger
//     (partyId, ledgerDate, beginningCbm, inboundCbmFg,
//     inboundCbmRawMaterial, outboundCbmFg, outboundCbmRawMaterial,
//     endingCbm, billedBalanceCbm, appliedStorageRateUsd, storageAmountUsd,
//     unique on (partyId, ledgerDate)).
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/vmi-daily-balance-backfill.ts
// (for backend-builder), established by this RED step:
//
//   // db is injected explicitly, same as C.1's getVmiPartyMovements(db, ...)
//   // pattern (a thin DB-facing layer over the pure C.2/C.3 compute layer),
//   // NOT an internal import of the @/lib/db/client singleton the way
//   // C.4a's route.ts does — this keeps the module unit-testable without a
//   // real Postgres connection or module-level vi.mock.
//   export type VmiBackfillDbLike = DbLike & { insert: (...args: any[]) => any };
//
//   export type VmiBackfillRequest = {
//     partyId: string;
//     startDate: string; // 'YYYY-MM-DD', Asia/Manila calendar date, inclusive
//     endDate: string;   // 'YYYY-MM-DD', inclusive
//     notes: string;     // REQUIRED, non-empty after trim (tasks.md C.6)
//     requestedByUserId: string;
//   };
//
//   export type VmiBackfillDayResult = {
//     ledgerDate: string;
//     status: "inserted" | "skipped_existing";
//     balance?: VmiDailyBalanceResult; // present only when status === "inserted"
//   };
//
//   export type VmiBackfillResult = {
//     partyId: string;
//     days: VmiBackfillDayResult[]; // one entry per date in the range, chronological order
//   };
//
//   // Pure helper — enumerates 'YYYY-MM-DD' calendar dates from startDate to
//   // endDate inclusive, chronological order.
//   export function enumerateLedgerDates(startDate: string, endDate: string): string[];
//
//   // Orchestration, per the DB call sequence this test asserts on:
//   //   1. Validate `notes` (non-empty after trim). Throws/rejects BEFORE any
//   //      db call at all if missing/empty/whitespace-only.
//   //   2. db.select(...).from(vmiDailyBalanceLedger).where(partyId, ledgerDate
//   //      BETWEEN startDate/endDate) -> existing rows in range, each
//   //      { ledgerDate, endingCbm } (needed both to skip and to correctly
//   //      seed the next gap day's beginning_cbm across a skip boundary).
//   //   3. db.select(...).from(vmiDailyBalanceLedger).where(partyId,
//   //      ledgerDate = day-before-startDate).limit(1) -> seeds
//   //      previousEndingCbm for the first date in the range (0/null if none).
//   //   4. db.select(...).from(vmiContractTerms).where(partyId = :p)
//   //      .orderBy(effectiveFrom) -> the party's FULL version history (never
//   //      filtered to effective_to IS NULL only — see the divergence-from-
//   //      C.4a note above).
//   //   5. getVmiPartyMovements(db, partyId) -> called exactly once,
//   //      regardless of range length.
//   //   6. For each date in enumerateLedgerDates(startDate, endDate), in
//   //      order: if the date already has an existing row (step 2), skip
//   //      (no db.insert), carry its endingCbm forward as the next date's
//   //      previousEndingCbm. Otherwise, filter movements to that date,
//   //      call computeVmiDailyBalance({ ..., contractVersions: <the full
//   //      history from step 4> }), db.insert(vmiDailyBalanceLedger)
//   //      .values({...}).onConflictDoNothing({ target: [partyId, ledgerDate] }),
//   //      and carry the newly computed endingCbm forward.
//   //   7. Returns { partyId, days }.
//   export async function backfillVmiDailyBalance(
//     db: VmiBackfillDbLike,
//     request: VmiBackfillRequest,
//   ): Promise<VmiBackfillResult>;
//
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  backfillVmiDailyBalance,
  enumerateLedgerDates,
} from "../vmi-daily-balance-backfill";
import type { VmiMovementRow } from "../vmi-movement-query";

// ---------------------------------------------------------------------------
// Mock @/lib/billing/vmi-movement-query — getVmiPartyMovements (C.1) is a
// DB-facing query module already covered by its own test suite
// (lib/billing/__tests__/vmi-movement-query.test.ts, 21/21 passing per
// tasks.md C.1). Mocked here so this test proves the BACKFILL module's own
// orchestration/date-filtering/rate-resolution, not a reimplementation of
// C.1's join logic — same "LAYER CHOICE" precedent as
// app/api/internal/vmi-daily-balance/__tests__/route.test.ts.
// computeVmiDailyBalance (C.2/C.3, real, not mocked) is used for real.
// ---------------------------------------------------------------------------
const mockGetVmiPartyMovements = vi.fn();
vi.mock("@/lib/billing/vmi-movement-query", () => ({
  getVmiPartyMovements: mockGetVmiPartyMovements,
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function movementRow(overrides: Partial<VmiMovementRow> = {}): VmiMovementRow {
  return {
    id: "txn-1",
    direction: "IN",
    category: "fg",
    cbm: 1,
    partyId: "party-a",
    movementType: "receiving",
    qty: 1,
    createdAt: new Date("2026-07-01T04:00:00.000Z"), // Manila noon, unambiguous day
    ...overrides,
  };
}

// Raw vmi_contract_terms row shape as returned by the DB (decimal columns
// serialize as strings) — mirrors app/api/internal/vmi-daily-balance/route.ts's
// own raw-row shape exactly.
function rawContractVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-v1",
    partyId: "party-a",
    storageRatePerCbmDay: "0.05",
    billingTiming: "beginning_of_day",
    cbmThresholdType: "none",
    cbmThreshold: null,
    overThresholdRate: null,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    ...overrides,
  };
}

// Minimal chainable mock query builder — same call-order-based pattern as
// app/api/internal/vmi-daily-balance/__tests__/route.test.ts's makeChain,
// generalized to also cover .insert().values().onConflictDoNothing().
function makeChain(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of [
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "orderBy",
    "limit",
    "values",
    "onConflictDoNothing",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.returning = vi.fn(() => Promise.resolve(rows));
  const resolved = Promise.resolve(rows);
  chain.then = resolved.then.bind(resolved);
  chain.catch = resolved.catch.bind(resolved);
  chain.finally = resolved.finally.bind(resolved);
  return chain;
}

// db is injected directly (per this module's expected contract — see header
// note), so each test builds its own isolated mock db object rather than
// relying on a module-level vi.mock("@/lib/db/client").
function createMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
  };
}

const VALID_NOTES = "Backfilling a missed CRON night per Ops request (2026-08-20).";

describe("enumerateLedgerDates (C.6, pure helper)", () => {
  it("(AC: multi-day range enumeration) returns every 'YYYY-MM-DD' date from startDate to endDate inclusive, in chronological order", () => {
    expect(enumerateLedgerDates("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });

  it("(AC: single-day range) returns exactly one date when startDate === endDate", () => {
    expect(enumerateLedgerDates("2026-07-05", "2026-07-05")).toEqual([
      "2026-07-05",
    ]);
  });
});

describe("backfillVmiDailyBalance (tasks.md C.6)", () => {
  beforeEach(() => {
    mockGetVmiPartyMovements.mockReset();
  });

  // -------------------------------------------------------------------
  // 4. notes field required — validated FIRST, before any computation or
  //    write (tasks.md C.6: "Manual admin tool, requires explicit
  //    confirmation and a notes field").
  // -------------------------------------------------------------------
  describe("notes field required (tasks.md C.6: \"requires explicit confirmation and a notes field\")", () => {
    it("(AC: C.6 notes required) rejects a request with no notes property at all, before any db/computation work", async () => {
      const db = createMockDb();

      await expect(
        backfillVmiDailyBalance(db as never, {
          partyId: "party-a",
          startDate: "2026-07-01",
          endDate: "2026-07-01",
          requestedByUserId: "user-1",
        } as never),
      ).rejects.toThrow();

      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(mockGetVmiPartyMovements).not.toHaveBeenCalled();
    });

    it("(AC: C.6 notes required) rejects a request with an empty-string notes value, before any db/computation work", async () => {
      const db = createMockDb();

      await expect(
        backfillVmiDailyBalance(db as never, {
          partyId: "party-a",
          startDate: "2026-07-01",
          endDate: "2026-07-01",
          notes: "",
          requestedByUserId: "user-1",
        }),
      ).rejects.toThrow();

      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(mockGetVmiPartyMovements).not.toHaveBeenCalled();
    });

    it("(AC: C.6 notes required) rejects a whitespace-only notes value", async () => {
      const db = createMockDb();

      await expect(
        backfillVmiDailyBalance(db as never, {
          partyId: "party-a",
          startDate: "2026-07-01",
          endDate: "2026-07-01",
          notes: "   ",
          requestedByUserId: "user-1",
        }),
      ).rejects.toThrow();

      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // 1. Accepts party_id + date_range, reconstructs via movement replay
  //    (not a current-state read) — requirements.md FR-2.1.
  // -------------------------------------------------------------------
  it(
    "(AC: FR-2.1/C.6 — accepts party_id + date_range and replays " +
      "inventory_transactions history, not a current-state read) computes " +
      "a single backfilled day's balance from getVmiPartyMovements + the " +
      "prior day's carried-forward ending_cbm, exactly like the nightly " +
      "job's own replay math",
    async () => {
      const db = createMockDb();

      // Step 2: existing-rows-in-range check -> none.
      db.select
        .mockImplementationOnce(() => makeChain([]))
        // Step 3: prior-day (2026-06-30) ending_cbm seed.
        .mockImplementationOnce(() => makeChain([{ endingCbm: "700.00" }]))
        // Step 4: full contract-terms version history.
        .mockImplementationOnce(() => makeChain([rawContractVersion()]));

      mockGetVmiPartyMovements.mockResolvedValue([
        movementRow({
          id: "m1",
          direction: "IN",
          category: "fg",
          cbm: 25,
          createdAt: new Date("2026-07-01T04:00:00.000Z"),
        }),
        movementRow({
          id: "m2",
          direction: "OUT",
          category: "raw_material",
          cbm: 10,
          createdAt: new Date("2026-07-01T05:00:00.000Z"),
        }),
      ]);

      const insertChain = makeChain([{ id: "row-1" }]);
      db.insert.mockImplementationOnce(() => insertChain);

      const result = await backfillVmiDailyBalance(db as never, {
        partyId: "party-a",
        startDate: "2026-07-01",
        endDate: "2026-07-01",
        notes: VALID_NOTES,
        requestedByUserId: "user-1",
      });

      expect(mockGetVmiPartyMovements).toHaveBeenCalledWith(
        expect.anything(),
        "party-a",
      );

      const insertedValues = insertChain.values.mock.calls[0][0];
      // beginning = 700 (carried from prior day), IN 25, OUT 10 -> ending 715.
      expect(Number(insertedValues.beginningCbm)).toBeCloseTo(700, 4);
      expect(Number(insertedValues.inboundCbmFg)).toBeCloseTo(25, 4);
      expect(Number(insertedValues.outboundCbmRawMaterial)).toBeCloseTo(10, 4);
      expect(Number(insertedValues.endingCbm)).toBeCloseTo(715, 4);
      // beginning_of_day timing -> billed against beginning_cbm (700), not ending.
      expect(Number(insertedValues.billedBalanceCbm)).toBeCloseTo(700, 4);
      expect(Number(insertedValues.storageAmountUsd)).toBeCloseTo(35, 4); // 700 * 0.05

      expect(result.partyId).toBe("party-a");
      expect(result.days).toEqual([
        expect.objectContaining({
          ledgerDate: "2026-07-01",
          status: "inserted",
        }),
      ]);
    },
  );

  // -------------------------------------------------------------------
  // 2. THE A.9 backfill-correctness case — load-bearing, explicitly named.
  // -------------------------------------------------------------------
  it(
    "(AC: THE A.9 backfill-correctness case — tasks.md A.9/C.6, design.md " +
      "§1.1/§2.2 step 6, tasks.md G.1 'Backfill a day after a later rate " +
      "change') resolves the vmi_contract_terms version that was actually " +
      "in effect ON the backfilled date, not today's/the-latest version, " +
      "even though the newer version already exists at backfill time",
    async () => {
      const db = createMockDb();

      const oldVersion = rawContractVersion({
        id: "v1-old",
        storageRatePerCbmDay: "0.05",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-06-15T00:00:00.000Z"),
      });
      // A LATER rate change already exists by the time this backfill runs —
      // this is the exact scenario A.9 exists to protect against. The range
      // being backfilled (June 1-3) is entirely BEFORE this new version's
      // effective_from.
      const newVersion = rawContractVersion({
        id: "v2-new",
        storageRatePerCbmDay: "0.08",
        effectiveFrom: new Date("2026-06-15T00:00:00.000Z"),
        effectiveTo: null,
      });

      db.select
        .mockImplementationOnce(() => makeChain([])) // no existing rows
        .mockImplementationOnce(() => makeChain([])) // no prior-day row (first period)
        // Full history returned — BOTH versions, proving this module does
        // not query only the currently-open (effective_to IS NULL) row the
        // way C.4a's nightly-job query does.
        .mockImplementationOnce(() => makeChain([oldVersion, newVersion]));

      mockGetVmiPartyMovements.mockResolvedValue([]); // isolate to the rate-resolution assertion

      const insertChain1 = makeChain([{ id: "row-1" }]);
      const insertChain2 = makeChain([{ id: "row-2" }]);
      const insertChain3 = makeChain([{ id: "row-3" }]);
      db.insert
        .mockImplementationOnce(() => insertChain1)
        .mockImplementationOnce(() => insertChain2)
        .mockImplementationOnce(() => insertChain3);

      await backfillVmiDailyBalance(db as never, {
        partyId: "party-a",
        startDate: "2026-06-01",
        endDate: "2026-06-03",
        notes: VALID_NOTES,
        requestedByUserId: "user-1",
      });

      for (const chain of [insertChain1, insertChain2, insertChain3]) {
        const insertedValues = chain.values.mock.calls[0][0];
        // Every backfilled day (all before the 2026-06-15 boundary) must
        // resolve to the OLD rate (0.05), never the newer 0.08 — proving
        // the lookup is date-scoped per day, not "whichever row is
        // currently open."
        expect(Number(insertedValues.appliedStorageRateUsd)).toBeCloseTo(
          0.05,
          6,
        );
        expect(Number(insertedValues.appliedStorageRateUsd)).not.toBeCloseTo(
          0.08,
          6,
        );
      }
    },
  );

  // -------------------------------------------------------------------
  // 3. Does not overwrite an existing row — skip already-populated days,
  //    fill only genuine gaps (tasks.md C.6, G.2).
  // -------------------------------------------------------------------
  it(
    "(AC: C.6/G.2 'does not overwrite an existing row') skips dates that " +
      "already have a vmi_daily_balance_ledger row and only inserts for " +
      "the genuine gap dates, correctly chaining beginning_cbm across an " +
      "already-populated day",
    async () => {
      const db = createMockDb();

      // Range: 2026-06-01 .. 2026-06-04. The nightly job already
      // successfully ran for 06-02 and 06-03 (existing rows); 06-01 and
      // 06-04 are the genuine gaps.
      db.select
        .mockImplementationOnce(() =>
          makeChain([
            { ledgerDate: "2026-06-02", endingCbm: "810.00" },
            { ledgerDate: "2026-06-03", endingCbm: "830.00" },
          ]),
        )
        .mockImplementationOnce(() => makeChain([{ endingCbm: "790.00" }])) // 05-31 seed
        .mockImplementationOnce(() => makeChain([rawContractVersion()]));

      mockGetVmiPartyMovements.mockResolvedValue([]); // no movement, isolate skip/chain behavior

      const insertChainDay1 = makeChain([{ id: "row-06-01" }]);
      const insertChainDay4 = makeChain([{ id: "row-06-04" }]);
      db.insert
        .mockImplementationOnce(() => insertChainDay1)
        .mockImplementationOnce(() => insertChainDay4);

      const result = await backfillVmiDailyBalance(db as never, {
        partyId: "party-a",
        startDate: "2026-06-01",
        endDate: "2026-06-04",
        notes: VALID_NOTES,
        requestedByUserId: "user-1",
      });

      // Exactly two inserts — never for the two already-existing dates.
      expect(db.insert).toHaveBeenCalledTimes(2);

      const day1Values = insertChainDay1.values.mock.calls[0][0];
      expect(day1Values.ledgerDate).toBe("2026-06-01");
      expect(Number(day1Values.beginningCbm)).toBeCloseTo(790, 4); // seeded from 05-31

      const day4Values = insertChainDay4.values.mock.calls[0][0];
      expect(day4Values.ledgerDate).toBe("2026-06-04");
      // 06-04's beginning must be 06-03's EXISTING row's ending_cbm (830),
      // not recomputed/re-derived and not the 06-01 gap's own result —
      // proves correct chaining across an already-populated day.
      expect(Number(day4Values.beginningCbm)).toBeCloseTo(830, 4);

      expect(result.days).toEqual([
        expect.objectContaining({ ledgerDate: "2026-06-01", status: "inserted" }),
        expect.objectContaining({ ledgerDate: "2026-06-02", status: "skipped_existing" }),
        expect.objectContaining({ ledgerDate: "2026-06-03", status: "skipped_existing" }),
        expect.objectContaining({ ledgerDate: "2026-06-04", status: "inserted" }),
      ]);

      // No insert call ever targets an already-existing date.
      const insertedLedgerDates = [day1Values.ledgerDate, day4Values.ledgerDate];
      expect(insertedLedgerDates).not.toContain("2026-06-02");
      expect(insertedLedgerDates).not.toContain("2026-06-03");
    },
  );

  // -------------------------------------------------------------------
  // 5. Multi-day range: a genuine 3-day gap inserts exactly 3 rows, each
  //    independently computed with its own correctly-chained beginning/
  //    ending CBM.
  // -------------------------------------------------------------------
  it(
    "(AC: C.6 multi-day range) backfilling a 3-day gap (no existing rows) " +
      "inserts exactly 3 rows, each day's beginning_cbm chained from the " +
      "previous day's computed ending_cbm",
    async () => {
      const db = createMockDb();

      db.select
        .mockImplementationOnce(() => makeChain([])) // no existing rows
        .mockImplementationOnce(() => makeChain([{ endingCbm: "500.00" }])) // 06-30 seed
        .mockImplementationOnce(() => makeChain([rawContractVersion()]));

      mockGetVmiPartyMovements.mockResolvedValue([
        // Day 1 (07-01): +20 FG in.
        movementRow({
          id: "d1-in",
          direction: "IN",
          category: "fg",
          cbm: 20,
          createdAt: new Date("2026-07-01T04:00:00.000Z"),
        }),
        // Day 2 (07-02): -5 raw material out.
        movementRow({
          id: "d2-out",
          direction: "OUT",
          category: "raw_material",
          cbm: 5,
          createdAt: new Date("2026-07-02T04:00:00.000Z"),
        }),
        // Day 3 (07-03): +8 FG in, -3 FG out.
        movementRow({
          id: "d3-in",
          direction: "IN",
          category: "fg",
          cbm: 8,
          createdAt: new Date("2026-07-03T04:00:00.000Z"),
        }),
        movementRow({
          id: "d3-out",
          direction: "OUT",
          category: "fg",
          cbm: 3,
          createdAt: new Date("2026-07-03T05:00:00.000Z"),
        }),
      ]);

      const insertChain1 = makeChain([{ id: "row-1" }]);
      const insertChain2 = makeChain([{ id: "row-2" }]);
      const insertChain3 = makeChain([{ id: "row-3" }]);
      db.insert
        .mockImplementationOnce(() => insertChain1)
        .mockImplementationOnce(() => insertChain2)
        .mockImplementationOnce(() => insertChain3);

      const result = await backfillVmiDailyBalance(db as never, {
        partyId: "party-a",
        startDate: "2026-07-01",
        endDate: "2026-07-03",
        notes: VALID_NOTES,
        requestedByUserId: "user-1",
      });

      expect(db.insert).toHaveBeenCalledTimes(3);
      expect(result.days).toHaveLength(3);
      expect(result.days.every((d) => d.status === "inserted")).toBe(true);

      const day1 = insertChain1.values.mock.calls[0][0];
      const day2 = insertChain2.values.mock.calls[0][0];
      const day3 = insertChain3.values.mock.calls[0][0];

      // Day 1: beginning 500 (seeded), +20 IN -> ending 520.
      expect(Number(day1.beginningCbm)).toBeCloseTo(500, 4);
      expect(Number(day1.endingCbm)).toBeCloseTo(520, 4);

      // Day 2's beginning MUST equal day 1's computed ending (chained, not
      // re-derived from the seed or recomputed independently): 520 - 5 = 515.
      expect(Number(day2.beginningCbm)).toBeCloseTo(Number(day1.endingCbm), 4);
      expect(Number(day2.endingCbm)).toBeCloseTo(515, 4);

      // Day 3's beginning MUST equal day 2's computed ending: 515 + 8 - 3 = 520.
      expect(Number(day3.beginningCbm)).toBeCloseTo(Number(day2.endingCbm), 4);
      expect(Number(day3.endingCbm)).toBeCloseTo(520, 4);
    },
  );

  // -------------------------------------------------------------------
  // 6. Party isolation — backfilling one party's gap never touches
  //    another party's vmi_daily_balance_ledger rows.
  // -------------------------------------------------------------------
  it(
    "(AC: C.6 party isolation) backfilling party-a's gap never reads or " +
      "writes party-b's data",
    async () => {
      const db = createMockDb();

      db.select
        .mockImplementationOnce(() => makeChain([])) // no existing rows for party-a
        .mockImplementationOnce(() => makeChain([])) // no prior-day row
        .mockImplementationOnce(() => makeChain([rawContractVersion()]));

      mockGetVmiPartyMovements.mockResolvedValue([
        movementRow({ id: "m1", direction: "IN", category: "fg", cbm: 12 }),
      ]);

      const insertChain = makeChain([{ id: "row-1" }]);
      db.insert.mockImplementationOnce(() => insertChain);

      const result = await backfillVmiDailyBalance(db as never, {
        partyId: "party-a",
        startDate: "2026-07-01",
        endDate: "2026-07-01",
        notes: VALID_NOTES,
        requestedByUserId: "user-1",
      });

      // getVmiPartyMovements is invoked only for party-a, never party-b.
      expect(mockGetVmiPartyMovements).toHaveBeenCalledTimes(1);
      expect(mockGetVmiPartyMovements).toHaveBeenCalledWith(
        expect.anything(),
        "party-a",
      );
      expect(mockGetVmiPartyMovements).not.toHaveBeenCalledWith(
        expect.anything(),
        "party-b",
      );

      // The only insert made carries party-a's id, never party-b's.
      expect(db.insert).toHaveBeenCalledTimes(1);
      const insertedValues = insertChain.values.mock.calls[0][0];
      expect(insertedValues.partyId).toBe("party-a");
      expect(insertedValues.partyId).not.toBe("party-b");

      expect(result.partyId).toBe("party-a");
    },
  );
});
