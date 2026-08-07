// Real-Postgres integration test for lib/db/rls-transaction.ts.
//
// Traceability: specs/02-rbac-roles/design.md §6.3 ("Drizzle and Supabase
// RLS session propagation") — "The implementation design must be validated
// against the selected Supabase connection mode ... with real Postgres
// before code is approved" — and specs/00-steering/testing.md's two-stage
// DB-testing requirement ("Before tasks.md sign-off — real-Postgres
// integration tests ... spin up actual Postgres ... exercise the actual
// functions with real data, and assert on real results (not mocked)").
//
// Backing acceptance criteria: specs/02-rbac-roles/requirements.md §7 AC-14
// ("Real-Postgres integration tests prove RLS separately for select,
// insert, update, and delete paths") and the design.md §13 real-Postgres
// test-bullet "Verify transaction-local JWT/session propagation cannot leak
// between pooled connections."
//
// THIS TEST REQUIRES A LIVE POSTGRES CONNECTION and is run separately from
// the mocked unit-test tier (lib/db/__tests__/rls-transaction.test.ts),
// per this repo's two-stage convention (see vitest.integration.config.mts
// and the "test:integration" package.json script, both added alongside this
// file since no repo convention for this tier existed yet). Point
// DATABASE_URL or TEST_DATABASE_URL at a disposable Postgres instance
// (matching the pattern already used by db-migration-verifier elsewhere in
// this project) before running `npm run test:integration`. Without either
// env var set, every test in this file is skipped (not failed) — this file
// is NOT part of `npm test` / CI's default unit-test run.
//
// This is a RED-step test: it targets lib/db/rls-transaction.ts, which does
// not exist yet. Once a live Postgres connection is available, running this
// file should fail with "Cannot find module '../rls-transaction'" — the
// same missing-implementation failure mode as the mocked unit-test file,
// not a fixture/connectivity error. Until Docker Postgres is available in
// this execution environment, this file cannot itself be run to confirm
// that RED — that verification step is deferred to db-migration-verifier /
// whoever next has a live Postgres available, exactly as instructed.
//
// postgres.js (already a project dependency via drizzle-orm) is used
// directly here rather than through Drizzle's schema layer, since this test
// only needs raw transaction/claim-propagation behavior, not any
// business-table schema.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const hasLiveDb = connectionString.length > 0;

describe.skipIf(!hasLiveDb)(
  "rls-transaction.ts — real-Postgres commit/rollback + claim propagation",
  () => {
    let sql: Sql;
    const table = "rls_transaction_test_rows";

    beforeAll(async () => {
      sql = postgres(connectionString, { prepare: false });
      await sql.unsafe(`DROP TABLE IF EXISTS ${table}`);
      await sql.unsafe(`CREATE TABLE ${table} (id serial PRIMARY KEY, note text NOT NULL)`);
    });

    afterAll(async () => {
      await sql.unsafe(`DROP TABLE IF EXISTS ${table}`);
      await sql.end({ timeout: 5 });
    });

    it("rolls back an insert when the callback throws — the row is never visible from a new connection (design.md §6.3 guaranteed-rollback clause)", async () => {
      const { withRlsTransaction } = await import("../rls-transaction");

      const pool = buildPgPool(sql);
      const getAuthenticatedSession = async () => ({
        userId: "11111111-1111-1111-1111-111111111111",
      });

      await expect(
        withRlsTransaction({ getAuthenticatedSession, pool }, async (tx: unknown) => {
          await (tx as { execute: (q: unknown) => Promise<unknown> }).execute(
            sql`INSERT INTO ${sql(table)} (note) VALUES ('should-not-persist')`,
          );
          throw new Error("forced rollback");
        }),
      ).rejects.toThrow("forced rollback");

      // Fresh, separate connection from the pool — proves the aborted
      // transaction never committed and the row is genuinely not visible,
      // not merely invisible to the same in-flight session.
      const rows = await sql`SELECT * FROM ${sql(table)} WHERE note = 'should-not-persist'`;
      expect(rows.length).toBe(0);
    });

    it("commits an insert on a successful callback — the row IS visible from a new connection afterward", async () => {
      const { withRlsTransaction } = await import("../rls-transaction");

      const pool = buildPgPool(sql);
      const getAuthenticatedSession = async () => ({
        userId: "22222222-2222-2222-2222-222222222222",
      });

      const result = await withRlsTransaction({ getAuthenticatedSession, pool }, async (tx: unknown) => {
        await (tx as { execute: (q: unknown) => Promise<unknown> }).execute(
          sql`INSERT INTO ${sql(table)} (note) VALUES ('should-persist')`,
        );
        return "committed";
      });

      expect(result).toEqual({ kind: "ok", value: "committed" });

      const rows = await sql`SELECT * FROM ${sql(table)} WHERE note = 'should-persist'`;
      expect(rows.length).toBe(1);
    });

    it("propagates auth.uid()-resolvable claims transaction-locally and does not leak them to a later query on the same pooled connection", async () => {
      const { withRlsTransaction, buildRlsClaimStatements } = await import("../rls-transaction");

      const pool = buildPgPool(sql);
      const userId = "33333333-3333-3333-3333-333333333333";
      const getAuthenticatedSession = async () => ({ userId });

      let claimSeenInsideTransaction: string | null = null;
      await withRlsTransaction({ getAuthenticatedSession, pool }, async (tx: unknown) => {
        const rows = await (tx as { execute: (q: unknown) => Promise<{ sub: string }[]> }).execute(
          sql`SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'sub') AS sub`,
        );
        claimSeenInsideTransaction = rows[0]?.sub ?? null;
        return null;
      });

      expect(claimSeenInsideTransaction).toBe(userId);

      // A brand-new, unrelated query against the same underlying pool must
      // NOT see the previous transaction's claim — proving the claim was
      // transaction-local (SET LOCAL / set_config(..., true)), not
      // connection-scoped.
      const leaked = await sql`SELECT current_setting('request.jwt.claims', true) AS claims`;
      expect(leaked[0]?.claims === null || leaked[0]?.claims === "").toBe(true);

      // Sanity check on the exported pure builder used above, real-DB style.
      const statements = buildRlsClaimStatements(userId);
      expect(statements.length).toBeGreaterThan(0);
    });
  },
);

