// @vitest-environment node
//
// RED-step tests for `app/api/internal/vmi-daily-balance/route.ts`
// (does not exist yet — Task C.4a).
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group C, C.4 / C.4a — "the nightly job
//     ... app/api/internal/vmi-daily-balance/route.ts — the real logic. Runs
//     C.1-C.3 for all active VMI parties, ON CONFLICT (party_id, ledger_date)
//     DO NOTHING. Secured by a shared secret (Vercel env var), rejecting any
//     request missing/mismatching it."
//   specs/12-vmi-billing/tasks.md C.5 — "Implement timezone-correct date
//     boundaries — All ledger_date values and created_at range filters use
//     Asia/Manila calendar dates."
//   specs/12-vmi-billing/requirements.md FR-2.3 — "A nightly job snapshots
//     one immutable row per party per day into vmi_daily_balance_ledger:
//     beginning CBM, ending CBM, IN/OUT by category, the storage rate in
//     effect *that night*, and the resulting dollar amount — priced same-day
//     so a mid-month rate change never retroactively reprices already-elapsed
//     days."
//   specs/12-vmi-billing/design.md §2.2 ("Invocation architecture" note,
//     added 2026-08-20) — confirms this is a plain Next.js route (NOT a
//     Vercel-Cron `app/api/cron/*` route), invoked by a Supabase Edge
//     Function over HTTPS with a shared secret, and the numbered algorithm
//     steps 1-7 this route implements (beginning_cbm carry-forward, movement
//     replay scoped to "today's Asia/Manila calendar day", billed_balance_cbm
//     resolution, rate resolution, INSERT ... ON CONFLICT DO NOTHING).
//   specs/12-vmi-billing/tasks.md G.2 — "Run CRON twice on same date -> second
//     run inserts zero rows."
//
// Schema verification note (per task instructions — "verify, don't guess"
// how a VMI party is identified in this schema):
//   `lib/db/schema/enums.ts`'s `party_role` enum is
//   ["vendor","supplier","customer","end_customer","internal_warehouse"] —
//   there is NO "vmi" party_roles value. VMI-ness is NOT determined via
//   `party_roles`. Per design.md §2.2's own algorithm pseudocode: "For each
//   party_id where vmi_contract_terms exists AND parties.is_active = true"
//   — i.e. a party counts as an "active VMI party" for this job when (a)
//   `parties.is_active = true` and (b) it has a currently-open
//   `vmi_contract_terms` version (`effective_to IS NULL`). This test's mocked
//   "active parties" query models exactly that join/filter; it is the
//   contract this RED step establishes for the route to satisfy.
//
// LAYER CHOICE (per specs/00-steering/testing.md): this is a Vitest
// integration-style unit test — real Postgres is not spun up here (that tier
// is reserved for db-migration-verifier's pre-sign-off pass over the actual
// unique constraint already verified in B.3). Instead, following this
// codebase's established precedent for testing route/action logic
// (app/(authenticated)/__tests__/actions.test.ts: vi.mock("@/lib/db/client")
// with a controllable, call-order-based chain, exercising the real exported
// handler function directly rather than over real HTTP), `db.select`/
// `db.insert` are mocked but `computeVmiDailyBalance` (C.2/C.3, already
// built and unit-tested) is used FOR REAL — this test verifies the route's
// wiring/orchestration, not a reimplementation of math already covered
// elsewhere.
//
// Route contract this test establishes (for backend-builder):
//   - POST-only. Reads a shared secret from the `x-vmi-daily-balance-secret`
//     request header, compares to `process.env.VMI_DAILY_BALANCE_SHARED_SECRET`.
//     Missing header, mismatched value, or unset env var -> 401, no DB work.
//   - On success: queries `parties` innerJoin `vmi_contract_terms` WHERE
//     `parties.is_active = true AND vmi_contract_terms.effective_to IS NULL`.
//   - For each returned party (independently, one party's failure must not
//     abort the batch — see Test 4's comment for why this is an inferred,
//     not directly-cited, choice): looks up the prior day's ending_cbm from
//     `vmi_daily_balance_ledger`, calls `getVmiPartyMovements` (C.1), filters
//     the returned movements to "today's Asia/Manila calendar day" window
//     (createdAt >= startUtc && createdAt < endUtc), calls the real
//     `computeVmiDailyBalance` (C.2/C.3), and inserts one
//     `vmi_daily_balance_ledger` row via
//     `.onConflictDoNothing({ target: [partyId, ledgerDate] })`.
//   - Returns 200 with `{ ledgerDate, results: [{ partyId, status,
//     error? }] }`, `status` one of "inserted" | "skipped" | "error".
//   - Exports two pure helpers for the Asia/Manila date-boundary math (C.5):
//     `resolveManilaLedgerDate(now: Date): string` ('YYYY-MM-DD') and
//     `resolveManilaDayBoundsUtc(ledgerDate: string): { startUtc: Date;
//     endUtc: Date }`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @/lib/db/client — same call-order-based chain pattern as
// app/(authenticated)/__tests__/actions.test.ts. Every intermediate builder
// method (from/innerJoin/where/orderBy/limit/values/onConflictDoNothing)
// returns the same chain object, which is itself thenable so `await` works
// regardless of which method was called last.
// ---------------------------------------------------------------------------
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

