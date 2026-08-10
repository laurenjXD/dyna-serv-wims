// Shared mock-RLS-deps builder for lib/actions/* test files.
//
// Every action now runs its DB work through withRlsTransaction (see
// ../rls-transaction.ts and ../rls-pool.ts) instead of a plain injected
// `db: DbLike`. This helper lets action test files keep their EXISTING mock
// `DbLike` objects (select/insert/update mocks built exactly as before) —
// only the injection mechanism changes: instead of passing that mock db as
// a positional argument, wrap it with `mockRlsDeps(mockDb)` and pass the
// result as the action's trailing `deps` override.
//
// Mirrors lib/db/__tests__/rls-transaction.test.ts's own createMockTx/
// createMockPool pattern (kept driver-agnostic there); this helper is the
// one place lib/actions/* tests share it from, so seven files don't each
// reinvent slightly different mock pools.

import { vi } from "vitest";
import type { AuthSession } from "@/lib/rbac/session";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";

export const DEFAULT_MOCK_USER_ID = "11111111-1111-1111-1111-111111111111";

export interface MockRlsDepsResult {
  deps: RlsTransactionDeps;
  // Call assertions against these if a test needs to confirm
  // commit/rollback/release behavior, not just the callback's return value.
  conn: {
    begin: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    rollback: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
}

/**
 * Builds a `RlsTransactionDeps` whose transaction-bound client's `db` field
 * is exactly the mock `DbLike` object passed in — so existing action tests'
 * select/insert/update mock behavior is reused unchanged. `session` defaults
 * to a fixed authorized user; pass `null` to simulate an unauthenticated
 * caller (withRlsTransaction returns `{ kind: "unauthenticated" }` before
 * ever calling `pool.connect()`).
 */
export function mockRlsDeps(
  mockDb: unknown,
  session: AuthSession | null = { userId: DEFAULT_MOCK_USER_ID },
): MockRlsDepsResult {
  const conn = {
    begin: vi.fn(async () => ({
      execute: vi.fn(async () => undefined),
      db: mockDb,
    })),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  };

  const deps: RlsTransactionDeps = {
    getAuthenticatedSession: vi.fn(async () => session),
    pool: {
      connect: vi.fn(async () => conn),
    },
  };

  return { deps, conn };
}
