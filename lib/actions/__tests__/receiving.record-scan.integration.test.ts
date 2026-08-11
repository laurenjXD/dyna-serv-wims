// Real-Postgres integration test for lib/actions/receiving.ts's recordScan,
// scoped to Task D's per-unit duplicate-scan persistence
// (wrr_item_unit_scans).
//
// Traceability:
//   docs/superpowers/plans/2026-08-11-barcode-scanner-and-unit-labels-completion.md
//     Phase 2, Task D — "Wire recordScan to check and persist
//     wrr_item_unit_scans".
//   specs/18-barcode-integration/requirements.md FR-3a.3 (AC 6.5): "WHEN a
//     physical label from this flow is scanned at the receiving bay, THE
//     SYSTEM SHALL resolve it to its owning wrr_items line and treat a
//     repeat scan of the exact same unique per-unit identifier as a
//     duplicate-scan rejection (per 07-incoming-receiving requirements.md
//     R3.3), SO THAT a duplicate physical rescan cannot be silently counted
//     as a second, distinct unit before the expected quantity is reached."
//   specs/07-incoming-receiving/requirements.md R3.3 — a duplicate carton
//     scan SHALL produce immediate non-success feedback through the
//     existing rejection path, not a silent extra count.
//   specs/18-barcode-integration/design.md §2.2 — the UNIQUE (wrr_item_id,
//     unit_id) constraint on wrr_item_unit_scans (supabase/migrations/
//     0025_wrr_item_unit_scans.sql) is the real enforcement mechanism, not
//     just application logic that a retry/race could bypass — this file's
//     concurrent-double-submit test exists specifically to prove that.
//
// None of Task D's recordScan behavior exists yet: recordScan currently
// never queries or writes wrr_item_unit_scans at all (see
// lib/actions/__tests__/receiving.test.ts's mocked-DB RED tests for the
// same gap at the unit level). Every test below is expected to fail against
// today's recordScan until backend-builder implements Task D strictly
// against this file and the mocked-DB tests above it.
//
// THIS TEST REQUIRES A LIVE POSTGRES CONNECTION, following the exact same
// two-stage convention and harness as
// lib/actions/__tests__/receiving.commit-line.integration.test.ts and
// supabase/migrations/__tests__/wrr_item_unit_scans.integration.test.ts
// (full migration-chain-against-vanilla-Postgres harness, real
// auth.uid()/auth.jwt() stub, real RBAC seeding, withRlsTransaction's real
// rlsPool + a stub getAuthenticatedSession). Point TEST_DATABASE_URL or
// DATABASE_URL at a disposable Postgres instance and run via
// `npm run test:integration`. Without either env var set, every test in
// this file is skipped via describe.skipIf(!hasLiveDb) — this file must
// never attempt to open a connection when neither var is set.

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

