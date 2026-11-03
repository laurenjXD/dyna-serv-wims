// Real PostgreSQL (PGlite WASM) verification; never connects to DATABASE_URL.
// Install the optional isolated engine, without changing root dependencies:
// npm.cmd install --prefix node_modules/.cache/rbac-db-verification --no-save --package-lock=false @electric-sql/pglite
// Run: npm.cmd run test:integration -- lib/rbac/__tests__/dynamic-rbac.integration.test.ts
// Platform auth/storage stubs supply Supabase schema shape only. Cron/network
// extensions and multi-connection concurrency require separate live-stack tests.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

interface Engine {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}
const enginePath = path.resolve(process.cwd(), "node_modules/.cache/rbac-db-verification/node_modules/@electric-sql/pglite");
const hasEngine = existsSync(enginePath);
const require = createRequire(import.meta.url);
const ids = {
  admin: "11111111-1111-4111-8111-111111111111",
  admin2: "22222222-2222-4222-8222-222222222222",
  receiver: "33333333-3333-4333-8333-333333333333",
  picker: "44444444-4444-4444-8444-444444444444",
  client: "55555555-5555-4555-8555-555555555555",
  inactive: "66666666-6666-4666-8666-666666666666",
};
interface Grant { permissionId: string; scopeKind: "global" | "assigned_party" }
let db: Engine;
let seededRoles: Record<string, string>;
let permissionIds: Record<string, string>;
let orgId: string;
let savepoint = 0;

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) { return (await db.query<T>(sql, params)).rows; }
async function as<T = Record<string, unknown>>(userId: string, sql: string, params: unknown[] = []) {
  const sp = `actor_${++savepoint}`;
  await db.exec(`SAVEPOINT ${sp}`);
  try {
    await db.exec("SET LOCAL ROLE authenticated");
    await db.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId })]);
    const result = await rows<T>(sql, params);
    await db.exec("RESET ROLE");
    await db.exec(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (error) {
    await db.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
    await db.exec(`RELEASE SAVEPOINT ${sp}`);
    throw error;
  }
}
function grant(capability: string, scopeKind: Grant["scopeKind"] = "global"): Grant {
  return { permissionId: permissionIds[capability], scopeKind };
}
async function saveRole(key: string, grants: Grant[], id: string | null = null, userId: string = ids.admin) {
  return (await as<{ id: string }>(userId,
    "SELECT rbac_internal.admin_save_role($1::uuid,$2,$3,$4,$5::jsonb,$6) AS id",
    [id, key, key, "Verification role", JSON.stringify(grants), "Access reviewed"]
  ))[0].id;
}
async function assign(userId: string, roleIds: string[], actor: string = ids.admin) {
  await as(actor, "SELECT rbac_internal.admin_replace_user_roles($1::uuid,$2::uuid[],$3)", [userId, roleIds, "Access reviewed"]);
}
async function can(userId: string, resource: string, action: string, scope = "global") {
  return (await as<{ allowed: boolean }>(userId, "SELECT rbac_internal.has_permission($1,$2,$3::public.scope_kind) AS allowed", [resource, action, scope]))[0].allowed;
}

