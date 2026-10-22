import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { tradingInvoiceLines, tradingPolicies } from "@/lib/db/schema/trading_pricing";
import { forexRates } from "@/lib/db/schema/forex";
import {
  resolveActiveTradingPolicy,
  type TradingPolicyRow,
} from "@/lib/billing/trading-price-resolution";
import { computeTradingPriceLine } from "@/lib/billing/trading-margin-calc";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type TradingPriceFreezeDbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export type TradingPriceFreezeInput = {
  partyId: string;
  itemId: string;
  pickListItemId: string;
  qty: string;
  createdByUserId: string;
};

export type TradingPriceFreezeResult =
  | { ok: true; sellPrice: string; currency: string; snapshotHash: string }
  | { ok: false; error: "no_rate_configured" | "fx_rate_required" | "price_invalid" };

function hashSnapshot(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function invertRate(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const scale = 8;
  const ticks = BigInt(`${whole}${fraction.padEnd(scale, "0").slice(0, scale)}`);
  if (ticks === 0n) return "0.00000000";
  const inverted = (10n ** BigInt(scale * 2)) / ticks;
  const raw = inverted.toString().padStart(scale + 1, "0");
  return `${raw.slice(0, -scale)}.${raw.slice(-scale)}`;
}

function resolveForex(rows: Array<Record<string, any>>, buyCurrency: string, sellCurrency: string) {
  if (rows.length === 0) return undefined;
  const latest = rows.reduce((best, row) =>
    new Date(row.effectiveDate).getTime() > new Date(best.effectiveDate).getTime() ? row : best,
  rows[0]);
  const source = `forex_rates:${latest.source ?? "manual"}`;
  if (buyCurrency === "USD" && sellCurrency === "PHP") {
    return { rate: String(latest.usdToPhpRate), source };
  }
  if (buyCurrency === "PHP" && sellCurrency === "USD") {
    return { rate: invertRate(String(latest.usdToPhpRate)), source };
  }
  return undefined;
}

/**
 * Transaction-local Trading price handoff used by pick-list commitment.
 * This intentionally has no authorization boundary of its own: the caller's
 * server action already holds the approved pick-list capability, and the
 * transaction's RLS policies still protect both pricing tables.
 */
export async function freezeTradingPriceInTransaction(
  db: TradingPriceFreezeDbLike,
  input: TradingPriceFreezeInput,
): Promise<TradingPriceFreezeResult> {
  const policyRows = (await db
    .select()
    .from(tradingPolicies)
    .where(and(
      eq(tradingPolicies.partyId, input.partyId),
      eq(tradingPolicies.itemId, input.itemId),
    ))) as Array<Record<string, any>>;

  const policies: TradingPolicyRow[] = policyRows.map((row) => ({
    id: row.id,
    partyId: row.partyId,
    itemId: row.itemId,
    buyCost: String(row.buyCost),
    buyCurrency: String(row.buyCurrency),
    marginType: row.marginType,
    marginValue: String(row.marginValue),
    sellPrice: String(row.sellPrice),
    sellPriceIsOverride: Boolean(row.sellPriceIsOverride),
    sellCurrency: String(row.sellCurrency),
    fxSource: row.fxSource ?? null,
    isActive: Boolean(row.isActive),
    effectiveFrom: row.effectiveFrom instanceof Date ? row.effectiveFrom : new Date(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? row.effectiveTo instanceof Date ? row.effectiveTo : new Date(row.effectiveTo) : null,
  }));

  const resolved = resolveActiveTradingPolicy(policies, input.partyId, input.itemId);
  if (!resolved.ok) return { ok: false, error: "no_rate_configured" };

  let fxRate: { rate: string; source: string } | undefined;
  if (resolved.policy.buyCurrency !== resolved.policy.sellCurrency) {
    const rows = (await db.select().from(forexRates)) as Array<Record<string, any>>;
    fxRate = resolveForex(rows, resolved.policy.buyCurrency, resolved.policy.sellCurrency);
    if (!fxRate) return { ok: false, error: "fx_rate_required" };
  }

  const computed = computeTradingPriceLine({
    buyCost: resolved.policy.buyCost,
    buyCurrency: resolved.policy.buyCurrency,
    marginType: resolved.policy.marginType,
    marginValue: resolved.policy.marginValue,
    sellCurrency: resolved.policy.sellCurrency,
    sellPriceIsOverride: false,
    fxRate,
  });
  if (!computed.ok) return { ok: false, error: computed.error };

  const lockedAt = new Date();
  const snapshotHash = hashSnapshot({
    direction: "sale",
    pickListItemId: input.pickListItemId,
    partyId: input.partyId,
    itemId: input.itemId,
    qty: input.qty,
    buyCost: computed.buyCost,
    sellPrice: computed.sellPrice,
    marginAmount: computed.marginAmount,
    currency: computed.currency,
    sourcePolicyId: resolved.policy.id,
    lockedAt: lockedAt.toISOString(),
  });

  await db.insert(tradingInvoiceLines).values({
    direction: "sale",
    pickListItemId: input.pickListItemId,
    partyId: input.partyId,
    itemId: input.itemId,
    qty: input.qty,
    buyCost: computed.buyCost,
    sellPrice: computed.sellPrice,
    marginAmount: computed.marginAmount,
    currency: computed.currency,
    sourcePolicyId: resolved.policy.id,
    snapshotHash,
    lockedAt,
    createdByUserId: input.createdByUserId,
  }).returning();

  return { ok: true, sellPrice: computed.sellPrice, currency: computed.currency, snapshotHash };
}
