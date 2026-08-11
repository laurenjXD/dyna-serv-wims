// Real-Postgres integration test for the not-yet-created
// `wrr_item_unit_scans` table (expected migration:
// supabase/migrations/0025_wrr_item_unit_scans.sql — next number after the
// current highest, 0024_approval_requests_reviewer_update_policy.sql, as of
// this RED step; database-builder should confirm the number is still free
// when picking this up).
//
// Traceability:
//   docs/superpowers/plans/2026-08-11-barcode-scanner-and-unit-labels-completion.md
//     Phase 2, Task B — "wrr_item_unit_scans tracking table".
//   specs/18-barcode-integration/requirements.md FR-3a.3 (AC 6.5): "WHEN a
//     physical label from this flow is scanned at the receiving bay, THE
//     SYSTEM SHALL resolve it to its owning wrr_items line and treat a
//     repeat scan of the exact same unique per-unit identifier as a
//     duplicate-scan rejection (per 07-incoming-receiving requirements.md
//     R3.3), SO THAT a duplicate physical rescan cannot be silently counted
//     as a second, distinct unit before the expected quantity is reached."
//   specs/07-incoming-receiving/requirements.md R3.3: "A scan for the wrong
//     item, unknown barcode, wrong WRR, duplicate carton, quantity beyond
//     the expected amount, ... SHALL produce immediate non-success feedback
//     and a recoverable exception state, through the same rejection path."
//   specs/07-incoming-receiving/design.md §6 ("wrr_item_unit" payload
//     resolution) and specs/00-steering/revision-log.md's 2026-08-10 "07
//     receiving reversed" entry, point 5 ("18-barcode-integration gains
//     WRR-time per-unit printed labels").
//
// This table does not exist yet — no migration creates it and
// lib/db/schema/wrr.ts has no matching Drizzle export. This file proves that
// absence: every test below either fails outright (relation
// "wrr_item_unit_scans" does not exist) or, for the RLS-negative case, would
// only pass today by accident (there is nothing to gate). That is this
// file's expected RED failure — not a typo/wrong-import in the test itself.
// Once database-builder adds the migration (uniqueness constraint + RLS
// policies gated on the existing 'receiving'/'scan'/'global' capability —
// no new capability string, per the completion plan's "Global constraints")
// and the matching Drizzle schema addition, these tests turn GREEN without
// modification.
//
// THIS TEST REQUIRES A LIVE POSTGRES CONNECTION, following the same
// two-stage convention as
// lib/actions/__tests__/receiving.commit-line.integration.test.ts and
// lib/db/__tests__/rls-pool.drizzle.integration.test.ts (full
// migration-chain-against-vanilla-Postgres harness, auth.uid()/auth.jwt()
// stub schema, real RBAC seeding). Point TEST_DATABASE_URL or DATABASE_URL
// at a disposable Postgres instance and run via `npm run test:integration`.
// Without either env var set, every test in this file is skipped (not
// failed) via describe.skipIf(!hasLiveDb) — this file must never attempt to
// open a connection when neither var is set.
//
// RLS mechanism: this file uses the REAL app machinery
// (lib/db/rls-transaction.ts's withRlsTransaction + lib/db/rls-pool.ts's
// rlsPool), exactly as lib/db/__tests__/rls-pool.drizzle.integration.test.ts
// does, rather than hand-rolling its own SET ROLE/set_config calls. Since
// wrr_item_unit_scans has no Drizzle schema export yet (that is
// database-builder's job alongside the migration), RLS-gated reads/writes
// below go through the transaction-bound client's raw `execute({ sql,
// params })` escape hatch (same shape rls-pool.ts's TransactionBoundClient
// always supports) rather than `tx.db.<table>`, so this test file does not
// need to change once the Drizzle schema is added — it isn't coupled to it.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const hasLiveDb = connectionString.length > 0;

