// Global Vitest setup. Only affects files that actually render DOM (their
// own `// @vitest-environment jsdom` docblock) — importing "@testing-library/
// jest-dom" matchers here is a no-op for plain "node"-environment logic
// tests since they never call the extended matchers.
import "@testing-library/jest-dom/vitest";

// @testing-library/react's built-in auto-cleanup only registers itself when
// it detects a *global* `afterEach` (see its dist/index.js: `typeof
// afterEach === 'function'`). This project intentionally does not set
// `test.globals: true` in vitest.config.mts (per-file explicit imports are
// preferred), so that auto-detection never fires and DOM from one test
// leaks into the next within the same file. Register cleanup explicitly
// instead so every `*.test.tsx` file gets a fresh document.body per test
// regardless of that global-detection quirk.
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// ─── Global module stubs for unit tests ──────────────────────────────────────
//
// These stubs prevent real I/O during unit tests that import page modules.
// Page modules (Server Components) transitively import lib/db/client, which
// creates a real postgres connection pool at module load time. Without this
// stub, any `import("../page")` in a unit test attempts a real TCP connection
// and times out after ~5 s.
//
// Integration tests (*.integration.test.ts) are excluded from this config
// via vitest.config.mts `exclude` and run separately against a live database.
//
// Existing unit tests that need a mock db pass one explicitly as a parameter
// and are NOT affected by this stub (they never import lib/db/client).

vi.mock("@/lib/db/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of [
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "leftJoin",
    "innerJoin",
    "returning",
    "values",
    "set",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  // Make the chain thenable so `await db.select(...).from(...).where(...)` resolves.
  const resolved = Promise.resolve([]);
  chain["then"] = resolved.then.bind(resolved);
  chain["catch"] = resolved.catch.bind(resolved);
  chain["finally"] = resolved.finally.bind(resolved);

  return {
    db: {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      delete: vi.fn(() => chain),
    },
  };
});
