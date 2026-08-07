import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Connection string only, never hardcoded — see .env.example.
// Supabase Postgres connection (session/transaction pooler URL in production,
// direct connection acceptable for local/dev). Required at runtime; not
// validated at import time so `next build` can succeed without a live DB.
const connectionString = process.env.DATABASE_URL ?? "";

// `prepare: false` is required for Supabase's connection pooler (pgbouncer,
// transaction mode) — see Supabase + Drizzle/postgres-js integration docs.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
