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
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";

type IntegrationDb = PostgresJsDatabase<typeof schema>;

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
      // The migration chain includes scripts with explicit BEGIN/COMMIT
      // blocks. postgres.js only permits those multi-statement migration
      // payloads when the client is single-connection (`max: 1`).
      sql = postgres(connectionString, { prepare: false, max: 1 });

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

    async function assignSystemRole(userId: string, roleKey: string) {
      const [role] = await sql`
        SELECT id FROM roles WHERE key = ${roleKey} AND is_active = true
      `;
      if (!role) throw new Error(`Missing seeded role ${roleKey}`);
      await sql`
        INSERT INTO user_roles (user_id, role_id, grant_reason)
        VALUES (${userId}::uuid, ${role.id}::uuid, ${"integration test grant"})
      `;
    }

    async function expectRlsDenied<T>(operation: Promise<T>) {
      try {
        await operation;
      } catch (error) {
        const cause = (error as { cause?: { code?: string } }).cause;
        expect(cause?.code).toBe("42501");
        return;
      }
      throw new Error("Expected PostgreSQL RLS denial (SQLSTATE 42501)");
    }

    function getOkValue<T>(
      result: { kind: "ok"; value: T } | { kind: "unauthenticated" },
    ): T {
      if (result.kind !== "ok") {
        throw new Error("Expected an authenticated integration result");
      }
      return result.value;
    }

    it("exposes a real Drizzle query builder on the transaction-bound client, and a session only sees its own row (user_profiles_select_self policy)", async () => {
      const { withRlsTransaction } = await import("../rls-transaction");
      const { rlsPool: pool } = await import("../rls-pool");
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

    it("enforces request/approve/reject boundaries in real RLS: requester can create, reviewer can decide, requester cannot self-approve", async () => {
      await assignSystemRole(selfUserId, "warehouse_staff");
      await assignSystemRole(otherUserId, "supervisor");

      const { withRlsTransaction } = await import("../rls-transaction");
      const { rlsPool: pool } = await import("../rls-pool");
      const requestId = "33333333-3333-3333-3333-333333333333";
      const targetId = "44444444-4444-4444-4444-444444444444";
      const requestResult = await withRlsTransaction(
        { getAuthenticatedSession: async () => ({ userId: selfUserId }), pool },
        async (tx) => {
          const db = tx.db as IntegrationDb;
          return db.insert(schema.approvalRequests).values({
            id: requestId,
            idempotencyKey: "integration-approval-request",
            approvalType: "fifo_override",
            requestedAction: "override_fifo",
            targetResourceType: "lot_location_balance",
            targetResourceId: targetId,
            targetSnapshot: { itemId: targetId, requestedQty: 1 },
            requesterUserId: selfUserId,
            reason: "Integration approval request reason",
            expiryAt: new Date(Date.now() + 60_000),
          }).returning({ id: schema.approvalRequests.id });
        },
      );
      expect(requestResult.kind).toBe("ok");
      expect(getOkValue(requestResult)).toHaveLength(1);

      const reviewerResult = await withRlsTransaction(
        { getAuthenticatedSession: async () => ({ userId: otherUserId }), pool },
        async (tx) => {
          const db = tx.db as IntegrationDb;
          const decisions = await db.insert(schema.approvalDecisions).values({
            requestId,
            reviewerUserId: otherUserId,
            outcome: "approved",
            reason: "Integration reviewer approval",
          }).returning({ id: schema.approvalDecisions.id });
          const updated = await db.update(schema.approvalRequests)
            .set({ status: "approved" })
            .where(eq(schema.approvalRequests.id, requestId))
            .returning({ id: schema.approvalRequests.id });
          return { decisions, updated };
        },
      );
      expect(reviewerResult.kind).toBe("ok");
      expect(getOkValue(reviewerResult).decisions).toHaveLength(1);
      expect(getOkValue(reviewerResult).updated).toHaveLength(1);

      await expectRlsDenied(
        withRlsTransaction(
          { getAuthenticatedSession: async () => ({ userId: selfUserId }), pool },
          async (tx) => {
            const db = tx.db as IntegrationDb;
            return db.insert(schema.approvalDecisions).values({
              requestId,
              reviewerUserId: selfUserId,
              outcome: "approved",
              reason: "Self approval must be rejected",
            }).returning({ id: schema.approvalDecisions.id });
          },
        ),
      );

      const [stored] = await sql`
        SELECT status FROM approval_requests WHERE id = ${requestId}::uuid
      `;
      expect(stored.status).toBe("approved");
    });

    it("enforces enrollment and settings mutation boundaries: administrator can write, supervisor cannot", async () => {
      await assignSystemRole(selfUserId, "administrator");
      await assignSystemRole(otherUserId, "supervisor");

      const { withRlsTransaction } = await import("../rls-transaction");
      const { rlsPool: pool } = await import("../rls-pool");
      const partyCode = "INT-RLS-001";
      const adminCreate = await withRlsTransaction(
        { getAuthenticatedSession: async () => ({ userId: selfUserId }), pool },
        async (tx) => {
          const db = tx.db as IntegrationDb;
          return db.insert(schema.parties).values({
            code: partyCode,
            name: "Integration RLS Organization",
            isActive: true,
          }).returning({ id: schema.parties.id });
        },
      );
      expect(adminCreate.kind).toBe("ok");
      expect(getOkValue(adminCreate)).toHaveLength(1);
      const partyId = getOkValue(adminCreate)[0]!.id;

      await expectRlsDenied(
        withRlsTransaction(
          { getAuthenticatedSession: async () => ({ userId: otherUserId }), pool },
          async (tx) => {
            const db = tx.db as IntegrationDb;
            return db.insert(schema.parties).values({
              code: "INT-RLS-DENY",
              name: "Must Not Be Created",
              isActive: true,
            }).returning({ id: schema.parties.id });
          },
        ),
      );

      const adminUpdate = await withRlsTransaction(
        { getAuthenticatedSession: async () => ({ userId: selfUserId }), pool },
        async (tx) => {
          const db = tx.db as IntegrationDb;
          return db.update(schema.parties)
            .set({ name: "Integration RLS Organization Updated" })
            .where(eq(schema.parties.id, partyId))
            .returning({ id: schema.parties.id });
        },
      );
      expect(adminUpdate.kind).toBe("ok");
      expect(getOkValue(adminUpdate)).toHaveLength(1);

      const supervisorUpdate = await withRlsTransaction(
        { getAuthenticatedSession: async () => ({ userId: otherUserId }), pool },
        async (tx) => {
          const db = tx.db as IntegrationDb;
          return db.update(schema.parties)
            .set({ name: "Unauthorized Update" })
            .where(eq(schema.parties.id, partyId))
            .returning({ id: schema.parties.id });
        },
      );
      expect(supervisorUpdate.kind).toBe("ok");
      expect(getOkValue(supervisorUpdate)).toHaveLength(0);

      const profileUpdate = await withRlsTransaction(
        { getAuthenticatedSession: async () => ({ userId: selfUserId }), pool },
        async (tx) => {
          const db = tx.db as IntegrationDb;
          return db.update(schema.userProfiles)
            .set({ displayName: "Self Profile Updated" })
            .where(eq(schema.userProfiles.id, selfUserId))
            .returning({ id: schema.userProfiles.id });
        },
      );
      expect(profileUpdate.kind).toBe("ok");
      expect(getOkValue(profileUpdate)).toHaveLength(1);

      const crossProfileUpdate = await withRlsTransaction(
        { getAuthenticatedSession: async () => ({ userId: otherUserId }), pool },
        async (tx) => {
          const db = tx.db as IntegrationDb;
          return db.update(schema.userProfiles)
            .set({ displayName: "Must Not Update Other Profile" })
            .where(eq(schema.userProfiles.id, selfUserId))
            .returning({ id: schema.userProfiles.id });
        },
      );
      expect(crossProfileUpdate.kind).toBe("ok");
      expect(getOkValue(crossProfileUpdate)).toHaveLength(0);
    });
  },
);
