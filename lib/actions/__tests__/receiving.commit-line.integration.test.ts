// Real-Postgres integration test for the commitWrrLine server action
// (lib/actions/receiving.ts).
//
// AMENDED 2026-08-20 (this pass): rewritten for the per-unit store commit
// amendment. Supersedes the 2026-08-10 per-line-batch version of this file
// (which is what's currently implemented and therefore what every rewritten
// test below is expected to fail against).
//
// Traceability:
//   specs/00-steering/revision-log.md — "07 receiving reversed" (2026-08-10)
//     and the 2026-08-20 per-unit follow-up amendment.
//   specs/07-incoming-receiving/design.md §9 — "Amended 2026-08-20: the
//     atomic step is now the unit, not the line." For a `store` line, each
//     individual scanned unit's commit ("Store") is its own atomic
//     transaction: on the line's first unit, creates the lot (status
//     'available'); on every unit, creates-or-increments the matching
//     lot_location_balances row at that unit's chosen location and inserts
//     one inventory_transactions row (qty=1); increments
//     wrr_items.scanned_qty (now "units committed so far") by 1;
//     wrr_items.committed_at is set only once scanned_qty reaches
//     expected_qty (the line's terminal state), not on every unit-commit.
//     `inspect`-disposition lines are UNCHANGED — still one whole-line
//     commit, still gated on the full scanned_qty, still using committed_at
//     as that single event's idempotency gate (§6.3, unaffected by this
//     amendment).
//   specs/07-incoming-receiving/design.md §6.2b — units of the same line MAY
//     commit to different locations once an earlier location's capacity is
//     exhausted; this produces more than one lot_location_balances row for
//     the SAME lot (same lot_id, different location_id), never a second lot.
//   specs/07-incoming-receiving/requirements.md (amended 2026-08-20):
//     R3.10 — each unit commits as its own atomic step; a line's units MAY
//       be committed one at a time; the line need not be fully scanned
//       before its first unit commits.
//     R3.11 — units of the same line MAY split across more than one
//       location; an additional lot_location_balances row is created per
//       additional location used.
//     R7.1/R7.2 — per-unit store commit, atomically validated per unit.
//     R7.3 — lot created once (first unit), reused thereafter; balance
//       created-or-incremented per unit's chosen location; one
//       inventory_transactions row per unit (qty=1); WRR reaches `confirmed`
//       only once every line's every expected unit is terminal.
//     R7.5 — each unit-commit is idempotent, scoped to that individual
//       unit-commit event (NOT to the line, and NOT via committed_at, which
//       now marks only the line's full terminal completion).
//     R7.6 — a failed unit-commit leaves no partial outcome for that unit
//       and does not affect any other unit's — on the same line or any
//       other line's — already-committed state.
//
// DESIGN DECISION (this RED step, since design.md §9's prose does not fix an
// exact TypeScript signature, and explicitly defers the per-unit idempotency
// storage mechanism to "implementation-level detail... not a schema/
// invariant question requiring 01's sign-off"):
//
//   commitWrrLine(resolver, wrrId, wrrItemId, params, rlsDeps)
//   where params is now:
//     { locationId: string; idempotencyKey?: string }
//
//   - For a `store`-disposition line, `idempotencyKey` is REQUIRED — a
//     missing/empty key is rejected before any write (R7.5's "scoped to
//     that individual unit-commit event" needs a caller-supplied key to
//     scope against, following this codebase's existing idempotencyKey
//     convention — see lib/withdrawal/withdrawal-validator.ts's
//     `idempotencyKey?: string` field and lib/db/schema/approvals.ts's
//     caller-supplied, unique `idempotency_key` column). Calling
//     commitWrrLine twice with the SAME idempotencyKey for the SAME
//     wrrItemId must be a no-op retry: it returns the original authoritative
//     { ok: true } WITHOUT incrementing scanned_qty, WITHOUT creating a
//     second lot_location_balances increment, and WITHOUT inserting a
//     second inventory_transactions row for that unit. Calling it again with
//     a DIFFERENT idempotencyKey for the same wrrItemId is a NEW unit.
//     This file tests this behavior black-box (by its observable effect on
//     scanned_qty/balance/transaction rows), not by asserting any specific
//     internal storage mechanism for the key itself — the exact mechanism
//     is left to the implementation, per design.md §9's own note.
//   - For an `inspect`-disposition line, idempotencyKey is not required —
//     that path is UNCHANGED from 2026-08-10 and continues to use
//     committed_at as its sole per-line idempotency gate.
//
// ---------------------------------------------------------------------------
// THIS TEST REQUIRES A LIVE POSTGRES CONNECTION, following the same
// two-stage convention as lib/db/__tests__/rls-transaction.integration.test.ts
// and specs/00-steering/testing.md's "Before tasks.md sign-off" real-Postgres
// stage. Point TEST_DATABASE_URL or DATABASE_URL at a DISPOSABLE Postgres
// instance and run via `npm run test:integration`. Without either env var
// set, every test in this file is skipped (not failed).
//
// SAFETY NOTE (added 2026-08-20 RED pass): this file's beforeAll runs
// `DROP SCHEMA public/auth/rbac_internal CASCADE` before replaying every
// migration from scratch. Never point TEST_DATABASE_URL/DATABASE_URL at a
// shared or production database when running this file — only a disposable,
// throwaway Postgres instance (the same discipline db-migration-verifier
// already follows).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const hasLiveDb = connectionString.length > 0;