// Minimal RlsPool adapter over postgres.js's own `sql.begin()` transaction
// primitive, matching the RlsPool/RlsConnection/TransactionBoundClient shape
// documented in rls-transaction.test.ts. Kept local to this file since it is
// test-harness wiring, not the module under test.
function buildPgPool(sql: Sql) {
  return {
    async connect() {
      let resolveBegun: (tx: unknown) => void;
      let rejectBegun: (err: unknown) => void;
      let settleOuter: (() => void) | undefined;
      let outcome: "commit" | "rollback" | undefined;

      const begunPromise = new Promise<unknown>((resolve, reject) => {
        resolveBegun = resolve;
        rejectBegun = reject;
      });

      const txFinished = new Promise<void>((resolve) => {
        settleOuter = resolve;
      });

      // postgres.js's sql.begin() itself manages BEGIN/COMMIT/ROLLBACK
      // around the callback it is given. We bridge that shape to the
      // explicit begin()/commit()/rollback()/release() contract this
      // wrapper's tests describe by resolving `begunPromise` with a
      // tx-bound client once inside sql.begin()'s callback, then blocking
      // that same callback until our own commit()/rollback() decides the
      // outcome.
      const txLifecyclePromise = sql
        .begin(async (txSql) => {
          const txClient = {
            execute: async (query: unknown) => {
              // Support both a tagged-template Sql fragment and our own
              // { sql, params } claim-statement shape.
              if (
                query &&
                typeof query === "object" &&
                "sql" in (query as Record<string, unknown>)
              ) {
                const q = query as { sql: string; params: unknown[] };
                return txSql.unsafe(q.sql, q.params as never);
              }
              return txSql.apply(txSql, query as never);
            },
          };
          resolveBegun(txClient);
          await txFinished;
          if (outcome === "rollback") {
            throw new Error("__rls_transaction_test_forced_rollback__");
          }
          return undefined;
        })
        .catch((err: unknown) => {
          if (
            err instanceof Error &&
            err.message === "__rls_transaction_test_forced_rollback__"
          ) {
            return undefined; // expected rollback signal, not a real failure
          }
          throw err;
        });

      return {
        begin: async () => begunPromise,
        commit: async () => {
          outcome = "commit";
          settleOuter!();
          await txLifecyclePromise;
        },
        rollback: async () => {
          outcome = "rollback";
          settleOuter!();
          await txLifecyclePromise;
        },
        release: () => {
          // postgres.js manages pool release internally once sql.begin()'s
          // callback settles; nothing further to do here.
        },
      };
    },
  };
}
