import { defineConfig } from "vitest/config";
import path from "path";

// Separate config for the real-Postgres integration tier only
// (specs/00-steering/testing.md's "Before tasks.md sign-off" stage).
// Requires a live DATABASE_URL/TEST_DATABASE_URL pointing at disposable
// Postgres (the same pattern already used by db-migration-verifier). Run via
// `npm run test:integration`. Never included in the default `npm test` run
// (vitest.config.mts explicitly excludes `**/*.integration.test.ts`).
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules", ".next"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
