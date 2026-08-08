// RED-step unit tests for lib/analytics/queries/rls-executor.ts (does not
// exist yet).
//
// Traceability:
//   - specs/16-reporting-and-analytics/design.md §6.2 ("RLS Behavior"):
//     "The analytics route handlers: 1. Call requirePermission('reporting',
//     'read', scope) ... 2. Execute the query inside the RLS-enforcing
//     transaction wrapper (per `02` §6.3). 3. Return only RLS-visible rows —
//     no application-layer `WHERE party_id = ?` clause replaces the RLS
//     boundary."
//   - specs/16-reporting-and-analytics/requirements.md AC-5 ("A party user
//     ... sees only their own party's lots, WRRs, and pick lists in every
//     analytics view ... returns empty results, not an error that reveals
//     data existence" — note this is empty RESULTS for a genuinely-scoped-
//     but-non-matching query, which is a distinct outcome from this file's
//     concern: an UNAUTHENTICATED session must never be indistinguishable
//     from "no rows matched", see the dedicated describe block below) and
//     NFR-3 ("All queries are automatically scoped by PostgreSQL RLS ... No
//     application-layer WHERE party_id = ? clause replaces RLS").
//   - specs/02-rbac-roles/design.md §6.3 (the withRlsTransaction five-step
//     contract this executor must delegate to, never reimplement).
//
// THE GAP THIS CLOSES: lib/analytics/queries/shared.ts's
// `defaultAnalyticsExecutor` calls the plain, unscoped `lib/db/client.ts`'s
// `db.execute(query)` directly — no RLS claims are ever set on that
// connection, so every analytics query function in lib/analytics/queries/
// (inventory.ts, receiving.ts, outbound.ts, heatmap.ts, export.ts) that
// relies on the `AnalyticsExecutor` default silently runs UNSCOPED. This
// test file targets a second, RLS-aware `AnalyticsExecutor` implementation
// that analytics route handlers are expected to inject instead of the
// default, per design.md §6.2 step 2 above.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/analytics/queries/rls-executor.ts (for
// backend-builder), fixed here since design.md §6.2 specifies the *behavior*
// ("execute inside the RLS wrapper") without fixing an exact TypeScript
// signature:
//
//   1. `createRlsAnalyticsExecutor(deps: RlsTransactionDeps):
//      AnalyticsExecutor` — takes exactly the same `{ getAuthenticatedSession,
//      pool }` dependency shape already defined by
//      lib/db/rls-transaction.ts's `RlsTransactionDeps` (re-exported/re-used,
//      never redefined with a different shape), and returns something that
//      structurally satisfies shared.ts's `AnalyticsExecutor` interface
//      (`execute<T>(query: SQL): Promise<T[]>`) so every existing query
//      function in lib/analytics/queries/*.ts can accept it as a drop-in
//      replacement for `defaultAnalyticsExecutor` with no call-site changes.
//   2. Internally, `execute()` MUST call `withRlsTransaction` from
//      lib/db/rls-transaction.ts — it is never reimplemented, and
//      lib/db/client.ts's `db`/`db.execute` must never be imported or called
//      anywhere in this module (proven below both behaviorally, via a pool
//      that would make any real-DB fallback path visibly fail differently,
//      and structurally, via a source-text check).
//   3. The drizzle-orm `SQL` query object `execute()` receives must be
//      converted to the `{ sql: string, params: unknown[] }` shape
//      `TransactionBoundClient.execute()` / `RlsClaimStatement` already use
//      (see lib/db/rls-pool.ts's own comment: "callers must build `{ sql,
//      params }` themselves") — e.g. via `drizzle-orm/pg-core`'s
//      `PgDialect.sqlToQuery(query)`, NOT a hand-rolled string-interpolation
//      of the query's values (that would defeat parameter binding).
//   4. Return-shape propagation: an `{ kind: "ok", value }`
//      `RlsTransactionResult` unwraps to `value` (the row array) unchanged.
//      An `{ kind: "unauthenticated" }` result MUST be surfaced to the
//      calling analytics query function as a thrown error (a dedicated
//      exported error type, `AnalyticsUnauthenticatedError`), never as a
//      silently-returned `[]` — an empty array is indistinguishable from "the
//      query legitimately found zero matching rows" and would be a silent
//      fail-open/fail-ambiguous bug for every caller in lib/analytics/queries.
//   5. No third "bypass" export: this module exports exactly
//      `createRlsAnalyticsExecutor` and `AnalyticsUnauthenticatedError` — no
//      raw pool/tx passthrough, matching the same "no escape hatch" pattern
//      already enforced for lib/db/rls-transaction.ts
//      (lib/db/__tests__/rls-transaction.test.ts's own "no escape hatch"
//      describe block).
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import type { AuthSession } from "../../../rbac/session";

