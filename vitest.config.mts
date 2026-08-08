import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // tsconfig.json sets jsx: "preserve" (Next.js/SWC handles the JSX
  // transform for the real app build). Vitest's esbuild transform needs
  // its own jsx setting for *.test.tsx files, since it never goes through
  // Next's SWC pipeline.
  esbuild: { jsx: "automatic" },
  test: {
    // Default stays "node" for pure-logic tests (lib/db, lib/rbac,
    // lib/shell) — fast, no DOM. Component tests (*.test.tsx, using RTL)
    // opt into jsdom per-file via a `// @vitest-environment jsdom`
    // docblock at the top of the file (Vitest 4's supported per-file
    // override mechanism; `environmentMatchGlobs` was removed from the
    // InlineConfig type in this major version). This is a scoped
    // per-test-file override, not a global environment switch.
    environment: "node",
    pool: "vmThreads",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // testing.md's two-stage DB-testing approach: mocked unit tests run on
    // every commit via `npm test`; real-Postgres integration tests
    // (`*.integration.test.ts`) are a separate, deliberately-excluded-here
    // tier run only via `npm run test:integration` (requires a live
    // DATABASE_URL/TEST_DATABASE_URL, typically the same disposable-Postgres
    // harness already used by db-migration-verifier).
    exclude: ["node_modules", ".next", "**/*.integration.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // Drizzle schema imports pull in a wide module graph that esbuild must
    // transform on first import; 5 s (the Vitest default) is too tight in
    // slower CI/dev environments — 30 s gives the transform room to breathe.
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
