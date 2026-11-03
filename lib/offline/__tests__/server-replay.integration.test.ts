// Uses ONLY the named disposable local database; never DATABASE_URL.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql as querySql } from "drizzle-orm";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { replayScan, scanCommandFingerprint } from "../server-replay";
import { withRlsTransaction, type RlsTransactionDeps } from "@/lib/db/rls-transaction";

const url = process.env.TEST_DATABASE_URL ?? "";
const safe = !!url && new URL(url).hostname === "127.0.0.1" && new URL(url).pathname === "/wims_bam_test";
const actor = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
let db: Sql;

function deps(userId = actor): RlsTransactionDeps {
  return {
    getAuthenticatedSession: async () => ({ userId }),
    pool: { connect: async () => {
      const connection = await db.reserve();
      return {
        begin: async () => {
          await connection.unsafe("BEGIN");
          Object.assign(connection, { options: db.options });
          const database = drizzle(connection as unknown as Sql);
          return { db: database, execute: async (statement: unknown) => {
            const query = statement as { sql: string; params?: unknown[] };
            return connection.unsafe(query.sql, (query.params ?? []) as never);
          } };
        },
        commit: async () => { await connection.unsafe("COMMIT"); },
        rollback: async () => { await connection.unsafe("ROLLBACK"); },
        release: () => connection.release(),
      };
    } },
  };
}
const command = { actorId: actor, operationId: "offline-op", actionType: "receiving_scan_observation",
  fingerprint: scanCommandFingerprint("receiving_scan_observation", "wrr", "line", "barcode") };
async function scan(borrowed: RlsTransactionDeps) {
  const result = await withRlsTransaction(borrowed, async (tx) => {
    const database = tx.db as PostgresJsDatabase;
    const rows = await database.execute(querySql`UPDATE public.offline_replay_probe SET qty=qty+1 WHERE actor=auth.uid() RETURNING qty`);
    return { ok: true as const, scannedQty: rows[0].qty };
  });
  if (result.kind !== "ok") throw new Error("unauthenticated");
  return result.value;
}

