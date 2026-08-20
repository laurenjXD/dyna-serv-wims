// Real-Postgres proof for the outbound two-stage commitment invariant.
// Runs only when TEST_DATABASE_URL/DATABASE_URL is configured.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";
import type { AuthorizationContext, RequestAuthorizationResolver } from "@/lib/rbac/session";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const hasLiveDb = connectionString.length > 0;
if (process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
const userId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const context: AuthorizationContext = {
  userId,
  profileStatus: "active",
  activeRoleKeys: ["supervisor"],
  grants: [
    { resource: "pick_list", action: "generate", scopeKind: "global" },
    { resource: "dispatch", action: "execute", scopeKind: "global" },
  ],
  partyScopes: [],
};
const resolver: RequestAuthorizationResolver = {
  getContext: async () => ({ kind: "authorized", context }),
};

describe.skipIf(!hasLiveDb)("outbound commitment and dispatch — real Postgres", () => {
  let sql: Sql;
  let partyId: string;
  let itemId: string;
  let lotId: string;
  let locationId: string;

  beforeAll(async () => {
    sql = postgres(connectionString, { prepare: false, max: 5 });
    await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.unsafe("DROP SCHEMA IF EXISTS auth CASCADE");
    await sql.unsafe("DROP SCHEMA IF EXISTS rbac_internal CASCADE");
    await sql.unsafe("CREATE SCHEMA public");
    await sql.unsafe("CREATE SCHEMA auth");
    await sql.unsafe(`CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
    $$`);
    await sql.unsafe("CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$");
    await sql.unsafe("CREATE TABLE auth.users (id uuid PRIMARY KEY)");
    await sql.unsafe("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$");

    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
      await sql.unsafe(readFileSync(path.join(migrationsDir, file), "utf8"));
    }
    await sql`INSERT INTO user_profiles (id, display_name, status) VALUES (${userId}, 'Outbound Test User', 'active')`;
    await sql`INSERT INTO user_roles (user_id, role_id) SELECT ${userId}, id FROM roles WHERE key = 'supervisor'`;
  }, 60_000);

  afterAll(async () => { await sql.end({ timeout: 5 }); });

  async function rlsDeps(): Promise<RlsTransactionDeps> {
    const { rlsPool } = await import("@/lib/db/rls-pool");
    return { getAuthenticatedSession: async () => ({ userId }), pool: rlsPool };
  }

  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE TABLE inventory_transactions, inventory_commitment_lines,
      inventory_commitments, pick_list_items, pick_lists, lot_location_balances, lots,
      wrr_items, wrr_documents, items, locations, parties RESTART IDENTITY CASCADE`);
    const [party] = await sql`INSERT INTO parties (code, name) VALUES ('CUST-01', 'Customer One') RETURNING id`;
    partyId = party.id as string;
    const [item] = await sql`INSERT INTO items (code, name, barcode, dsgc_item_number, default_supplier_party_id, volume_cbm)
      VALUES ('ITEM-01', 'Test Item', 'BARCODE-01', 'DSGC-01', ${partyId}, 0.1) RETURNING id`;
    itemId = item.id as string;
    const [location] = await sql`INSERT INTO locations (zone, rack, level, position, label, location_type, max_cbm_capacity)
      VALUES ('A', '1', '1', '01', 'A1-01', 'storage', 100) RETURNING id`;
    locationId = location.id as string;
    const [wrr] = await sql`INSERT INTO wrr_documents (wrr_number, vendor_party_id, flow_type, status, staged_by_user_id)
      VALUES ('WRR-OUTBOUND-01', ${partyId}, 'trading', 'confirmed', ${userId}) RETURNING id`;
    const [wrrItem] = await sql`INSERT INTO wrr_items (wrr_id, item_id, lot_number, expected_qty, scanned_qty, unit_cbm, uom, disposition)
      VALUES (${wrr.id}, ${itemId}, 'LOT-01', 20, 20, 0.1, 'piece', 'store') RETURNING id`;
    const [lot] = await sql`INSERT INTO lots (lot_number, wrr_item_id, item_id, flow_type, status)
      VALUES ('LOT-01', ${wrrItem.id}, ${itemId}, 'trading', 'available') RETURNING id`;
    lotId = lot.id as string;
    await sql`INSERT INTO lot_location_balances (lot_id, location_id, qty_received, qty_remaining, qty_committed)
      VALUES (${lotId}, ${locationId}, 20, 20, 0)`;
  });

  it("reserves without decrementing, then dispatches once with the committed scan evidence", async () => {
    const { commitWithdrawal, dispatchPickList } = await import("../withdrawals");
    const committed = await commitWithdrawal(resolver, {
      partyId,
      flowType: "trading",
      lines: [{ itemId, lotId: "client-cannot-select", locationId: "client-cannot-select", qty: 10, itemCodeIsProvisional: false }],
    }, await rlsDeps());
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    let balance = await sql`SELECT qty_remaining, qty_committed FROM lot_location_balances WHERE lot_id = ${lotId}`;
    expect(balance[0]).toMatchObject({ qty_remaining: 20, qty_committed: 10 });
    const line = await sql`SELECT id FROM pick_list_items WHERE pick_list_id = ${committed.pickListId}`;
    expect(line).toHaveLength(1);

    const dispatched = await dispatchPickList(resolver, committed.pickListId, [line[0].id as string], await rlsDeps());
    expect(dispatched).toEqual({ ok: true });

    balance = await sql`SELECT qty_remaining, qty_committed FROM lot_location_balances WHERE lot_id = ${lotId}`;
    expect(balance[0]).toMatchObject({ qty_remaining: 10, qty_committed: 0 });
    const txns = await sql`SELECT qty, movement_type, pick_list_id FROM inventory_transactions WHERE pick_list_id = ${committed.pickListId}`;
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({ qty: 10, movement_type: "pick", pick_list_id: committed.pickListId });
    const retry = await dispatchPickList(resolver, committed.pickListId, [line[0].id as string], await rlsDeps());
    expect(retry).toEqual({ ok: false, errors: ["already_dispatched"] });
  });
});
