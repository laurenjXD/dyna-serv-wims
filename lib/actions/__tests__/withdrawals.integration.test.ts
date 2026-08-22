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
    // Minimal Supabase Storage schema stub — 0030_cipl_documents_storage.sql
    // (already present in supabase/migrations/ before this task started;
    // unrelated to commitment expiry) inserts into storage.buckets and adds
    // policies on storage.objects, neither of which this harness previously
    // created, so the migration chain failed for every integration test in
    // this file before any expiry-specific test even ran. Real Supabase
    // ships these platform-managed tables already; this stub only provides
    // the minimal shape 0030 needs (bucket row insert + object policy
    // creation), mirroring the auth.uid()/auth.jwt() stub pattern directly
    // above.
    await sql.unsafe("CREATE SCHEMA IF NOT EXISTS storage");
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      public boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    )`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text REFERENCES storage.buckets(id),
      name text
    )`);

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

  // Bug 1 reproduction: commitWithdrawal's allocation SELECT
  // (lib/actions/withdrawals.ts, ~lines 165-196) never projects
  // lots.expiry_date / lots.created_at into the row shape, yet the mapping
  // code at ~lines 217-218 reads row.receivedAt / row.expiryDate from those
  // same rows. beforeEach above only ever seeds ONE lot per item, so this
  // exact scenario — a request that must span 2+ eligible lot/location rows
  // for a single item — is never exercised by the rest of this file. Against
  // real Postgres (not a mock), allocate()'s FIFO sort
  // (lib/withdrawal/allocation.ts) throws a TypeError on the second row's
  // undefined receivedAt, which commitWithdrawal's outer catch silently
  // converts into { ok: false, errors: ["unable_to_reserve_stock"] }.
  //
  // Traceability:
  //   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §5 —
  //     "FEFO by expiry for perishable items and FIFO by approved
  //     received/created ordering for non-perishable items"
  //   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
  //     R2.1 — Allocation considers only lots with status = 'available'.
  //     R2.2 — FEFO applies to perishable items, FIFO to non-perishable items.
  it("(AC: FIFO across 2 lots succeeds, correct order) reserves stock spanning two non-perishable lots with distinct created_at, allocating the older lot first", async () => {
    const { commitWithdrawal } = await import("../withdrawals");

    // Exclude beforeEach's single-lot fixture (LOT-01) from eligibility so
    // this test exercises exactly the 2-lot scenario the bug report
    // describes, without a third eligible row muddying the assertions.
    await sql`UPDATE lots SET status = 'quarantined' WHERE id = ${lotId}`;

    const [wrr2] = await sql`INSERT INTO wrr_documents (wrr_number, vendor_party_id, flow_type, status, staged_by_user_id)
      VALUES ('WRR-OUTBOUND-02', ${partyId}, 'trading', 'confirmed', ${userId}) RETURNING id`;
    const [wrrItemA] = await sql`INSERT INTO wrr_items (wrr_id, item_id, lot_number, expected_qty, scanned_qty, unit_cbm, uom, disposition)
      VALUES (${wrr2.id}, ${itemId}, 'LOT-A', 15, 15, 0.1, 'piece', 'store') RETURNING id`;
    const [wrrItemB] = await sql`INSERT INTO wrr_items (wrr_id, item_id, lot_number, expected_qty, scanned_qty, unit_cbm, uom, disposition)
      VALUES (${wrr2.id}, ${itemId}, 'LOT-B', 15, 15, 0.1, 'piece', 'store') RETURNING id`;

    const [lotA] = await sql`INSERT INTO lots (lot_number, wrr_item_id, item_id, flow_type, status, created_at)
      VALUES ('LOT-A', ${wrrItemA.id}, ${itemId}, 'trading', 'available', '2026-01-01T00:00:00Z') RETURNING id`;
    const [lotB] = await sql`INSERT INTO lots (lot_number, wrr_item_id, item_id, flow_type, status, created_at)
      VALUES ('LOT-B', ${wrrItemB.id}, ${itemId}, 'trading', 'available', '2026-02-01T00:00:00Z') RETURNING id`;

    await sql`INSERT INTO lot_location_balances (lot_id, location_id, qty_received, qty_remaining, qty_committed)
      VALUES (${lotA.id}, ${locationId}, 15, 15, 0)`;
    await sql`INSERT INTO lot_location_balances (lot_id, location_id, qty_received, qty_remaining, qty_committed)
      VALUES (${lotB.id}, ${locationId}, 15, 15, 0)`;

    const committed = await commitWithdrawal(resolver, {
      partyId,
      flowType: "trading",
      lines: [{ itemId, lotId: "client-cannot-select", locationId: "client-cannot-select", qty: 20, itemCodeIsProvisional: false }],
    }, await rlsDeps());

    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    const balanceA = await sql`SELECT qty_remaining, qty_committed FROM lot_location_balances WHERE lot_id = ${lotA.id}`;
    const balanceB = await sql`SELECT qty_remaining, qty_committed FROM lot_location_balances WHERE lot_id = ${lotB.id}`;
    // FIFO: the older lot (LOT-A, created 2026-01-01) is fully consumed (15
    // of 15) before the newer lot (LOT-B, created 2026-02-01) is touched
    // (5 of its 15 committed, to cover the remaining 20 - 15 = 5 units).
    expect(balanceA[0]).toMatchObject({ qty_remaining: 15, qty_committed: 15 });
    expect(balanceB[0]).toMatchObject({ qty_remaining: 15, qty_committed: 5 });

    const lines = await sql`SELECT lot_id, qty FROM pick_list_items WHERE pick_list_id = ${committed.pickListId} ORDER BY created_at ASC`;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ lot_id: lotA.id, qty: 15 });
    expect(lines[1]).toMatchObject({ lot_id: lotB.id, qty: 5 });
  });

  // ---------------------------------------------------------------------
  // Commitment expiry — Stage 2 real-time rejection (RED step)
  //
  // Traceability:
  //   specs/00-steering/revision-log.md — "Spec 08 — Pick-list expiry
  //     enforcement: Option C (staleness check at Stage 2 + nightly CRON
  //     sweep)": "Stage 2 dispatch rejects and marks `expired` in real time
  //     when `expires_at` is in the past... Both paths write the same
  //     `expired` transition; the CRON is the safety net, not the primary
  //     enforcer."
  //   Product Owner decision (this task): TTL duration is 24 hours from
  //     commitment creation.
  //   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §7 —
  //     Stage 2 physical execution and dispatch transaction: the dispatch
  //     command rechecks "current lot status, selected lot/location balance,
  //     and reservation state" before any of the numbered atomic dispatch
  //     writes; an expired reservation must fail this recheck.
  //   specs/08-outgoing-withdrawal-and-two-stage-commitment/tasks.md
  //     Task 4 (unchecked): "Implement safe cancellation/release/expiry
  //     before dispatch with concurrency protection."
  //
  // This test forces the commitment stale via a direct UPDATE rather than
  // waiting out the real 24h TTL — the reservation's `expires_at` value is
  // what matters here, not the wall-clock delay to reach it. Today this test
  // is RED because dispatchPickList performs the full normal dispatch
  // regardless of expires_at: `dispatched` resolves to `{ ok: true }` and the
  // assertion below fails, not because of a thrown error.
  // ---------------------------------------------------------------------
  it("(AC: expired commitment rejects dispatch, releases reservation, writes no pick transaction) rejects dispatch with commitment_expired, marks the commitment 'expired', releases qty_committed back to its pre-reservation value, and creates no inventory_transactions row", async () => {
    const { commitWithdrawal, dispatchPickList } = await import("../withdrawals");
    const committed = await commitWithdrawal(resolver, {
      partyId,
      flowType: "trading",
      lines: [{ itemId, lotId: "client-cannot-select", locationId: "client-cannot-select", qty: 10, itemCodeIsProvisional: false }],
    }, await rlsDeps());
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    const balanceAfterCommit = await sql`SELECT qty_remaining, qty_committed FROM lot_location_balances WHERE lot_id = ${lotId}`;
    expect(balanceAfterCommit[0]).toMatchObject({ qty_remaining: 20, qty_committed: 10 });

    // Force this reservation stale, independent of the 24h wall-clock TTL.
    await sql`UPDATE inventory_commitments SET expires_at = now() - interval '1 hour' WHERE pick_list_id = ${committed.pickListId}`;

    const line = await sql`SELECT id FROM pick_list_items WHERE pick_list_id = ${committed.pickListId}`;
    expect(line).toHaveLength(1);

    const dispatched = await dispatchPickList(resolver, committed.pickListId, [line[0].id as string], await rlsDeps());
    expect(dispatched).toEqual({ ok: false, errors: ["commitment_expired"] });

    const commitmentRow = await sql`SELECT status FROM inventory_commitments WHERE pick_list_id = ${committed.pickListId}`;
    expect(commitmentRow[0]).toMatchObject({ status: "expired" });

    const balanceAfterExpiry = await sql`SELECT qty_remaining, qty_committed FROM lot_location_balances WHERE lot_id = ${lotId}`;
    // Stock never left the shelf (qty_remaining unchanged) and the
    // reservation is fully released (qty_committed back to 0).
    expect(balanceAfterExpiry[0]).toMatchObject({ qty_remaining: 20, qty_committed: 0 });

    const txns = await sql`SELECT id FROM inventory_transactions WHERE pick_list_id = ${committed.pickListId}`;
    expect(txns).toHaveLength(0);
  });

  // ---------------------------------------------------------------------
  // Nightly pg_cron sweep — expire_stale_commitments() (RED step)
  //
  // This SQL function does not exist yet — it is new database-builder work,
  // owned by a migration file this test does not write. The test below is
  // written as if the function already worked correctly (full expected
  // end-state assertions), NOT wrapped in `.rejects.toThrow(...)`, so that
  // once the function is implemented this test needs no changes to turn
  // GREEN. Today it is RED because the direct `SELECT
  // expire_stale_commitments()` call itself throws a Postgres error
  // ("function expire_stale_commitments() does not exist" or equivalent
  // 42883 undefined_function error) before any assertion runs — confirmed
  // when this suite is run against a live disposable Postgres instance.
  //
  // Traceability:
  //   specs/00-steering/revision-log.md — "Spec 08 — Pick-list expiry
  //     enforcement: Option C": "A nightly pg_cron job sweeps for any
  //     commitments past `expires_at` that were never attempted and marks
  //     them `expired`, freeing `qty_committed` on `lot_location_balances`."
  //   specs/08-outgoing-withdrawal-and-two-stage-commitment/tasks.md
  //     Task 4 (unchecked): "Implement safe cancellation/release/expiry
  //     before dispatch with concurrency protection."
  //
  // Function-name proposal (flagged, not gospel — for database-builder):
  // `expire_stale_commitments()`, no arguments, matching this migration
  // set's existing snake_case verb_object SQL function naming convention
  // (`generate_document_number`, `set_updated_at`,
  // `wrr_items_protect_committed_at`).
  // ---------------------------------------------------------------------
  it("(AC: sweep expires unattempted stale commitments and releases qty_committed, leaving still-active commitments untouched) transitions a past-expires_at, never-dispatched commitment to 'expired' and releases its qty_committed, without touching a commitment whose expires_at is still in the future", async () => {
    const { commitWithdrawal } = await import("../withdrawals");

    // Commitment A: will be forced stale below, never attempted at Stage 2 —
    // exactly the "never attempted" safety-net case the CRON sweep exists
    // for (revision-log.md).
    const committedA = await commitWithdrawal(resolver, {
      partyId,
      flowType: "trading",
      lines: [{ itemId, lotId: "client-cannot-select", locationId: "client-cannot-select", qty: 6, itemCodeIsProvisional: false }],
    }, await rlsDeps());
    expect(committedA.ok).toBe(true);
    if (!committedA.ok) return;
    await sql`UPDATE inventory_commitments SET expires_at = now() - interval '1 hour' WHERE pick_list_id = ${committedA.pickListId}`;

    // Commitment B: genuinely still active (expires_at set ~24h out by
    // commitWithdrawal itself) and must be left untouched by the sweep.
    const committedB = await commitWithdrawal(resolver, {
      partyId,
      flowType: "trading",
      lines: [{ itemId, lotId: "client-cannot-select", locationId: "client-cannot-select", qty: 4, itemCodeIsProvisional: false }],
    }, await rlsDeps());
    expect(committedB.ok).toBe(true);
    if (!committedB.ok) return;

    const before = await sql`SELECT qty_remaining, qty_committed FROM lot_location_balances WHERE lot_id = ${lotId}`;
    // 20 received; A reserved 6, B reserved 4 => qty_remaining 20, qty_committed 10.
    expect(before[0]).toMatchObject({ qty_remaining: 20, qty_committed: 10 });

    await sql`SELECT expire_stale_commitments()`;

    const commitmentA = await sql`SELECT status FROM inventory_commitments WHERE pick_list_id = ${committedA.pickListId}`;
    expect(commitmentA[0]).toMatchObject({ status: "expired" });

    const commitmentB = await sql`SELECT status FROM inventory_commitments WHERE pick_list_id = ${committedB.pickListId}`;
    expect(commitmentB[0]).toMatchObject({ status: "active" });

    const after = await sql`SELECT qty_remaining, qty_committed FROM lot_location_balances WHERE lot_id = ${lotId}`;
    // A's 6 released, B's 4 still held => qty_remaining unchanged (20),
    // qty_committed drops from 10 to 4.
    expect(after[0]).toMatchObject({ qty_remaining: 20, qty_committed: 4 });
  });

  // ---------------------------------------------------------------------
  // Regression — expire_stale_commitments() must release EVERY stale
  // commitment line's qty_committed, not just one, when two or more of
  // them share the same lot_location_balances row in the same sweep call.
  //
  // Found by db-migration-verifier via an ad-hoc real-Postgres repro (not
  // itself committed to this suite): the sweep's balance-release statement
  // is `UPDATE lot_location_balances llb ... FROM inventory_commitment_lines
  // icl WHERE llb.id = icl.lot_location_balance_id AND icl.commitment_id =
  // ANY(v_stale_ids) AND icl.status = 'active'`. Postgres's `UPDATE ...
  // FROM` applies only ONE arbitrary matching source row per target row
  // when multiple FROM-joined rows match the same target — it does not
  // sum/loop across all matches. Whenever two different stale commitment
  // lines reference the identical `lot_location_balance_id` in the same
  // sweep call (realistic: two different pick lists both drawing from the
  // same lot/location, both going stale in the same window), only one
  // release is applied and the other is silently dropped — even though the
  // separate commitment/line status UPDATEs below it (`WHERE id =
  // ANY(...)`, no FROM join) correctly mark ALL of them 'expired'. The bug
  // is therefore invisible from the commitment/line tables; only
  // `lot_location_balances.qty_committed` silently drifts high (available
  // stock permanently under-reported — a reservation leak in the opposite
  // direction from what expiry exists to fix).
  //
  // This test uses two DIFFERENT reserved quantities (10 and 7, matching
  // the confirmed repro exactly) rather than two equal quantities, so a fix
  // that happens to sum only the 2-equal-quantities case cannot
  // accidentally pass.
  //
  // Traceability:
  //   specs/00-steering/revision-log.md — "Spec 08 — Pick-list expiry
  //     enforcement: Option C (staleness check at Stage 2 + nightly CRON
  //     sweep)": "A nightly pg_cron job sweeps for any commitments past
  //     `expires_at` that were never attempted and marks them `expired`,
  //     freeing `qty_committed` on `lot_location_balances`."
  //   specs/08-outgoing-withdrawal-and-two-stage-commitment/tasks.md Task 4:
  //     "Implement safe cancellation/release/expiry before dispatch with
  //     concurrency protection." (resolved 2026-08-09 per the
  //     "Expiry enforcement mechanism" decision above it: dual enforcement,
  //     nightly sweep decrements `qty_committed` on `lot_location_balances`
  //     for every unattempted, now-stale commitment — not a subset of them.)
  // ---------------------------------------------------------------------
  it("(AC: tasks.md Task 4 — safe expiry with concurrency protection; revision-log.md 'Spec 08 — Pick-list expiry enforcement' — nightly sweep frees qty_committed for every stale commitment) releases the full reserved qty_committed for BOTH stale commitments when their lines share the same lot_location_balances row, instead of dropping one release", async () => {
    const { commitWithdrawal } = await import("../withdrawals");

    // Two independent, unrelated commitments (distinct pick lists), each
    // with one line, both allocated against the SAME single
    // lot_location_balances row seeded in beforeEach (only one lot/location
    // exists for this item) — with different reserved quantities (10, 7)
    // per the confirmed repro.
    const committedA = await commitWithdrawal(resolver, {
      partyId,
      flowType: "trading",
      lines: [{ itemId, lotId: "client-cannot-select", locationId: "client-cannot-select", qty: 10, itemCodeIsProvisional: false }],
    }, await rlsDeps());
    expect(committedA.ok).toBe(true);
    if (!committedA.ok) return;
    await sql`UPDATE inventory_commitments SET expires_at = now() - interval '1 hour' WHERE pick_list_id = ${committedA.pickListId}`;

    const committedB = await commitWithdrawal(resolver, {
      partyId,
      flowType: "trading",
      lines: [{ itemId, lotId: "client-cannot-select", locationId: "client-cannot-select", qty: 7, itemCodeIsProvisional: false }],
    }, await rlsDeps());
    expect(committedB.ok).toBe(true);
    if (!committedB.ok) return;
    await sql`UPDATE inventory_commitments SET expires_at = now() - interval '1 hour' WHERE pick_list_id = ${committedB.pickListId}`;

    const before = await sql`SELECT qty_remaining, qty_committed FROM lot_location_balances WHERE lot_id = ${lotId}`;
    // 20 received; A reserved 10, B reserved 7 => qty_remaining 20, qty_committed 17.
    expect(before[0]).toMatchObject({ qty_remaining: 20, qty_committed: 17 });

    await sql`SELECT expire_stale_commitments()`;

    const commitmentA = await sql`SELECT status FROM inventory_commitments WHERE pick_list_id = ${committedA.pickListId}`;
    expect(commitmentA[0]).toMatchObject({ status: "expired" });

    const commitmentB = await sql`SELECT status FROM inventory_commitments WHERE pick_list_id = ${committedB.pickListId}`;
    expect(commitmentB[0]).toMatchObject({ status: "expired" });

    const after = await sql`SELECT qty_remaining, qty_committed FROM lot_location_balances WHERE lot_id = ${lotId}`;
    // Both A's 10 and B's 7 must be released from the SAME shared balance
    // row => qty_committed fully back to 0. The bug leaves this at 7 (only
    // B's release applied — the alphabetically/arbitrarily "last" FROM-match
    // for that target row) or 10, never both. qty_remaining stays 20 —
    // expiry never touches physical on-hand quantity.
    expect(after[0]).toMatchObject({ qty_remaining: 20, qty_committed: 0 });
  });
});
