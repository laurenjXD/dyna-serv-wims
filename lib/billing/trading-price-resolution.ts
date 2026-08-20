// Server-only Trading price resolution — resolves the active
// `trading_policies` row for a (customer_party_id, item_id) pair.
//
// Traceability:
//   specs/13-trading-orders-and-pricing/requirements.md
//     R2.1 — "the system resolves the active trading_policies row for
//             (customer_party_id, item_id). Missing row -> block, per §2."
//   specs/13-trading-orders-and-pricing/design.md
//     §2 — trading_policies: "One active row per (party, item); prior rows
//          are deactivated, not deleted, when a policy is revised, so
//          historical sales remain traceable to the policy that produced
//          them."
//     §4 — "13 looks up active trading_policies WHERE party_id = customer
//          AND item_id = item ... not found: reject with a clear error
//          naming the missing (customer, item) pair."
//   specs/13-trading-orders-and-pricing/tasks.md Task 4, bullet 2.
//
// Pattern mirrored (explicitly instructed): lib/billing/vmi-daily-balance.ts's
// resolveContractTermsForDate — same effective-dated-version-history lookup
// shape (`effective_from <= X AND (effective_to IS NULL OR effective_to > X)`,
// never "the current/latest row"), applied to trading_policies instead of
// vmi_contract_terms, with an added party+item pair-matching dimension.
//
// This function is pure — no DB access. It deliberately does NOT filter on
// `isActive`: like vmi_contract_terms, resolution is purely a function of
// which version's effective-dated window covers `now`, so a version that
// was later deactivated when superseded is still the correct row to return
// when resolving a HISTORICAL `now` that falls inside its own window (a
// deactivated row is not the same thing as an expired one — its
// effectiveTo boundary is what actually excludes it, not the isActive
// flag). The caller passes in every row this (party, item) pair has ever
// had, not a pre-filtered "only active rows" query result.

export type TradingMarginType = "percentage" | "fixed_amount";

export type TradingPolicyRow = {
  id: string;
  partyId: string;
  itemId: string;
  buyCost: string;
  buyCurrency: string;
  marginType: TradingMarginType;
  marginValue: string;
  sellPrice: string;
  sellPriceIsOverride: boolean;
  sellCurrency: string;
  fxSource: string | null;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type ResolveTradingPolicyResult =
  | { ok: true; policy: TradingPolicyRow }
  | { ok: false; error: "no_rate_configured"; partyId: string; itemId: string };

/**
 * Resolves whichever `trading_policies` version is effective for the given
 * (partyId, itemId) pair at `now`:
 *
 *   WHERE party_id = partyId AND item_id = itemId
 *     AND effective_from <= now
 *     AND (effective_to IS NULL OR effective_to > now)
 *
 * Rows for other (party, item) pairs never match. `effective_to` is an
 * exclusive upper bound (a row is not effective AT its own effective_to
 * instant). Returns a clean `no_rate_configured` rejection naming the
 * REQUESTED pair (never some other row's pair present in the input array)
 * when no row's window covers `now`.
 */
export function resolveActiveTradingPolicy(
  policies: TradingPolicyRow[],
  partyId: string,
  itemId: string,
  now: Date = new Date(),
): ResolveTradingPolicyResult {
  const nowMs = now.getTime();

  for (const policy of policies) {
    if (policy.partyId !== partyId || policy.itemId !== itemId) continue;

    const startsOnOrBefore = policy.effectiveFrom.getTime() <= nowMs;
    const endsAfter =
      policy.effectiveTo === null || policy.effectiveTo.getTime() > nowMs;

    if (startsOnOrBefore && endsAfter) {
      return { ok: true, policy };
    }
  }

  return { ok: false, error: "no_rate_configured", partyId, itemId };
}