// rls-pool.ts reads DATABASE_URL at module-load time; bridge TEST_DATABASE_URL
// into it before any dynamic import of rls-pool below, matching
// receiving.commit-line.integration.test.ts's and
// rls-pool.drizzle.integration.test.ts's established pattern.
if (process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

describe.skipIf(!hasLiveDb)(
  "wrr_item_unit_scans — real-Postgres uniqueness + RLS (FR-3a.3 / AC 6.5, 07 R3.3)",
  () => {
    let sql: Sql;

    const scanUserId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const noScanUserId = "dddddddd-dddd-dddd-dddd-dddddddddddd";

    let vendorPartyId: string;
    let itemId: string;
    let wrrId: string;
    let wrrItemAId: string;
    let wrrItemBId: string;

    beforeAll(async () => {
      sql = postgres(connectionString, { prepare: false, max: 5 });

      // Fresh schema every run — this test may reuse a persistent disposable
      // Postgres container across multiple invocations, so start from a
      // clean slate rather than assuming an empty database.
      await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
      await sql.unsafe(`DROP SCHEMA IF EXISTS auth CASCADE`);
      await sql.unsafe(`DROP SCHEMA IF EXISTS rbac_internal CASCADE`);
      await sql.unsafe(`CREATE SCHEMA public`);

      // Real auth.uid()/auth.jwt() definitions — resolves from the
      // request.jwt.claims GUC's "sub" claim, matching
      // rls-pool.drizzle.integration.test.ts's pattern. This file DOES
      // exercise RLS (that is the whole point of assertion group 4 below),
      // so a NULL-returning stub would make every write fail RLS regardless
      // of the seeded grants.
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
      // Some migrations (e.g. 0018_generated_documents.sql, and the expected
      // wrr_item_unit_scans migration's scanned_by_user_id FK) reference
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

      // auth.users rows for the FK on scanned_by_user_id, once that column
      // exists.
      await sql`
        INSERT INTO auth.users (id) VALUES (${scanUserId}::uuid), (${noScanUserId}::uuid)
        ON CONFLICT (id) DO NOTHING
      `;

      // Real RBAC rows: scanUserId holds 'warehouse_staff' (which already
      // carries receiving.scan per 0005_rbac_constraints_and_seed.sql's
      // seed — no new grant introduced by this table). noScanUserId holds
      // 'party_user', which the same seed file never grants any
      // 'receiving' capability to.
      await sql`
        INSERT INTO user_profiles (id, display_name, status)
        VALUES
          (${scanUserId}::uuid, 'Scan-Capable User', 'active'),
          (${noScanUserId}::uuid, 'No-Receiving-Capability User', 'active')
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO user_roles (user_id, role_id)
        SELECT ${scanUserId}::uuid, id FROM roles WHERE key = 'warehouse_staff'
      `;
      await sql`
        INSERT INTO user_roles (user_id, role_id)
        SELECT ${noScanUserId}::uuid, id FROM roles WHERE key = 'party_user'
      `;
    }, 60_000);

    afterAll(async () => {
      await sql.end({ timeout: 5 });
    });

    beforeEach(async () => {
      // Clean slate for the fixture rows this file owns. Not truncating
      // user_profiles/user_roles — those are seeded once in beforeAll and
      // are not touched by any test below.
      // wrr_item_unit_scans is intentionally NOT listed here: until the
      // migration exists, TRUNCATE on a nonexistent relation would itself
      // throw, masking the real RED failure each test is meant to surface.
      // Once the migration lands, database-builder/db-migration-verifier
      // should confirm this list still needs no update (an empty table
      // freshly created per beforeAll run needs no truncation between
      // tests within the same run, since wrr_items/wrr_documents are
      // recreated fresh below anyway via CASCADE from parties/items).
      await sql.unsafe(`
        TRUNCATE TABLE wrr_items, wrr_documents, items, parties RESTART IDENTITY CASCADE
      `);

      const [party] = await sql`
        INSERT INTO parties (code, name) VALUES ('VEND-UNIT-01', 'Test Unit-Label Vendor')
        RETURNING id
      `;
      vendorPartyId = party.id as string;

      const [item] = await sql`
        INSERT INTO items (code, name, barcode, volume_cbm)
        VALUES ('ITEM-UNIT-01', 'Test Unit-Label Item', 'BARCODE-UNIT-01', 0.5)
        RETURNING id
      `;
      itemId = item.id as string;

      const [wrr] = await sql`
        INSERT INTO wrr_documents (wrr_number, vendor_party_id, flow_type, status, staged_by_user_id)
        VALUES (${"WRR-UNIT-TEST-" + Date.now() + "-" + Math.random().toString(36).slice(2)},
          ${vendorPartyId}, 'vmi', 'receiving_in_progress', ${scanUserId}::uuid)
        RETURNING id
      `;
      wrrId = wrr.id as string;

      const [lineA] = await sql`
        INSERT INTO wrr_items (wrr_id, item_id, lot_number, expected_qty, scanned_qty, unit_cbm, uom, disposition)
        VALUES (${wrrId}, ${itemId}, 'LOT-UNIT-A', 5, 0, 0.5, 'CTN', 'store')
        RETURNING id
      `;
      wrrItemAId = lineA.id as string;

      const [lineB] = await sql`
        INSERT INTO wrr_items (wrr_id, item_id, lot_number, expected_qty, scanned_qty, unit_cbm, uom, disposition)
        VALUES (${wrrId}, ${itemId}, 'LOT-UNIT-B', 5, 0, 0.5, 'CTN', 'store')
        RETURNING id
      `;
      wrrItemBId = lineB.id as string;
    });

    // -----------------------------------------------------------------
    // Direct-table assertions (superuser connection, RLS bypassed) —
    // proves the schema-level invariant itself, independent of RLS.
    // -----------------------------------------------------------------
    describe("uniqueness invariant (FR-3a.3 / AC 6.5, 07 R3.3 'duplicate carton')", () => {
      it("1. a first INSERT of (wrr_item_id, unit_id) succeeds", async () => {
        const unitId = "11111111-0000-0000-0000-000000000001";

        const rows = await sql`
          INSERT INTO wrr_item_unit_scans (wrr_item_id, unit_id, scanned_by_user_id)
          VALUES (${wrrItemAId}, ${unitId}::uuid, ${scanUserId}::uuid)
          RETURNING id, wrr_item_id, unit_id
        `;

        expect(rows.length).toBe(1);
        expect(rows[0].wrr_item_id).toBe(wrrItemAId);
        expect(rows[0].unit_id).toBe(unitId);
      });

      it("2. a second INSERT of the exact same (wrr_item_id, unit_id) pair fails at the database level (unique constraint violation) — the actual point of the table", async () => {
        const unitId = "11111111-0000-0000-0000-000000000002";

        await sql`
          INSERT INTO wrr_item_unit_scans (wrr_item_id, unit_id, scanned_by_user_id)
          VALUES (${wrrItemAId}, ${unitId}::uuid, ${scanUserId}::uuid)
        `;

        await expect(
          sql`
            INSERT INTO wrr_item_unit_scans (wrr_item_id, unit_id, scanned_by_user_id)
            VALUES (${wrrItemAId}, ${unitId}::uuid, ${scanUserId}::uuid)
          `,
        ).rejects.toMatchObject({ code: "23505" }); // unique_violation

        const rows = await sql`
          SELECT * FROM wrr_item_unit_scans WHERE wrr_item_id = ${wrrItemAId} AND unit_id = ${unitId}::uuid
        `;
        expect(rows.length).toBe(1); // exactly one row survives — the rejected insert posted nothing
      });

      it("3. the same unit_id value under a DIFFERENT wrr_item_id is allowed — uniqueness is scoped to the (wrr_item_id, unit_id) pair, not unit_id alone", async () => {
        const sharedUnitId = "11111111-0000-0000-0000-000000000003";

        await sql`
          INSERT INTO wrr_item_unit_scans (wrr_item_id, unit_id, scanned_by_user_id)
          VALUES (${wrrItemAId}, ${sharedUnitId}::uuid, ${scanUserId}::uuid)
        `;

        const rows = await sql`
          INSERT INTO wrr_item_unit_scans (wrr_item_id, unit_id, scanned_by_user_id)
          VALUES (${wrrItemBId}, ${sharedUnitId}::uuid, ${scanUserId}::uuid)
          RETURNING id, wrr_item_id, unit_id
        `;

        expect(rows.length).toBe(1);
        expect(rows[0].wrr_item_id).toBe(wrrItemBId);
        expect(rows[0].unit_id).toBe(sharedUnitId);

        const allForUnitId = await sql`
          SELECT wrr_item_id FROM wrr_item_unit_scans WHERE unit_id = ${sharedUnitId}::uuid ORDER BY wrr_item_id
        `;
        expect(allForUnitId.length).toBe(2);
      });
    });

    // -----------------------------------------------------------------
    // 4. RLS: gated on the existing 'receiving'/'scan'/'global' capability
    //    (the same capability recordScan already requires — no new
    //    capability string, per the completion plan).
    // -----------------------------------------------------------------
    describe("RLS gates INSERT/SELECT on receiving.scan (same capability recordScan already requires)", () => {
      async function rlsDepsFor(userId: string) {
        const { rlsPool } = await import("../../../lib/db/rls-pool");
        return {
          getAuthenticatedSession: async () => ({ userId }),
          pool: rlsPool,
        };
      }

      it("a user holding receiving.scan CAN insert a scan row", async () => {
        const { withRlsTransaction } = await import("../../../lib/db/rls-transaction");
        const unitId = "22222222-0000-0000-0000-000000000001";

        const result = await withRlsTransaction(await rlsDepsFor(scanUserId), async (tx) => {
          return tx.execute({
            sql: `INSERT INTO wrr_item_unit_scans (wrr_item_id, unit_id, scanned_by_user_id) VALUES ($1, $2, $3) RETURNING id`,
            params: [wrrItemAId, "22222222-0000-0000-0000-000000000001", scanUserId],
          });
        });

        expect(result.kind).toBe("ok");

        const rows = await sql`
          SELECT * FROM wrr_item_unit_scans WHERE wrr_item_id = ${wrrItemAId} AND unit_id = ${unitId}::uuid
        `;
        expect(rows.length).toBe(1);
      });

      it("a user holding receiving.scan CAN select scan rows", async () => {
        const unitId = "22222222-0000-0000-0000-000000000002";
        await sql`
          INSERT INTO wrr_item_unit_scans (wrr_item_id, unit_id, scanned_by_user_id)
          VALUES (${wrrItemAId}, ${unitId}::uuid, ${scanUserId}::uuid)
        `;

        const { withRlsTransaction } = await import("../../../lib/db/rls-transaction");

        const result = await withRlsTransaction(await rlsDepsFor(scanUserId), async (tx) => {
          return tx.execute({
            sql: `SELECT id FROM wrr_item_unit_scans WHERE wrr_item_id = $1 AND unit_id = $2`,
            params: [wrrItemAId, unitId],
          });
        });

        expect(result.kind).toBe("ok");
        const rows = (result as { kind: "ok"; value: unknown[] }).value;
        expect(rows.length).toBe(1);
      });

      it("a user WITHOUT any receiving capability is DENIED insert (RLS rejects, no row is posted)", async () => {
        const { withRlsTransaction } = await import("../../../lib/db/rls-transaction");
        const unitId = "22222222-0000-0000-0000-000000000003";

        await expect(
          withRlsTransaction(await rlsDepsFor(noScanUserId), async (tx) => {
            return tx.execute({
              sql: `INSERT INTO wrr_item_unit_scans (wrr_item_id, unit_id, scanned_by_user_id) VALUES ($1, $2, $3) RETURNING id`,
              params: [wrrItemAId, unitId, noScanUserId],
            });
          }),
        ).rejects.toBeTruthy();

        // Confirm via the superuser connection (bypasses RLS) that nothing
        // was actually posted — the rejection is a real denial, not a
        // silently-swallowed error.
        const rows = await sql`
          SELECT * FROM wrr_item_unit_scans WHERE wrr_item_id = ${wrrItemAId} AND unit_id = ${unitId}::uuid
        `;
        expect(rows.length).toBe(0);
      });

      it("a user WITHOUT any receiving capability is DENIED select (sees zero rows via RLS, even though rows exist)", async () => {
        const unitId = "22222222-0000-0000-0000-000000000004";
        await sql`
          INSERT INTO wrr_item_unit_scans (wrr_item_id, unit_id, scanned_by_user_id)
          VALUES (${wrrItemAId}, ${unitId}::uuid, ${scanUserId}::uuid)
        `;

        const { withRlsTransaction } = await import("../../../lib/db/rls-transaction");

        const result = await withRlsTransaction(await rlsDepsFor(noScanUserId), async (tx) => {
          return tx.execute({
            sql: `SELECT id FROM wrr_item_unit_scans WHERE wrr_item_id = $1 AND unit_id = $2`,
            params: [wrrItemAId, unitId],
          });
        });

        // A denying SELECT policy returns zero rows rather than throwing
        // (standard Postgres RLS SELECT behavior — rows simply aren't
        // visible), so this asserts on the result shape rather than a
        // rejection, unlike the INSERT-denial test above.
        expect(result.kind).toBe("ok");
        const rows = (result as { kind: "ok"; value: unknown[] }).value;
        expect(rows.length).toBe(0);
      });
    });
  },
);