// rls-pool.ts reads DATABASE_URL at module-load time; bridge
// TEST_DATABASE_URL into it before any dynamic import of rls-pool/receiving
// below, matching receiving.commit-line.integration.test.ts's and
// wrr_item_unit_scans.integration.test.ts's established pattern.
if (process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

function makeResolver(resolution: AuthorizationResolution): RequestAuthorizationResolver {
  return { getContext: async () => resolution };
}

const scanCapableUserId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const scanContext: AuthorizationContext = {
  userId: scanCapableUserId,
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [{ resource: "receiving", action: "scan", scopeKind: "global" }],
  partyScopes: [],
};

const scanOnlyResolver = () => makeResolver({ kind: "authorized", context: scanContext });

function unitPayload(wrrItemId: string, unitId: string): string {
  return JSON.stringify({ type: "wrr_item_unit", wrr_item_id: wrrItemId, unit_id: unitId });
}

describe.skipIf(!hasLiveDb)(
  "recordScan — real-Postgres per-unit duplicate detection (FR-3a.3/AC 6.5, spec 18 §2.2, Task D)",
  () => {
    let sql: Sql;

    let vendorPartyId: string;
    let itemId: string;
    let wrrId: string;
    let wrrItemId: string;

    beforeAll(async () => {
      sql = postgres(connectionString, { prepare: false, max: 5 });

      // Fresh schema every run — this test may reuse a persistent
      // disposable Postgres container across multiple invocations, so start
      // from a clean slate rather than assuming an empty database.
      await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
      await sql.unsafe(`DROP SCHEMA IF EXISTS auth CASCADE`);
      await sql.unsafe(`DROP SCHEMA IF EXISTS rbac_internal CASCADE`);
      await sql.unsafe(`CREATE SCHEMA public`);

      // Real auth.uid()/auth.jwt() definitions — resolves from the
      // request.jwt.claims GUC's "sub" claim, matching
      // rls-pool.drizzle.integration.test.ts's pattern. recordScan's writes
      // (including the new wrr_item_unit_scans insert) are genuinely
      // RLS-enforced, so a NULL-returning stub would make every write fail
      // RLS regardless of the seeded grants below.
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
      // Some migrations (e.g. 0018_generated_documents.sql, and
      // 0025_wrr_item_unit_scans.sql's scanned_by_user_id FK) reference
      // auth.users(id) — Supabase provisions this table itself; vanilla
      // Postgres needs a minimal stand-in for the migration chain to apply
      // at all.
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

      // auth.users row for the FK on wrr_item_unit_scans.scanned_by_user_id.
      await sql`
        INSERT INTO auth.users (id) VALUES (${scanCapableUserId}::uuid)
        ON CONFLICT (id) DO NOTHING
      `;

      // Real RBAC rows: scanCapableUserId holds 'warehouse_staff', which
      // already carries receiving.scan per
      // 0005_rbac_constraints_and_seed.sql's seed — no new grant introduced
      // by this table/action.
      await sql`
        INSERT INTO user_profiles (id, display_name, status)
        VALUES (${scanCapableUserId}::uuid, 'Test Scan User', 'active')
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO user_roles (user_id, role_id)
        SELECT ${scanCapableUserId}::uuid, id FROM roles WHERE key = 'warehouse_staff'
      `;
    }, 60_000);

    afterAll(async () => {
      await sql.end({ timeout: 5 });
    });

    // Real RlsPool bound to this test's own connection string (rls-pool.ts's
    // module-level rlsPool reads DATABASE_URL, bridged from
    // TEST_DATABASE_URL above) plus a stub getAuthenticatedSession resolving
    // to the fixture's own userId — matching
    // receiving.commit-line.integration.test.ts's established pattern.
    async function rlsDepsFor(userId: string): Promise<RlsTransactionDeps> {
      // Dynamic import, not a static one: rls-pool.ts reads DATABASE_URL at
      // module-load time, and a static top-level import would be hoisted
      // ahead of this file's DATABASE_URL bridge above.
      const { rlsPool } = await import("@/lib/db/rls-pool");
      return {
        getAuthenticatedSession: async () => ({ userId }),
        pool: rlsPool,
      };
    }

    beforeEach(async () => {
      // Clean slate: truncate every table this test touches, in FK-safe
      // order, before seeding fresh fixtures for the next test.
      await sql.unsafe(`
        TRUNCATE TABLE wrr_item_unit_scans, wrr_items, wrr_documents, items,
          parties RESTART IDENTITY CASCADE
      `);

      const [party] = await sql`
        INSERT INTO parties (code, name) VALUES ('VEND-RS-01', 'Test recordScan Vendor')
        RETURNING id
      `;
      vendorPartyId = party.id as string;

      const [item] = await sql`
        INSERT INTO items (code, name, barcode, volume_cbm)
        VALUES ('ITEM-RS-01', 'Test recordScan Item', 'BARCODE-RS-01', 0.5)
        RETURNING id
      `;
      itemId = item.id as string;

      const [wrr] = await sql`
        INSERT INTO wrr_documents (wrr_number, vendor_party_id, flow_type, status, staged_by_user_id)
        VALUES (${"WRR-RS-TEST-" + Date.now() + "-" + Math.random().toString(36).slice(2)},
          ${vendorPartyId}, 'vmi', 'receiving_in_progress', ${scanCapableUserId}::uuid)
        RETURNING id
      `;
      wrrId = wrr.id as string;

      const [wrrItem] = await sql`
        INSERT INTO wrr_items (wrr_id, item_id, lot_number, expected_qty, scanned_qty, unit_cbm, uom, disposition)
        VALUES (${wrrId}, ${itemId}, 'LOT-RS-A', 5, 0, 0.5, 'CTN', 'store')
        RETURNING id
      `;
      wrrItemId = wrrItem.id as string;
    });

    // -----------------------------------------------------------------
    // 1. First scan of a fresh unit_id — one row posted, qty incremented.
    // -----------------------------------------------------------------
    it("(AC 6.5) the first recordScan call for a fresh unit_id succeeds, posts exactly one wrr_item_unit_scans row, and increments wrr_items.scanned_qty", async () => {
      const { recordScan } = await import("../receiving");
      const unitId = "33333333-0000-0000-0000-000000000001";
      const barcode = unitPayload(wrrItemId, unitId);

      const result = await recordScan(
        scanOnlyResolver(),
        wrrId,
        barcode,
        await rlsDepsFor(scanCapableUserId),
      );

      expect(result.ok).toBe(true);

      const scanRows = await sql`
        SELECT * FROM wrr_item_unit_scans WHERE wrr_item_id = ${wrrItemId} AND unit_id = ${unitId}::uuid
      `;
      expect(scanRows.length).toBe(1);
      expect(scanRows[0].scanned_by_user_id).toBe(scanCapableUserId);

      const itemRow = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${wrrItemId}`;
      expect(itemRow[0].scanned_qty).toBe(1);
    });

    // -----------------------------------------------------------------
    // 2. Sequential repeat — rejected, no partial state.
    // -----------------------------------------------------------------
    it("(AC 6.5, R3.3) a second recordScan call with the same unit_id is rejected with duplicate_unit_scan and posts nothing additional — no partial state", async () => {
      const { recordScan } = await import("../receiving");
      const unitId = "33333333-0000-0000-0000-000000000002";
      const barcode = unitPayload(wrrItemId, unitId);

      const first = await recordScan(
        scanOnlyResolver(),
        wrrId,
        barcode,
        await rlsDepsFor(scanCapableUserId),
      );
      expect(first.ok).toBe(true);

      const second = await recordScan(
        scanOnlyResolver(),
        wrrId,
        barcode,
        await rlsDepsFor(scanCapableUserId),
      );
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.reason).toBe("duplicate_unit_scan");
      }

      // Exactly one row survives — the rejected second attempt posted
      // nothing additional.
      const scanRows = await sql`
        SELECT * FROM wrr_item_unit_scans WHERE wrr_item_id = ${wrrItemId} AND unit_id = ${unitId}::uuid
      `;
      expect(scanRows.length).toBe(1);

      // scanned_qty reflects exactly one successful scan, not two.
      const itemRow = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${wrrItemId}`;
      expect(itemRow[0].scanned_qty).toBe(1);
    });

    // -----------------------------------------------------------------
    // 3. Genuinely concurrent double-submit — DB constraint, not app-layer
    //    timing, is what prevents the double count. Mirrors the same class
    //    of proof receiving.commit-line.integration.test.ts's per-line
    //    idempotency tests establish for commitWrrLine.
    // -----------------------------------------------------------------
    it("(AC 6.5, spec 18 §2.2) a genuinely concurrent double-submit of the same unit_id (fired via Promise.allSettled before either resolves) still results in exactly one recorded wrr_item_unit_scans row and exactly one scanned_qty increment — proving the DB unique constraint, not app-layer timing, prevents the double-count", async () => {
      const { recordScan } = await import("../receiving");
      const unitId = "33333333-0000-0000-0000-000000000003";
      const barcode = unitPayload(wrrItemId, unitId);

      // Both calls are started before either is awaited, so both race to
      // read "already scanned" (both may see an empty set) and both attempt
      // to write — exactly the race the UNIQUE (wrr_item_id, unit_id)
      // constraint (supabase/migrations/0025_wrr_item_unit_scans.sql) exists
      // to close, independent of any application-layer check-then-act
      // timing.
      const results = await Promise.allSettled([
        recordScan(scanOnlyResolver(), wrrId, barcode, await rlsDepsFor(scanCapableUserId)),
        recordScan(scanOnlyResolver(), wrrId, barcode, await rlsDepsFor(scanCapableUserId)),
      ]);

      // Whether the losing call surfaces as a resolved { ok: false,
      // reason: 'duplicate_unit_scan' } result or an outright rejected
      // promise (e.g. an uncaught unique_violation propagating out of the
      // transaction) is an implementation choice this test does not pin
      // down. What MUST be true regardless: at most one of the two calls
      // actually succeeded.
      const fulfilledOkTrue = results.filter(
        (r) => r.status === "fulfilled" && (r.value as { ok: boolean }).ok === true,
      );
      expect(fulfilledOkTrue.length).toBe(1);

      const scanRows = await sql`
        SELECT * FROM wrr_item_unit_scans WHERE wrr_item_id = ${wrrItemId} AND unit_id = ${unitId}::uuid
      `;
      expect(scanRows.length).toBe(1);

      const itemRow = await sql`SELECT scanned_qty FROM wrr_items WHERE id = ${wrrItemId}`;
      expect(itemRow[0].scanned_qty).toBe(1);
    });
  },
);
