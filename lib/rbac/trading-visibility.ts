// Pure capability-check helper, extracted from lib/actions/trading-pricing.ts
// so it can be imported by non-Server-Action modules (e.g.
// lib/billing/queries/trading-margin.ts, the /billing-pricing page) without
// tripping Next.js's "every export of a 'use server' file must be an async
// Server Action" rule.
//
// specs/13-trading-orders-and-pricing/design.md §5/§7a — margin visibility:
// gates on trading_prices.read_internal (= trading.margin_view) OR
// trading_prices.override. Per supabase/migrations/0038_trading_pricing_rbac_capabilities.sql,
// these two capabilities are always co-granted to the same two roles
// (supervisor, administrator) and never granted independently in this
// codebase's seed data — a caller authorized to override a resolved sell
// price is, by construction, always also authorized to view the cost/margin
// it is priced against.

import type { AuthorizationContext } from "@/lib/rbac/session";

export function hasTradingPriceInternalVisibility(context: AuthorizationContext): boolean {
  return context.grants.some(
    (grant) =>
      grant.resource === "trading_prices" &&
      (grant.action === "read_internal" || grant.action === "override"),
  );
}
