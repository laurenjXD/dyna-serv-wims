// Query helpers for trading rate cards (trading_policies).
//
// Traceability:
//   specs/13-trading-orders-and-pricing/design.md §2, §7a

import { and, eq, ilike, or, desc } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { tradingPolicies } from "@/lib/db/schema/trading_pricing";
import { parties } from "@/lib/db/schema/parties";
import { items } from "@/lib/db/schema/items";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DbLike = { select: (...args: any[]) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

export type TradingPolicyRow = {
  id: string;
  partyId: string;
  partyName: string;
  partyCode: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  buyCost: string;
  buyCurrency: string;
  marginType: "percentage" | "fixed_amount";
  marginValue: string;
  sellPrice: string;
  sellCurrency: string;
  sellPriceIsOverride: boolean;
  fxSource: string | null;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type ListTradingPoliciesOpts = {
  search?: string | null;
  partyId?: string | null;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
};

export async function listTradingPolicies(
  db: DbLike = defaultDb,
  opts: ListTradingPoliciesOpts = {},
): Promise<{ rows: TradingPolicyRow[]; total: number }> {
  const search = opts.search?.trim() ?? null;
  const activeOnly = opts.activeOnly ?? true;

  const conditions = [];
  if (activeOnly) {
    conditions.push(eq(tradingPolicies.isActive, true));
  }
  if (opts.partyId) {
    conditions.push(eq(tradingPolicies.partyId, opts.partyId));
  }
  if (search) {
    conditions.push(
      or(
        ilike(items.code, `%${search}%`),
        ilike(items.name, `%${search}%`),
        ilike(parties.name, `%${search}%`),
        ilike(parties.code, `%${search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: tradingPolicies.id,
      partyId: tradingPolicies.partyId,
      partyName: parties.name,
      partyCode: parties.code,
      itemId: tradingPolicies.itemId,
      itemCode: items.code,
      itemName: items.name,
      buyCost: tradingPolicies.buyCost,
      buyCurrency: tradingPolicies.buyCurrency,
      marginType: tradingPolicies.marginType,
      marginValue: tradingPolicies.marginValue,
      sellPrice: tradingPolicies.sellPrice,
      sellCurrency: tradingPolicies.sellCurrency,
      sellPriceIsOverride: tradingPolicies.sellPriceIsOverride,
      fxSource: tradingPolicies.fxSource,
      isActive: tradingPolicies.isActive,
      effectiveFrom: tradingPolicies.effectiveFrom,
      effectiveTo: tradingPolicies.effectiveTo,
    })
    .from(tradingPolicies)
    .innerJoin(parties, eq(tradingPolicies.partyId, parties.id))
    .innerJoin(items, eq(tradingPolicies.itemId, items.id))
    .where(whereClause)
    .orderBy(desc(tradingPolicies.effectiveFrom));

  return {
    rows: rows as TradingPolicyRow[],
    total: rows.length,
  };
}