describe.skipIf(!safe)("offline replay — disposable PostgreSQL 16", () => {
  beforeAll(async () => {
    db = postgres(url, { max: 6, onnotice: () => {} });
    // The explicit host+database guard above protects all non-test databases.
    await db.unsafe(`DROP SCHEMA IF EXISTS offline_internal CASCADE; DROP SCHEMA IF EXISTS rbac_internal CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE;
      CREATE SCHEMA public; CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA IF NOT EXISTS extensions;
      DO $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
      END $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,anon;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
        SELECT CASE WHEN position('/' IN name)=0 THEN ARRAY[]::text[] ELSE string_to_array(regexp_replace(name,'/[^/]*$',''),'/') END $$;
    `);
    const folder = path.resolve(process.cwd(), "supabase/migrations");
    const migrationConnection = await db.reserve();
    try {
      for (const file of readdirSync(folder).filter((name) => /^\d.*\.sql$/.test(name)).sort()) {
        try { await migrationConnection.unsafe(readFileSync(path.join(folder, file), "utf8")); }
        catch (error) { throw new Error(`Migration ${file} failed`, { cause: error }); }
      }
    } finally { migrationConnection.release(); }
    await db.unsafe(`CREATE TABLE public.offline_replay_probe(actor uuid PRIMARY KEY, qty integer NOT NULL DEFAULT 0);
      ALTER TABLE public.offline_replay_probe ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_probe ON public.offline_replay_probe USING (actor=auth.uid()) WITH CHECK (actor=auth.uid());
      GRANT SELECT,UPDATE ON public.offline_replay_probe TO authenticated;`);
    for (const userId of [actor, other]) {
      await db`INSERT INTO auth.users(id) VALUES(${userId})`;
      await db`INSERT INTO user_profiles(id,display_name,status) VALUES(${userId},'Replay tester','active')`;
      await db`INSERT INTO user_roles(user_id,role_id) SELECT ${userId},id FROM roles WHERE key='warehouse_staff'`;
      await db`INSERT INTO public.offline_replay_probe(actor) VALUES(${userId})`;
    }
  }, 120_000);
  beforeEach(async () => {
    await db.unsafe("TRUNCATE offline_internal.scan_replay_receipts; UPDATE public.offline_replay_probe SET qty=0; UPDATE user_profiles SET status='active';");
  });
  afterAll(async () => { if (db) await db.end(); });

  it("applies once and returns the exact durable result on a lost-response retry", async () => {
    const first = await replayScan(deps(), command, scan);
    const retry = await replayScan(deps(), command, scan);
    expect(first).toEqual({ outcome: "applied", detail: { ok: true, scannedQty: 1 } });
    expect(retry).toEqual({ outcome: "duplicate", detail: first.detail });
    expect((await db`SELECT qty FROM public.offline_replay_probe WHERE actor=${actor}`)[0].qty).toBe(1);
  });
  it("serializes concurrent retries without double-applying", async () => {
    const results = await Promise.all([replayScan(deps(), command, scan), replayScan(deps(), command, scan)]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["applied", "duplicate"]);
    expect((await db`SELECT qty FROM public.offline_replay_probe WHERE actor=${actor}`)[0].qty).toBe(1);
  });
  it("rejects a changed command fingerprint and preserves the original result", async () => {
    await replayScan(deps(), command, scan);
    await expect(replayScan(deps(), { ...command, fingerprint: "b".repeat(64) }, scan)).rejects.toMatchObject({ code: "22023" });
    expect((await db`SELECT qty FROM public.offline_replay_probe WHERE actor=${actor}`)[0].qty).toBe(1);
  });
  it("does not confuse independent operations or actors", async () => {
    await replayScan(deps(), command, scan);
    await replayScan(deps(), { ...command, operationId: "another-op" }, scan);
    await replayScan(deps(other), { ...command, actorId: other }, scan);
    expect((await db`SELECT qty FROM public.offline_replay_probe WHERE actor=${actor}`)[0].qty).toBe(2);
    expect((await db`SELECT qty FROM public.offline_replay_probe WHERE actor=${other}`)[0].qty).toBe(1);
  });
  it("rolls back the scan when serializing/persisting its receipt fails", async () => {
    await expect(replayScan(deps(), command, async (borrowed) => ({ ...await scan(borrowed), invalid: 1n }))).rejects.toThrow();
    expect((await db`SELECT qty FROM public.offline_replay_probe WHERE actor=${actor}`)[0].qty).toBe(0);
    expect(await db`SELECT * FROM offline_internal.scan_replay_receipts`).toHaveLength(0);
    expect((await replayScan(deps(), command, scan)).outcome).toBe("applied");
  });
  it("rechecks active capability before returning even an existing receipt", async () => {
    await replayScan(deps(), command, scan);
    await db`UPDATE user_profiles SET status='inactive' WHERE id=${actor}`;
    await expect(replayScan(deps(), command, scan)).rejects.toMatchObject({ code: "42501" });
  });
  it("denies browser-role direct receipt table reads/writes and anonymous functions", async () => {
    const result = await db`SELECT has_table_privilege('authenticated','offline_internal.scan_replay_receipts','INSERT') AS insert,
      has_table_privilege('authenticated','offline_internal.scan_replay_receipts','SELECT') AS read,
      has_function_privilege('anon','offline_internal.read_scan_receipt(text,text,text)','EXECUTE') AS anon`;
    expect(result[0]).toEqual({ insert: false, read: false, anon: false });
    const connection = await db.reserve();
    try {
      await connection.unsafe("BEGIN; SET LOCAL ROLE authenticated");
      await expect(connection.unsafe("SELECT * FROM offline_internal.scan_replay_receipts")).rejects.toMatchObject({ code: "42501" });
    } finally { await connection.unsafe("ROLLBACK"); connection.release(); }
  });
});
