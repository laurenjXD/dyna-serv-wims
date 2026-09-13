import { describe, expect, it } from "vitest";
import { normalizeDatabaseConnectionString } from "../connection-string";

describe("normalizeDatabaseConnectionString", () => {
  const sessionPooler =
    "postgresql://postgres.project:encoded%40password@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";

  it("routes Supabase session-pooler URLs through transaction mode in serverless runtimes", () => {
    expect(normalizeDatabaseConnectionString(sessionPooler, true)).toBe(
      "postgresql://postgres.project:encoded%40password@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres",
    );
  });

  it("preserves the configured URL outside serverless runtimes", () => {
    expect(normalizeDatabaseConnectionString(sessionPooler, false)).toBe(sessionPooler);
  });

  it("does not alter direct or already-transactional connections", () => {
    const direct = "postgresql://postgres:password@db.project.supabase.co:5432/postgres";
    const transaction = sessionPooler.replace(":5432/", ":6543/");

    expect(normalizeDatabaseConnectionString(direct, true)).toBe(direct);
    expect(normalizeDatabaseConnectionString(transaction, true)).toBe(transaction);
  });
});
