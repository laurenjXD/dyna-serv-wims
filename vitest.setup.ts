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
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
