// Real-Postgres integration test for lib/analytics/queries/rls-executor.ts
// (does not exist yet — see lib/analytics/queries/__tests__/rls-executor.test.ts
// for the mocked/unit-tier RED tests and the full expected module contract).
//
// Traceability:
//   - specs/16-reporting-and-analytics/requirements.md AC-5 ("A party user
//     ... sees only their own party's lots, WRRs, and pick lists in every
//     analytics view. Querying with a different party's ID directly ...
//     returns empty results, not an error that reveals data existence") and
//     NFR-3 ("All queries are automatically scoped by PostgreSQL RLS ... No
//     application-layer WHERE party_id = ? clause replaces RLS") and NFR-6
//     ("Pricing, revenue, cost, profit, and margin fields SHALL never appear
//     in floor-staff or party-user projections/exports. Exclusion is
//     enforced at the RLS/view layer, not by application column
//     filtering.").
//   - specs/16-reporting-and-analytics/design.md §6.2 ("RLS Behavior") and
//     §6.3 ("Sensitive Field Exclusion" — `party_visible_items` is the sole
//     party-facing item read path; `buying_price` / `selling_price` /
//     `default_supplier_party_id` are never included in party-user
//     projections).
//   - specs/02-rbac-roles/design.md §3.2 (the two-gate `flow_type =
//     'supplies'` exclusion: both `has_party_scope`'s null-flow_type
//     semantics AND `can_access_party_resource`'s own independent
//     `p_flow_type IS DISTINCT FROM 'supplies'` hard-deny) and
//     supabase/migrations/0008_rls_policies.sql (ground truth for what is
//     actually enforced today).
//   - specs/00-steering/testing.md's two-stage DB-testing requirement
//     ("Before tasks.md sign-off — real-Postgres integration tests ... spin
//     up actual Postgres, run the real migrations in order, exercise the
//     actual functions with real data, and assert on real results").
//
// THIS TEST REQUIRES A LIVE POSTGRES CONNECTION and follows the exact same
// gating pattern as lib/db/__tests__/rls-transaction.integration.test.ts:
// point DATABASE_URL or TEST_DATABASE_URL at a disposable Postgres instance
// before running `npm run test:integration`. Without either env var set,
// every test in this file is skipped (not failed).
//
// This is a RED-step test: it targets lib/analytics/queries/rls-executor.ts,
// which does not exist yet. Running this file against a live Postgres
// connection fails with "Cannot find module '../rls-executor'" — the same
// missing-implementation failure mode as the mocked unit-test file, proven
// live below (see the harness notes right before the `describe.skipIf`
// block: this file WAS run against a real, disposable postgres:16-alpine
// container during authoring, and the RED failure was confirmed to be
// exactly this missing-module error, not a fixture/connectivity problem —
// every other piece of this harness, including all real-Postgres query
// behavior it exercises, was proven correct first via a throwaway script
// using the same fixtures/migrations before being folded into this file).
//
// ---------------------------------------------------------------------------
// FLAGGED FINDING (surfaced for db-migration-verifier / database-builder,
// not silently patched into 0008 by this test-writer pass): 0008's own
// section 8 "narrow, explicit table-level grants to `authenticated`" never
// grants SELECT on the `lot_inventory_totals` VIEW (0002). Unlike
// `party_visible_items` (an explicit `security_invoker = false` view whose
// own ACL this test's fixtures prove is correctly grantable),
// `lot_inventory_totals` is an ordinary view — Postgres always checks the
// VIEW OBJECT's own ACL against the querying role, even though the
// underlying `lot_location_balances` table's privileges are substituted
// with the view owner's (only relevant for the *base table*, not the view
// itself). Proven live: WITHOUT the extra grant this test's own harness
// applies below, `SELECT ... FROM lot_inventory_totals` as `authenticated`
// fails with `permission denied for view lot_inventory_totals` for EVERY
// authenticated caller, including global-scope staff — i.e. NFR-1's own
// mandated aggregation source (`lot_inventory_totals`) is currently
// unreachable by any RLS-governed session, not just party users. This
// test's `beforeAll` applies the missing `GRANT SELECT ON
// lot_inventory_totals TO authenticated` itself (clearly isolated in its own
// step below) ONLY so the RLS row-filtering behavior under test can actually
// be exercised — this is a test-harness workaround, not a fix to
// 0008_rls_policies.sql, and a real migration (0009 or a follow-up to 0008)
// still needs to add this grant for the application itself to work.
// ---------------------------------------------------------------------------

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import fs from "node:fs";
import path from "node:path";
import { sql as drizzleSql } from "drizzle-orm";

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const hasLiveDb = connectionString.length > 0;

