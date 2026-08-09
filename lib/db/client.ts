import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Connection string only, never hardcoded — see .env.example.
// Supabase Postgres connection (session/transaction pooler URL in production,
// direct connection acceptable for local/dev). Required at runtime.
//
// Lazy by construction, not just by intent: `postgres()` parses its
// connection-string argument immediately and throws a synchronous
// `TypeError: Invalid URL` on an empty/missing one — it does NOT defer that
// validation to first query the way a comment here once claimed. Next.js's
// "Collecting page data" build step imports every route module server-side
// (without executing component bodies), so any route importing `db` at
// module scope broke `next build` outright whenever `DATABASE_URL` wasn't
// set (2026-08-08, caught by a real Vercel build against this repo's
// then-unconfigured project). `vitest.setup.ts`'s global `vi.mock` of this
// module already worked around the identical problem for unit tests, but
// nothing covered a real `next build`/Vercel deploy.
//
// Fixed by deferring the real `postgres()`/`drizzle()` construction until
// the first actual property access on `db`, via a Proxy — every existing
// `import { db } from "@/lib/db/client"` call site (32+ files) keeps working
// unchanged; only the timing of the real connection attempt moves from
// "module import" to "first query," which only happens inside actual
// request handling, never during static page-data collection.
type Db = PostgresJsDatabase<typeof schema>;

let realDb: Db | null = null;

function getDb(): Db {
  if (!realDb) {
    const connectionString = process.env.DATABASE_URL ?? "";
    // `prepare: false` is required for Supabase's connection pooler
    // (pgbouncer, transaction mode) — see Supabase + Drizzle/postgres-js
    // integration docs.
    const client = postgres(connectionString, { prepare: false });
    realDb = drizzle(client, { schema });
  }
  return realDb;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
