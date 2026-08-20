// Pure decimal-safe margin/currency/forex calculation for Trading Pricing
// (specs/13-trading-orders-and-pricing).
//
// Traceability:
//   specs/13-trading-orders-and-pricing/requirements.md §2 — margin/margin%
//     formula, "no configured rate card, no sale" boundary.
//   specs/13-trading-orders-and-pricing/design.md §5 — the literal
//     markup-on-cost formula for margin_type = 'percentage', the
//     fixed_amount formula, the override rule, and the fx_source/missing-
//     rate rule.
//   specs/13-trading-orders-and-pricing/tasks.md Task 4 — "Implement
//     decimal-safe margin/currency/forex calculation exactly per
//     design.md §5."
//
// This module is a pure computation — no DB access, no forex_rates lookup,
// no imports from lib/db/schema. The caller (Task 4's price-resolution
// command) is responsible for sourcing `fxRate` from `forex_rates` before
// calling this function, and for persisting the result into an immutable
// `trading_invoice_lines` snapshot row.
//
// Decimal-math approach: this codebase has no decimal.js/big.js dependency
// and no prior money-math convention. Rather than add a new runtime
// dependency for a single pure-function module, all arithmetic here is done
// with BigInt at a fixed internal precision (10 decimal digits), scaled up
// from/rounded down to the public contract's fixed scale of 4 decimal
// places (matching trading_policies/trading_invoice_lines' decimal(12,4)/
// decimal(14,4)/decimal(10,4) columns). This avoids IEEE-754 float
// arithmetic entirely — no `Number()` is ever used on a monetary value —
// so there is no floating-point drift to round away in the first place.
// Rounding at every scale-reduction step is half-up (round-half-away-from-
// zero for the magnitudes this module deals with, which are all
// non-negative in practice).

export type TradingMarginType = "percentage" | "fixed_amount";

export type FxRateInput = {
  rate: string; // decimal string; multiplier converting 1 unit of buyCurrency into sellCurrency
  source: string; // matches trading_policies.fx_source
};

export type ComputeTradingPriceLineInput = {
  buyCost: string; // decimal string, in buyCurrency
  buyCurrency: string; // ISO currency code, e.g. 'USD'
  marginType: TradingMarginType;
  marginValue: string; // decimal string; % for 'percentage', flat amount (in sellCurrency) for 'fixed_amount'
  sellCurrency: string; // ISO currency code, e.g. 'PHP'
  sellPriceIsOverride: boolean;
  overrideSellPrice?: string; // decimal string, in sellCurrency; required when sellPriceIsOverride=true
  fxRate?: FxRateInput; // required when buyCurrency !== sellCurrency
};

export type ComputeTradingPriceLineResult =
  | {
      ok: true;
      buyCost: string; // buy cost re-expressed in sellCurrency terms
      sellPrice: string;
      marginAmount: string;
      marginPct: string; // decimal fraction string, e.g. "0.1304"
      currency: string; // = sellCurrency
      fxSource?: string;
    }
  | {
      ok: false;
      error: "fx_rate_required";
      buyCurrency: string;
      sellCurrency: string;
    };

// ---------------------------------------------------------------------------
// BigInt-based fixed-point decimal arithmetic.
//
// All intermediate values are represented as a BigInt "tick count" at
// INTERNAL_SCALE decimal digits of precision (i.e. value * 10^INTERNAL_SCALE).
// This gives ample headroom above the public contract's scale of 4 so that
// intermediate multiplication/division never loses meaningful precision
// before the final rounding step.
// ---------------------------------------------------------------------------

const INTERNAL_SCALE = 10;
const OUTPUT_SCALE = 4;

/** Parses a decimal string into a BigInt scaled at `scale` digits, rounding half-up if the input has more fractional digits than `scale`. */
function decimalStringToBigInt(input: string, scale: number): bigint {
  const trimmed = input.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative
    ? trimmed.slice(1)
    : trimmed.startsWith("+")
      ? trimmed.slice(1)
      : trimmed;

  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw === "" ? "0" : intPartRaw;

  let fracPart = fracPartRaw;
  let roundUp = false;
  if (fracPart.length > scale) {
    const keep = fracPart.slice(0, scale);
    const nextDigit = fracPart.charAt(scale);
    roundUp = nextDigit !== "" && Number(nextDigit) >= 5;
    fracPart = keep;
  } else {
    fracPart = fracPart.padEnd(scale, "0");
  }

  let magnitude = BigInt(intPart + fracPart);
  if (roundUp) magnitude += 1n;

  return negative ? -magnitude : magnitude;
}

/** Rescales a BigInt tick value from `fromScale` to `toScale` digits, rounding half-up when reducing precision. */
function rescale(value: bigint, fromScale: number, toScale: number): bigint {
  if (toScale === fromScale) return value;
  if (toScale > fromScale) {
    return value * 10n ** BigInt(toScale - fromScale);
  }

  const divisor = 10n ** BigInt(fromScale - toScale);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const quotient = abs / divisor;
  const remainder = abs % divisor;
  const roundedAbs = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return negative ? -roundedAbs : roundedAbs;
}

