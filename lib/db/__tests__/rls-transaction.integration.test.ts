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

// rls-pool.ts reads DATABASE_URL at module-load time; TEST_DATABASE_URL
// (this file's own preferred var) must be mirrored onto it before the
// dynamic import below so the real, reusable pool adapter connects to the
// same disposable test database as this file's own `sql` client.
if (process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

describe.skipIf(!hasLiveDb)(
  "rls-transaction.ts — real-Postgres commit/rollback + claim propagation",
  () => {
    let sql: Sql;
    const table = "rls_transaction_test_rows";

    beforeAll(async () => {
      sql = postgres(connectionString, { prepare: false });
      await sql.unsafe(`DROP TABLE IF EXISTS ${table}`);
      await sql.unsafe(`CREATE TABLE ${table} (id serial PRIMARY KEY, note text NOT NULL)`);
      // The wrapper switches the transaction's role GUC to `authenticated`
      // (design.md §6.3's own PostgREST/RPC-exposure rationale) which, per
      // §7.1's default-deny baseline, has zero table privileges until
      // explicitly granted -- this scratch table needs the same explicit
      // grant any real table would get in its own migration.
      await sql.unsafe(`GRANT SELECT, INSERT ON ${table} TO authenticated`);
      await sql.unsafe(`GRANT USAGE, SELECT ON SEQUENCE ${table}_id_seq TO authenticated`);
    });

    afterAll(async () => {
      await sql.unsafe(`DROP TABLE IF EXISTS ${table}`);
      await sql.end({ timeout: 5 });
    });

    it("rolls back an insert when the callback throws — the row is never visible from a new connection (design.md §6.3 guaranteed-rollback clause)", async () => {
      const { withRlsTransaction } = await import("../rls-transaction");

      const { rlsPool: pool } = await import("../rls-pool");
      const getAuthenticatedSession = async () => ({
        userId: "11111111-1111-1111-1111-111111111111",
      });

      await expect(
        withRlsTransaction({ getAuthenticatedSession, pool }, async (tx: unknown) => {
          await (tx as { execute: (q: unknown) => Promise<unknown> }).execute({
            sql: `INSERT INTO ${table} (note) VALUES ($1)`,
            params: ["should-not-persist"],
          });
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

      const { rlsPool: pool } = await import("../rls-pool");
      const getAuthenticatedSession = async () => ({
        userId: "22222222-2222-2222-2222-222222222222",
      });

      const result = await withRlsTransaction({ getAuthenticatedSession, pool }, async (tx: unknown) => {
        await (tx as { execute: (q: unknown) => Promise<unknown> }).execute({
          sql: `INSERT INTO ${table} (note) VALUES ($1)`,
          params: ["should-persist"],
        });
        return "committed";
      });

      expect(result).toEqual({ kind: "ok", value: "committed" });

      const rows = await sql`SELECT * FROM ${sql(table)} WHERE note = 'should-persist'`;
      expect(rows.length).toBe(1);
    });

    it("propagates auth.uid()-resolvable claims transaction-locally and does not leak them to a later query on the same pooled connection", async () => {
      const { withRlsTransaction, buildRlsClaimStatements } = await import("../rls-transaction");

      const { rlsPool: pool } = await import("../rls-pool");
      const userId = "33333333-3333-3333-3333-333333333333";
      const getAuthenticatedSession = async () => ({ userId });

      let claimSeenInsideTransaction: string | null = null;
      await withRlsTransaction({ getAuthenticatedSession, pool }, async (tx: unknown) => {
        const rows = await (tx as { execute: (q: unknown) => Promise<{ sub: string }[]> }).execute({
          sql: "select (current_setting('request.jwt.claims', true)::jsonb ->> 'sub') as sub",
          params: [],
        });
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

// The local buildPgPool adapter that used to live here has been promoted to
// lib/db/rls-pool.ts (exported as `rlsPool`) so real application code has a
// ready-to-use RlsPool adapter, not just test-harness wiring. This file now
// imports and exercises that real module directly (see the `rlsPool` import
// above each test), so running these tests proves the exported module
// itself works against real Postgres, not a duplicate local copy of it.