const mockSelect = vi.fn();
const mockInsert = vi.fn();
vi.mock("@/lib/db/client", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

// ---------------------------------------------------------------------------
// Mock @/lib/billing/vmi-movement-query — getVmiPartyMovements (C.1) is a
// DB-facing query module; its own correctness is covered by
// lib/billing/__tests__/vmi-movement-query.test.ts (21/21 passing per
// tasks.md C.1). Here it's a controllable per-partyId stub so this test can
// prove the ROUTE correctly filters its (unfiltered, full-history) return
// value down to "today's Asia/Manila calendar day" — C.1's module performs
// no date filtering of its own (confirmed by reading vmi-movement-query.ts:
// no created_at WHERE clause exists there), so that filtering must happen in
// this route (C.5).
// ---------------------------------------------------------------------------
const mockGetVmiPartyMovements = vi.fn();
vi.mock("@/lib/billing/vmi-movement-query", () => ({
  getVmiPartyMovements: mockGetVmiPartyMovements,
}));

// computeVmiDailyBalance (C.2/C.3) is used for real — not mocked. See the
// LAYER CHOICE note above.

const SECRET_HEADER = "x-vmi-daily-balance-secret";
const TEST_SECRET = "test-only-shared-secret-value";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/internal/vmi-daily-balance", {
    method: "POST",
    headers,
  });
}

