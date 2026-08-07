// RED-step unit tests for lib/db/rls-transaction.ts (does not exist yet).
//
// Traceability: specs/02-rbac-roles/design.md §6.3 ("Drizzle and Supabase RLS
// session propagation") — the five-step contract quoted verbatim:
//   1. Validates the Supabase access token on the server.
//   2. Starts a database transaction.
//   3. Sets transaction-local authenticated role/JWT claims needed by
//      auth.uid().
//   4. Executes the callback through the transaction-bound Drizzle client
//      only.
//   5. Commits or rolls back before the connection returns to the pool.
// "No user-scoped query may escape this wrapper, and no session claim may be
// set at connection scope." "The wrapper's commit/rollback step MUST be
// implemented with guaranteed rollback on any callback exception (e.g.
// try/finally around the callback, rolling back unless the callback
// completed and commit was explicitly reached) — a callback that throws must
// never leave the transaction open or implicitly committed."
//
// Backing acceptance criteria (specs/02-rbac-roles/requirements.md §7):
// AC-1 (no valid session -> denied, before any DB access), AC-5 (a
// client-supplied identifier / override channel never expands access --
// proven structurally here by the wrapper's fixed 2-argument signature and
// exports), FR-6.4/FR-6.5 ("RLS scope checks SHALL resolve active
// assignments from auth.uid() ... Interactive user requests SHALL execute
// with the user session so RLS evaluates the caller"), and the
// non-functional requirement "Authorization SHALL fail closed when session,
// assignment, scope, or resource ownership cannot be resolved."
//
// This module is DB-transaction machinery, not authorization *resolution*
// (that is lib/rbac/session.ts's job, already implemented and re-used here
// only for its `getAuthenticatedSession(): Promise<AuthSession | null>`
// dependency-injection seam and `AuthSession` shape -- step 1 of the
// contract above). This file does not re-test session resolution itself.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/db/rls-transaction.ts (for
// database-builder / backend-builder):
//
// Design choices made by this RED step, since design.md §6.3 specifies the
// five-step contract in prose without fixing an exact TypeScript signature:
//
//   1. Claim-setting mechanism: `set_config('request.jwt.claims', <json>,
//      true)` and `set_config('role', 'authenticated', true)`. Supabase's
//      `auth.uid()` resolves from the `request.jwt.claims` GUC (falling back
//      to the deprecated `request.jwt.claim.sub`); the standard,
//      parameter-bindable, transaction-local-safe way to set a GUC from
//      application code is `set_config(setting, value, is_local)` with
//      `is_local = true` -- functionally identical to `SET LOCAL
//      "<setting>" = '<value>'` but usable as an ordinary parameterized
//      statement rather than raw SQL-text interpolation of a value. This
//      matches this design doc's own real-Postgres verification note (§13,
//      "pass 1"): "`SET LOCAL` (`is_local=true`) transaction-local claim
//      propagation confirmed: value is present inside the transaction,
//      reverts to prior session value after commit." `is_local=true` is
//      literally `set_config`'s third argument name, so this is the
//      documented mechanism the design doc's own verification pass already
//      exercised, not a fresh guess. FLAGGED AMBIGUITY: design.md does not
//      spell out the exact GUC name/JSON shape (`request.jwt.claims` vs
//      `request.jwt.claim.sub`) or whether the Postgres `role` GUC must also
//      be switched to `authenticated` for the RBAC helper EXECUTE grants
//      (§7.2) to apply to the connecting session -- this test file's
//      `buildRlsClaimStatements()` sets both, as the most defensible
//      interpretation of "transaction-local authenticated role/JWT claims"
//      (design.md's own phrase, §6.3 step 3, listing "role" and "JWT claims"
//      together). A reviewer should confirm this against the exact Supabase
//      connection-role setup chosen in 04-services-and-infrastructure.
//   2. The wrapper depends on an injected `RlsPool`, whose ONLY method is
//      `connect(): Promise<RlsConnection>`. `RlsConnection` exposes exactly
//      `begin`, `commit`, `rollback`, `release` -- no `.query()`/`.execute()`
//      of its own. `RlsConnection.begin()` returns a `TransactionBoundClient`
//      -- a structurally distinct type whose `.execute()` is the ONLY place
//      any SQL (claim-setting or callback queries) can run. This is what
//      makes "no user-scoped query may escape this wrapper" and "no session
//      claim may be set at connection scope" structural rather than
//      convention: there is no pool-level or connection-level execute method
//      to call by mistake.
//   3. `withRlsTransaction(deps, callback)` takes exactly two arguments:
//      `deps: RlsTransactionDeps` (`{ getAuthenticatedSession, pool }`) and
//      `callback: (tx: TransactionBoundClient, session: AuthSession) =>
//      Promise<T>`. There is no third "scope override" or "role override"
//      parameter of any kind -- this is what makes AC-5 structurally true
//      for this module, the same pattern already used by
//      lib/rbac/guard.ts's `requirePermission`.
//   4. Return shape: `Promise<RlsTransactionResult<T>>` where
//      `RlsTransactionResult<T> = { kind: "unauthenticated" } | { kind: "ok";
//      value: T }`. Unauthenticated is a typed result (matching
//      session.ts's `AuthorizationResolution` convention) because it is an
//      expected, safely-distinguishable control-flow outcome reached BEFORE
//      any transaction is opened. A callback exception is different: it is
//      re-thrown as-is (not converted into a typed `{ kind: "error" }`
//      result), so that callers get the original error/stack for their own
//      try/catch and observability (Sentry etc.) rather than losing type
//      information behind a generic error wrapper -- documented here as a
//      deliberate choice, not an oversight.
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../../rbac/session";

