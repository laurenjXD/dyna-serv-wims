// RED-step unit tests for lib/billing/trading-margin-calc.ts (does not exist
// yet — this is the pure-computation slice of Task 4, not the full
// price-resolution-with-DB-lookup-and-freeze command).
//
// Traceability:
//   specs/13-trading-orders-and-pricing/requirements.md
//     §2 — "Margin = sell_price - buy_cost (or % = margin / sell_price)"
//     R1.2 — trading_policies stores buy_cost/buy_currency, margin_type
//            ('percentage' | 'fixed_amount'), margin_value, a
//            derived-or-overridden sell_price/sell_currency, and fx_source
//            when buy/sell currencies differ.
//     R1.3 — items.selling_price/items.buying_price are never auto-applied.
//   specs/13-trading-orders-and-pricing/design.md
//     §3 — TradingPriceSnapshot contract: "All monetary values are decimal
//          strings; floating-point types are forbidden for price fields."
//     §5 — Margin, currency, and commercial rules:
//          "sell_price = buy_cost + (buy_cost × margin_value/100)" for
//          margin_type = 'percentage', or "buy_cost + margin_value" for
//          'fixed_amount' — unless sell_price_is_override = true, in which
//          case the stored value is authoritative and the formula is
//          display-only context.
//          "fx_source required when [buy_currency/sell_currency] differ;
//          forex sourced from forex_rates, locked at freeze time. Missing
//          rate blocks the freeze."
//   specs/13-trading-orders-and-pricing/tasks.md
//     Task 4, bullet 3 — "Implement decimal-safe margin/currency/forex
//     calculation exactly per design.md §5."
//     Testing matrix — "Decimal-safe price/currency/forex/margin
//     calculations — no floating-point arithmetic on money fields."
//
// ---------------------------------------------------------------------------
// A note on design.md §5's percentage formula (read in full before writing
// this file, per instruction):
//
// design.md §5 gives an EXPLICIT, unambiguous formula for margin_type =
// 'percentage': `sell_price = buy_cost + (buy_cost × margin_value/100)`.
// This is markup-on-cost, NOT "solve for sell_price such that
// margin/sell_price = margin_value%". Those two readings diverge: the
// separate "margin %" figure (requirements.md §2: margin / sell_price) is a
// DERIVED, after-the-fact display quantity computed identically for BOTH
// margin_type values — it does not equal margin_value for the 'percentage'
// type once buy_cost > 0. This file tests the literal design.md §5 formula,
// not the alternate algebraic-solve reading, since design.md is authoritative
// and already disambiguates this.
// ---------------------------------------------------------------------------
//
// File path chosen: lib/billing/trading-margin-calc.ts.
// Neither design.md nor tasks.md names an exact file path for this pure
// calculation slice (design.md §2 only names lib/db/schema/trading_pricing.ts
// for persistence). This path follows this repo's established
// lib/<domain>/<concern>.ts convention (cf. lib/withdrawal/allocation.ts,
// lib/fifo/index.ts) using "billing" as the domain, matching this feature's
// Sub-tab home ("Billing & Pricing", design.md §7) and its sibling
// lib/db/schema/vmi_billing.ts naming for the same tab family.
//
// A note on decimal-math convention (repo grep performed before writing this
// file): this codebase has NO decimal.js/big.js dependency in package.json,
// and no existing lib/fifo, lib/withdrawal, lib/approval, or lib/enrollment
// module does money-safe decimal arithmetic yet (lib/fifo/index.ts is an
// unimplemented placeholder; lib/withdrawal/allocation.ts works in plain
// `number` quantities, not currency). This is therefore the FIRST
// decimal-safe money-math module in this codebase — there is no existing
// convention to follow. This test file deliberately does not prescribe which
// internal technique the backend-builder uses (decimal.js, big.js, or manual
// integer-cents arithmetic are all valid implementations); it only asserts
// on the PUBLIC CONTRACT: decimal-STRING inputs/outputs (matching design.md
// §3's "decimal string, never float" guarantee), at a fixed scale of 4
// decimal places (matching trading_policies/trading_invoice_lines' decimal
// (12,4)/(14,4)/(10,4) columns per design.md §2), with half-up rounding at
// that scale, and — the actual thing under test — no floating-point drift
// artifacts (e.g. "0.30000000000000004") anywhere in the output strings.
//
// marginPct's own output scale (4 decimal places as a fraction, e.g.
// "0.1304" = 13.04%) is this test file's own assumption, since neither
// design.md nor requirements.md names a column/precision for it (it is a
// computed-on-read display quantity, not a persisted column) — flagged here
// for the builder/reviewer rather than silently guessed.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/trading-margin-calc.ts
// (for backend-builder):
//
//   export type TradingMarginType = "percentage" | "fixed_amount";
//
//   export type FxRateInput = {
//     rate: string;    // decimal string; multiplier converting 1 unit of
//                       // buyCurrency into sellCurrency
//     source: string;  // matches trading_policies.fx_source
//   };
//
//   export type ComputeTradingPriceLineInput = {
//     buyCost: string;             // decimal string, in buyCurrency
//     buyCurrency: string;         // ISO currency code, e.g. 'USD'
//     marginType: TradingMarginType;
//     marginValue: string;         // decimal string; % for 'percentage',
//                                   // flat amount (in sellCurrency) for
//                                   // 'fixed_amount'
//     sellCurrency: string;        // ISO currency code, e.g. 'PHP'
//     sellPriceIsOverride: boolean;
//     overrideSellPrice?: string;  // decimal string, in sellCurrency;
//                                   // required when sellPriceIsOverride=true
//     fxRate?: FxRateInput;        // required when buyCurrency !== sellCurrency
//   };
//
//   export type ComputeTradingPriceLineResult =
//     | {
//         ok: true;
//         buyCost: string;      // buy cost re-expressed in sellCurrency terms
//         sellPrice: string;
//         marginAmount: string;
//         marginPct: string;    // decimal fraction string, e.g. "0.1304"
//         currency: string;     // = sellCurrency
//         fxSource?: string;
//       }
//     | {
//         ok: false;
//         error: "fx_rate_required";
//         buyCurrency: string;
//         sellCurrency: string;
//       };
//
//   // Pure function — no DB access, no forex_rates lookup. The caller
//   // (Task 4's price-resolution command) is responsible for sourcing
//   // fxRate from forex_rates before calling this function.
//   export function computeTradingPriceLine(
//     input: ComputeTradingPriceLineInput,
//   ): ComputeTradingPriceLineResult;
//
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { computeTradingPriceLine } from "../trading-margin-calc";