interface MockStatement {
  sql: string;
  params: unknown[];
}

function createMockTx(queryRows: Record<string, unknown>[]) {
  const calls: MockStatement[] = [];
  return {
    calls,
    execute: vi.fn(async (statement: MockStatement) => {
      calls.push(statement);
      // Claim-setting statements (design.md §6.3 step 3) always call
      // set_config and never carry the real query text -- only the REAL
      // query call (the one this executor is responsible for dispatching)
      // should ever receive the fixture rows back.
      if (/set_config/i.test(statement.sql)) {
        return undefined;
      }
      return queryRows;
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

const okSession: AuthSession = { userId: "44444444-4444-4444-4444-444444444444" };

describe("rls-executor.ts — createRlsAnalyticsExecutor delegates to withRlsTransaction (design.md §6.2 step 2)", () => {
  it("runs the query through the transaction-bound client (connect -> begin -> claims -> query -> commit -> release), never touching a bare/unscoped connection", async () => {
    const { createRlsAnalyticsExecutor } = await import("../rls-executor");

    const fixtureRows = [{ lot_id: "lot-1", qty_available: 10 }];
    const tx = createMockTx(fixtureRows);
    const { pool, conn, callOrder } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => okSession);

    const executor = createRlsAnalyticsExecutor({ getAuthenticatedSession, pool });
    const rows = await executor.execute(sql`select * from lot_inventory_totals`);

    expect(rows).toEqual(fixtureRows);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(conn.begin).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);

    // The real query text/param pair must have actually reached tx.execute
    // (not just the claim statements) — matches the RlsClaimStatement /
    // TransactionBoundClient `{ sql, params }` contract, not a raw drizzle
    // SQL object or an unsafely-interpolated string.
    const queryCall = tx.calls.find((c) => /lot_inventory_totals/i.test(c.sql));
    expect(queryCall).toBeDefined();
    expect(Array.isArray(queryCall!.params)).toBe(true);

    const connectIdx = callOrder.indexOf("connect");
    const beginIdx = callOrder.indexOf("begin");
    const commitIdx = callOrder.indexOf("commit");
    const releaseIdx = callOrder.indexOf("release");
    expect(connectIdx).toBeLessThan(beginIdx);
    expect(commitIdx).toBeLessThan(releaseIdx);
  });

  it("converts a parameterized drizzle SQL query into a bound { sql, params } statement — never string-interpolates the parameter value into the SQL text", async () => {
    const { createRlsAnalyticsExecutor } = await import("../rls-executor");

    const tx = createMockTx([]);
    const { pool } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => okSession);

    const executor = createRlsAnalyticsExecutor({ getAuthenticatedSession, pool });
    await executor.execute(sql`select * from lots where flow_type = ${"vmi"}::flow_type`);

    const queryCall = tx.calls.find((c) => /lots/i.test(c.sql));
    expect(queryCall).toBeDefined();
    // The bound value travels as a parameter, not inline SQL text.
    expect(queryCall!.sql).not.toContain("'vmi'");
    expect(queryCall!.params).toContain("vmi");
  });

  it("returns the ok-result rows completely unchanged (no re-shaping, no re-implementation of withRlsTransaction's own result unwrapping)", async () => {
    const { createRlsAnalyticsExecutor } = await import("../rls-executor");

    const fixtureRows = [
      { item_code: "ITM-1", qty_available: 5 },
      { item_code: "ITM-2", qty_available: 12 },
    ];
    const tx = createMockTx(fixtureRows);
    const { pool } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => okSession);

    const executor = createRlsAnalyticsExecutor({ getAuthenticatedSession, pool });
    const rows = await executor.execute(sql`select * from lot_inventory_totals`);

    expect(rows).toBe(fixtureRows);
  });
});