// Minimal local mock shapes matching the expected contract above. These are
// intentionally typed by hand (not imported) since the module under test
// does not exist yet -- that absence is exactly what makes this RED.
interface MockClaimCall {
  sql: string;
  params: unknown[];
}

function createMockTx() {
  const calls: MockClaimCall[] = [];
  return {
    calls,
    execute: vi.fn(async (statement: MockClaimCall) => {
      calls.push(statement);
      return undefined;
    }),
  };
}

function createMockPool(tx: ReturnType<typeof createMockTx>) {
  const callOrder: string[] = [];
  const conn = {
    begin: vi.fn(async () => {
      callOrder.push("begin");
      return tx;
    }),
    commit: vi.fn(async () => {
      callOrder.push("commit");
    }),
    rollback: vi.fn(async () => {
      callOrder.push("rollback");
    }),
    release: vi.fn(() => {
      callOrder.push("release");
    }),
  };
  const pool = {
    connect: vi.fn(async () => {
      callOrder.push("connect");
      return conn;
    }),
  };
  return { pool, conn, callOrder };
}

const okSession: AuthSession = { userId: "11111111-1111-1111-1111-111111111111" };

describe("rls-transaction.ts — buildRlsClaimStatements (design.md §6.3 step 3)", () => {
  it("produces a set_config('role', 'authenticated', true) statement and a set_config('request.jwt.claims', <json with sub>, true) statement", async () => {
    const { buildRlsClaimStatements } = await import("../rls-transaction");
    const statements = buildRlsClaimStatements(okSession.userId);

    expect(statements.length).toBeGreaterThanOrEqual(2);

    const roleStatement = (statements as MockClaimCall[]).find(
      (s: MockClaimCall) => /set_config/i.test(s.sql) && /'role'/.test(s.sql),
    );
    expect(roleStatement).toBeDefined();
    expect(roleStatement!.sql).toMatch(/true/); // is_local = true, never false/omitted
    expect(roleStatement!.params.join(" ")).not.toMatch(/false/);

    const claimsStatement = (statements as MockClaimCall[]).find(
      (s: MockClaimCall) => /set_config/i.test(s.sql) && /request\.jwt\.claims/.test(s.sql),
    );
    expect(claimsStatement).toBeDefined();
    expect(claimsStatement!.sql).toMatch(/true\s*\)/); // third arg is_local literal true
    const jsonParam = claimsStatement!.params.find(
      (p: unknown) => typeof p === "string" && p.includes(okSession.userId),
    );
    expect(jsonParam).toBeDefined();
    const parsed = JSON.parse(jsonParam as string);
    expect(parsed.sub).toBe(okSession.userId);
  });

  it("never embeds the raw userId directly into the SQL text (must be a bound parameter, not string interpolation)", async () => {
    const { buildRlsClaimStatements } = await import("../rls-transaction");
    const statements = buildRlsClaimStatements(okSession.userId);
    for (const statement of statements) {
      expect(statement.sql).not.toContain(okSession.userId);
    }
  });
});

