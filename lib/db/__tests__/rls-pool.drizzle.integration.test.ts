// Real-Postgres integration test for lib/db/rls-pool.ts's Drizzle-bound
// transaction client.
//
// Traceability: specs/02-rbac-roles/design.md §6.3 step 4 ("Execute the
// callback through the transaction-bound Drizzle client only") — HIGH
// finding from rbac-rls-reviewer: every lib/actions/* server action
// currently runs its DB work through lib/db/client.ts's plain `db`, which
// never sets the `role`/`request.jwt.claims` GUCs, so RLS is not actually
// enforced at the DB layer today. This file proves the fix's load-bearing
// claim: the `db` handle rls-pool.ts's TransactionBoundClient exposes is a
// REAL Drizzle query builder, bound to the transaction-scoped connection,
// and RLS policies are genuinely active on it (not merely "would be active
// if it were wired up correctly").
//
// This is a RED-step test: as of this commit, lib/db/rls-pool.ts's
// TransactionBoundClient only exposes `execute()` (a raw {sql, params}
// dispatcher) — there is no `.db` property at all, so `tx.db` below is
// `undefined` and `tx.db.select` throws "Cannot read properties of
// undefined". That is the expected RED failure this file proves, not a
// migration/fixture/connectivity error.
//
// THIS TEST REQUIRES A LIVE POSTGRES CONNECTION and follows the same
// two-stage convention as lib/db/__tests__/rls-transaction.integration.test.ts
// and lib/actions/__tests__/receiving.commit-line.integration.test.ts (full
// migration-chain-against-vanilla-Postgres harness, auth stub schema, etc).
// Point TEST_DATABASE_URL or DATABASE_URL at a disposable Postgres instance
// and run via `npm run test:integration`. Without either env var set, every
// test in this file is skipped (not failed).
//
// Unlike receiving.commit-line's auth.uid() stub (which always returns NULL
// because that test doesn't exercise RLS), THIS file needs a REAL auth.uid()
// implementation — the actual Supabase definition, resolving from the
// `request.jwt.claims` GUC's `sub` claim — because proving RLS is actually
// active on the transaction-bound connection is the entire point of this
// test. rls-transaction.ts's buildRlsClaimStatements() sets exactly that GUC
// via set_config(..., true) inside the transaction, so a real auth.uid()
// here is what makes the two modules' contracts actually meet.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const hasLiveDb = connectionString.length > 0;

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

// rls-pool.ts reads DATABASE_URL at module-load time; TEST_DATABASE_URL
// (this file's own preferred var) must be mirrored onto it before the
// dynamic import below so the real pool adapter connects to the same
// disposable test database as this file's own `sql` client.
if (process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

describe.skipIf(!hasLiveDb)(
  "rls-pool.ts — transaction-bound Drizzle client is subject to real RLS (design.md §6.3 step 4)",
  () => {
    let sql: Sql;

    const selfUserId = "11111111-1111-1111-1111-111111111111";
    const otherUserId = "22222222-2222-2222-2222-222222222222";

    beforeAll(async () => {
      sql = postgres(connectionString, { prepare: false, max: 5 });

      await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
      await sql.unsafe(`DROP SCHEMA IF EXISTS auth CASCADE`);
      await sql.unsafe(`DROP SCHEMA IF EXISTS rbac_internal CASCADE`);
      await sql.unsafe(`CREATE SCHEMA public`);

      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS auth`);
      // The REAL Supabase auth.uid() definition (not a NULL-returning stub):
      // resolves from the request.jwt.claims GUC's "sub" claim, exactly the
      // GUC rls-transaction.ts's buildRlsClaimStatements() sets
      // transaction-locally. This is what makes RLS genuinely active for
      // this test, rather than trivially permissive/denying.
      await sql.unsafe(`
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
        LANGUAGE sql STABLE AS $$
          SELECT nullif(
            nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
            ''
          )::uuid
        $$
      `);
      await sql.unsafe(
        `CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$`,
      );
      await sql.unsafe(`CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)`);
      await sql.unsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
      END $$;`);

      const migrationFiles = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      for (const file of migrationFiles) {
        const fullPath = path.join(MIGRATIONS_DIR, file);
        const contents = readFileSync(fullPath, "utf8");
        try {
          await sql.unsafe(contents);
        } catch (err) {
          throw new Error(`Migration ${file} failed to apply: ${(err as Error).message}`);
        }
      }

      // The connecting role for this test's own `sql` fixture stays
      // `postgres` (superuser, bypasses RLS) intentionally — assertions
      // below go through the RLS-enforcing pool adapter under test, not
      // this fixture connection.
    }, 60_000);

    afterAll(async () => {
      await sql.end({ timeout: 5 });
    });

    beforeEach(async () => {
      await sql.unsafe(`TRUNCATE TABLE user_profiles RESTART IDENTITY CASCADE`);

      await sql`
        INSERT INTO user_profiles (id, display_name, status)
        VALUES (${selfUserId}::uuid, 'Self User', 'active')
      `;
      await sql`
        INSERT INTO user_profiles (id, display_name, status)
        VALUES (${otherUserId}::uuid, 'Other User', 'active')
      `;
    });

    it("exposes a real Drizzle query builder on the transaction-bound client, and a session only sees its own row (user_profiles_select_self policy)", async () => {
      const { withRlsTransaction } = await import("../rls-transaction");
      const { rlsPool: pool } = await import("../rls-pool");
      const schema = await import("../schema");

      const getAuthenticatedSession = async () => ({ userId: selfUserId });

      const result = await withRlsTransaction(
        { getAuthenticatedSession, pool },
        async (tx) => {
          const boundTx = tx as unknown as {
            db: { select: () => { from: (t: unknown) => Promise<unknown[]> } };
          };
          return boundTx.db.select().from(schema.userProfiles);
        },
      );

      expect(result.kind).toBe("ok");
      const rows = (result as { kind: "ok"; value: Array<{ id: string }> }).value;

      // RLS is genuinely active: even though two rows exist in the table,
      // the session bound to selfUserId only sees its own row via the
      // user_profiles_select_self policy (id = auth.uid()) -- proving this
      // is real enforcement, not an unfiltered query that happens to return
      // the right answer.
      expect(rows.length).toBe(1);
      expect(rows[0]!.id).toBe(selfUserId);
    });

    it("a different authenticated session sees only ITS own row, not the first session's row — proving per-session isolation, not a fixed/cached result", async () => {
      const { withRlsTransaction } = await import("../rls-transaction");
      const { rlsPool: pool } = await import("../rls-pool");
      const schema = await import("../schema");

      const getAuthenticatedSession = async () => ({ userId: otherUserId });

      const result = await withRlsTransaction(
        { getAuthenticatedSession, pool },
        async (tx) => {
          const boundTx = tx as unknown as {
            db: { select: () => { from: (t: unknown) => Promise<unknown[]> } };
          };
          return boundTx.db.select().from(schema.userProfiles);
        },
      );

      expect(result.kind).toBe("ok");
      const rows = (result as { kind: "ok"; value: Array<{ id: string }> }).value;
      expect(rows.length).toBe(1);
      expect(rows[0]!.id).toBe(otherUserId);
    });
  },
);
