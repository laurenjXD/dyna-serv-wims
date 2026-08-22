// RED-step unit tests for lib/billing/trading-price-resolution.ts (does not
// exist yet — Task 4, bullet 2: "Implement server-only price resolution:
// given (customer_party_id, item_id), find the active trading_policies row
// or reject with a clear 'no rate configured' error naming both party and
// item.")
//
// Traceability:
//   specs/13-trading-orders-and-pricing/requirements.md
//     R2.1 — "the system resolves the active trading_policies row for
//             (customer_party_id, item_id). Missing row -> block, per §2."
//     §2 — "No configured rate card, no sale. If no active trading_policies
//           row exists for a given (customer, item) pair, pick-list
//           generation for that line blocks ... never a silent fallback to
//           items.selling_price."
//   specs/13-trading-orders-and-pricing/design.md
//     §2 — trading_policies: "One active row per (party, item); prior rows
//          are deactivated, not deleted, when a policy is revised, so
//          historical sales remain traceable to the policy that produced
//          them." isActive/effectiveFrom/effectiveTo shape.
//     §4 — "13 looks up active trading_policies WHERE party_id = customer
//          AND item_id = item ... not found: reject with a clear error
//          naming the missing (customer, item) pair."
//   specs/13-trading-orders-and-pricing/tasks.md Task 4, bullet 2.
//
// Pattern mirrored (explicitly instructed): lib/billing/vmi-daily-balance.ts's
// resolveContractTermsForDate — same effective-dated-version-history lookup
// shape (`effective_from <= X AND (effective_to IS NULL OR effective_to > X)`,
// never "the current/latest row"), applied to trading_policies instead of
// vmi_contract_terms, with the added party+item pair-matching dimension that
// vmi_contract_terms doesn't need (it's already scoped to a single party by
// its caller — trading_policies is keyed on (party_id, item_id) together,
// design.md §2).
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/trading-price-resolution.ts
// (for backend-builder):
//
//   export type TradingPolicyRow = {
//     id: string;
//     partyId: string;
//     itemId: string;
//     buyCost: string;
//     buyCurrency: string;
//     marginType: "percentage" | "fixed_amount";
//     marginValue: string;
//     sellPrice: string;
//     sellPriceIsOverride: boolean;
//     sellCurrency: string;
//     fxSource: string | null;
//     isActive: boolean;
//     effectiveFrom: Date;
//     effectiveTo: Date | null;
//   };
//
//   export type ResolveTradingPolicyResult =
//     | { ok: true; policy: TradingPolicyRow }
//     | { ok: false; error: "no_rate_configured"; partyId: string; itemId: string };
//
//   // `policies` may contain rows for OTHER (party, item) pairs and OTHER
//   // historical versions of the SAME pair — this function does the full
//   // filter+resolve, not just the effective-date part, mirroring how a
//   // caller would pass in "every trading_policies row this party/item pair
//   // has ever had" (design.md §2's "prior rows are deactivated, not
//   // deleted") rather than a pre-filtered single-pair query result.
//   export function resolveActiveTradingPolicy(
//     policies: TradingPolicyRow[],
//     partyId: string,
//     itemId: string,
//     now?: Date,
//   ): ResolveTradingPolicyResult;
//
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { resolveActiveTradingPolicy } from "../trading-price-resolution";
import type { TradingPolicyRow } from "../trading-price-resolution";

const PARTY_A = "party-uuid-customer-a";
const ITEM_A = "item-uuid-1";
const PARTY_B = "party-uuid-customer-b";
const ITEM_B = "item-uuid-2";

function policyRow(overrides: Partial<TradingPolicyRow> = {}): TradingPolicyRow {
  return {
    id: "policy-uuid-1",
    partyId: PARTY_A,
    itemId: ITEM_A,
    buyCost: "100.0000",
    buyCurrency: "USD",
    marginType: "percentage",
    marginValue: "20.0000",
    sellPrice: "120.0000",
    sellPriceIsOverride: false,
    sellCurrency: "USD",
    fxSource: null,
    isActive: true,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    ...overrides,
  };
}

const NOW = new Date("2026-08-20T12:00:00Z");