// ---------------------------------------------------------------------------
// margin_type = 'percentage' — sell_price = buy_cost + (buy_cost * margin_value/100)
// (design.md §5)
// ---------------------------------------------------------------------------

describe("computeTradingPriceLine — margin_type='percentage' formula (design.md §5)", () => {
  it("(AC: percentage margin derives sell_price as markup-on-cost, not margin-as-%-of-sell-price) buyCost=200.0000, marginValue=15% → sellPrice=230.0000", () => {
    const result = computeTradingPriceLine({
      buyCost: "200.0000",
      buyCurrency: "PHP",
      marginType: "percentage",
      marginValue: "15.0000",
      sellCurrency: "PHP",
      sellPriceIsOverride: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sellPrice).toBe("230.0000");
    }
  });

  it("(AC: margin and margin_pct derived from the resulting sell_price, requirements.md §2) buyCost=200.0000, marginValue=15% → margin=30.0000, marginPct=30/230=0.1304", () => {
    const result = computeTradingPriceLine({
      buyCost: "200.0000",
      buyCurrency: "PHP",
      marginType: "percentage",
      marginValue: "15.0000",
      sellCurrency: "PHP",
      sellPriceIsOverride: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.marginAmount).toBe("30.0000");
      // 30 / 230 = 0.130434... → rounded half-up at scale 4 = 0.1304
      expect(result.marginPct).toBe("0.1304");
    }
  });
});

// ---------------------------------------------------------------------------
// margin_type = 'fixed_amount' — sell_price = buy_cost + margin_value
// (design.md §5)
// ---------------------------------------------------------------------------

