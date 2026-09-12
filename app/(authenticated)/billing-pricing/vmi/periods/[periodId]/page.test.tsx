import { describe, expect, it } from "vitest";

describe("VMI period detail", () => {
  it("exports an authorized period detail page with payment history", async () => {
    const page = await import("./page");
    const source = page.default.toString();
    expect(typeof page.default).toBe("function");
    expect(source).toContain("reporting.financial_read");
    expect(source).toContain("PaymentForm");
    expect(source).toContain("vmiPayments");
  });
});