// rls-pool.ts reads DATABASE_URL at module-load time; mirror
// TEST_DATABASE_URL onto it before the dynamic import below, exactly as
// lib/db/__tests__/rls-transaction.integration.test.ts already does.
if (process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../supabase/migrations");
const MIGRATION_FILES = [
  "0001_core_data_model.sql",
  "0002_lot_inventory_totals_and_indexes.sql",
  "0003_derived_read_models.sql",
  "0004_rbac_tables.sql",
  "0005_rbac_constraints_and_seed.sql",
  "0006_daily_transaction_counts.sql",
  "0007_analytics_indexes.sql",
  "0008_rls_policies.sql",
];

// Fixture identifiers -- fixed, readable UUIDs (all valid hex) so failures
// are easy to eyeball in a query-tool re-run against the same disposable DB.
const ids = {
  partyVmiA: "a0000000-0000-0000-0000-00000000001a",
  partyVmiB: "a0000000-0000-0000-0000-00000000001b",
  partyTradingC: "a0000000-0000-0000-0000-00000000001c",
  partyTradingD: "a0000000-0000-0000-0000-00000000001d",
  userA: "b0000000-0000-0000-0000-00000000001a", // party_user, VMI party A
  userB: "b0000000-0000-0000-0000-00000000001b", // party_user, VMI party B
  userC: "b0000000-0000-0000-0000-00000000001c", // party_user, Trading party C
  userStaff: "b0000000-0000-0000-0000-0000000000ff", // warehouse_staff, global
  itemX: "c0000000-0000-0000-0000-000000000002",
  wrrItemX: "d0000000-0000-0000-0000-000000000002",
  wrrDocA: "e0000000-0000-0000-0000-00000000001a",
  lotA: "f0000000-0000-0000-0000-00000000001a", // vmi, owner = party A
  lotB: "f0000000-0000-0000-0000-00000000001b", // vmi, owner = party B
  lotSupplies: "f0000000-0000-0000-0000-000000000001", // supplies, owner = party A (deliberately -- proves the exclusion is flow-type-gated, not ownership-gated)
  locA: "10000000-0000-0000-0000-00000000001a",
  plC: "20000000-0000-0000-0000-00000000001c", // trading pick list, customer = party C
  plD: "20000000-0000-0000-0000-00000000001d", // trading pick list, customer = party D
};

describe.skipIf(!hasLiveDb)(
  "lib/analytics/queries/rls-executor.ts — real-Postgres party isolation (AC-5, NFR-3, NFR-6)",
  () => {
    let sql: Sql;

    beforeAll(async () => {
      sql = postgres(connectionString, { prepare: false });

      // Clean slate for idempotent local re-runs against the same
      // disposable database.
      await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
      await sql.unsafe(`CREATE SCHEMA public`);
      await sql.unsafe(`GRANT ALL ON SCHEMA public TO postgres`);
      await sql.unsafe(`GRANT ALL ON SCHEMA public TO public`);
      // 0008_rls_policies.sql's rbac_internal schema lives outside `public`,
      // so the DROP/CREATE above never touches it -- drop it separately for
      // idempotent local re-runs (its functions would otherwise collide with
      // "already exists with same argument types" on the next run).
      await sql.unsafe(`DROP SCHEMA IF EXISTS rbac_internal CASCADE`);

      // Minimal Supabase-shaped `auth` schema this project's migrations
      // depend on (`auth.uid()`, the `authenticated` role) -- a real
      // Supabase project provides both; a disposable plain Postgres
      // container does not, so this harness bootstraps the two pieces
      // 0008_rls_policies.sql itself assumes already exist.
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS auth`);
      await sql.unsafe(`
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
        LANGUAGE sql STABLE AS $$
          SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
        $$;
      `);
      await sql.unsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated NOLOGIN;
          END IF;
        END $$;
      `);

      // Run the real migrations, in order, exactly as committed --
      // per testing.md's "run the real migrations in order" requirement.
      // Split on the project's own `--> statement-breakpoint` marker
      // (drizzle-kit's convention, already used throughout
      // supabase/migrations/*.sql).
      for (const file of MIGRATION_FILES) {
        const text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
        const statements = text
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const statement of statements) {
          await sql.unsafe(statement);
        }
      }

      // See the FLAGGED FINDING header note above: 0008 never grants
      // SELECT on lot_inventory_totals to `authenticated`. Applied here,
      // isolated from the real migration files, purely to unblock this
      // test's ability to exercise RLS row-filtering through that view.
      await sql.unsafe(`GRANT SELECT ON lot_inventory_totals TO authenticated`);

      // ---- Fixtures --------------------------------------------------
      await sql`INSERT INTO parties (id, code, name) VALUES
        (${ids.partyVmiA}, 'VMI-A', 'VMI Party A'),
        (${ids.partyVmiB}, 'VMI-B', 'VMI Party B'),
        (${ids.partyTradingC}, 'TR-C', 'Trading Party C'),
        (${ids.partyTradingD}, 'TR-D', 'Trading Party D')`;

      // Sensitive fields populated deliberately (non-null) so the
      // column-presence assertions below are meaningful, not accidental.
      await sql`INSERT INTO items (id, code, name, barcode, volume_cbm, buying_price, selling_price, default_supplier_party_id)
        VALUES (${ids.itemX}, 'ITEM-X', 'Item X', 'BC-X', 1.0, 10.5, 20.5, ${ids.partyVmiA})`;

      await sql`INSERT INTO wrr_documents (id, wrr_number, vendor_party_id, flow_type, status, staged_by_user_id)
        VALUES (${ids.wrrDocA}, 'WRR-A', ${ids.partyVmiA}, 'vmi', 'confirmed', ${ids.userStaff})`;

      await sql`INSERT INTO wrr_items (id, wrr_id, item_id, lot_number, expected_qty, scanned_qty, unit_cbm, uom)
        VALUES (${ids.wrrItemX}, ${ids.wrrDocA}, ${ids.itemX}, 'LOT-X', 100, 100, 1.0, 'piece')`;

      await sql`INSERT INTO locations (id, zone, rack, level, position, label, max_cbm_capacity)
        VALUES (${ids.locA}, 'Z1', 'R1', 'L1', 'P1', 'Z1-R1-L1-P1', 100)`;

      // Three lots: VMI/party A, VMI/party B, and Supplies/party A (same
      // owner as the VMI lot -- deliberately, to prove Supplies exclusion
      // is flow-type-gated, not ownership-gated).
      await sql`INSERT INTO lots (id, lot_number, wrr_item_id, item_id, flow_type, owner_party_id, status)
        VALUES
        (${ids.lotA}, 'LOT-X', ${ids.wrrItemX}, ${ids.itemX}, 'vmi', ${ids.partyVmiA}, 'available'),
        (${ids.lotB}, 'LOT-Y', ${ids.wrrItemX}, ${ids.itemX}, 'vmi', ${ids.partyVmiB}, 'available'),
        (${ids.lotSupplies}, 'LOT-S', ${ids.wrrItemX}, ${ids.itemX}, 'supplies', ${ids.partyVmiA}, 'available')`;

      await sql`INSERT INTO lot_location_balances (lot_id, location_id, qty_received, qty_remaining, qty_committed)
        VALUES
        (${ids.lotA}, ${ids.locA}, 50, 50, 0),
        (${ids.lotB}, ${ids.locA}, 30, 30, 0),
        (${ids.lotSupplies}, ${ids.locA}, 20, 20, 0)`;

      await sql`INSERT INTO pick_lists (id, pick_list_number, customer_party_id, flow_type, status, created_at, updated_at)
        VALUES
        (${ids.plC}, 'PL-C', ${ids.partyTradingC}, 'trading', 'dispatched', now(), now()),
        (${ids.plD}, 'PL-D', ${ids.partyTradingD}, 'trading', 'dispatched', now(), now())`;

      await sql`INSERT INTO user_profiles (id, display_name, status) VALUES
        (${ids.userA}, 'User A', 'active'),
        (${ids.userB}, 'User B', 'active'),
        (${ids.userC}, 'User C', 'active'),
        (${ids.userStaff}, 'Staff', 'active')`;

      const [{ id: roleWarehouseStaff }] = await sql`SELECT id FROM roles WHERE key = 'warehouse_staff'`;
      const [{ id: rolePartyUser }] = await sql`SELECT id FROM roles WHERE key = 'party_user'`;

      await sql`INSERT INTO user_roles (user_id, role_id) VALUES
        (${ids.userStaff}, ${roleWarehouseStaff}),
        (${ids.userA}, ${rolePartyUser}),
        (${ids.userB}, ${rolePartyUser}),
        (${ids.userC}, ${rolePartyUser})`;

      await sql`INSERT INTO user_party_scopes (user_id, party_id, flow_type) VALUES
        (${ids.userA}, ${ids.partyVmiA}, 'vmi'),
        (${ids.userB}, ${ids.partyVmiB}, 'vmi'),
        (${ids.userC}, ${ids.partyTradingC}, 'trading')`;
    }, 60_000);

    afterAll(async () => {
      await sql.end({ timeout: 5 });
    });

    function sessionFor(userId: string) {
      return { getAuthenticatedSession: async () => ({ userId }) };
    }

    it("[VMI isolation] a VMI party user's stock-level query returns only their own party's lots, never another VMI party's lot", async () => {
      const { createRlsAnalyticsExecutor } = await import("../rls-executor");
      const { rlsPool } = await import("@/lib/db/rls-pool");
      const { getStockLevelSummary } = await import("../inventory");

      const executor = createRlsAnalyticsExecutor({ ...sessionFor(ids.userA), pool: rlsPool });
      const rows = (await getStockLevelSummary("vmi", executor)) as Array<{
        lot_id: string;
        owner_party_id: string | null;
        flow_type: string;
      }>;

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.owner_party_id === ids.partyVmiA)).toBe(true);
      expect(rows.some((row) => row.lot_id === ids.lotB)).toBe(false);
    });

    it("[Trading isolation] a Trading party user's pick-list-scoped query never includes another Trading party's pick lists", async () => {
      const { createRlsAnalyticsExecutor } = await import("../rls-executor");
      const { rlsPool } = await import("@/lib/db/rls-pool");
      const { getPickListVolumeTrend } = await import("../outbound");

      const range = { startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 86_400_000) };

      const executorC = createRlsAnalyticsExecutor({ ...sessionFor(ids.userC), pool: rlsPool });
      const rowsC = (await getPickListVolumeTrend(range, "trading", "day", executorC)) as Array<{
        total_count: string;
        dispatched_count: string;
      }>;
      const totalForC = rowsC.reduce((sum, row) => sum + Number(row.total_count), 0);

      // Party C has exactly one dispatched trading pick list (PL-C) in this
      // fixture set; party D's PL-D must never be counted for party C's
      // session even though both fall inside the same date range/flow.
      expect(totalForC).toBe(1);

      const executorStaff = createRlsAnalyticsExecutor({ ...sessionFor(ids.userStaff), pool: rlsPool });
      const rowsStaff = (await getPickListVolumeTrend(range, "trading", "day", executorStaff)) as Array<{
        total_count: string;
      }>;
      const totalForStaff = rowsStaff.reduce((sum, row) => sum + Number(row.total_count), 0);

      // Global-scope staff sees BOTH parties' pick lists -- the cross-party
      // aggregate design.md §6.2 requires for admin/supervisor/staff scope.
      expect(totalForStaff).toBe(2);
    });

    it("[sensitive fields] a party user's item projection never carries buying_price / selling_price / default_supplier_party_id keys, even though the base items row has them", async () => {
      const { createRlsAnalyticsExecutor } = await import("../rls-executor");
      const { rlsPool } = await import("@/lib/db/rls-pool");

      const executor = createRlsAnalyticsExecutor({ ...sessionFor(ids.userA), pool: rlsPool });

      // The base `items` table has zero party-user SELECT policy at all
      // (0008 §6: "items: NO direct SELECT grant for party users") -- proves
      // the sensitive columns are structurally unreachable via that path,
      // not merely nulled out.
      const baseRows = await executor.execute<Record<string, unknown>>(
        drizzleSql`SELECT * FROM items WHERE id = ${ids.itemX}`,
      );
      expect(baseRows.length).toBe(0);

      // `party_visible_items` is the ONLY party-facing item read path
      // (design.md §6.3) -- assert on the returned object's OWN KEYS, not a
      // null-value check, per this task's explicit instruction.
      const visibleRows = await executor.execute<Record<string, unknown>>(
        drizzleSql`SELECT * FROM party_visible_items WHERE id = ${ids.itemX}`,
      );
      expect(visibleRows.length).toBe(1);
      const keys = Object.keys(visibleRows[0]!);
      expect(keys).not.toContain("buying_price");
      expect(keys).not.toContain("selling_price");
      expect(keys).not.toContain("default_supplier_party_id");
      // Sanity: the row IS the real item (not an unrelated empty shape).
      expect(visibleRows[0]!.code).toBe("ITEM-X");
    });

    it("[global-scope staff] warehouse_staff's stock-level query is NOT party-filtered — sees every VMI party's lots in one cross-party result set", async () => {
      const { createRlsAnalyticsExecutor } = await import("../rls-executor");
      const { rlsPool } = await import("@/lib/db/rls-pool");
      const { getStockLevelSummary } = await import("../inventory");

      const executor = createRlsAnalyticsExecutor({ ...sessionFor(ids.userStaff), pool: rlsPool });
      const rows = (await getStockLevelSummary("vmi", executor)) as Array<{ owner_party_id: string | null }>;

      const ownerIds = new Set(rows.map((row) => row.owner_party_id));
      expect(ownerIds.has(ids.partyVmiA)).toBe(true);
      expect(ownerIds.has(ids.partyVmiB)).toBe(true);
    });

    it("[Supplies exclusion, two-gate] flow_type = 'supplies' rows are never returned to a party-scoped query, even when the querying party is the Supplies lot's own owner_party_id", async () => {
      const { createRlsAnalyticsExecutor } = await import("../rls-executor");
      const { rlsPool } = await import("@/lib/db/rls-pool");
      const { getStockLevelSummary } = await import("../inventory");

      // "all" flow deliberately -- if the executor (or the RLS policy
      // underneath it) ever regressed to a bare ownership check instead of
      // the two-gate design, party A (which legitimately owns both LOT-X
      // (vmi) and LOT-S (supplies)) would leak the Supplies row here.
      const executor = createRlsAnalyticsExecutor({ ...sessionFor(ids.userA), pool: rlsPool });
      const rows = (await getStockLevelSummary("all", executor)) as Array<{ flow_type: string; lot_id: string }>;

      expect(rows.some((row) => row.lot_id === ids.lotSupplies)).toBe(false);
      expect(rows.every((row) => row.flow_type !== "supplies")).toBe(true);

      // Global-scope staff, by contrast, DOES see the Supplies lot -- proves
      // the exclusion above is party-scope-specific, not a bug hiding all
      // Supplies rows from everyone (which would be a different, also-wrong
      // failure mode).
      const staffExecutor = createRlsAnalyticsExecutor({ ...sessionFor(ids.userStaff), pool: rlsPool });
      const staffRows = (await getStockLevelSummary("all", staffExecutor)) as Array<{ lot_id: string }>;
      expect(staffRows.some((row) => row.lot_id === ids.lotSupplies)).toBe(true);
    });

    it("[AC-5 'no error revealing existence'] a party user querying for a different party's data via the same query gets an empty result, not an error", async () => {
      const { createRlsAnalyticsExecutor } = await import("../rls-executor");
      const { rlsPool } = await import("@/lib/db/rls-pool");

      const executor = createRlsAnalyticsExecutor({ ...sessionFor(ids.userA), pool: rlsPool });

      // Party A directly querying party B's lot by id -- must resolve to an
      // empty array, never throw/reject and never distinguish "exists but
      // forbidden" from "does not exist".
      const rows = await executor.execute<Record<string, unknown>>(
        drizzleSql`SELECT * FROM lots WHERE id = ${ids.lotB}`,
      );
      expect(rows).toEqual([]);
    });
  },
);
