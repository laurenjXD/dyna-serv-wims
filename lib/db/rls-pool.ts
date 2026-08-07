// Reusable runtime RlsPool adapter over postgres.js, for real use with
// withRlsTransaction (see ./rls-transaction.ts). Promoted out of
// lib/db/__tests__/rls-transaction.integration.test.ts's local
// `buildPgPool` helper (proven correct there against real Postgres) so
// application code has a ready-to-use adapter instead of re-implementing
// the sql.begin()-to-explicit-begin/commit/rollback/release bridge itself.
//
// Traceability: specs/02-rbac-roles/design.md §6.3 — this is the concrete
// "database transaction" / "transaction-bound Drizzle client" mechanism
// the wrapper's five-step contract requires; the wrapper itself
// (rls-transaction.ts) stays driver-agnostic via the RlsPool/RlsConnection
// interfaces, this module is the one real implementation of them.
//
// Usage:
//   import { withRlsTransaction } from "./rls-transaction";
//   import { rlsPool } from "./rls-pool";
//   import { getAuthenticatedSession } from "../rbac/session";
//
//   await withRlsTransaction({ getAuthenticatedSession, pool: rlsPool }, async (tx) => {
//     const rows = await tx.execute(sql`select * from lots where ...`);
//     ...
//   });

import postgres, { type Sql } from "postgres";
import type { RlsConnection, RlsPool } from "./rls-transaction";

const connectionString = process.env.DATABASE_URL ?? "";

// `prepare: false` matches lib/db/client.ts's existing rationale: required
// for Supabase's connection pooler (pgbouncer, transaction mode).
const sql: Sql = postgres(connectionString, { prepare: false });

function buildConnection(): RlsConnection {
  let resolveBegun: (tx: unknown) => void;
  let settleOuter: (() => void) | undefined;
  let outcome: "commit" | "rollback" | undefined;

  const begunPromise = new Promise<unknown>((resolve) => {
    resolveBegun = resolve;
  });

  const txFinished = new Promise<void>((resolve) => {
    settleOuter = resolve;
  });

  // postgres.js's sql.begin() manages BEGIN/COMMIT/ROLLBACK around the
  // callback it's given. This bridges that shape to the explicit
  // begin()/commit()/rollback()/release() contract RlsConnection requires:
  // resolve `begunPromise` with a transaction-bound client once inside
  // sql.begin()'s own callback, then block that callback until this
  // adapter's own commit()/rollback() decides the outcome.
  const txLifecyclePromise = sql
    .begin(async (txSql) => {
      const txClient = {
        // Every query goes through the { sql, params } shape (matching
        // RlsClaimStatement) and is dispatched via `txSql.unsafe`, so it
        // always runs on the transaction-bound connection, never the outer
        // pool's connection. A postgres.js tagged-template value built from
        // the *outer* `sql` (e.g. `sql\`...\``) executes immediately against
        // that outer connection the moment it's evaluated -- it cannot be
        // captured and re-dispatched on `txSql` afterward, so that shape is
        // deliberately not supported here; callers must build `{ sql, params }`
        // themselves (or use `txSql` directly within their own callback if
        // they need postgres.js's tagged-template ergonomics inside a
        // specific driver-aware call site).
        execute: async (query: unknown) => {
          const q = query as { sql: string; params?: unknown[] };
          return txSql.unsafe(q.sql, (q.params ?? []) as never);
        },
      };
      resolveBegun(txClient);
      await txFinished;
      if (outcome === "rollback") {
        throw new Error("__rls_pool_forced_rollback__");
      }
      return undefined;
    })
    .catch((err: unknown) => {
      if (
        err instanceof Error &&
        err.message === "__rls_pool_forced_rollback__"
      ) {
        return undefined; // expected rollback signal, not a real failure
      }
      throw err;
    });

  return {
    begin: async () => begunPromise,
    commit: async () => {
      outcome = "commit";
      settleOuter!();
      await txLifecyclePromise;
    },
    rollback: async () => {
      outcome = "rollback";
      settleOuter!();
      await txLifecyclePromise;
    },
    release: () => {
      // postgres.js manages pool release internally once sql.begin()'s
      // callback settles; nothing further to do here.
    },
  };
}

export const rlsPool: RlsPool = {
  async connect() {
    return buildConnection();
  },
};