describe("resolveActiveTradingPolicy — active policy resolution (R2.1, design.md §4)", () => {
  it("(AC: found active row -> ok:true with that policy) resolves the single active, currently-effective row for the (party, item) pair", () => {
    const policy = policyRow();
    const result = resolveActiveTradingPolicy(
      [policy],
      PARTY_A,
      ITEM_A,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy.id).toBe(policy.id);
      expect(result.policy.partyId).toBe(PARTY_A);
      expect(result.policy.itemId).toBe(ITEM_A);
    }
  });

  it("(AC: version history -> only the version effective on `now` is returned, never 'the latest row') picks the superseded version when `now` falls in its window, mirroring vmi_contract_terms' effective-dated lookup", () => {
    const supersededV1 = policyRow({
      id: "policy-uuid-v1",
      buyCost: "90.0000",
      isActive: false, // deactivated when v2 was created
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: new Date("2026-06-01T00:00:00Z"),
    });
    const currentV2 = policyRow({
      id: "policy-uuid-v2",
      buyCost: "110.0000",
      isActive: true,
      effectiveFrom: new Date("2026-06-01T00:00:00Z"),
      effectiveTo: null,
    });

    const asOfMarch = resolveActiveTradingPolicy(
      [supersededV1, currentV2],
      PARTY_A,
      ITEM_A,
      new Date("2026-03-15T00:00:00Z"),
    );
    expect(asOfMarch.ok).toBe(true);
    if (asOfMarch.ok) expect(asOfMarch.policy.id).toBe("policy-uuid-v1");

    const asOfAugust = resolveActiveTradingPolicy(
      [supersededV1, currentV2],
      PARTY_A,
      ITEM_A,
      NOW,
    );
    expect(asOfAugust.ok).toBe(true);
    if (asOfAugust.ok) expect(asOfAugust.policy.id).toBe("policy-uuid-v2");
  });

  it("(AC: rows for a different item or a different party never match) ignores policy rows for other (party, item) pairs even when active and effective", () => {
    const wrongItem = policyRow({ id: "policy-wrong-item", itemId: ITEM_B });
    const wrongParty = policyRow({ id: "policy-wrong-party", partyId: PARTY_B });
    const correct = policyRow({ id: "policy-correct" });

    const result = resolveActiveTradingPolicy(
      [wrongItem, wrongParty, correct],
      PARTY_A,
      ITEM_A,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.policy.id).toBe("policy-correct");
  });

  it("(AC: effectiveTo is exclusive at the boundary) excludes a row whose effectiveTo exactly equals `now`", () => {
    const expiredAtNow = policyRow({
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: NOW,
    });

    const result = resolveActiveTradingPolicy(
      [expiredAtNow],
      PARTY_A,
      ITEM_A,
      NOW,
    );

    expect(result.ok).toBe(false);
  });
});

describe("resolveActiveTradingPolicy — missing rate card (§2, R2.1, design.md §4)", () => {
  it("(AC: no matching row at all -> clean rejection naming BOTH party and item, never a generic error) returns { ok: false, error: 'no_rate_configured', partyId, itemId }", () => {
    const result = resolveActiveTradingPolicy([], PARTY_A, ITEM_A, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("no_rate_configured");
      expect(result.partyId).toBe(PARTY_A);
      expect(result.itemId).toBe(ITEM_A);
    }
  });

  it("(AC: an isActive=false row with no active successor is treated as no rate configured) returns no_rate_configured when every row for the pair is inactive", () => {
    const deactivated = policyRow({ isActive: false, effectiveTo: new Date("2026-02-01T00:00:00Z") });

    const result = resolveActiveTradingPolicy(
      [deactivated],
      PARTY_A,
      ITEM_A,
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("no_rate_configured");
      expect(result.partyId).toBe(PARTY_A);
      expect(result.itemId).toBe(ITEM_A);
    }
  });

  it("(AC: a row that hasn't started yet is not active) returns no_rate_configured when the only row's effectiveFrom is in the future relative to `now`", () => {
    const notYetEffective = policyRow({
      effectiveFrom: new Date("2027-01-01T00:00:00Z"),
      effectiveTo: null,
    });

    const result = resolveActiveTradingPolicy(
      [notYetEffective],
      PARTY_A,
      ITEM_A,
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("no_rate_configured");
    }
  });

  it("(AC: rejection names the REQUESTED pair, not some other row's pair present in the input array) still names the requested (party, item) even when unrelated rows exist for other pairs", () => {
    const unrelated = policyRow({ id: "policy-other-pair", partyId: PARTY_B, itemId: ITEM_B });

    const result = resolveActiveTradingPolicy(
      [unrelated],
      PARTY_A,
      ITEM_A,
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.partyId).toBe(PARTY_A);
      expect(result.itemId).toBe(ITEM_A);
    }
  });
});
