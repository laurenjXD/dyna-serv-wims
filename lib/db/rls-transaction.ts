// RLS-enforcing query transaction wrapper.
//
// Traceability: specs/02-rbac-roles/design.md §6.3 ("Drizzle and Supabase RLS
// session propagation") — the five-step contract:
//   1. Validate the Supabase access token on the server.
//   2. Start a database transaction.
//   3. Set transaction-local authenticated role/JWT claims needed by
//      auth.uid().
//   4. Execute the callback through the transaction-bound Drizzle client
//      only.
//   5. Commit or roll back before the connection returns to the pool.
// "No user-scoped query may escape this wrapper, and no session claim may be
// set at connection scope." The commit/rollback step is implemented with
// guaranteed rollback (try/finally) on any callback exception — a callback
// that throws never leaves the transaction open or implicitly committed.
//
// This module is DB-transaction machinery, not authorization *resolution*
// (that remains lib/rbac/session.ts's job). `deps.getAuthenticatedSession`
// reuses that module's session-resolution seam/shape and is never
// reimplemented here.
//
// Resolved ambiguity (flagged in
// lib/db/__tests__/rls-transaction.test.ts's header): whether the Postgres
// `role` GUC must also switch to `authenticated` for §7.2's RLS
// helper-function EXECUTE grants to apply. Yes — design.md §6.3's own
// "PostgREST/RPC exposure" subsection states this directly: "because §6.3's
// transaction wrapper sets transaction-local claims so RLS evaluates the
// caller as the `authenticated` Postgres role, RLS policy evaluation runs
// under the *same* `authenticated` role that Supabase's `/rest/v1/rpc/*`
// routing would use for a direct client call." The helpers in §7.2
// (`current_user_is_active`, `has_permission`, `has_party_scope`,
// `can_access_party_resource`, `party_has_any_role`) grant `EXECUTE` to
// `authenticated` and explicitly `REVOKE ... FROM PUBLIC` — a session that
// never switches its `role` GUC away from the pool's underlying connection
// role would not carry that grant, and RLS policies invoking those helpers
// would fail closed for a legitimate caller. Setting both `role` and
// `request.jwt.claims` transaction-locally is therefore required, not just
// the most defensible reading of "role/JWT claims" (§6.3 step 3) — it is
// the specific mechanism §6.3's own later section says the wrapper relies
// on.
//
// The `set_config(setting, value, is_local)` mechanism (bound parameters,
// not `SET LOCAL` string interpolation) matches design.md §13's real-Postgres
// verification note (pass 1): "`SET LOCAL` (`is_local=true`)
// transaction-local claim propagation confirmed: value is present inside the
// transaction, reverts to prior session value after commit."

import type { AuthSession } from "../rbac/session";

export type RlsTransactionResult<T> =
  | { kind: "unauthenticated" }
  | { kind: "ok"; value: T };

// A single claim-setting statement, expressed as a bound-parameter SQL call
// rather than string-interpolated SQL text — matches the shape the
// tx-bound client's `.execute()` accepts.
export interface RlsClaimStatement {
  sql: string;
  params: unknown[];
}

// The transaction-bound client is the ONLY place any SQL (claim-setting or
// callback queries) can run. No pool-level or connection-level execute
// method exists to call by mistake — see RlsConnection/RlsPool below.
//
// `db` is an additive, optional field (deliberately typed `unknown` here,
// not `PostgresJsDatabase<...>`): this module stays driver-agnostic per its
// own header comment, so it cannot import drizzle-orm/postgres-js or the
// app's schema module without coupling the wrapper to one specific driver.
// The concrete real implementation (lib/db/rls-pool.ts) always populates
// this with a real `drizzle(txSql, { schema })` instance bound to the
// transaction-scoped connection; callers narrow it to the app's actual
// `PostgresJsDatabase<typeof schema>` type at the call site. Optional (not
// required) so existing hand-rolled mocks that only implement `execute`
// (e.g. lib/db/__tests__/rls-transaction.test.ts) remain valid without
// modification — a mock pool that never populates `db` continues to
// typecheck and continues to exercise every existing execute()-only
// assertion unchanged.
export interface TransactionBoundClient {
  execute(statement: unknown): Promise<unknown>;
  db?: unknown;
}

