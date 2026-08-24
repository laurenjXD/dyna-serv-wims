import { describe, expect, it } from "vitest";
import { hasTradingPriceInternalVisibility } from "../trading-visibility";
import type { AuthorizationContext } from "../session";

function contextWith(grants: AuthorizationContext["grants"]): AuthorizationContext {
  return { grants } as AuthorizationContext;
}

describe("hasTradingPriceInternalVisibility (specs/13-trading-orders-and-pricing design.md §5/§7a)", () => {
  it("returns true when the context holds trading_prices.read_internal", () => {
    const context = contextWith([
      { resource: "trading_prices", action: "read_internal", scopeKind: "global" },
    ]);
    expect(hasTradingPriceInternalVisibility(context)).toBe(true);
  });

  it("returns true when the context holds trading_prices.override (co-granted capability)", () => {
    const context = contextWith([
      { resource: "trading_prices", action: "override", scopeKind: "global" },
    ]);
    expect(hasTradingPriceInternalVisibility(context)).toBe(true);
  });

  it("returns false for a context holding only reporting.financial_read", () => {
    const context = contextWith([
      { resource: "reporting", action: "financial_read", scopeKind: "global" },
    ]);
    expect(hasTradingPriceInternalVisibility(context)).toBe(false);
  });

  it("returns false for an empty grant list", () => {
    expect(hasTradingPriceInternalVisibility(contextWith([]))).toBe(false);
  });
});