describe("rls-transaction.ts — withRlsTransaction happy path (design.md §6.3 steps 1-5, FR-6.5)", () => {
  it("validates the session, starts a transaction, sets claims on the tx client, runs the callback with the tx client, and commits", async () => {
    const { withRlsTransaction } = await import("../rls-transaction");

    const tx = createMockTx();
    const { pool, conn, callOrder } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => okSession);

    const callback = vi.fn(async (givenTx: unknown, givenSession: AuthSession) => {
      callOrder.push("callback");
      expect(givenTx).toBe(tx); // callback receives the SAME tx-bound client
      expect(givenSession).toEqual(okSession);
      return "callback-result";
    });

    const result = await withRlsTransaction({ getAuthenticatedSession, pool }, callback);

    expect(result).toEqual({ kind: "ok", value: "callback-result" });
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(conn.begin).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalled(); // claim statements ran
    expect(callback).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);

    // Ordering: connect -> begin -> claims set (on tx, captured via tx.calls
    // being non-empty before callback) -> callback -> commit -> release.
    expect(tx.calls.length).toBeGreaterThan(0);
    const connectIdx = callOrder.indexOf("connect");
    const beginIdx = callOrder.indexOf("begin");
    const callbackIdx = callOrder.indexOf("callback");
    const commitIdx = callOrder.indexOf("commit");
    const releaseIdx = callOrder.indexOf("release");
    expect(connectIdx).toBeLessThan(beginIdx);
    expect(beginIdx).toBeLessThan(callbackIdx);
    expect(callbackIdx).toBeLessThan(commitIdx);
    expect(commitIdx).toBeLessThan(releaseIdx);
  });
});

describe("rls-transaction.ts — no connection-scope claim leakage (design.md §6.3 'no session claim may be set at connection scope')", () => {
  it("only ever calls .execute() on the tx-bound client, never on the pool or the raw connection object", async () => {
    const { withRlsTransaction } = await import("../rls-transaction");

    const tx = createMockTx();
    const { pool, conn } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => okSession);
    const callback = vi.fn(async () => "ok");

    await withRlsTransaction({ getAuthenticatedSession, pool }, callback);

    // The mock pool/conn objects structurally have no execute/query method at
    // all -- there is nothing to call. This assertion documents that the
    // wrapper never attempts to reach for one via bracket-access/`any`.
    expect((pool as Record<string, unknown>).execute).toBeUndefined();
    expect((pool as Record<string, unknown>).query).toBeUndefined();
    expect((conn as Record<string, unknown>).execute).toBeUndefined();
    expect((conn as Record<string, unknown>).query).toBeUndefined();

    // And the claim statements that DID run are only observable via the
    // tx-bound client's own recorded calls.
    expect(tx.calls.length).toBeGreaterThan(0);
  });
});

describe("rls-transaction.ts — no escape hatch (structural, same pattern as guard.test.ts)", () => {
  it("exports only withRlsTransaction and the pure claim-statement builder — no raw-pool passthrough function", async () => {
    const mod = await import("../rls-transaction");
    const exportedKeys = Object.keys(mod).sort();
    expect(exportedKeys).toEqual(["buildRlsClaimStatements", "withRlsTransaction"].sort());
  });

  it("withRlsTransaction accepts exactly two parameters (deps, callback) — no scope/role override channel", async () => {
    const { withRlsTransaction } = await import("../rls-transaction");
    expect(withRlsTransaction.length).toBe(2);
  });
});

