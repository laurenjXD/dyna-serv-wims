// Real-Postgres integration test for the not-yet-implemented commitWrrLine
// server action (lib/actions/receiving.ts), which replaces commitWrr per the
// 2026-08-10 "07 receiving reversed" per-line-commit reversal.
//
// Traceability:
//   specs/00-steering/revision-log.md — "07 receiving reversed" entry
//     (2026-08-10): per-line immediate commit replaces the single
//     end-of-WRR atomic gate.
//   specs/07-incoming-receiving/design.md §9 — Receipt commit and
//     idempotency ("Reversed 2026-08-10 ..."). Each line's commit is its own
//     atomic transaction, immediately on "Store"/"Hold"; the WRR only
//     reaches `confirmed` once every line has reached a terminal committed
//     state. §6.2 (store: staff accepts/overrides a suggested location at
//     scan time) and §6.3 (inspect/"Hold": staff selects/confirms the active
//     inspection location BEFORE scanning) — both dispositions therefore
//     receive an explicit, staff-supplied `locationId` from the caller; see
//     the DESIGN DECISION note below.
//   specs/07-incoming-receiving/requirements.md (amended 2026-08-10):
//     R7.1 — each line's commit SHALL be an explicit, authorized server
//       command executed per line, not gated on every other line being
//       ready.
//     R7.2 — each per-line commit SHALL atomically validate that line's scan
//       totals, conformance decisions, disposition value, and (for store)
//       the target location's active `storage` state — or (for inspect) the
//       confirmed `inspection` location — before posting that line alone.
//     R7.3 — successful commit creates the approved lot/lot state and one
//       immutable `inventory_transactions` row (`movement_type='receiving'`)
//       for that line; the WRR transitions to `confirmed` only once every
//       line has reached a terminal committed state.
//     R7.5 — each per-line commit SHALL be idempotent, scoped to that line.
//     R7.6 — a failed per-line commit SHALL leave no partial outcome for
//       that line and SHALL NOT affect any other line's already-committed
//       state.
//   specs/07-incoming-receiving/requirements.md R7.1 (pre-amendment, still
//     in force) — all mutations require authenticated, authorized user
//     (receiving.confirm).
//
// DESIGN DECISION (this RED step, since design.md §9's prose does not fix an
// exact TypeScript signature): commitWrrLine takes an explicit
// `{ locationId: string }` param for BOTH `store` and `inspect` lines, not
// just `store`. design.md §6.3 states inspect/"Hold" lines have staff
// "select/confirm" the active inspection location BEFORE scanning — i.e.
// staff-supplied, exactly like store's accepted/overridden location per
// §6.2 — so this test file does NOT expect the action to auto-resolve "the
// one active inspection location" the way the OLD commitWrr's
// resolveCommitLocations() did. That auto-resolution behavior belongs to the
// old, now-reversed atomic-WRR-gate model and should not carry over.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/actions/receiving.ts's commitWrrLine (for
// backend-builder):
//
//   export type CommitWrrLineResult =
//     | { ok: true }
//     | { ok: false; errors: string[] };
//
//   export async function commitWrrLine(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     wrrId: string,
//     wrrItemId: string,
//     params: { locationId: string },
//   ): Promise<CommitWrrLineResult>;
//
// Internally, commitWrrLine is expected to call
// lib/receiving/commit-validation.ts's validateLineCommit(wrr, line,
// location) (already implemented, GREEN) rather than the old
// lib/receiving/commit-validation.ts's validateCommit (whole-WRR) used by
// the now-superseded commitWrr.
//
// ---------------------------------------------------------------------------
// THIS TEST REQUIRES A LIVE POSTGRES CONNECTION, following the same
// two-stage convention as lib/db/__tests__/rls-transaction.integration.test.ts
// (see that file's header comment) and specs/00-steering/testing.md's
// "Before tasks.md sign-off" real-Postgres stage. Point TEST_DATABASE_URL or
// DATABASE_URL at a disposable Postgres instance and run via
// `npm run test:integration`. Without either env var set, every test in
// this file is skipped (not failed).
//
// Unlike rls-transaction.integration.test.ts's ad hoc scratch table, this
// file needs the real receiving/lot/location schema, so its beforeAll runs
// every file in supabase/migrations/ in numeric order via raw SQL, exactly
// as specs/00-steering/testing.md's real-Postgres stage and the
// db-migration-verifier agent's own process require ("Run every migration
// file in supabase/migrations/ in numeric order, stopping on first error").
// A minimal `auth.uid()`/`auth.jwt()` stub schema is created first so the
// later RLS-policy migrations (auth.jwt()-based, Supabase-specific) apply
// without erroring on vanilla Postgres -- this test does not exercise RLS at
// all (commitWrrLine's authorization is the app-layer requirePermission
// guard, not RLS), so the stub only needs to make CREATE POLICY's function
// resolution succeed, not behave correctly.
//
// 2026-08-11 UPDATE: commitWrrLine now runs through withRlsTransaction (see
// lib/db/rls-transaction.ts / rls-pool.ts) rather than a plain injected
// `db`, per the app-wide RLS session-binding rollout recorded in
// specs/00-steering/revision-log.md. This file's auth.uid() stub is
// therefore now the REAL claim-reading definition (matching
// lib/db/__tests__/rls-pool.drizzle.integration.test.ts's pattern, not a
// NULL-returning stand-in) and every commitWrrLine call passes an explicit
// RlsTransactionDeps override: the real rlsPool bound to this test's own
// connection string, plus a stub getAuthenticatedSession resolving to the
// fixture's own userId. Real user_profiles/user_roles rows are seeded for
// that userId so the actual RLS policies (rbac_internal.has_permission)
// genuinely authorize the writes, not just the app-layer requirePermission
// mock resolver.

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
  "commitWrrLine — real-Postgres per-line commit (design.md §9, requirements.md R7.1-R7.6 amended 2026-08-10)",
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
      // pattern. commitWrrLine's writes are now genuinely RLS-enforced (see
      // the 2026-08-11 header note above), so a NULL-returning stub would
      // make every write fail RLS regardless of the seeded grants below.
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
      // Migration 0030 configures a Supabase Storage bucket and policies.
      // Storage is platform-owned in production, so provide only the two
      // minimal relations/columns that its SQL references in this vanilla
      // Postgres verification database.
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS storage`);
      await sql.unsafe(`CREATE TABLE IF NOT EXISTS storage.buckets (
        id text PRIMARY KEY,
        name text NOT NULL,
        public boolean NOT NULL DEFAULT false,
        file_size_limit bigint,
        allowed_mime_types text[]
      )`);
      await sql.unsafe(`CREATE TABLE IF NOT EXISTS storage.objects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id text NOT NULL
      )`);
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
        INSERT INTO auth.users (id) VALUES (${confirmContext.userId})
        ON CONFLICT (id) DO NOTHING
      `;
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
    // 1. Happy path — store disposition (R7.3, design.md §7.2, §9)
    // -----------------------------------------------------------------
    it("(AC R7.3, design.md §7.2/§9) commits a fully-scanned store line: creates one available lot, one balance row at the given location, one receiving ledger row, sets committed_at + putaway_location_id, and leaves wrr_documents.status untouched", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-A", expectedQty: 10, scannedQty: 10, disposition: "store" },
        { lotNumber: "LOT-B", expectedQty: 5, scannedQty: 5, disposition: "store" },
      ]);

      const result = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId },
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
      expect(balanceRows[0].qty_received).toBe(10);
      expect(balanceRows[0].qty_remaining).toBe(10);

      const txnRows = await sql`SELECT * FROM inventory_transactions WHERE lot_id = ${lotRows[0].id}`;
      expect(txnRows.length).toBe(1);
      expect(txnRows[0].movement_type).toBe("receiving");
      expect(txnRows[0].to_location_id).toBe(storageLocationId);

      const itemRow = await sql`SELECT committed_at, putaway_location_id FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect(itemRow[0].committed_at).not.toBeNull();
      expect(itemRow[0].putaway_location_id).toBe(storageLocationId);

      // Line B is untouched, so the WRR must NOT flip to confirmed yet.
      const wrrRow = await sql`SELECT status FROM wrr_documents WHERE id = ${wrrId}`;
      expect(wrrRow[0].status).toBe("receiving_in_progress");
    });

    it("(AC R3.3-R3.5) batch Store All accepts one verified pallet QR, requires the declared allocation, and commits every box across its selected locations", async () => {
      const { commitWrrLine } = await import("../receiving");
      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-PALLET", expectedQty: 5, scannedQty: 1, disposition: "store" },
      ]);

      const result = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        {
          allocations: [
            { locationId: storageLocationId, qty: 2 },
            { locationId: otherStorageLocationId, qty: 3 },
          ],
          presenceAttested: true,
        },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(result.ok).toBe(true);

      const itemRows = await sql`SELECT scanned_qty, committed_at FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect(itemRows[0].scanned_qty).toBe(5);
      expect(itemRows[0].committed_at).not.toBeNull();

      const allocationRows = await sql`
        SELECT location_id, qty FROM wrr_item_putaway_allocations
        WHERE wrr_item_id = ${lineIds[0]} ORDER BY qty
      `;
      expect(allocationRows).toHaveLength(2);
      expect(allocationRows.map((row) => Number(row.qty))).toEqual([2, 3]);

      const balanceRows = await sql`
        SELECT qty_received FROM lot_location_balances
        WHERE lot_id = (SELECT id FROM lots WHERE wrr_item_id = ${lineIds[0]})
        ORDER BY qty_received
      `;
      expect(balanceRows.map((row) => Number(row.qty_received))).toEqual([2, 3]);
    });

    // -----------------------------------------------------------------
    // 2. Happy path — inspect disposition (R7.3, design.md §7.3/§6.3/§9)
    // -----------------------------------------------------------------
    it("(AC R7.3, design.md §7.3/§6.3/§9) commits a fully-scanned inspect line: creates one quarantined lot, posts its balance at the inspection location, and opens the inbound inspection case", async () => {
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
    });

    // -----------------------------------------------------------------
    // 3. WRR-level completion only once every line commits (R7.3, §9)
    // -----------------------------------------------------------------
    it("(AC R7.3, design.md §9) flips wrr_documents.status to 'confirmed' only once every line on the WRR has committed — not before the last line", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-1", expectedQty: 2, scannedQty: 2, disposition: "store" },
        { lotNumber: "LOT-2", expectedQty: 3, scannedQty: 3, disposition: "store" },
      ]);

      const first = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(first.ok).toBe(true);

      let wrrRow = await sql`SELECT status FROM wrr_documents WHERE id = ${wrrId}`;
      expect(wrrRow[0].status).toBe("receiving_in_progress");

      const second = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[1],
        { locationId: storageLocationId },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(second.ok).toBe(true);

      wrrRow = await sql`SELECT status FROM wrr_documents WHERE id = ${wrrId}`;
      expect(wrrRow[0].status).toBe("confirmed");
    });

    // -----------------------------------------------------------------
    // 4. Per-line idempotency (R7.5)
    // -----------------------------------------------------------------
    it("(AC R7.5) calling commitWrrLine twice on the same already-committed line does not double-insert lots/balances/transactions and returns the original authoritative { ok: true } result", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-IDEMP", expectedQty: 6, scannedQty: 6, disposition: "store" },
      ]);

      const first = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(first.ok).toBe(true);

      const second = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId },
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
    // 5. Line isolation — the core behavioral proof of the reversal (R7.1, R7.6)
    // -----------------------------------------------------------------
    it("(AC R7.1, R7.6) an invalid/under-scanned line B does NOT prevent a valid line A on the same WRR from committing — unlike the old whole-WRR-gated commitWrr", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-VALID", expectedQty: 5, scannedQty: 5, disposition: "store" },
        // Under-scanned: 2 of 5 expected.
        { lotNumber: "LOT-INVALID", expectedQty: 5, scannedQty: 2, disposition: "store" },
      ]);

      const validResult = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(validResult.ok).toBe(true);

      const invalidResult = await commitWrrLine(
        authorizedConfirmResolver(),
        wrrId,
        lineIds[1],
        { locationId: storageLocationId },
        await rlsDepsFor(confirmContext.userId),
      );
      expect(invalidResult.ok).toBe(false);

      // Line A's commit stands, unaffected by line B's rejection.
      const lotRowsA = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRowsA.length).toBe(1);
      const itemA = await sql`SELECT committed_at FROM wrr_items WHERE id = ${lineIds[0]}`;
      expect(itemA[0].committed_at).not.toBeNull();

      // Line B never posted anything.
      const lotRowsB = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[1]}`;
      expect(lotRowsB.length).toBe(0);
      const itemB = await sql`SELECT committed_at FROM wrr_items WHERE id = ${lineIds[1]}`;
      expect(itemB[0].committed_at).toBeNull();
    });

    // -----------------------------------------------------------------
    // 6. Rejection cases — no partial writes (R7.2, R7.6)
    // -----------------------------------------------------------------
    describe("rejection cases leave no partial writes (R7.2, R7.6)", () => {
      it("rejects a store line whose target location is not an active 'storage' location", async () => {
        const { commitWrrLine } = await import("../receiving");

        const { wrrId, lineIds } = await createWrrFixture([
          { lotNumber: "LOT-BADLOC", expectedQty: 3, scannedQty: 3, disposition: "store" },
        ]);

        const result = await commitWrrLine(
          authorizedConfirmResolver(),
          wrrId,
          lineIds[0],
          { locationId: inactiveLocationId },
          await rlsDepsFor(confirmContext.userId),
        );

        expect(result.ok).toBe(false);
        const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
        expect(lotRows.length).toBe(0);
        const itemRow = await sql`SELECT committed_at FROM wrr_items WHERE id = ${lineIds[0]}`;
        expect(itemRow[0].committed_at).toBeNull();
      });

      it("rejects an under-scanned line", async () => {
        const { commitWrrLine } = await import("../receiving");

        const { wrrId, lineIds } = await createWrrFixture([
          { lotNumber: "LOT-SHORT", expectedQty: 10, scannedQty: 4, disposition: "store" },
        ]);

        const result = await commitWrrLine(
          authorizedConfirmResolver(),
          wrrId,
          lineIds[0],
          { locationId: storageLocationId },
          await rlsDepsFor(confirmContext.userId),
        );

        expect(result.ok).toBe(false);
        const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
        expect(lotRows.length).toBe(0);
      });

      it("rejects a commit on a line whose WRR is not receiving_in_progress", async () => {
        const { commitWrrLine } = await import("../receiving");

        const { wrrId, lineIds } = await createWrrFixture([
          { lotNumber: "LOT-CONFIRMED-WRR", expectedQty: 3, scannedQty: 3, disposition: "store" },
        ]);
        await sql`UPDATE wrr_documents SET status = 'confirmed' WHERE id = ${wrrId}`;

        const result = await commitWrrLine(
          authorizedConfirmResolver(),
          wrrId,
          lineIds[0],
          { locationId: storageLocationId },
          await rlsDepsFor(confirmContext.userId),
        );

        expect(result.ok).toBe(false);
        const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
        expect(lotRows.length).toBe(0);
      });
    });

    // -----------------------------------------------------------------
    // 7. Authorization (pre-amendment R7.1 still in force)
    // -----------------------------------------------------------------
    it("(AC R7.1) requires receiving.confirm — returns { ok: false } and writes nothing when the resolver lacks the capability", async () => {
      const { commitWrrLine } = await import("../receiving");

      const { wrrId, lineIds } = await createWrrFixture([
        { lotNumber: "LOT-FORBIDDEN", expectedQty: 3, scannedQty: 3, disposition: "store" },
      ]);

      const result = await commitWrrLine(
        noReceivingResolver(),
        wrrId,
        lineIds[0],
        { locationId: storageLocationId },
        await rlsDepsFor(confirmContext.userId),
      );

      expect(result.ok).toBe(false);
      const lotRows = await sql`SELECT * FROM lots WHERE wrr_item_id = ${lineIds[0]}`;
      expect(lotRows.length).toBe(0);
    });

    // Sanity check that otherStorageLocationId fixture is actually usable
    // (kept distinct from storageLocationId so a future test can assert an
    // override to a different accepted location without reusing the id).
    it("sanity: a second active storage location is available as a distinct override target", async () => {
      expect(otherStorageLocationId).not.toBe(storageLocationId);
    });
  },
);