/** Multiplies two INTERNAL_SCALE-scaled BigInt values, returning an INTERNAL_SCALE-scaled BigInt (rounded half-up). */
function multiply(a: bigint, b: bigint): bigint {
  const product = a * b; // scaled at 2 * INTERNAL_SCALE
  return rescale(product, INTERNAL_SCALE * 2, INTERNAL_SCALE);
}

/** Divides two INTERNAL_SCALE-scaled BigInt values, returning an INTERNAL_SCALE-scaled BigInt (rounded half-up). */
function divide(a: bigint, b: bigint): bigint {
  if (b === 0n) {
    return 0n;
  }
  const numerator = a * 10n ** BigInt(INTERNAL_SCALE); // scaled at 2 * INTERNAL_SCALE
  const negative = numerator < 0n !== b < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = b < 0n ? -b : b;
  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  const roundedAbs = remainder * 2n >= absDenominator ? quotient + 1n : quotient;
  return negative ? -roundedAbs : roundedAbs;
}

function parseTicks(value: string): bigint {
  return decimalStringToBigInt(value, INTERNAL_SCALE);
}

/** Formats an INTERNAL_SCALE-scaled BigInt as a fixed-scale-4 decimal string. */
function formatOutput(value: bigint): string {
  const rounded = rescale(value, INTERNAL_SCALE, OUTPUT_SCALE);
  const negative = rounded < 0n;
  const abs = negative ? -rounded : rounded;
  const factor = 10n ** BigInt(OUTPUT_SCALE);
  const intPart = abs / factor;
  const fracPart = (abs % factor).toString().padStart(OUTPUT_SCALE, "0");
  const sign = negative && abs !== 0n ? "-" : "";
  return `${sign}${intPart.toString()}.${fracPart}`;
}

const ONE_HUNDRED_TICKS = parseTicks("100");

/**
 * Computes a Trading price line's sell price, margin amount, and margin
 * percentage from a buy cost, margin rule, and optional currency/forex
 * conversion — exactly per design.md §5.
 *
 * Pure function — no DB access, no forex_rates lookup. The caller sources
 * `fxRate` from `forex_rates` before invoking this function.
 */
export function computeTradingPriceLine(
  input: ComputeTradingPriceLineInput,
): ComputeTradingPriceLineResult {
  const currenciesDiffer = input.buyCurrency !== input.sellCurrency;

  if (currenciesDiffer && !input.fxRate) {
    return {
      ok: false,
      error: "fx_rate_required",
      buyCurrency: input.buyCurrency,
      sellCurrency: input.sellCurrency,
    };
  }

  const buyCostTicksRaw = parseTicks(input.buyCost);

  let buyCostInSellCurrencyTicks: bigint;
  let fxSource: string | undefined;

  if (currenciesDiffer && input.fxRate) {
    const rateTicks = parseTicks(input.fxRate.rate);
    buyCostInSellCurrencyTicks = multiply(buyCostTicksRaw, rateTicks);
    fxSource = input.fxRate.source;
  } else {
    buyCostInSellCurrencyTicks = buyCostTicksRaw;
  }

  let sellPriceTicks: bigint;

  if (input.sellPriceIsOverride) {
    if (input.overrideSellPrice === undefined) {
      throw new Error(
        "computeTradingPriceLine: overrideSellPrice is required when sellPriceIsOverride is true",
      );
    }
    // Override wins outright; the margin_type/margin_value formula below is
    // display-only context and is never used to re-derive sellPrice here
    // (design.md §5).
    sellPriceTicks = parseTicks(input.overrideSellPrice);
  } else if (input.marginType === "percentage") {
    const marginValueTicks = parseTicks(input.marginValue);
    const marginFraction = divide(marginValueTicks, ONE_HUNDRED_TICKS);
    const markup = multiply(buyCostInSellCurrencyTicks, marginFraction);
    sellPriceTicks = buyCostInSellCurrencyTicks + markup;
  } else {
    // margin_type = 'fixed_amount': marginValue is a flat amount in sellCurrency.
    const marginValueTicks = parseTicks(input.marginValue);
    sellPriceTicks = buyCostInSellCurrencyTicks + marginValueTicks;
  }

  const marginAmountTicks = sellPriceTicks - buyCostInSellCurrencyTicks;
  const marginPctTicks = divide(marginAmountTicks, sellPriceTicks);

  return {
    ok: true,
    buyCost: formatOutput(buyCostInSellCurrencyTicks),
    sellPrice: formatOutput(sellPriceTicks),
    marginAmount: formatOutput(marginAmountTicks),
    marginPct: formatOutput(marginPctTicks),
    currency: input.sellCurrency,
    ...(fxSource !== undefined ? { fxSource } : {}),
  };
}
