// RED-step schema tests for lib/db/schema/forex.ts
// Traceability: specs/01-core-data-model/requirements.md Acceptance Criteria 8
// (forex_rates stores effective_date + usd_to_php_rate) and design.md §1.2
// (`forex_rates`).
import { describe, expect, it } from "vitest";
import { column, tableName } from "./helpers";

describe("forex.ts — forex_rates table (Req 8)", () => {
  it("is named 'forex_rates'", async () => {
    const { forexRates } = await import("../forex");
    expect(tableName(forexRates)).toBe("forex_rates");
  });

  it("has effectiveDate as notNull + unique", async () => {
    const { forexRates } = await import("../forex");
    const effectiveDate = column(forexRates, "effectiveDate");
    expect(effectiveDate.notNull).toBe(true);
    expect(effectiveDate.isUnique).toBe(true);
  });

  it("has usdToPhpRate as notNull", async () => {
    const { forexRates } = await import("../forex");
    expect(column(forexRates, "usdToPhpRate").notNull).toBe(true);
  });

  it("has source notNull with default 'manual'", async () => {
    const { forexRates } = await import("../forex");
    const source = column(forexRates, "source");
    expect(source.notNull).toBe(true);
    expect(source.hasDefault).toBe(true);
  });

  it("has createdAt notNull with default", async () => {
    const { forexRates } = await import("../forex");
    expect(column(forexRates, "createdAt").notNull).toBe(true);
  });
});