describe("computeTradingPriceLine — margin_type='fixed_amount' formula (design.md §5)", () => {
  it("(AC: fixed-amount margin adds flat margin_value to buy_cost) buyCost=80.0000, marginValue=20.0000 → sellPrice=100.0000", () => {
    const result = computeTradingPriceLine({
      buyCost: "80.0000",
      buyCurrency: "PHP",
      marginType: "fixed_amount",
      marginValue: "20.0000",
      sellCurrency: "PHP",
      sellPriceIsOverride: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sellPrice).toBe("100.0000");
      expect(result.marginAmount).toBe("20.0000");
      // 20 / 100 = 0.2000 exactly
      expect(result.marginPct).toBe("0.2000");
    }
  });
});

// ---------------------------------------------------------------------------
// margin = sell_price - buy_cost; margin_pct = margin / sell_price
// (requirements.md §2, exact formula — general assertion independent of
// margin_type, using a repeating-decimal margin_pct to confirm rounding
// behavior rather than truncation-to-zero or silent drift)
// ---------------------------------------------------------------------------

describe("computeTradingPriceLine — margin/margin_pct formula (requirements.md §2)", () => {
  it("(AC: margin_pct = margin / sell_price, rounded cleanly for a repeating decimal) buyCost=100.0000 override sellPrice=300.0000 → margin=200.0000, marginPct=200/300=0.6667", () => {
    const result = computeTradingPriceLine({
      buyCost: "100.0000",
      buyCurrency: "PHP",
      marginType: "fixed_amount",
      marginValue: "999.0000", // irrelevant — override takes precedence
      sellCurrency: "PHP",
      sellPriceIsOverride: true,
      overrideSellPrice: "300.0000",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.marginAmount).toBe("200.0000");
      // 200 / 300 = 0.666666... → rounded half-up at scale 4 = 0.6667,
      // never a raw floating-point repeating value like
      // "0.6666666666666666".
      expect(result.marginPct).toBe("0.6667");
    }
  });
});

// ---------------------------------------------------------------------------
// sell_price_is_override = true — override value used as-is; margin/
// margin_pct are computed FROM it (derived), never re-driving sell_price
// via the margin_type formula (design.md §5: "the stored value is
// authoritative and the formula is display-only context")
// ---------------------------------------------------------------------------

describe("computeTradingPriceLine — sell_price_is_override (design.md §5)", () => {
  it("(AC: override sell_price wins over the margin_type/margin_value formula, even when the formula result differs) buyCost=100 + percentage margin=50% would imply sellPrice=150, but override=120 must win", () => {
    const result = computeTradingPriceLine({
      buyCost: "100.0000",
      buyCurrency: "PHP",
      marginType: "percentage",
      marginValue: "50.0000", // would derive sellPrice = 150.0000 if not overridden
      sellCurrency: "PHP",
      sellPriceIsOverride: true,
      overrideSellPrice: "120.0000",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sellPrice).toBe("120.0000");
      expect(result.sellPrice).not.toBe("150.0000");
    }
  });

  it("(AC: margin/margin_pct are derived from the override value, not re-driven by margin_type/margin_value) buyCost=100.0000, override sellPrice=120.0000 → margin=20.0000, marginPct=20/120=0.1667", () => {
    const result = computeTradingPriceLine({
      buyCost: "100.0000",
      buyCurrency: "PHP",
      marginType: "percentage",
      marginValue: "50.0000",
      sellCurrency: "PHP",
      sellPriceIsOverride: true,
      overrideSellPrice: "120.0000",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.marginAmount).toBe("20.0000");
      // 20 / 120 = 0.166666... → rounded half-up at scale 4 = 0.1667
      expect(result.marginPct).toBe("0.1667");
    }
  });
});

// ---------------------------------------------------------------------------
// Currency / forex (design.md §5: "fx_source required when [currencies]
// differ ... Missing rate blocks the freeze")
// ---------------------------------------------------------------------------

