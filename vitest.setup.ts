// Global Vitest setup. Only affects files that actually render DOM (their
// own `// @vitest-environment jsdom` docblock) — importing "@testing-library/
// jest-dom" matchers here is a no-op for plain "node"-environment logic
// tests since they never call the extended matchers.
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// ─── Web Audio API stub for jsdom ─────────────────────────────────────────────
//
// jsdom does not implement the Web Audio API. Component tests that exercise
// ScanFeedbackProvider (and any other component that uses AudioContext) call
// vi.spyOn(window, "AudioContext", "get") to inject a mock constructor, which
// requires the property to already exist as an accessor on window. Without this
// stub the spy throws "The property 'AudioContext' is not defined on the object."
//
// Defining it here as a configurable accessor (get + set) lets the spy replace
// the getter, and lets tests directly assign a mock with window.AudioContext = fn.
// The default value is undefined so any component that tries to use the real
// AudioContext in the test environment hits the try/catch and silently skips audio.
if (typeof window !== "undefined" && !Object.prototype.hasOwnProperty.call(window, "AudioContext")) {
  let _webAudioContext: unknown = undefined;
  Object.defineProperty(window, "AudioContext", {
    get: () => _webAudioContext,
    set: (value: unknown) => {
      _webAudioContext = value;
    },
    configurable: true, // required for vi.spyOn to replace the getter in tests
  });
}

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
