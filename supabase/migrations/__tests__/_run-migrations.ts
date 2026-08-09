// Shared real-Postgres migration-chain runner for supabase/migrations
// integration tests.
//
// Per specs/00-steering/testing.md ("Before tasks.md sign-off — real-Postgres
// integration tests ... spin up actual Postgres, run the real migrations in
// order, exercise the actual functions with real data") and the
// db-migration-verifier agent's own documented process ("Run every migration
// file in supabase/migrations/ in numeric order, stopping on first error").
//
// This module is test-harness infrastructure, not a test file itself (no
// `describe`/`it`), so it is not picked up by the `**/*.integration.test.ts`
// glob directly — it is imported by files that are.
//
// Supabase-managed prerequisites this project's migrations assume but a
// vanilla Postgres instance does not provide:
//   - the `authenticated` role (Supabase Auth-managed; migrations 0008+
//     GRANT to it but never CREATE it)
//   - the `auth` schema with a `users` table (0018 REFERENCES auth.users(id))
//   - `auth.uid()` (used inside RLS policy bodies from 0008 onward)
// bootstrapPrerequisites() creates minimal stand-ins for these so the real
// migration SQL can run unmodified. This mirrors db-migration-verifier's own
// "create a fresh test database and role" step, just made reusable here.
import type { Sql } from "postgres";
import { readdirSync, readFileSync } from "fs";
import path from "path";

const MIGRATIONS_DIR = path.resolve(__dirname, "..");

export function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // filenames are zero-padded-numeric-prefixed, so lexical sort == numeric order
}

export async function bootstrapPrerequisites(sql: Sql): Promise<void> {
  // `authenticated` — Supabase Auth's fixed role name; migrations only GRANT
  // to it, they never create it, because Supabase provisions it already.
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
      END IF;
    END
    $$;
  `);

  // Minimal `auth` schema stand-in: just enough surface (auth.users table,
  // auth.uid() function) for FK targets and RLS policy bodies to parse and
  // execute against a vanilla Postgres instance. auth.uid() intentionally
  // returns NULL (no session claim machinery here) -- this test batch is
  // schema/constraint structure only, not RLS behavior.
  await sql.unsafe(`
    CREATE SCHEMA IF NOT EXISTS auth;

    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid()
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT NULL::uuid $$;
  `);
}

/**
 * Runs every migration file currently present in supabase/migrations, in
 * numeric order, via a real connection -- stopping on first SQL error
 * (mirrors db-migration-verifier's `-v ON_ERROR_STOP=1` precedent).
 */
export async function runAllExistingMigrations(sql: Sql): Promise<string[]> {
  const files = listMigrationFiles();
  const applied: string[] = [];

  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const contents = readFileSync(fullPath, "utf-8");
    // Drizzle's `--> statement-breakpoint` marker is a plain SQL comment;
    // postgres.js's `unsafe()` already executes a multi-statement string
    // over the simple query protocol, so no splitting is needed.
    await sql.unsafe(contents);
    applied.push(file);
  }

  return applied;
}

/** Reads a specific migration file's SQL by exact filename (no directory scan). */
export function readMigrationFile(name: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, name), "utf-8");
}