describe("computeTradingPriceLine — currency and forex (design.md §5, R2.3)", () => {
  it("(AC: missing fx rate is a clean rejection, not a silent proceed) buyCurrency='USD' !== sellCurrency='PHP' with no fxRate supplied → { ok: false, error: 'fx_rate_required' } naming both currencies", () => {
    const result = computeTradingPriceLine({
      buyCost: "100.0000",
      buyCurrency: "USD",
      marginType: "percentage",
      marginValue: "10.0000",
      sellCurrency: "PHP",
      sellPriceIsOverride: false,
      // fxRate intentionally omitted
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("fx_rate_required");
      expect(result.buyCurrency).toBe("USD");
      expect(result.sellCurrency).toBe("PHP");
    }
  });

  it("(AC: a supplied fx rate is applied to the cost basis before the margin formula, and locked into the result) buyCost=100.0000 USD, rate=56.0000 PHP/USD, marginValue=10% → sellPrice=6160.0000 PHP", () => {
    const result = computeTradingPriceLine({
      buyCost: "100.0000",
      buyCurrency: "USD",
      marginType: "percentage",
      marginValue: "10.0000",
      sellCurrency: "PHP",
      sellPriceIsOverride: false,
      fxRate: { rate: "56.0000", source: "BSP" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // buyCost re-expressed in sellCurrency: 100 * 56 = 5600.0000
      expect(result.buyCost).toBe("5600.0000");
      // sellPrice = 5600 + 5600*0.10 = 6160.0000
      expect(result.sellPrice).toBe("6160.0000");
      expect(result.marginAmount).toBe("560.0000");
      expect(result.currency).toBe("PHP");
      expect(result.fxSource).toBe("BSP");
    }
  });

  it("(AC: same-currency policies never require an fx rate) buyCurrency === sellCurrency === 'PHP' with no fxRate supplied succeeds", () => {
    const result = computeTradingPriceLine({
      buyCost: "50.0000",
      buyCurrency: "PHP",
      marginType: "fixed_amount",
      marginValue: "10.0000",
      sellCurrency: "PHP",
      sellPriceIsOverride: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sellPrice).toBe("60.0000");
      expect(result.currency).toBe("PHP");
    }
  });
});

// ---------------------------------------------------------------------------
// Decimal precision — no floating-point arithmetic on money fields
// (tasks.md testing matrix; design.md §3: "floating-point types are
// forbidden for price fields")
// ---------------------------------------------------------------------------

describe("computeTradingPriceLine — decimal precision, no floating-point drift (tasks.md testing matrix)", () => {
  it("(AC: classic 0.1 + 0.2 float-drift case, scaled to currency, produces an exact decimal string) buyCost=0.1000, fixed_amount margin=0.2000 → sellPrice is exactly '0.3000', never a float-drift artifact", () => {
    const result = computeTradingPriceLine({
      buyCost: "0.1000",
      buyCurrency: "PHP",
      marginType: "fixed_amount",
      marginValue: "0.2000",
      sellCurrency: "PHP",
      sellPriceIsOverride: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // In native JS floating point, 0.1 + 0.2 === 0.30000000000000004.
      // This must not leak into the returned decimal string.
      expect(result.sellPrice).toBe("0.3000");
      expect(result.sellPrice).not.toContain("0.30000000000000004");
      expect(typeof result.sellPrice).toBe("string");
    }
  });

  it("(AC: repeating-decimal percentage markup rounds to the 4-decimal-place contract, not raw float precision) buyCost=10.0000, percentage marginValue=33.3333% → sellPrice rounds cleanly at scale 4", () => {
    const result = computeTradingPriceLine({
      buyCost: "10.0000",
      buyCurrency: "PHP",
      marginType: "percentage",
      marginValue: "33.3333",
      sellCurrency: "PHP",
      sellPriceIsOverride: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // 10 + 10*0.333333 = 13.33333 → rounded half-up at scale 4 = 13.3333
      expect(result.sellPrice).toBe("13.3333");
      // Never a raw unrounded/float-tainted value.
      expect(result.sellPrice).not.toMatch(/\d{5,}$/);
    }
  });

  it("(AC: all monetary output fields are decimal strings, never JS number type) every numeric-looking output field is typeof 'string'", () => {
    const result = computeTradingPriceLine({
      buyCost: "10.0000",
      buyCurrency: "PHP",
      marginType: "fixed_amount",
      marginValue: "5.0000",
      sellCurrency: "PHP",
      sellPriceIsOverride: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.buyCost).toBe("string");
      expect(typeof result.sellPrice).toBe("string");
      expect(typeof result.marginAmount).toBe("string");
      expect(typeof result.marginPct).toBe("string");
    }
  });
});