// Fresh in-memory Postgres per suite: no production URLs, schema drops, or data
// persistence. Each individual test uses a rollback transaction over real rows.
describe.skipIf(!hasEngine)("dynamic RBAC — PostgreSQL WASM migration/function/RLS verification", () => {
  beforeAll(async () => {
    const engineModule = require(enginePath) as { PGlite: new () => Engine };
    db = new engineModule.PGlite();
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid
      $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
      $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
        SELECT CASE WHEN position('/' IN name)=0 THEN ARRAY[]::text[] ELSE string_to_array(regexp_replace(name,'/[^/]*$',''),'/') END
      $$;
    `);
    const migrations = path.resolve(process.cwd(), "supabase/migrations");
    for (const file of readdirSync(migrations).filter((file) => /^\d.*\.sql$/.test(file)).sort()) {
      try { await db.exec(readFileSync(path.join(migrations, file), "utf8")); }
      catch (error) { throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
    }
    seededRoles = Object.fromEntries((await rows<{ key: string; id: string }>("SELECT key,id FROM roles")).map((row) => [row.key, row.id]));
    permissionIds = Object.fromEntries((await rows<{ capability: string; id: string }>("SELECT resource || '.' || action AS capability,id FROM permissions")).map((row) => [row.capability, row.id]));
    for (const [name, id] of Object.entries(ids)) {
      await db.query("INSERT INTO auth.users(id) VALUES($1)", [id]);
      await db.query("INSERT INTO user_profiles(id,display_name,status) VALUES($1,$2,$3::public.user_profile_status)", [id, name, name === "inactive" ? "inactive" : "active"]);
    }
    for (const id of [ids.admin, ids.admin2]) await db.query("INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)", [id, seededRoles.administrator]);
    orgId = (await rows<{ id: string }>("INSERT INTO parties(code,name) VALUES('RBAC-ORG','RBAC Organization') RETURNING id"))[0].id;
    await db.query("INSERT INTO user_party_scopes(user_id,party_id,flow_type) VALUES($1,$2,'vmi')", [ids.client, orgId]);
  }, 120_000);
  beforeEach(async () => { await db.exec("BEGIN"); });
  afterEach(async () => { if (db) await db.exec("ROLLBACK"); });
  afterAll(async () => { if (db) await db.close(); });

  it("applies every migration through 0071 and exposes protected functions only internally", async () => {
    const functions = await rows<{ nspname: string; proname: string; prosecdef: boolean }>("SELECT n.nspname,p.proname,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname LIKE 'admin_%' AND n.nspname='rbac_internal'");
    expect(functions.length).toBeGreaterThanOrEqual(7);
    expect(functions.every((f) => f.prosecdef)).toBe(true);
    expect(await rows("SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='admin_save_role' AND n.nspname='public'")).toHaveLength(0);
  });
  it("catalog returns exact supported scope pairs and roles with no grants remain empty", async () => {
    const catalog = await as(ids.admin, "SELECT * FROM rbac_internal.admin_permission_catalog()");
    expect(catalog.some((p) => p.resource === "receiving" && p.action === "view" && p.scope_kind === "global")).toBe(true);
    const id = await saveRole("empty_role", []);
    const listed = (await as<{ data: { id: string; grants: unknown[] }[] }>(ids.admin, "SELECT rbac_internal.admin_list_roles() AS data"))[0].data;
    expect(listed.find((r) => r.id === id)?.grants).toEqual([]);
  });
  it("different custom roles isolate permissions between separate authenticated identities", async () => {
    const receive = await saveRole("receive_role", [grant("receiving.view")]);
    const pick = await saveRole("pick_role", [grant("pick_list.execute")]);
    await assign(ids.receiver, [receive]); await assign(ids.picker, [pick]);
    expect(await can(ids.receiver, "receiving", "view")).toBe(true);
    expect(await can(ids.receiver, "pick_list", "execute")).toBe(false);
    expect(await can(ids.picker, "receiving", "view")).toBe(false);
    expect(await can(ids.picker, "pick_list", "execute")).toBe(true);
  });
  it("multi-role union deduplicates grants; removal preserves another role's contribution", async () => {
    const first = await saveRole("first_role", [grant("receiving.view")]);
    const second = await saveRole("second_role", [grant("receiving.view"), grant("pick_list.execute")]);
    await assign(ids.receiver, [first, second]);
    const access = (await as<{ data: { roleIds: string[]; grants: unknown[] } }>(ids.admin, "SELECT rbac_internal.admin_get_user_access($1) AS data", [ids.receiver]))[0].data;
    expect(access.roleIds).toHaveLength(2); expect(access.grants).toHaveLength(2);
    await assign(ids.receiver, [first]);
    expect(await can(ids.receiver, "receiving", "view")).toBe(true);
    expect(await can(ids.receiver, "pick_list", "execute")).toBe(false);
    expect((await rows("SELECT 1 FROM user_roles WHERE user_id=$1 AND revoked_at IS NOT NULL", [ids.receiver]))).toHaveLength(1);
  });
  it("grant replacement removes stale access and deactivation takes effect immediately", async () => {
    const id = await saveRole("mutable_role", [grant("receiving.view")]);
    await assign(ids.receiver, [id]);
    await saveRole("mutable_role", [grant("pick_list.execute")], id);
    expect(await can(ids.receiver, "receiving", "view")).toBe(false);
    expect(await can(ids.receiver, "pick_list", "execute")).toBe(true);
    await as(ids.admin, "SELECT rbac_internal.admin_deactivate_role($1,$2)", [id, "No longer required"]);
    expect(await can(ids.receiver, "pick_list", "execute")).toBe(false);
    const audit = await rows("SELECT action FROM audit_log WHERE entity_id=$1 ORDER BY created_at", [id]);
    expect(audit.map((a) => a.action)).toEqual(["dynamic_role_saved", "dynamic_role_saved", "dynamic_role_deactivated"]);
  });
  it("denies ordinary authenticated direct writes despite administrative grants", async () => {
    await expect(as(ids.admin, "INSERT INTO roles(key,name,is_system) VALUES('bypass','Bypass',false)")).rejects.toThrow();
    await expect(as(ids.admin, "DELETE FROM role_permissions")).rejects.toThrow();
  });
  it("activation-only accounts cannot create roles or assign themselves administrator", async () => {
    const id = await saveRole("activate_only", [grant("users.activate")]); await assign(ids.receiver, [id]);
    await expect(saveRole("escalated", [grant("users.activate")], null, ids.receiver)).rejects.toThrow(/administrator/i);
    await expect(assign(ids.receiver, [seededRoles.administrator], ids.receiver)).rejects.toThrow(/administrator/i);
  });
  it("custom role with access-management capabilities still cannot delegate protected administration", async () => {
    const id = await saveRole("custom_management", [grant("access_assignments.grant"), grant("access_assignments.revoke")]);
    await assign(ids.receiver, [id]);
    await expect(saveRole("escalated", [], null, ids.receiver)).rejects.toThrow(/administrator/i);
  });
  it("unknown, inactive, wrong-scope, malformed and extra-key grant payloads reject atomically", async () => {
    const receive = grant("receiving.view");
    await expect(saveRole("wrong_scope", [{ ...receive, scopeKind: "assigned_party" }])).rejects.toThrow(/permission|scope/i);
    await expect(saveRole("unknown_permission", [{ permissionId: ids.inactive, scopeKind: "global" }])).rejects.toThrow(/permission|scope/i);
    await db.query("UPDATE permissions SET is_active=false WHERE id=$1", [receive.permissionId]);
    await expect(saveRole("inactive_permission", [receive])).rejects.toThrow(/inactive/i);
    for (const payload of ['[{"permissionId":"bad","scopeKind":"global"}]', '[{"permissionId":null,"scopeKind":"global"}]', JSON.stringify([{ ...grant("pick_list.execute"), extra: true }])]) {
      await expect(as(ids.admin, "SELECT rbac_internal.admin_save_role(NULL,'invalid_role','Invalid','',$1::jsonb,'Reviewed')", [payload])).rejects.toThrow();
    }
    expect(await rows("SELECT 1 FROM roles WHERE key IN ('wrong_scope','unknown_permission','inactive_permission','invalid_role')")).toHaveLength(0);
  });
  it("built-in system roles cannot be edited, renamed through an ID, or deactivated", async () => {
    await expect(saveRole("administrator", [], seededRoles.administrator)).rejects.toThrow(/System-defined/i);
    await expect(as(ids.admin, "SELECT rbac_internal.admin_deactivate_role($1,$2)", [seededRoles.warehouse_staff, "Reviewed"])).rejects.toThrow(/System-defined/i);
    await expect(saveRole("administrator", [])).rejects.toThrow(/exists/i);
  });
  it("last active administrator cannot be suspended or lose their role", async () => {
    await as(ids.admin, "SELECT rbac_internal.admin_set_user_active($1,false,$2)", [ids.admin2, "Deactivate second admin"]);
    await expect(as(ids.admin, "SELECT rbac_internal.admin_set_user_active($1,false,$2)", [ids.admin, "Deactivate last admin"])).rejects.toThrow(/last active administrator/i);
    await expect(assign(ids.admin, [])).rejects.toThrow(/last active administrator/i);
    expect(await can(ids.admin, "access_assignments", "grant")).toBe(true);
    expect((await rows("SELECT status FROM user_profiles WHERE id=$1", [ids.admin]))[0].status).toBe("active");
  });
  it("assignment validity, revocation, role activity and account activity all deny live access", async () => {
    const id = await saveRole("validity_role", [grant("receiving.view")]);
    await assign(ids.receiver, [id]);
    await db.query("UPDATE user_roles SET valid_until=now()-interval '1 second' WHERE user_id=$1", [ids.receiver]);
    expect(await can(ids.receiver, "receiving", "view")).toBe(false);
    await assign(ids.receiver, [id]);
    expect(await can(ids.receiver, "receiving", "view")).toBe(true);
    await db.query("UPDATE user_roles SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [ids.receiver]);
    expect(await can(ids.receiver, "receiving", "view")).toBe(false);
    await assign(ids.inactive, [id]);
    expect(await can(ids.inactive, "receiving", "view")).toBe(false);
  });
  it("scoped roles need Organization scopes and cannot be changed into global access", async () => {
    const id = await saveRole("scoped_role", [grant("pick_list.read", "assigned_party")]);
    await expect(assign(ids.receiver, [id])).rejects.toThrow(/Organization scope/i);
    await assign(ids.client, [id]);
    expect(await can(ids.client, "pick_list", "read", "assigned_party")).toBe(true);
    await expect(saveRole("scoped_role", [grant("pick_list.read")], id)).rejects.toThrow(/warehouse-wide/i);
    expect(await can(ids.client, "pick_list", "read", "global")).toBe(false);
    await expect(assign(ids.client, [seededRoles.warehouse_staff])).rejects.toThrow(/warehouse-wide/i);
  });
  it("scoped permission helper denies other Organizations, other Inventory Models, and Supplies", async () => {
    const id = await saveRole("scoped_reader", [grant("pick_list.read", "assigned_party")]); await assign(ids.client, [id]);
    const result = await as<{ own: boolean; other: boolean; trading: boolean; supplies: boolean }>(ids.client,
      "SELECT rbac_internal.can_access_party_resource('pick_list','read',$1,'vmi') own, rbac_internal.can_access_party_resource('pick_list','read',$2,'vmi') other, rbac_internal.can_access_party_resource('pick_list','read',$1,'trading') trading, rbac_internal.can_access_party_resource('pick_list','read',$1,'supplies') supplies", [orgId, ids.admin2]);
    expect(result[0]).toEqual({ own: true, other: false, trading: false, supplies: false });
  });
  it("audit failure rolls back the role and all replaced grants", async () => {
    const id = await saveRole("audit_role", [grant("receiving.view")]);
    await db.exec("CREATE FUNCTION public.test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$; CREATE TRIGGER test_reject_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION public.test_reject_audit()");
    await expect(saveRole("audit_role", [grant("pick_list.execute")], id)).rejects.toThrow(/test audit failure/i);
    const stored = await rows("SELECT p.resource,p.action FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE role_id=$1", [id]);
    expect(stored).toEqual([{ resource: "receiving", action: "view" }]);
    await expect(saveRole("audit_new_role", [grant("receiving.view")])).rejects.toThrow(/test audit failure/i);
    expect(await rows("SELECT 1 FROM roles WHERE key='audit_new_role'")).toHaveLength(0);
  });
  it("anonymous callers cannot invoke controlled administrative functions or private helpers", async () => {
    await db.exec("SAVEPOINT anonymous; SET LOCAL ROLE anon");
    await expect(db.query("SELECT rbac_internal.admin_list_roles()")).rejects.toThrow();
    await db.exec("ROLLBACK TO SAVEPOINT anonymous; RELEASE SAVEPOINT anonymous");
    expect((await rows<{ allowed: boolean }>("SELECT has_function_privilege('authenticated','rbac_internal.require_access_administrator()','EXECUTE') allowed"))[0].allowed).toBe(false);
  });
  it("actual Organization RLS filters rows for scoped users and allows separately granted global readers", async () => {
    await db.query("INSERT INTO parties(code,name) VALUES('RBAC-OTHER','Other Organization')");
    const scopedRole = await saveRole("org_reader", [grant("pick_list.read", "assigned_party")]);
    const globalRole = await saveRole("global_org_reader", [grant("parties.read")]);
    await assign(ids.client, [scopedRole]); await assign(ids.receiver, [globalRole]);
    expect(await as(ids.client, "SELECT id FROM public.parties ORDER BY id")).toEqual([{ id: orgId }]);
    expect(await as(ids.receiver, "SELECT id FROM public.parties")).toHaveLength(2);
    await db.query("UPDATE user_party_scopes SET revoked_at=now() WHERE user_id=$1", [ids.client]);
    expect(await as(ids.client, "SELECT id FROM public.parties")).toHaveLength(0);
  });
  it("future assignments, inactive permissions and inactive roles never grant access", async () => {
    const id = await saveRole("future_role", [grant("receiving.view")]);
    await assign(ids.receiver, [id]);
    await db.query("UPDATE user_roles SET valid_from=now()+interval '1 hour' WHERE user_id=$1", [ids.receiver]);
    expect(await can(ids.receiver, "receiving", "view")).toBe(false);
    await assign(ids.receiver, [id]);
    await db.query("UPDATE permissions SET is_active=false WHERE id=$1", [permissionIds["receiving.view"]]);
    expect(await can(ids.receiver, "receiving", "view")).toBe(false);
    await db.query("UPDATE permissions SET is_active=true WHERE id=$1", [permissionIds["receiving.view"]]);
    await db.query("UPDATE roles SET is_active=false WHERE id=$1", [id]);
    expect(await can(ids.receiver, "receiving", "view")).toBe(false);
  });
  it("audit rows remain append-only for authenticated administrators", async () => {
    const id = await saveRole("audited_role", []);
    await expect(as(ids.admin, "UPDATE audit_log SET action='rewritten' WHERE entity_id=$1", [id])).rejects.toThrow();
    await expect(as(ids.admin, "DELETE FROM audit_log WHERE entity_id=$1", [id])).rejects.toThrow();
    const audit = await rows("SELECT actor_user_id,before_data,after_data,diff_data FROM audit_log WHERE entity_id=$1", [id]);
    expect(audit).toHaveLength(1); expect(audit[0].actor_user_id).toBe(ids.admin);
    expect(audit[0].after_data).toBeTruthy(); expect(audit[0].diff_data).toEqual({ reason: "Access reviewed" });
  });  it("cancels only pending invitations, retaining history while revoking role and Organization scope", async () => {
    const pending = "77777777-7777-4777-8777-777777777777";
    await db.query("INSERT INTO auth.users(id) VALUES($1)", [pending]);
    await db.query("INSERT INTO user_profiles(id,display_name,status) VALUES($1,'Pending','invited')", [pending]);
    await db.query("INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)", [pending, seededRoles.party_user]);
    await db.query("INSERT INTO user_party_scopes(user_id,party_id,flow_type) VALUES($1,$2,'vmi')", [pending, orgId]);
    await as(ids.admin, "SELECT rbac_internal.admin_cancel_invite($1,$2)", [pending, "Invitation cancelled"]);
    expect((await rows("SELECT status,deactivated_by_user_id FROM user_profiles WHERE id=$1", [pending]))[0]).toEqual({ status: "inactive", deactivated_by_user_id: ids.admin });
    expect(await rows("SELECT id FROM user_roles WHERE user_id=$1 AND revoked_at IS NOT NULL", [pending])).toHaveLength(1);
    expect(await rows("SELECT id FROM user_party_scopes WHERE user_id=$1 AND revoked_at IS NOT NULL", [pending])).toHaveLength(1);
    expect(await rows("SELECT id FROM auth.users WHERE id=$1", [pending])).toHaveLength(1);
    expect(await rows("SELECT id FROM audit_log WHERE entity_id=$1 AND action='invite_cancelled'", [pending])).toHaveLength(1);
    await expect(as(ids.admin, "SELECT rbac_internal.admin_cancel_invite($1,$2)", [pending, "Retry cancellation"])).rejects.toThrow(/pending invitations/i);
    await expect(as(ids.admin, "SELECT rbac_internal.admin_cancel_invite($1,$2)", [ids.admin, "Cancel active account"])).rejects.toThrow(/pending invitations/i);
  });  it("rejects duplicate grants, duplicate assignments and mixed internal/external scope bundles", async () => {
    const receiving = grant("receiving.view");
    await expect(saveRole("duplicate_grants", [receiving, receiving])).rejects.toThrow(/duplicate/i);
    await expect(assign(ids.receiver, [seededRoles.warehouse_staff, seededRoles.warehouse_staff])).rejects.toThrow(/duplicate/i);
    await expect(saveRole("mixed_scope_role", [receiving, grant("pick_list.read", "assigned_party")])).rejects.toThrow(/mix|scope/i);
    expect(await rows("SELECT id FROM roles WHERE key IN ('duplicate_grants','mixed_scope_role')")).toHaveLength(0);
  });});
