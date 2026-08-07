import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // tsconfig.json sets jsx: "preserve" (Next.js/SWC handles the JSX
  // transform for the real app build). Vitest's esbuild transform needs
  // its own jsx setting for *.test.tsx files, since it never goes through
  // Next's SWC pipeline.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    // Default stays "node" for pure-logic tests (lib/db, lib/rbac,
    // lib/shell) — fast, no DOM. Component tests (*.test.tsx, using RTL)
    // opt into jsdom per-file via a `// @vitest-environment jsdom`
    // docblock at the top of the file (Vitest 4's supported per-file
    // override mechanism; `environmentMatchGlobs` was removed from the
    // InlineConfig type in this major version). This is a scoped
    // per-test-file override, not a global environment switch.
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // testing.md's two-stage DB-testing approach: mocked unit tests run on
    // every commit via `npm test`; real-Postgres integration tests
    // (`*.integration.test.ts`) are a separate, deliberately-excluded-here
    // tier run only via `npm run test:integration` (requires a live
    // DATABASE_URL/TEST_DATABASE_URL, typically the same disposable-Postgres
    // harness already used by db-migration-verifier) — see that script and
    // lib/db/__tests__/rls-transaction.integration.test.ts for the pattern.
    exclude: ["node_modules", ".next", "**/*.integration.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
