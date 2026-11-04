// Independent R1-R8 migration verification against PostgreSQL (PGlite).
// Uses a fresh in-memory DB, the real core migration, and narrow RBAC fixtures.
// This does not connect to or modify the hosted database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.PGLITE_RUNTIME || path.join(root, "node_modules/.cache/rbac-db-verification/node_modules/@electric-sql/pglite"));
const migrationPath = path.join(root, "supabase/migrations/0076_material_expiry_policy.sql");
// Fail before fixtures if the expected implementation is absent (the RED step).
const migration = await readFile(migrationPath, "utf8");
const db = new PGlite();
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const actor = id(1), otherActor = id(2), item = id(3), organization = id(4);
const wrr = id(5), wrrItem = id(6), lot = id(7), location = id(8), pickList = id(9), pickLine = id(10);
let count = 0;

async function check(label, run) {
  await run();
  count += 1;
  console.log(`PASS ${label}`);
}

async function fails(sql, params = []) {
  await assert.rejects(() => db.query(sql, params));
}

async function asActor(sql, params = [], user = actor) {
  return db.transaction(async (tx) => {
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user })]);
    await tx.exec("SET LOCAL ROLE authenticated");
    return tx.query(sql, params);
  });
}

try {
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth; CREATE SCHEMA rbac_internal;
    CREATE TYPE public.scope_kind AS ENUM ('global','assigned_party');
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'
    $$;
  `.replace("SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'", "SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid"));
  await db.exec(`
    CREATE FUNCTION rbac_internal.current_user_is_active() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;
    CREATE FUNCTION rbac_internal.has_permission(text,text,public.scope_kind) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT auth.uid() IS NOT NULL AND coalesce(current_setting('app.test_deny',true),'false') <> 'true'
    $$;
    CREATE FUNCTION rbac_internal.can_access_party_resource(text,text,uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT auth.uid() IS NOT NULL AND coalesce(current_setting('app.test_deny',true),'false') <> 'true'
    $$;
    GRANT USAGE ON SCHEMA auth,rbac_internal TO authenticated,anon;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth,rbac_internal TO authenticated;
  `);
  await db.exec(await readFile(path.join(root, "supabase/migrations/0001_core_data_model.sql"), "utf8"));
  await db.exec(await readFile(path.join(root, "supabase/migrations/0053_wrr_item_expiry_date.sql"), "utf8"));
  await db.exec("ALTER TABLE public.wrr_items ADD COLUMN committed_at timestamptz; GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated");
  // Unrelated later-module fixture tables allow the exact migration's GRANTs
  // and deferred PL/pgSQL functions to resolve. Expiry scenarios below exercise
  // the real 0001 stock/reservation/document tables and the exact 0076 triggers.
  await db.exec(`
    CREATE TABLE public.inventory_units(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carton_id text,
      lot_id uuid, location_id uuid, pick_list_item_id uuid, status text, updated_at timestamptz DEFAULT now());
    CREATE TABLE public.carton_status_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), inventory_unit_id uuid,
      carton_id text, previous_status text, new_status text, location_id uuid, changed_by_user_id uuid, reason text);
    CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_user_id uuid,
      category text, title text, body text, source_type text, source_id uuid, flow_type public.flow_type);
    CREATE TABLE public.user_profiles(id uuid PRIMARY KEY, status text);
    CREATE TABLE public.roles(id uuid PRIMARY KEY, is_active boolean);
    CREATE TABLE public.permissions(id uuid PRIMARY KEY, resource text, action text);
    CREATE TABLE public.role_permissions(role_id uuid, permission_id uuid, scope_kind public.scope_kind);
    CREATE TABLE public.user_roles(user_id uuid, role_id uuid, revoked_at timestamptz, valid_from timestamptz, valid_until timestamptz);
    CREATE TABLE public.inspection_cases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lot_id uuid, item_id uuid);
    CREATE TABLE public.inspection_dispositions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), inspection_case_id uuid, disposition_type text);
  `);
  await db.query("INSERT INTO auth.users(id) VALUES ($1),($2)", [actor,otherActor]);
  await db.query("INSERT INTO parties(id,code,name) VALUES ($1,'ORG','Organization')", [organization]);
  await db.query("INSERT INTO items(id,code,name,barcode,volume_cbm) VALUES ($1,'MAT-1','Material','BAR-1',0.1)", [item]);
  await db.query("INSERT INTO locations(id,zone,rack,level,position,label,max_cbm_capacity) VALUES ($1,'storage','A','1','1','A-1-1',100)", [location]);
  await db.query("INSERT INTO wrr_documents(id,wrr_number,vendor_party_id,flow_type,staged_by_user_id) VALUES ($1,'WRR-1',$2,'trading',$3)", [wrr,organization,actor]);
  await db.query("INSERT INTO wrr_items(id,wrr_id,item_id,lot_number,expected_qty,unit_cbm,uom,expiry_date) VALUES ($1,$2,$3,'LOT-1',24,0.1,'piece',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1)", [wrrItem,wrr,item]);
  await db.query("INSERT INTO lots(id,lot_number,wrr_item_id,item_id,flow_type,status,expiry_date) VALUES ($1,'LOT-1',$2,$3,'trading','available',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1)", [lot,wrrItem,item]);
  await db.query("INSERT INTO pick_lists(id,pick_list_number,customer_party_id,flow_type) VALUES ($1,'PL-1',$2,'trading')", [pickList,organization]);
  await db.query("INSERT INTO pick_list_items(id,pick_list_id,item_id,item_code,lot_id,lot_number,location_id,location_label,qty,spq,number_of_boxes) VALUES ($1,$2,$3,'MAT-1',$4,'LOT-1',$5,'A-1-1',12,12,1)", [pickLine,pickList,item,lot,location]);
  await db.query("INSERT INTO lot_location_balances(lot_id,location_id,qty_received,qty_remaining,qty_committed) VALUES ($1,$2,24,24,0)", [lot,location]);
  await db.exec(migration);

  await check("R1 existing-item backfill is conservative and versioned", async () => {
    const { rows } = await db.query("SELECT expiry_policy,expiry_policy_version FROM items WHERE id=$1", [item]);
    assert.deepEqual(rows[0], { expiry_policy: "block_release", expiry_policy_version: 1 });
  });
  await check("R1 new items default to block release and reject invalid policy", async () => {
    const { rows } = await db.query("INSERT INTO items(code,name,barcode,volume_cbm) VALUES ('MAT-2','Second material','BAR-2',0.1) RETURNING expiry_policy,expiry_policy_version");
    assert.deepEqual(rows[0], { expiry_policy: "block_release", expiry_policy_version: 1 });
    await fails("INSERT INTO items(code,name,barcode,volume_cbm,expiry_policy) VALUES ('MAT-3','Invalid','BAR-3',0.1,'silently_allow')");
    await fails("INSERT INTO items(code,name,barcode,volume_cbm,expiry_policy_version) VALUES ('MAT-4','Forged revision','BAR-4',0.1,3)");
    await fails("UPDATE items SET expiry_policy_version=3 WHERE id=$1", [item]);
  });
  await check("R2/R4 SQL eligibility uses current Manila calendar date and policy", async () => {
    const { rows } = await db.query(`SELECT
      public.inventory_expiry_eligible('available',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,'block_release',false) AS today,
      public.inventory_expiry_eligible('available',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'block_release',false) AS yesterday_block,
      public.inventory_expiry_eligible('available',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'allow_with_acknowledgement',false) AS yesterday_allow,
      public.inventory_expiry_eligible('quarantined',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'allow_with_acknowledgement',false) AS quarantined,
      public.inventory_expiry_eligible('expired',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'allow_with_acknowledgement',false) AS legacy_expired,
      public.inventory_expiry_eligible('available',NULL,'allow_with_acknowledgement',true) AS missing_required,
      public.inventory_expiry_eligible('available',NULL,'block_release',false) AS optional_date,
      public.inventory_expiry_eligible('available',NULL,NULL,false) AS missing_policy`);
    assert.deepEqual(rows[0], { today:true, yesterday_block:false, yesterday_allow:true, quarantined:false, legacy_expired:false, missing_required:false, optional_date:true, missing_policy:false });
  });
  await check("R1 policy edits require an explicit reason", async () => {
    await assert.rejects(() => asActor("UPDATE items SET expiry_policy='allow_with_acknowledgement' WHERE id=$1", [item]));
  });
  await check("R4 blocked stock cannot gain a new reservation directly", async () => {
    await fails("UPDATE lot_location_balances SET qty_committed=12 WHERE lot_id=$1", [lot]);
    const { rows } = await db.query("SELECT qty_remaining,qty_committed FROM lot_location_balances WHERE lot_id=$1", [lot]);
    assert.deepEqual(rows[0], { qty_remaining:24, qty_committed:0 });
  });
  await check("R6 direct pick transaction cannot bypass expired block policy", async () => {
    await fails("INSERT INTO inventory_transactions(transaction_number,lot_id,item_id,movement_type,from_location_id,qty,flow_type,pick_list_id,performed_by_user_id) VALUES ('BLOCKED-PICK',$1,$2,'pick',$3,12,'trading',$4,$5)", [lot,item,location,pickList,actor]);
  });
  await check("R1 authorized reasoned edit increments revision and writes audit", async () => {
    await db.transaction(async (tx) => {
      await tx.query("SELECT set_config('request.jwt.claims',$1,true),set_config('app.expiry_policy_reason','Reviewed material policy',true)", [JSON.stringify({sub:actor})]);
      await tx.exec("SET LOCAL ROLE authenticated");
      await tx.query("UPDATE items SET expiry_policy='allow_with_acknowledgement' WHERE id=$1", [item]);
    });
    const { rows } = await db.query("SELECT expiry_policy,expiry_policy_version FROM items WHERE id=$1", [item]);
    assert.deepEqual(rows[0], { expiry_policy:"allow_with_acknowledgement", expiry_policy_version:2 });
    const audit = await db.query("SELECT actor_user_id,before_data,after_data FROM audit_log WHERE entity_id=$1 ORDER BY created_at DESC LIMIT 1", [item]);
    assert.equal(audit.rows[0].actor_user_id, actor);
    assert.ok(audit.rows[0].before_data);
    assert.ok(audit.rows[0].after_data);
  });
  await check("R6 permissive expiry still cannot dispatch without acknowledgement", async () => {
    await fails("INSERT INTO inventory_transactions(transaction_number,lot_id,item_id,movement_type,from_location_id,qty,flow_type,pick_list_id,performed_by_user_id) VALUES ('NO-ACK-PICK',$1,$2,'pick',$3,12,'trading',$4,$5)", [lot,item,location,pickList,actor]);
  });

  const { rows:dateRows } = await db.query("SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1)::text AS expiry,((clock_timestamp() AT TIME ZONE 'Asia/Manila')::date)::text AS today");
  const line = { itemId:item,lotId:lot,locationId:location,qty:12,expiryDate:dateRows[0].expiry,expiryPolicy:"allow_with_acknowledgement",expiryPolicyVersion:2 };
  const ack = [pickList,actor,"Documented material request",dateRows[0].today,"a".repeat(64),JSON.stringify([line])];
  const insertAck = "INSERT INTO expiry_acknowledgements(stage,source_id,actor_user_id,reason,business_date,fingerprint,lines) VALUES ('dispatch',$1,$2,$3,$4,$5,$6::jsonb) RETURNING id";
  await check("R8 rejects forged actors and nonexistent workflow sources", async () => {
    await assert.rejects(() => asActor(insertAck, [pickList,otherActor,...ack.slice(2)]));
    await assert.rejects(() => asActor(insertAck, [id(999),actor,...ack.slice(2)]));
  });
  let ackId;
  await check("R6/R8 accepts exact current scoped acknowledgement", async () => {
    const result = await asActor(insertAck, ack);
    ackId = result.rows[0].id;
    assert.ok(ackId);
  });
  await check("R8 acknowledged evidence is immutable and duplicate fingerprint is rejected", async () => {
    await assert.rejects(() => asActor("UPDATE expiry_acknowledgements SET reason='rewritten' WHERE id=$1", [ackId]));
    await assert.rejects(() => asActor("DELETE FROM expiry_acknowledgements WHERE id=$1", [ackId]));
    await assert.rejects(() => asActor(insertAck, ack));
  });
  await check("R6 acknowledgement for another quantity cannot authorize dispatch", async () => {
    await fails("INSERT INTO inventory_transactions(transaction_number,lot_id,item_id,movement_type,from_location_id,qty,flow_type,pick_list_id,performed_by_user_id) VALUES ('WRONG-QTY-PICK',$1,$2,'pick',$3,24,'trading',$4,$5)", [lot,item,location,pickList,actor]);
  });
  await check("R6 exact current acknowledgement permits dispatch without changing stock itself", async () => {
    await asActor("INSERT INTO inventory_transactions(transaction_number,lot_id,item_id,movement_type,from_location_id,qty,flow_type,pick_list_id,performed_by_user_id) VALUES ('VALID-PICK',$1,$2,'pick',$3,12,'trading',$4,$5)", [lot,item,location,pickList,actor]);
    const { rows } = await db.query("SELECT qty_remaining FROM lot_location_balances WHERE lot_id=$1", [lot]);
    assert.equal(rows[0].qty_remaining,24);
  });
  await check("R8 read and write require current workflow authority", async () => {
    await db.transaction(async (tx) => {
      await tx.query("SELECT set_config('request.jwt.claims',$1,true),set_config('app.test_deny','true',true)", [JSON.stringify({sub:actor})]);
      await tx.exec("SET LOCAL ROLE authenticated");
      const {rows} = await tx.query("SELECT id FROM expiry_acknowledgements");
      assert.deepEqual(rows,[]);
    });
  });
  console.log(`Verified ${count} expiry-policy PostgreSQL scenarios.`);
} catch (error) {
  console.error("Expiry verification failed:", error.message, error.code || "", error.detail || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