describe("rls-transaction.ts — unauthenticated/invalid session fails closed before touching the database (AC-1)", () => {
  it("returns { kind: 'unauthenticated' } and never calls pool.connect when getAuthenticatedSession resolves null", async () => {
    const { withRlsTransaction } = await import("../rls-transaction");

    const tx = createMockTx();
    const { pool } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => null);
    const callback = vi.fn(async () => "should-never-run");

    const result = await withRlsTransaction({ getAuthenticatedSession, pool }, callback);

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(pool.connect).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it("returns { kind: 'unauthenticated' } for a session with an empty/missing userId", async () => {
    const { withRlsTransaction } = await import("../rls-transaction");

    const tx = createMockTx();
    const { pool } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => ({ userId: "" }) as AuthSession);
    const callback = vi.fn(async () => "should-never-run");

    const result = await withRlsTransaction({ getAuthenticatedSession, pool }, callback);

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(pool.connect).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it("treats a thrown session-validation error the same as unauthenticated, never as an unhandled exception", async () => {
    const { withRlsTransaction } = await import("../rls-transaction");

    const tx = createMockTx();
    const { pool } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => {
      throw new Error("invalid token signature");
    });
    const callback = vi.fn(async () => "should-never-run");

    const result = await withRlsTransaction({ getAuthenticatedSession, pool }, callback);

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(pool.connect).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
});

describe("rls-transaction.ts — guaranteed rollback on callback failure (design.md §6.3 commit/rollback MUST clause)", () => {
  it("rolls back and re-throws on a SYNCHRONOUSLY-thrown callback error, never committing", async () => {
    const { withRlsTransaction } = await import("../rls-transaction");

    const tx = createMockTx();
    const { pool, conn } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => okSession);

    // Deliberately not an `async` function: throws synchronously the moment
    // it is invoked, before returning any promise at all.
    const callback = vi.fn(() => {
      throw new Error("sync-callback-failure");
    });

    await expect(
      withRlsTransaction({ getAuthenticatedSession, pool }, callback as unknown as (tx: unknown) => Promise<unknown>),
    ).rejects.toThrow("sync-callback-failure");

    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1); // connection still returned to pool
  });

  it("rolls back and re-throws on an ASYNCHRONOUSLY-rejected callback promise, never committing", async () => {
    const { withRlsTransaction } = await import("../rls-transaction");

    const tx = createMockTx();
    const { pool, conn } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => okSession);

    const callback = vi.fn(async () => {
      await Promise.resolve(); // force at least one real microtask hop
      throw new Error("async-callback-failure");
    });

    await expect(
      withRlsTransaction({ getAuthenticatedSession, pool }, callback),
    ).rejects.toThrow("async-callback-failure");

    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  it("still rolls back and releases even if the callback returns an already-rejected promise (no throw at all)", async () => {
    const { withRlsTransaction } = await import("../rls-transaction");

    const tx = createMockTx();
    const { pool, conn } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => okSession);

    const callback = vi.fn(() => Promise.reject(new Error("rejected-without-throw")));

    await expect(
      withRlsTransaction({ getAuthenticatedSession, pool }, callback),
    ).rejects.toThrow("rejected-without-throw");

    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);
  });
});

describe("rls-transaction.ts — commit happens only after the callback fully resolves (same deferred-promise pattern as AuthenticatedShellBoundary.test.tsx)", () => {
  it("has not committed while the callback's returned promise is still pending", async () => {
    const { withRlsTransaction } = await import("../rls-transaction");

    const tx = createMockTx();
    const { pool, conn } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => okSession);

    let releaseDeferred: (() => void) | undefined;
    const deferred = new Promise<string>((resolve) => {
      releaseDeferred = () => resolve("resolved-late");
    });

    const callback = vi.fn(async () => deferred);

    const resultPromise = withRlsTransaction({ getAuthenticatedSession, pool }, callback);

    // Let microtasks up to (and including) the callback invocation flush,
    // WITHOUT resolving the deferred promise yet. Poll instead of hardcoding
    // a fixed number of flushes, since the exact number of microtask hops
    // before invocation is an implementation detail (e.g. claim-setting
    // being awaited first) that shouldn't make this test timing-fragile.
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledTimes(1);
    });
    expect(conn.commit).not.toHaveBeenCalled(); // no premature commit
    expect(conn.rollback).not.toHaveBeenCalled();

    releaseDeferred!();
    const result = await resultPromise;

    expect(result).toEqual({ kind: "ok", value: "resolved-late" });
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });
});