describe("POST /api/internal/vmi-daily-balance (tasks.md C.4a, C.5)", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockGetVmiPartyMovements.mockReset();
    vi.stubEnv("VMI_DAILY_BALANCE_SHARED_SECRET", TEST_SECRET);
    // Fixed "now" chosen so UTC calendar date (2026-08-19) and Asia/Manila
    // calendar date (2026-08-20, since Manila = UTC+8) DIFFER — this is the
    // exact case Test 5 / C.5 exists to protect against a naive
    // `new Date().toISOString().slice(0, 10)` implementation.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T20:00:00.000Z"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------
  // 1. Auth
  // ---------------------------------------------------------------------
  describe("shared-secret auth (tasks.md C.4a: \"Secured by a shared secret ... rejecting any request missing/mismatching it\")", () => {
    it("rejects a request with no secret header at all — 401, no DB work done", async () => {
      const { POST } = await import("@/app/api/internal/vmi-daily-balance/route");

      const response = await POST(makeRequest());

      expect(response.status).toBe(401);
      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("rejects a request with the wrong secret value — 401, no DB work done", async () => {
      const { POST } = await import("@/app/api/internal/vmi-daily-balance/route");

      const response = await POST(
        makeRequest({ [SECRET_HEADER]: "definitely-not-the-real-secret" }),
      );

      expect(response.status).toBe(401);
      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("proceeds (does not 401) with the correct secret", async () => {
      mockSelect.mockImplementationOnce(() => makeChain([])); // active-parties query, no parties

      const { POST } = await import("@/app/api/internal/vmi-daily-balance/route");

      const response = await POST(makeRequest({ [SECRET_HEADER]: TEST_SECRET }));

      expect(response.status).not.toBe(401);
      expect(mockSelect).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // 2. Happy path (+ embedded C.5 timezone proof — see comment below)
  // ---------------------------------------------------------------------
  it(
    "for a single active VMI party: calls getVmiPartyMovements + the real " +
      "computeVmiDailyBalance, and inserts exactly one vmi_daily_balance_ledger " +
      "row for the Asia/Manila target date (requirements.md FR-2.3; " +
      "design.md §2.2 steps 1-7)",
    async () => {
      // Active-parties query: one party, currently-open contract version.
      // June-fixture-derived rate (tasks.md G.1/G.3): rate 0.05, beginning_of_day.
      mockSelect.mockImplementationOnce(() =>
        makeChain([
          {
            partyId: "party-a",
            contractId: "contract-a-1",
            storageRatePerCbmDay: "0.05",
            billingTiming: "beginning_of_day",
            cbmThresholdType: "none",
            cbmThreshold: null,
            overThresholdRate: null,
            effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
            effectiveTo: null,
          },
        ]),
      );
      // Prior day's ending_cbm lookup for party-a: 792.02 (June-fixture value).
      mockSelect.mockImplementationOnce(() =>
        makeChain([{ endingCbm: "792.02" }]),
      );

      // getVmiPartyMovements returns C.1's full (unfiltered-by-date) history.
      // Asia/Manila target date resolves to 2026-08-20 (see beforeEach); the
      // Manila calendar day's UTC window is [2026-08-19T16:00:00Z,
      // 2026-08-20T16:00:00Z). Movements are deliberately placed so that
      // correctly filtering (not simply "use them all") is required to reach
      // the expected numbers below:
      mockGetVmiPartyMovements.mockImplementation((_db, partyId: string) => {
        if (partyId !== "party-a") return Promise.resolve([]);
        return Promise.resolve([
          {
            id: "txn-in-window-1",
            direction: "IN",
            category: "fg",
            cbm: 10,
            partyId: "party-a",
            movementType: "receiving",
            qty: 10,
            createdAt: new Date("2026-08-19T18:00:00.000Z"), // inside window
          },
          {
            // Just before the Manila-day window opens (16:00 UTC 8/19) —
            // still the PREVIOUS Manila calendar day. Deliberately huge CBM
            // (999) so an incorrect "use all movements" implementation would
            // be unmistakably wrong, not off by a rounding error.
            id: "txn-out-of-window",
            direction: "IN",
            category: "fg",
            cbm: 999,
            partyId: "party-a",
            movementType: "receiving",
            qty: 999,
            createdAt: new Date("2026-08-19T14:00:00.000Z"),
          },
          {
            id: "txn-in-window-2",
            direction: "OUT",
            category: "raw_material",
            cbm: 5,
            partyId: "party-a",
            movementType: "pick",
            qty: 5,
            createdAt: new Date("2026-08-20T15:00:00.000Z"), // inside window
          },
        ]);
      });

      const insertChain = makeChain([{ id: "ledger-row-a" }]);
      mockInsert.mockImplementationOnce(() => insertChain);

      const { POST } = await import("@/app/api/internal/vmi-daily-balance/route");

      const response = await POST(makeRequest({ [SECRET_HEADER]: TEST_SECRET }));
      const body = await response.json();

      expect(response.status).toBe(200);

      // C.5 embedded proof: ledgerDate is the ASIA/MANILA calendar date
      // (2026-08-20), not the server's UTC calendar date (2026-08-19), for
      // this fixed "now".
      expect(body.ledgerDate).toBe("2026-08-20");

      expect(mockGetVmiPartyMovements).toHaveBeenCalledWith(
        expect.anything(),
        "party-a",
      );

      // db.insert was called once, with values reflecting movement replay
      // over ONLY the two in-window movements (10 CBM in/FG, 5 CBM out/raw
      // material) — the 999-CBM out-of-window movement must be excluded.
      expect(mockInsert).toHaveBeenCalledTimes(1);
      const insertedValues = insertChain.values.mock.calls[0][0];

      expect(insertedValues.partyId).toBe("party-a");
      expect(insertedValues.ledgerDate).toBe("2026-08-20");
      expect(Number(insertedValues.beginningCbm)).toBeCloseTo(792.02, 4);
      expect(Number(insertedValues.inboundCbmFg)).toBeCloseTo(10, 4);
      expect(Number(insertedValues.outboundCbmRawMaterial)).toBeCloseTo(5, 4);
      // ending = beginning + IN - OUT = 792.02 + 10 - 5 = 797.02 (proves the
      // 999-CBM out-of-window row was excluded; wrongly including it would
      // give ~1801.02).
      expect(Number(insertedValues.endingCbm)).toBeCloseTo(797.02, 4);
      // beginning_of_day timing -> billed against beginning_cbm, not ending.
      expect(Number(insertedValues.billedBalanceCbm)).toBeCloseTo(792.02, 4);
      expect(Number(insertedValues.appliedStorageRateUsd)).toBeCloseTo(0.05, 6);
      // Verified fixture (tasks.md C.3 / requirements.md FR-2.4):
      // 792.02 * 0.05 = 39.60 exactly.
      expect(Number(insertedValues.storageAmountUsd)).toBeCloseTo(39.6, 4);

      // onConflictDoNothing wired against the (party_id, ledger_date) unique
      // constraint already real-Postgres-verified in tasks.md B.3.
      expect(insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1);

      expect(body.results).toContainEqual(
        expect.objectContaining({ partyId: "party-a", status: "inserted" }),
      );
    },
  );

  // ---------------------------------------------------------------------
  // 3. Idempotency (tasks.md G.2)
  // ---------------------------------------------------------------------
  it(
    "reports zero newly-inserted rows on a second run for the same date " +
      "(tasks.md G.2: \"Run CRON twice on same date -> second run inserts " +
      "zero rows\"; ON CONFLICT (party_id, ledger_date) DO NOTHING)",
    async () => {
      const activePartyRow = {
        partyId: "party-a",
        contractId: "contract-a-1",
        storageRatePerCbmDay: "0.05",
        billingTiming: "beginning_of_day",
        cbmThresholdType: "none",
        cbmThreshold: null,
        overThresholdRate: null,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: null,
      };
      mockGetVmiPartyMovements.mockResolvedValue([]);

      const { POST } = await import("@/app/api/internal/vmi-daily-balance/route");

      // --- First run: row does not exist yet, insert succeeds. ---
      mockSelect.mockImplementationOnce(() => makeChain([activePartyRow]));
      mockSelect.mockImplementationOnce(() => makeChain([])); // no prior-day row
      const firstInsertChain = makeChain([{ id: "ledger-row-a" }]);
      mockInsert.mockImplementationOnce(() => firstInsertChain);

      const firstResponse = await POST(
        makeRequest({ [SECRET_HEADER]: TEST_SECRET }),
      );
      const firstBody = await firstResponse.json();
      expect(firstBody.results).toContainEqual(
        expect.objectContaining({ partyId: "party-a", status: "inserted" }),
      );

      // --- Second run, same date: the unique (party_id, ledger_date)
      // constraint means a real Postgres ON CONFLICT DO NOTHING insert
      // returns zero rows from .returning() — modeled here directly, since
      // full DB-constraint enforcement is real-Postgres integration
      // territory (already verified separately in tasks.md B.3), not this
      // mocked-db unit tier. What THIS test proves is that the route reads
      // an empty .returning() result as "already exists, skip" rather than
      // erroring or fabricating a second row. ---
      mockSelect.mockImplementationOnce(() => makeChain([activePartyRow]));
      mockSelect.mockImplementationOnce(() => makeChain([])); // no prior-day row
      const secondInsertChain = makeChain([]); // ON CONFLICT DO NOTHING -> no rows
      mockInsert.mockImplementationOnce(() => secondInsertChain);

      const secondResponse = await POST(
        makeRequest({ [SECRET_HEADER]: TEST_SECRET }),
      );
      const secondBody = await secondResponse.json();

      expect(secondResponse.status).toBe(200);
      expect(secondBody.results).toContainEqual(
        expect.objectContaining({ partyId: "party-a", status: "skipped" }),
      );
      // Zero *newly inserted* rows this run — no entry claiming "inserted".
      expect(secondBody.results).not.toContainEqual(
        expect.objectContaining({ partyId: "party-a", status: "inserted" }),
      );
      expect(secondInsertChain.onConflictDoNothing).toHaveBeenCalledTimes(1);
    },
  );

  // ---------------------------------------------------------------------
  // 4. Multi-party isolation + partial-failure resilience
  // ---------------------------------------------------------------------
  it(
    "processes two active VMI parties independently in one invocation; " +
      "one party's failure does not block the other's insert (INFERRED " +
      "CHOICE — design.md §2.2 / tasks.md C.4a do not explicitly specify " +
      "partial-failure handling for this loop; per the RED-step task " +
      "instructions, this test asserts the more defensive behavior: a " +
      "single party's error is reported, not silently swallowed, but does " +
      "not abort the run for the remaining parties)",
    async () => {
      const partyA = {
        partyId: "party-a",
        contractId: "contract-a-1",
        storageRatePerCbmDay: "0.05",
        billingTiming: "beginning_of_day",
        cbmThresholdType: "none",
        cbmThreshold: null,
        overThresholdRate: null,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: null,
      };
      const partyB = {
        partyId: "party-b",
        contractId: "contract-b-1",
        storageRatePerCbmDay: "0.10",
        billingTiming: "beginning_of_day",
        cbmThresholdType: "none",
        cbmThreshold: null,
        overThresholdRate: null,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: null,
      };

      mockSelect.mockImplementationOnce(() => makeChain([partyA, partyB]));
      // Prior-day lookups for each party (order follows the active-parties
      // result array).
      mockSelect.mockImplementationOnce(() => makeChain([{ endingCbm: "100" }])); // party-a
      mockSelect.mockImplementationOnce(() => makeChain([{ endingCbm: "50" }])); // party-b

      mockGetVmiPartyMovements.mockImplementation((_db, partyId: string) => {
        if (partyId === "party-a") return Promise.resolve([]);
        if (partyId === "party-b") {
          // party-b's movement query fails — e.g. a transient DB error.
          return Promise.reject(new Error("simulated movement-query failure"));
        }
        return Promise.resolve([]);
      });

      const insertChainA = makeChain([{ id: "ledger-row-a" }]);
      mockInsert.mockImplementationOnce(() => insertChainA);

      const { POST } = await import("@/app/api/internal/vmi-daily-balance/route");

      const response = await POST(makeRequest({ [SECRET_HEADER]: TEST_SECRET }));
      const body = await response.json();

      // The whole batch must not fail/500 just because party-b errored.
      expect(response.status).toBe(200);

      expect(body.results).toContainEqual(
        expect.objectContaining({ partyId: "party-a", status: "inserted" }),
      );
      expect(body.results).toContainEqual(
        expect.objectContaining({ partyId: "party-b", status: "error" }),
      );
      // party-b's failure is surfaced, not silently dropped from the report.
      const partyBResult = body.results.find(
        (r: { partyId: string }) => r.partyId === "party-b",
      );
      expect(partyBResult.error).toBeTruthy();

      // party-a's insert still happened despite party-b's failure.
      expect(mockInsert).toHaveBeenCalledTimes(1);
    },
  );

  // ---------------------------------------------------------------------
  // 5. Asia/Manila date-boundary correctness (tasks.md C.5)
  // ---------------------------------------------------------------------
  describe("Asia/Manila calendar-date boundary helpers (tasks.md C.5, design.md §2.2 step 3)", () => {
    it("resolveManilaLedgerDate returns the Manila calendar date, which can differ from the UTC calendar date", async () => {
      const { resolveManilaLedgerDate } = await import(
        "@/app/api/internal/vmi-daily-balance/route"
      );

      // 20:00 UTC on Aug 19 = 04:00 Manila on Aug 20 (UTC+8, no DST).
      expect(resolveManilaLedgerDate(new Date("2026-08-19T20:00:00.000Z"))).toBe(
        "2026-08-20",
      );
      // 10:00 UTC on Aug 19 = 18:00 Manila on Aug 19 — same calendar date
      // both ways, confirming the function isn't just always +1 day.
      expect(resolveManilaLedgerDate(new Date("2026-08-19T10:00:00.000Z"))).toBe(
        "2026-08-19",
      );
      // Exactly at the Manila midnight boundary: 16:00 UTC = 00:00 Manila
      // the NEXT day.
      expect(resolveManilaLedgerDate(new Date("2026-08-19T16:00:00.000Z"))).toBe(
        "2026-08-20",
      );
    });

    it("resolveManilaDayBoundsUtc returns the correct [startUtc, endUtc) window for a given Manila calendar date", async () => {
      const { resolveManilaDayBoundsUtc } = await import(
        "@/app/api/internal/vmi-daily-balance/route"
      );

      const { startUtc, endUtc } = resolveManilaDayBoundsUtc("2026-08-20");

      expect(startUtc.toISOString()).toBe("2026-08-19T16:00:00.000Z");
      expect(endUtc.toISOString()).toBe("2026-08-20T16:00:00.000Z");
    });
  });
});