describe("rls-executor.ts — unauthenticated RlsTransactionResult is a clear error, never a silent empty array (AC-5 boundary, NFR-3)", () => {
  it("throws AnalyticsUnauthenticatedError when the session cannot be resolved, and never returns []", async () => {
    const { createRlsAnalyticsExecutor, AnalyticsUnauthenticatedError } = await import("../rls-executor");

    const tx = createMockTx([]);
    const { pool } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => null);

    const executor = createRlsAnalyticsExecutor({ getAuthenticatedSession, pool });

    await expect(executor.execute(sql`select * from lots`)).rejects.toBeInstanceOf(
      AnalyticsUnauthenticatedError,
    );
    // Fail-closed, same as withRlsTransaction itself: the pool must never be
    // touched for an unauthenticated session.
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("throws AnalyticsUnauthenticatedError (not a generic Error, and not a resolved empty array) for a session with an empty userId", async () => {
    const { createRlsAnalyticsExecutor, AnalyticsUnauthenticatedError } = await import("../rls-executor");

    const tx = createMockTx([]);
    const { pool } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => ({ userId: "" }) as AuthSession);

    const executor = createRlsAnalyticsExecutor({ getAuthenticatedSession, pool });

    let caught: unknown;
    let resolvedValue: unknown;
    let didResolve = false;
    try {
      resolvedValue = await executor.execute(sql`select * from lots`);
      didResolve = true;
    } catch (error) {
      caught = error;
    }

    expect(didResolve).toBe(false);
    expect(resolvedValue).toBeUndefined();
    expect(caught).toBeInstanceOf(AnalyticsUnauthenticatedError);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe("rls-executor.ts — never bypasses withRlsTransaction / lib/db/client (structural)", () => {
  it("exports exactly createRlsAnalyticsExecutor and AnalyticsUnauthenticatedError — no raw pool/tx passthrough", async () => {
    const mod = await import("../rls-executor");
    const exportedKeys = Object.keys(mod).sort();
    expect(exportedKeys).toEqual(["AnalyticsUnauthenticatedError", "createRlsAnalyticsExecutor"].sort());
  });

  it("createRlsAnalyticsExecutor never imports lib/db/client (source-text check — no unscoped db.execute fallback path)", async () => {
    // Forces the RED failure to be "module not found", identical to every
    // other assertion in this file, while still proving something concrete
    // about the eventual implementation once it exists.
    const modulePath = path.resolve(__dirname, "../rls-executor.ts");
    const source = fs.readFileSync(modulePath, "utf8");
    expect(source).not.toMatch(/from\s+["']@\/lib\/db\/client["']/);
    expect(source).not.toMatch(/from\s+["'].*\/db\/client["']/);
  });

  it("only ever calls .execute() on the tx-bound client returned by pool.connect().begin() — never on the pool or connection object directly", async () => {
    const { createRlsAnalyticsExecutor } = await import("../rls-executor");

    const tx = createMockTx([{ ok: true }]);
    const { pool, conn } = createMockPool(tx);
    const getAuthenticatedSession = vi.fn(async () => okSession);

    const executor = createRlsAnalyticsExecutor({ getAuthenticatedSession, pool });
    await executor.execute(sql`select 1`);

    expect((pool as Record<string, unknown>).execute).toBeUndefined();
    expect((pool as Record<string, unknown>).query).toBeUndefined();
    expect((conn as Record<string, unknown>).execute).toBeUndefined();
    expect((conn as Record<string, unknown>).query).toBeUndefined();
    expect(tx.calls.length).toBeGreaterThan(0);
  });
});