// rls-pool.ts reads DATABASE_URL at module-load time; bridge TEST_DATABASE_URL
// into it before any dynamic import of rls-pool/receiving below, matching
// lib/db/__tests__/rls-pool.drizzle.integration.test.ts's established pattern.
if (process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

function makeResolver(resolution: AuthorizationResolution): RequestAuthorizationResolver {
  return { getContext: async () => resolution };
}

const confirmContext: AuthorizationContext = {
  userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [{ resource: "receiving", action: "confirm", scopeKind: "global" }],
  partyScopes: [],
};

const noReceivingContext: AuthorizationContext = {
  userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [],
  partyScopes: [],
};

const authorizedConfirmResolver = () => makeResolver({ kind: "authorized", context: confirmContext });
const noReceivingResolver = () => makeResolver({ kind: "authorized", context: noReceivingContext });

describe.skipIf(!hasLiveDb)(
  "commitWrrLine — real-Postgres per-unit commit (design.md §9 amended 2026-08-20, requirements.md R3.10/R3.11/R7.1-R7.6 amended 2026-08-20)",
  () => {
    let sql: Sql;

    // Fixture IDs shared across a test via beforeEach setup helpers.
    let vendorPartyId: string;
    let itemId: string;
    let storageLocationId: string;
    let otherStorageLocationId: string;
    let inspectionLocationId: string;
    let inactiveLocationId: string;

    beforeAll(async () => {
      sql = postgres(connectionString, { prepare: false, max: 5 });

      // Fresh schema every run — this test may reuse a persistent disposable
      // Postgres container across multiple invocations (not a fresh
      // container each time), so start from a clean slate rather than
      // assuming an empty database.
      await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
      await sql.unsafe(`DROP SCHEMA IF EXISTS auth CASCADE`);
      await sql.unsafe(`DROP SCHEMA IF EXISTS rbac_internal CASCADE`);
      await sql.unsafe(`CREATE SCHEMA public`);

      // Real auth.uid()/auth.jwt() definitions — resolves from the
      // request.jwt.claims GUC's "sub" claim, exactly like Supabase's actual
      // implementation, matching rls-pool.drizzle.integration.test.ts's
      // pattern. commitWrrLine's writes are genuinely RLS-enforced, so a
      // NULL-returning stub would make every write fail RLS regardless of
      // the seeded grants below.
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS auth`);
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
      // Some migrations (e.g. 0018_generated_documents.sql) reference
      // auth.users(id) as an FK target -- Supabase provisions this table
      // itself; vanilla Postgres needs a minimal stand-in for the migration
      // chain to apply at all. This test does not exercise its contents.
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

      // Real RBAC rows for confirmContext.userId so the actual RLS policies
      // (rbac_internal.has_permission) genuinely authorize commitWrrLine's
      // writes, not just the app-layer requirePermission mock resolver.
      // warehouse_staff already holds receiving.confirm per
      // 0005_rbac_constraints_and_seed.sql's role_permissions seed -- no new
      // grant needed, just linking this test's fixed userId to that role.
      await sql`
        INSERT INTO user_profiles (id, display_name, status)
        VALUES (${confirmContext.userId}, 'Test Confirm User', 'active')
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO user_roles (user_id, role_id)
        SELECT ${confirmContext.userId}, id FROM roles WHERE key = 'warehouse_staff'
      `;
    }, 60_000);

    // Real RlsPool bound to this test's own connection string (rls-pool.ts's
    // module-level rlsPool reads DATABASE_URL, which is bridged from
    // TEST_DATABASE_URL above) plus a stub getAuthenticatedSession resolving
    // to the fixture's own userId -- the real Supabase-cookie-based default
    // getAuthenticatedSession has no request context to read in this test
    // environment, so every commitWrrLine call below passes this explicitly.
    async function rlsDepsFor(userId: string): Promise<RlsTransactionDeps> {
      // Dynamic import, not a static one: rls-pool.ts reads DATABASE_URL at
      // module-load time, and a static top-level import would be hoisted
      // ahead of this file's DATABASE_URL bridge above (ES module semantics
      // evaluate import statements before other top-level code) — matching
      // rls-pool.drizzle.integration.test.ts's established pattern.
      const { rlsPool } = await import("@/lib/db/rls-pool");
      return {
        getAuthenticatedSession: async () => ({ userId }),
        pool: rlsPool,
      };
    }

    afterAll(async () => {
      await sql.end({ timeout: 5 });
    });

    beforeEach(async () => {
      // Clean slate: truncate every table this test touches, in FK-safe
      // order, before seeding fresh fixtures for the next test.
      await sql.unsafe(`
        TRUNCATE TABLE inventory_transactions, lot_location_balances, lots,
          wrr_inspection_logs, wrr_items, wrr_documents, items, locations,
          parties RESTART IDENTITY CASCADE
      `);

      const [party] = await sql`
        INSERT INTO parties (code, name) VALUES ('VEND-01', 'Test Vendor')
        RETURNING id
      `;
      vendorPartyId = party.id as string;

      const [item] = await sql`
        INSERT INTO items (code, name, barcode, volume_cbm)
        VALUES ('ITEM-01', 'Test Item', 'BARCODE-01', 0.5)
        RETURNING id
      `;
      itemId = item.id as string;

      const [storageLoc] = await sql`
        INSERT INTO locations (zone, rack, level, position, label, location_type, max_cbm_capacity, is_active)
        VALUES ('A', '1', '1', '01', 'A1-01', 'storage', 100, true)
        RETURNING id
      `;
      storageLocationId = storageLoc.id as string;

      const [otherStorageLoc] = await sql`
        INSERT INTO locations (zone, rack, level, position, label, location_type, max_cbm_capacity, is_active)
        VALUES ('A', '1', '2', '01', 'A1-02', 'storage', 100, true)
        RETURNING id
      `;
      otherStorageLocationId = otherStorageLoc.id as string;

      const [inspectionLoc] = await sql`
        INSERT INTO locations (zone, rack, level, position, label, location_type, max_cbm_capacity, is_active)
        VALUES ('INSP', '1', '1', '01', 'INSP-01', 'inspection', 100, true)
        RETURNING id
      `;
      inspectionLocationId = inspectionLoc.id as string;

      const [inactiveLoc] = await sql`
        INSERT INTO locations (zone, rack, level, position, label, location_type, max_cbm_capacity, is_active)
        VALUES ('A', '1', '3', '01', 'A1-03', 'storage', 100, false)
        RETURNING id
      `;
      inactiveLocationId = inactiveLoc.id as string;
    });

    // `scannedQty` here now seeds "units already committed so far" (the
    // re-scoped meaning of wrr_items.scanned_qty, design.md §9) — for a
    // FRESH line with nothing committed yet, pass 0.
    async function createWrrFixture(
      lines: Array<{
        lotNumber: string;
        expectedQty: number;
        scannedQty: number;
        disposition: "store" | "inspect";
      }>,
    ): Promise<{ wrrId: string; lineIds: string[] }> {
      const [wrr] = await sql`
        INSERT INTO wrr_documents (wrr_number, vendor_party_id, flow_type, status, staged_by_user_id)
        VALUES (${"WRR-TEST-" + Date.now() + "-" + Math.random().toString(36).slice(2)},
          ${vendorPartyId}, 'vmi', 'receiving_in_progress', ${confirmContext.userId})
        RETURNING id
      `;
      const wrrId = wrr.id as string;

      const lineIds: string[] = [];
      for (const line of lines) {
        const [row] = await sql`
          INSERT INTO wrr_items (wrr_id, item_id, lot_number, expected_qty, scanned_qty, unit_cbm, uom, disposition)
          VALUES (${wrrId}, ${itemId}, ${line.lotNumber}, ${line.expectedQty}, ${line.scannedQty}, 0.5, 'CTN', ${line.disposition})
          RETURNING id
        `;
        lineIds.push(row.id as string);
      }

      return { wrrId, lineIds };
    }

    // -----------------------------------------------------------------
    // 1. Happy path — a store line's FIRST unit commit (R7.3/R3.10, §9)
    // -----------------------------------------------------------------
    it("(AC R7.3/R3.10, design.md §9) commits exactly one unit for a fresh store line: creates one available lot, one balance row (qty=1) at the given location, one receiving ledger row (qty=1), increments scanned_qty by 1, and leaves committed_at/wrr status untouched since the line is not yet complete", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-A", expectedQty: 10, scannedQty: 0, disposition: "store" },
      ]);

      const result = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId, idempotencyKey: "unit-1" },
        await rlsDepsFor(confirmContext.userId),
      );

      expect(result.ok).toBe(true);

      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRows.length).toBe(1);
      expect(lotRows[0].status).toBe("available");
      expect(lotRows[0].lot_number).toBe("LOT-A");

      const balanceRows = await sql`SELECT * FROM lot_location_balances WHERE lot_id = ${lotRows[0].id}`;
      expect(balanceRows.length).toBe(1);
      expect(balanceRows[0].location_id).toBe(storageLocationId);
      expect(balanceRows[0].qty_received).toBe(1);
      expect(balanceRows[0].qty_remaining).toBe(1);

      const txnRows = await sql`SELECT * FROM inventory_transactions WHERE lot_id = ${lotRows[0].id}`;
      expect(txnRows.length).toBe(1);
      expect(txnRows[0].movement_type).toBe("receiving");
      expect(txnRows[0].to_location_id).toBe(storageLocationId);
      expect(txnRows[0].qty).toBe(1);

      const itemRow = await sql`SELECT scanned_qty, committed_at FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect(itemRow[0].scanned_qty).toBe(1);
      // Only 1 of 10 expected units committed — line is NOT terminal yet.
      expect(itemRow[0].committed_at).toBeNull();

      const wrrRow = await sql`SELECT status FROM wrr_documents WHERE id = ${wrrId}`;
      expect(wrrRow[0].status).toBe("receiving_in_progress");
    });

    // -----------------------------------------------------------------
    // 2. Sequential per-unit commits to completion — committed_at only
    //    set on the LAST unit, and only then does the WRR flip (R7.3, §9)
    // -----------------------------------------------------------------
    it("(AC R7.3, design.md §9) sets wrr_items.committed_at only once the line's final expected unit commits, and flips wrr_documents.status to 'confirmed' only once every line is terminal", async () => {
      const { commitWrrLine } = await import("../receiving");

      // Two single-unit lines: each line completes in exactly one commit
      // call, letting this test isolate "does the WRR wait for the SECOND
      // line" without needing many sequential per-unit calls on one line
      // (that finer-grained progression is covered by test 3 below).
      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-1", expectedQty: 1, scannedQty: 0, disposition: "store" },
        { lotNumber: "LOT-2", expectedQty: 1, scannedQty: 0, disposition: "store" },
      ]);

      const first = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId, idempotencyKey: "line1-unit1" },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(first.ok).toBe(true);

      const line1Row = await sql`SELECT committed_at FROM wrr_items WHERE id = ${lineIds[0]}`;
      // expectedQty=1, and this was its only unit — terminal immediately.
      expect(line1Row[0].committed_at).not.toBeNull();

      let wrrRow = await sql`SELECT status FROM wrr_documents WHERE id = ${wrrId}`;
      expect(wrrRow[0].status).toBe("receiving_in_progress");

      const second = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[1],
        { locationId: storageLocationId, idempotencyKey: "line2-unit1" },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(second.ok).toBe(true);

      wrrRow = await sql`SELECT status FROM wrr_documents WHERE id = ${wrrId}`;
      expect(wrrRow[0].status).toBe("confirmed");
    });

    // -----------------------------------------------------------------
    // 3. Multi-unit progression on ONE line — committed_at stays null
    //    until the LAST of several units, not the first (R7.3, §9)
    // -----------------------------------------------------------------
    it("(AC R7.3, design.md §9) a 3-unit store line stays non-terminal (committed_at null) after its first two unit-commits, and only becomes terminal after the third", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-MULTI", expectedQty: 3, scannedQty: 0, disposition: "store" },
      ]);

      for (const [n, key] of [
        [1, "multi-unit-1"],
        [2, "multi-unit-2"],
      ] as const) {
        const result = await commitWrrLine(
          authorizedConfirmResolver(),
          wrrId,
          lineIds[0],
          { locationId: storageLocationId, idempotencyKey: key },
          await rlsDepsFor(confirmContext.userId),
        );
        expect(result.ok).toBe(true);

        const itemRow = await sql`SELECT scanned_qty, committed_at FROM wrr_items WHERE id = ${lineIds[0]}`;
        expect(itemRow[0].scanned_qty).toBe(n);
        expect(itemRow[0].committed_at).toBeNull();
      }

      const third = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId, idempotencyKey: "multi-unit-3" },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(third.ok).toBe(true);

      const finalRow = await sql`SELECT scanned_qty, committed_at FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect(finalRow[0].scanned_qty).toBe(3);
      expect(finalRow[0].committed_at).not.toBeNull();

      // Still exactly one lot for the whole line, reused across all 3 units.
      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRows.length).toBe(1);
      const balanceRows = await sql`SELECT * FROM lot_location_balances WHERE lot_id = ${lotRows[0].id}`;
      expect(balanceRows.length).toBe(1);
      expect(balanceRows[0].qty_received).toBe(3);
      expect(balanceRows[0].qty_remaining).toBe(3);
    });

    // -----------------------------------------------------------------
    // 4. Multi-location split (§6.2b, R3.11) — two units of the SAME line
    //    committed to two DIFFERENT locations produce two balance rows
    //    for the SAME lot
    // -----------------------------------------------------------------
    it("(AC R3.11, design.md §6.2b/§9) a 2-unit store line whose units go to two different locations ends with one lot and TWO lot_location_balances rows (one per location), each qty=1", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-SPLIT", expectedQty: 2, scannedQty: 0, disposition: "store" },
      ]);

      const firstUnit = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId, idempotencyKey: "split-unit-1" },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(firstUnit.ok).toBe(true);

      const secondUnit = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: otherStorageLocationId, idempotencyKey: "split-unit-2" },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(secondUnit.ok).toBe(true);

      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRows.length).toBe(1);

      const balanceRows = await sql`
        SELECT * FROM lot_location_balances WHERE lot_id = ${lotRows[0].id} ORDER BY location_id
      `;
      expect(balanceRows.length).toBe(2);
      const byLocation = Object.fromEntries(
        balanceRows.map((r) => [r.location_id as string, r]),
      );
      expect(byLocation[storageLocationId].qty_received).toBe(1);
      expect(byLocation[storageLocationId].qty_remaining).toBe(1);
      expect(byLocation[otherStorageLocationId].qty_received).toBe(1);
      expect(byLocation[otherStorageLocationId].qty_remaining).toBe(1);

      const itemRow = await sql`SELECT scanned_qty, committed_at FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect(itemRow[0].scanned_qty).toBe(2);
      expect(itemRow[0].committed_at).not.toBeNull();
    });

    // -----------------------------------------------------------------
    // 5. Create-or-increment (design.md §9 step 4) — two units to the SAME
    //    location increment one row rather than creating a duplicate
    // -----------------------------------------------------------------
    it("(AC design.md §9 step 4) two units of the same line committed to the SAME location increment one lot_location_balances row (qty_received=2), not two separate rows", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-SAMELOC", expectedQty: 2, scannedQty: 0, disposition: "store" },
      ]);

      await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId, idempotencyKey: "sameloc-unit-1" },
        await rlsDepsFor(confirmContext.userId),
      );
      await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId, idempotencyKey: "sameloc-unit-2" },
        await rlsDepsFor(confirmContext.userId),
      );

      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRows.length).toBe(1);

      const balanceRows = await sql`SELECT * FROM lot_location_balances WHERE lot_id = ${lotRows[0].id}`;
      expect(balanceRows.length).toBe(1);
      expect(balanceRows[0].location_id).toBe(storageLocationId);
      expect(balanceRows[0].qty_received).toBe(2);
      expect(balanceRows[0].qty_remaining).toBe(2);

      const txnRows = await sql`SELECT * FROM inventory_transactions WHERE lot_id = ${lotRows[0].id}`;
      expect(txnRows.length).toBe(2);
    });

    // -----------------------------------------------------------------
    // 6. Per-unit idempotency scoped to the unit-commit event, NOT
    //    committed_at (R7.5, design.md §9's re-scoping — the core proof
    //    that per-unit idempotency is independent of the line's terminal
    //    state, since committed_at stays NULL throughout this test)
    // -----------------------------------------------------------------
    it("(AC R7.5, design.md §9) retrying commitWrrLine with the SAME idempotencyKey for the same unit does not double-count it, even while the line's committed_at is still null (mid-line, not yet terminal)", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-IDEMP", expectedQty: 5, scannedQty: 0, disposition: "store" },
      ]);

      const first = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId, idempotencyKey: "idemp-unit-1" },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(first.ok).toBe(true);

      const retry = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        // SAME idempotencyKey as the first call — must be a no-op retry.
        { locationId: storageLocationId, idempotencyKey: "idemp-unit-1" },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(retry.ok).toBe(true);

      const itemRow = await sql`SELECT scanned_qty, committed_at FROM wrr_items WHERE id = ${lineIds[0]}`;
      // Still 1 — the retry must NOT have incremented a second time.
      expect(itemRow[0].scanned_qty).toBe(1);
      // Line is nowhere near complete (1 of 5) — committed_at is null,
      // proving the retry-safety above did NOT rely on committed_at at all.
      expect(itemRow[0].committed_at).toBeNull();

      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRows.length).toBe(1);
      const balanceRows = await sql`SELECT * FROM lot_location_balances WHERE lot_id = ${lotRows[0].id}`;
      expect(balanceRows.length).toBe(1);
      expect(balanceRows[0].qty_received).toBe(1);
      const txnRows = await sql`SELECT * FROM inventory_transactions WHERE lot_id = ${lotRows[0].id}`;
      expect(txnRows.length).toBe(1);
    });

    it("(AC R7.5, design.md §9) a DIFFERENT idempotencyKey for the same wrrItemId is treated as a NEW unit, not a retry", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-NEWKEY", expectedQty: 5, scannedQty: 0, disposition: "store" },
      ]);

      await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId, idempotencyKey: "newkey-unit-1" },
        await rlsDepsFor(confirmContext.userId),
      );
      await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId, idempotencyKey: "newkey-unit-2" },
        await rlsDepsFor(confirmContext.userId),
      );

      const itemRow = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect(itemRow[0].scanned_qty).toBe(2);
    });

    // -----------------------------------------------------------------
    // 6b. Genuine concurrency, not sequential retries — TWO SIMULTANEOUS
    //     commitWrrLine calls with the IDENTICAL idempotencyKey for the
    //     SAME unit (R7.5, design.md §9's idempotency requirement).
    //
    //     The sequential-retry tests above ("SAME idempotencyKey"/
    //     "DIFFERENT idempotencyKey") only prove that a SECOND call, made
    //     after the FIRST has already committed, sees the first call's row
    //     via commitStoreUnit's SELECT and short-circuits cleanly. They do
    //     NOT prove anything about two callers racing the SAME
    //     check-then-act window (found via db-migration-verifier's
    //     real-Postgres scratch concurrency probe on this same amendment):
    //     commitStoreUnit's idempotency guard is a plain
    //     `SELECT ... WHERE transaction_number = unitTxnNumber` followed,
    //     several statements later, by `INSERT INTO inventory_transactions`
    //     — under genuinely simultaneous calls with the identical
    //     idempotencyKey, both transactions can pass the SELECT before
    //     either commits, both proceed to INSERT, and the loser's INSERT
    //     throws an unhandled Postgres unique-violation
    //     (`inventory_transactions_transaction_number_unique`) that
    //     currently propagates, uncaught, out of commitStoreUnit and
    //     commitWrrLine — a rejected promise, not the graceful idempotent
    //     `{ ok: true }` no-op (or clean `{ ok: false, errors: [...] }`)
    //     R7.5 and design.md §9's idempotency requirement require. Data
    //     integrity itself already holds (the UNIQUE constraint prevents a
    //     duplicate row), but the API contract breaks for the losing
    //     caller. This test fires both calls via `Promise.allSettled`
    //     (never sequential `await`s) so both genuinely race the same
    //     window, and asserts neither settles as "rejected".
    // -----------------------------------------------------------------
    it("(AC R7.5, design.md §9's idempotency requirement) two genuinely SIMULTANEOUS commitWrrLine calls with the IDENTICAL idempotencyKey for the same unit both resolve (neither call rejects with an unhandled Postgres unique-violation), and exactly one unit is committed", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-RACE", expectedQty: 5, scannedQty: 0, disposition: "store" },
      ]);

      // Two independent RLS-bound connections, resolved BEFORE either
      // commitWrrLine call starts, so neither call's own internal work is
      // serialized behind the other by an accidental shared `await` here.
      const depsA = await rlsDepsFor(confirmContext.userId);
      const depsB = await rlsDepsFor(confirmContext.userId);

      // Both calls are invoked back-to-back with no `await` between them,
      // then raced via Promise.allSettled — this is what makes the two
      // calls genuinely concurrent (both begin their own transaction and
      // reach commitStoreUnit's idempotency SELECT before either one's
      // INSERT commits), unlike a sequential `await call1(); await call2();`
      // pattern, which would let call2's SELECT observe call1's already-
      // committed row and never exercise the race at all.
      const [resultA, resultB] = await Promise.allSettled([
        commitWrrLine(
          authorizedConfirmResolver(),
          wrrId,
          lineIds[0],
          { locationId: storageLocationId, idempotencyKey: "race-unit-1" },
          depsA,
        ),
        commitWrrLine(
          authorizedConfirmResolver(),
          wrrId,
          lineIds[0],
          { locationId: storageLocationId, idempotencyKey: "race-unit-1" },
          depsB,
        ),
      ]);

      // THE BUG UNDER TEST: neither concurrent caller may see an unhandled
      // rejection — both must settle as "fulfilled", whether with
      // { ok: true } (graceful idempotent no-op/success) or a clean
      // { ok: false, errors: [...] } returned normally. Prior to the fix,
      // exactly one of these two currently settles as "rejected" with a
      // raw Postgres unique-violation error instead.
      expect(resultA.status).toBe("fulfilled");
      expect(resultB.status).toBe("fulfilled");

      const fulfilledValues = [resultA, resultB]
        .filter(
          (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof commitWrrLine>>> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value);
      // The race must not have LOST the unit commit that genuinely
      // happened — at least one of the two settled outcomes reports the
      // authoritative success.
      expect(fulfilledValues.some((v) => v.ok === true)).toBe(true);

      // Data integrity (already true via the UNIQUE constraint, locked in
      // here as the observable application-level effect): exactly one
      // committed unit resulted from the race, never a duplicate.
      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRows.length).toBe(1);

      const balanceRows = await sql`SELECT * FROM lot_location_balances WHERE lot_id = ${lotRows[0].id}`;
      expect(balanceRows.length).toBe(1);
      expect(balanceRows[0].qty_received).toBe(1);

      const txnRows = await sql`SELECT * FROM inventory_transactions WHERE lot_id = ${lotRows[0].id}`;
      expect(txnRows.length).toBe(1);

      // Not double-incremented, even on the losing side of the race.
      const itemRow = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect(itemRow[0].scanned_qty).toBe(1);
    });

    // -----------------------------------------------------------------
    // 6c. Genuine concurrency with DISTINCT idempotencyKeys on the SAME
    //     line — the normal case (e.g. several units of one line committed
    //     in close succession), not a double-tap retry of the same unit.
    //     Found via db-migration-verifier's ad-hoc real-Postgres stress
    //     test on this same 2026-08-20 amendment (not previously part of
    //     this permanent suite): commitStoreUnit's lot lookup (design.md §9
    //     step 3, "on the line's first committed unit, creates the lot; on
    //     every subsequent unit, reuses it") is a plain
    //     `SELECT lots WHERE wrr_item_id = line.id` followed, several
    //     statements later, by `INSERT INTO lots` — unlike the
    //     inventory_transactions row inserted per unit, `lots` has NO
    //     unique constraint on wrr_item_id (lib/db/schema/lots.ts), so under
    //     genuinely simultaneous calls with DIFFERENT idempotencyKeys (thus
    //     DIFFERENT deterministic transaction_numbers — the identical-key
    //     race's savepoint-and-retry recovery in commitStoreUnit never
    //     triggers here, since there is no unique-constraint conflict to
    //     catch), every racing call can independently observe "no lot yet"
    //     and insert its OWN lot for the same wrr_item_id, violating design.md
    //     §9's "exactly one lot reused across all units of a line" invariant.
    //     Each racer's lot_location_balances create-or-increment (§9 step 4)
    //     then also targets its OWN phantom lot's (lot_id, location_id) pair,
    //     so lot_location_balances' unique(lot_id, location_id) constraint
    //     never fires either — the result is several qty_received=1 balance
    //     rows fragmented across several phantom lots, instead of one
    //     qty_received=4 row on one lot. Separately, the final
    //     `wrr_items.scanned_qty` update
    //     (`newCommittedCount = line.scannedQty + 1`, computed from a
    //     snapshot fetched once at the top of commitWrrLine's own
    //     transaction, then written via an absolute
    //     `SET scanned_qty = newCommittedCount` rather than an atomic
    //     increment) means every racer computes the SAME newCommittedCount
    //     from the SAME stale snapshot, and whichever transaction's UPDATE
    //     commits last simply overwrites the others' — the line can end up
    //     stuck below expected_qty forever even though every unit was
    //     physically stored. All three symptoms are asserted below.
    // -----------------------------------------------------------------
    it("(AC R7.3/R3.10, design.md §9 — 'exactly one lot reused across all units of a line' and each unit-commit posts atomically) four genuinely SIMULTANEOUS commitWrrLine calls with FOUR DISTINCT idempotencyKeys for the SAME line end with exactly one lot, one lot_location_balances row (qty_received=4), and scanned_qty=4 — not four fragmented lots/balances and a lost scanned_qty count", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-CONCURRENT-DISTINCT", expectedQty: 10, scannedQty: 0, disposition: "store" },
      ]);

      // Four independent RLS-bound connections, resolved BEFORE any
      // commitWrrLine call starts (matching test 6b's pattern above), so
      // none of the four calls' own internal work is serialized behind
      // another by an accidental shared `await` here.
      const deps = await Promise.all([
        rlsDepsFor(confirmContext.userId),
        rlsDepsFor(confirmContext.userId),
        rlsDepsFor(confirmContext.userId),
        rlsDepsFor(confirmContext.userId),
      ]);

      // All four calls are dispatched back-to-back with no `await` between
      // them, then raced via Promise.allSettled — genuine concurrency, not
      // a sequential double-tap. Each uses a DISTINCT idempotencyKey (four
      // separate physical units of the same line, the normal receiving
      // case) and the SAME locationId, matching the verifier's confirmed
      // repro.
      const results = await Promise.allSettled(
        ["distinct-unit-1", "distinct-unit-2", "distinct-unit-3", "distinct-unit-4"].map(
          (idempotencyKey, i) =>
            commitWrrLine(
              authorizedConfirmResolver(),
              wrrId,
              lineIds[0],
              { locationId: storageLocationId, idempotencyKey },
              deps[i],
            ),
        ),
      );

      // 4. Already-working part, locked in so a future fix doesn't regress
      //    it while fixing the other two races: every call resolves (no
      //    unhandled rejection) with { ok: true }.
      for (const result of results) {
        expect(result.status).toBe("fulfilled");
      }
      const fulfilled = results
        .filter(
          (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof commitWrrLine>>> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value);
      for (const value of fulfilled) {
        expect(value.ok).toBe(true);
      }

      // Each of the three checks below is a DISTINCT symptom of the two
      // races described in design.md §9 (lot lookup race; lost scanned_qty
      // update) — `expect.soft` so a future fix that only addresses ONE of
      // the two races still gets caught here by the OTHER soft assertion,
      // in a single test run, rather than needing a second RED cycle to
      // surface the remaining symptom.

      // 1. Exactly ONE lot for this wrr_item_id — not four phantom lots
      //    (the lot-lookup race: SELECT-then-INSERT with no unique
      //    constraint on lots.wrr_item_id).
      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect.soft(lotRows.length).toBe(1);

      // 2. Exactly ONE lot_location_balances row for (that lot, that
      //    location), with qty_received=4 — not four separate rows of 1
      //    each fragmented across phantom lots (a direct consequence of
      //    symptom 1: each phantom lot gets its own balance row, so the
      //    lot_location_balances unique(lot_id, location_id) constraint
      //    never fires).
      const lotIdForBalanceLookup = lotRows[0]?.id ?? null;
      const balanceRows = lotIdForBalanceLookup
        ? await sql`
            SELECT * FROM lot_location_balances
            WHERE lot_id = ${lotIdForBalanceLookup} AND location_id = ${storageLocationId}
          `
        : [];
      expect.soft(balanceRows.length).toBe(1);
      expect.soft(balanceRows[0]?.qty_received).toBe(4);
      expect.soft(balanceRows[0]?.qty_remaining).toBe(4);

      // 3. wrr_items.scanned_qty reflects all four committed units — not
      //    lost/overwritten down to 1 by the last racer's absolute
      //    `SET scanned_qty = newCommittedCount` (the second, independent
      //    race: every racer computes newCommittedCount from the same
      //    stale snapshot rather than an atomic increment).
      const itemRow = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect.soft(itemRow[0].scanned_qty).toBe(4);
    });

    it("(AC R7.5 amended 2026-08-20) rejects a store-disposition unit-commit missing idempotencyKey before any write", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-NOKEY", expectedQty: 5, scannedQty: 0, disposition: "store" },
      ]);

      const result = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { locationId: storageLocationId } as any,
        await rlsDepsFor(confirmContext.userId),
      );

      expect(result.ok).toBe(false);
      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRows.length).toBe(0);
      const itemRow = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect(itemRow[0].scanned_qty).toBe(0);
    });

    // -----------------------------------------------------------------
    // 7. Happy path — inspect disposition, UNCHANGED whole-line commit
    //    (R7.3, design.md §7.3/§6.3/§9 — explicitly unaffected by the
    //    2026-08-20 per-unit amendment)
    // -----------------------------------------------------------------
    it("(AC R7.3, design.md §7.3/§6.3/§9 — unaffected by the per-unit amendment) commits a fully-scanned inspect line as ONE whole-line event: creates one quarantined lot, posts its balance at the inspection location, and opens the inbound inspection case", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-HOLD", expectedQty: 4, scannedQty: 4, disposition: "inspect" },
      ]);

      const result = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: inspectionLocationId },
        await rlsDepsFor(confirmContext.userId),
      );

      expect(result.ok).toBe(true);

      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRows.length).toBe(1);
      expect(lotRows[0].status).toBe("quarantined");

      const balanceRows = await sql`SELECT * FROM lot_location_balances WHERE lot_id = ${lotRows[0].id}`;
      expect(balanceRows.length).toBe(1);
      expect(balanceRows[0].location_id).toBe(inspectionLocationId);
      expect(balanceRows[0].qty_received).toBe(4);

      const caseRows = await sql`
        SELECT * FROM inspection_cases
        WHERE source_ref_type = 'wrr_item' AND source_ref_id = ${lineIds[0]}
      `;
      expect(caseRows).toHaveLength(1);
      expect(caseRows[0].context_type).toBe("inbound");
      expect(caseRows[0].lot_id).toBe(lotRows[0].id);
      expect(caseRows[0].status).toBe("open");

      // Inspect's own per-line idempotency gate is unchanged: committed_at
      // is set immediately, on this single whole-line event.
      const itemRow = await sql`SELECT committed_at FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect(itemRow[0].committed_at).not.toBeNull();
    });

    it("(AC R7.5, design.md §9 — inspect's per-line idempotency is UNCHANGED, still committed_at-gated) calling commitWrrLine twice on the same already-committed inspect line does not double-insert lots/balances/transactions", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-HOLD-IDEMP", expectedQty: 2, scannedQty: 2, disposition: "inspect" },
      ]);

      const first = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: inspectionLocationId },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(first.ok).toBe(true);

      const second = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: inspectionLocationId },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(second.ok).toBe(true);

      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRows.length).toBe(1);
      const balanceRows = await sql`SELECT * FROM lot_location_balances WHERE lot_id = ${lotRows[0].id}`;
      expect(balanceRows.length).toBe(1);
      const txnRows = await sql`SELECT * FROM inventory_transactions WHERE lot_id = ${lotRows[0].id}`;
      expect(txnRows.length).toBe(1);
    });

    // -----------------------------------------------------------------
    // 8. Line isolation — a store line already fully committed (the NEW
    //    distinct rejection reason, superseding the old "under-scanned"
    //    fixture used here pre-2026-08-20) does NOT prevent a valid
    //    unit-commit on a different line of the same WRR (R7.1, R7.6)
    // -----------------------------------------------------------------
    it("(AC R7.1, R7.6) an already-fully-committed line B does NOT prevent a valid unit-commit on line A of the same WRR — each unit-commit validates and posts in total isolation", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-VALID", expectedQty: 5, scannedQty: 0, disposition: "store" },
        // Already fully committed (seeded state) — a further commit attempt
        // on this line must be rejected as "already fully committed", the
        // 2026-08-20 amendment's new distinct rejection reason (superseding
        // the old "under-scanned blocks the whole line" fixture this test
        // used before the amendment).
        { lotNumber: "LOT-COMPLETE", expectedQty: 5, scannedQty: 5, disposition: "store" },
      ]);

      const validResult = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId, idempotencyKey: "isolation-unit-1" },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(validResult.ok).toBe(true);

      const invalidResult = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[1],
        { locationId: storageLocationId, idempotencyKey: "isolation-line-b-extra-unit" },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(invalidResult.ok).toBe(false);

      // Line A's commit stands, unaffected by line B's rejection.
      const lotRowsA = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRowsA.length).toBe(1);
      const itemA = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect(itemA[0].scanned_qty).toBe(1);

      // Line B never posted anything for the rejected extra-unit attempt —
      // no lot was ever created for it (its seeded scanned_qty=5 was a pure
      // fixture value, not the result of real prior commits).
      const lotRowsB = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[1]}`;
      expect(lotRowsB.length).toBe(0);
      const itemB = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${lineIds[1]}`;
      expect(itemB[0].scanned_qty).toBe(5);
    });

    // -----------------------------------------------------------------
    // 9. Rejection cases leave no partial writes, and a failed unit-commit
    //    does not corrupt sibling state (R7.2, R7.6)
    // -----------------------------------------------------------------
    describe("rejection cases leave no partial writes, and recovery is possible after a failed unit-commit (R7.2, R7.6)", () => {
      it("rejects a unit-commit whose target location is not an active 'storage' location, and a later retry to a valid location for the SAME unit still succeeds normally", async () => {
        const { commitWrrLine } = await import("../receiving");

        const { wrrId, lineIds } = await createWrrFixture([
          { lotNumber: "LOT-BADLOC", expectedQty: 3, scannedQty: 0, disposition: "store" },
        ]);

        const failed = await commitWrrLine(
          authorizedConfirmResolver(),
          wrrId,
          lineIds[0],
          { locationId: inactiveLocationId, idempotencyKey: "badloc-unit-1" },
          await rlsDepsFor(confirmContext.userId),
        );
        expect(failed.ok).toBe(false);

        let lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
        expect(lotRows.length).toBe(0);
        let itemRow = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${lineIds[0]}`;
        expect(itemRow[0].scanned_qty).toBe(0);

        // R7.6: the failure must be recoverable — staff retry the SAME
        // unit against a valid location (same or a different idempotencyKey
        // is acceptable here since the first attempt never actually wrote
        // anything for this unit to be idempotent against).
        const retried = await commitWrrLine(
          authorizedConfirmResolver(),
          wrrId,
          lineIds[0],
          { locationId: storageLocationId, idempotencyKey: "badloc-unit-1-retry" },
          await rlsDepsFor(confirmContext.userId),
        );
        expect(retried.ok).toBe(true);

        lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
        expect(lotRows.length).toBe(1);
        itemRow = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${lineIds[0]}`;
        expect(itemRow[0].scanned_qty).toBe(1);
      });

      it("rejects an already-fully-committed store line (scanned_qty >= expected_qty) as a distinct error, without creating a 6th unit on a 5-unit line", async () => {
        const { commitWrrLine } = await import("../receiving");

        const { wrrId, lineIds } = await createWrrFixture([
          { lotNumber: "LOT-COMPLETE-2", expectedQty: 5, scannedQty: 5, disposition: "store" },
        ]);

        const result = await commitWrrLine(
          authorizedConfirmResolver(),
          wrrId,
          lineIds[0],
          { locationId: storageLocationId, idempotencyKey: "over-commit-attempt" },
          await rlsDepsFor(confirmContext.userId),
        );

        expect(result.ok).toBe(false);
        const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
        expect(lotRows.length).toBe(0);
        const itemRow = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${lineIds[0]}`;
        // Unchanged — no 6th unit was created.
        expect(itemRow[0].scanned_qty).toBe(5);
      });

      it("rejects a unit-commit on a line whose WRR is not receiving_in_progress", async () => {
        const { commitWrrLine } = await import("../receiving");

        const { wrrId, lineIds } = await createWrrFixture([
          { lotNumber: "LOT-CONFIRMED-WRR", expectedQty: 3, scannedQty: 0, disposition: "store" },
        ]);
        await sql`UPDATE wrr_documents SET status = 'confirmed' WHERE id = ${wrrId}`;

        const result = await commitWrrLine(
          authorizedConfirmResolver(),
          wrrId,
          lineIds[0],
          { locationId: storageLocationId, idempotencyKey: "wrong-status-attempt" },
          await rlsDepsFor(confirmContext.userId),
        );

        expect(result.ok).toBe(false);
        const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
        expect(lotRows.length).toBe(0);
      });
    });

    // -----------------------------------------------------------------
    // 10. Authorization (pre-amendment R7.1 still in force)
    // -----------------------------------------------------------------
    it("(AC R7.1) requires receiving.confirm — returns { ok: false } and writes nothing when the resolver lacks the capability", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-FORBIDDEN", expectedQty: 3, scannedQty: 0, disposition: "store" },
      ]);

      const result = await commitWrrLine(
        noReceivingResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId, idempotencyKey: "forbidden-attempt" },
        await rlsDepsFor(confirmContext.userId),
      );

      expect(result.ok).toBe(false);
      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRows.length).toBe(0);
    });
  },
);
