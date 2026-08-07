import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
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