export interface RlsConnection {
  // Typed `Promise<unknown>` rather than `Promise<TransactionBoundClient>`
  // at this boundary deliberately: real driver adapters (e.g. the
  // integration test's postgres.js `sql.begin()` bridge) hand back a
  // begin()-resolved value through their own already-erased-to-`unknown`
  // promise chain before it reaches this contract. `withRlsTransaction`
  // itself is the single place that treats the resolved value as a
  // `TransactionBoundClient` (its callback parameter is typed precisely),
  // so callers still get full type safety at the one place that matters.
  begin(): Promise<unknown>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void | Promise<void>;
}

export interface RlsPool {
  connect(): Promise<RlsConnection>;
}

export interface RlsTransactionDeps {
  getAuthenticatedSession(): Promise<AuthSession | null>;
  pool: RlsPool;
}

function hasUsableUserId(session: AuthSession | null): session is AuthSession {
  return (
    session !== null &&
    typeof session === "object" &&
    typeof session.userId === "string" &&
    session.userId.length > 0
  );
}

// Pure helper: builds the transaction-local claim statements design.md §6.3
// step 3 requires. Never embeds the raw userId (or any other value) directly
// into SQL text -- every value travels as a bound parameter.
export function buildRlsClaimStatements(userId: string): RlsClaimStatement[] {
  const claims = JSON.stringify({ sub: userId });
  return [
    {
      sql: "select set_config('role', $1, true)",
      params: ["authenticated"],
    },
    {
      sql: "select set_config('request.jwt.claims', $1, true)",
      params: [claims],
    },
  ];
}

export async function withRlsTransaction<T>(
  deps: RlsTransactionDeps,
  callback: (tx: TransactionBoundClient, session: AuthSession) => Promise<T>,
): Promise<RlsTransactionResult<T>> {
  let session: AuthSession | null;
  try {
    session = await deps.getAuthenticatedSession();
  } catch {
    // A thrown session-validation error is treated as unauthenticated,
    // never an unhandled exception -- fail closed before any DB access.
    return { kind: "unauthenticated" };
  }

  if (!hasUsableUserId(session)) {
    return { kind: "unauthenticated" };
  }

  // Fail closed before touching the database at all (AC-1): pool.connect()
  // is never called for an unauthenticated/invalid session.
  const conn = await deps.pool.connect();
  try {
    const tx = (await conn.begin()) as TransactionBoundClient;
    try {
      // Claim statements are awaited to completion before the callback is
      // ever invoked: this guarantees `set_config('role', ...)` and
      // `set_config('request.jwt.claims', ...)` are confirmed set before any
      // callback query reaches the connection, without relying on an
      // unverified call-order-equals-wire-order assumption in the
      // tx-bound client. A claim-setting rejection is caught by this
      // `try`'s own `catch` below (guaranteed rollback), so it is never an
      // unhandled rejection.
      const claimStatements = buildRlsClaimStatements(session.userId);
      await Promise.all(
        claimStatements.map((statement) => tx.execute(statement)),
      );

      const value = await callback(tx, session);

      await conn.commit();
      return { kind: "ok", value };
    } catch (error) {
      // Guaranteed rollback on any callback (or claim-setting) exception,
      // whether synchronous or an asynchronously-rejected promise -- the
      // original error/stack is re-thrown as-is, never wrapped.
      await conn.rollback();
      throw error;
    }
  } finally {
    // The connection is always released back to the pool -- success,
    // callback error, or claim-setting error.
    await conn.release();
  }
}
