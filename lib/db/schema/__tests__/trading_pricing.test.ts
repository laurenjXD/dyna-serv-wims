// RED-step schema tests for lib/db/schema/trading_pricing.ts
// Traceability:
//   - specs/13-trading-orders-and-pricing/requirements.md R1 (trading_policies
//     rate card), R2 (frozen trading_invoice_lines sale snapshot, Acceptance
//     Criterion 3), R3 (purchase-side ingestion, trading_invoice_lines
//     direction='purchase').
//   - specs/13-trading-orders-and-pricing/design.md §2 (exact column
//     definitions for `trading_policies` / `trading_invoice_lines`) and §3
//     (the `TradingPriceSnapshot` contract's decimal-string/precision
//     guarantees — "floating-point types are forbidden for price fields").
//   - specs/13-trading-orders-and-pricing/tasks.md Task 2 ("Define data,
//     snapshot, and audit model"), including the "one active policy per
//     (party_id, item_id)" invariant, which design.md §2 states explicitly
//     is application-layer enforced on write (isActive transition), NOT a DB
//     partial unique index — this file tests the schema-level shape that
//     supports that invariant (isActive/effectiveFrom/effectiveTo, and the
//     absence of a bare (party_id, item_id) DB uniqueness constraint), not
//     the write-time enforcement logic itself (that belongs to Task 4's
//     price-resolution engine, not this data-model task).
//
// Neither `lib/db/schema/trading_pricing.ts` nor its re-export from
// `lib/db/schema/index.ts` exists yet — this is the RED step.
import { describe, expect, it } from "vitest";
import {
  column,
  hasColumn,
  referencesTable,
  tableName,
  uniqueConstraints,
} from "./helpers";

describe("trading_pricing.ts — trading enums (design.md §2)", () => {
  it("exports tradingMarginTypeEnum with 'percentage' | 'fixed_amount'", async () => {
    const { tradingMarginTypeEnum } = await import("../trading_pricing");
    expect(tradingMarginTypeEnum.enumValues).toEqual([
      "percentage",
      "fixed_amount",
    ]);
  });

  it("exports tradingInvoiceDirectionEnum with 'purchase' | 'sale'", async () => {
    const { tradingInvoiceDirectionEnum } = await import(
      "../trading_pricing"
    );
    expect(tradingInvoiceDirectionEnum.enumValues).toEqual([
      "purchase",
      "sale",
    ]);
  });
});

describe("trading_pricing.ts — trading_policies table (R1, tasks.md Task 2)", () => {
  it("is named 'trading_policies'", async () => {
    const { tradingPolicies } = await import("../trading_pricing");
    expect(tableName(tradingPolicies)).toBe("trading_policies");
  });

  it("has partyId notNull referencing parties.id (the customer)", async () => {
    const { tradingPolicies } = await import("../trading_pricing");
    expect(column(tradingPolicies, "partyId").notNull).toBe(true);
    expect(
      referencesTable(tradingPolicies, "party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has itemId notNull referencing items.id", async () => {
    const { tradingPolicies } = await import("../trading_pricing");
    expect(column(tradingPolicies, "itemId").notNull).toBe(true);
    expect(referencesTable(tradingPolicies, "item_id", "items", "id")).toBe(
      true,
    );
  });

  it("has buyCost notNull decimal(12,4) and buyCurrency notNull default 'USD'", async () => {
    const { tradingPolicies } = await import("../trading_pricing");
    const buyCost = column(tradingPolicies, "buyCost");
    expect(buyCost.notNull).toBe(true);
    expect(buyCost.precision).toBe(12);
    expect(buyCost.scale).toBe(4);

    const buyCurrency = column(tradingPolicies, "buyCurrency");
    expect(buyCurrency.notNull).toBe(true);
    expect(buyCurrency.hasDefault).toBe(true);
    expect(buyCurrency.default).toBe("USD");
  });

  it("has marginType notNull typed as tradingMarginTypeEnum", async () => {
    const { tradingPolicies } = await import("../trading_pricing");
    const marginType = column(tradingPolicies, "marginType");
    expect(marginType.notNull).toBe(true);
    expect(marginType.enumValues).toEqual(["percentage", "fixed_amount"]);
  });

  it("has marginValue notNull decimal(10,4)", async () => {
    const { tradingPolicies } = await import("../trading_pricing");
    const marginValue = column(tradingPolicies, "marginValue");
    expect(marginValue.notNull).toBe(true);
    expect(marginValue.precision).toBe(10);
    expect(marginValue.scale).toBe(4);
  });

  it("has sellPrice notNull decimal(12,4), sellPriceIsOverride notNull default false, sellCurrency notNull default 'PHP'", async () => {
    const { tradingPolicies } = await import("../trading_pricing");
    const sellPrice = column(tradingPolicies, "sellPrice");
    expect(sellPrice.notNull).toBe(true);
    expect(sellPrice.precision).toBe(12);
    expect(sellPrice.scale).toBe(4);

    const sellPriceIsOverride = column(tradingPolicies, "sellPriceIsOverride");
    expect(sellPriceIsOverride.notNull).toBe(true);
    expect(sellPriceIsOverride.hasDefault).toBe(true);
    expect(sellPriceIsOverride.default).toBe(false);

    const sellCurrency = column(tradingPolicies, "sellCurrency");
    expect(sellCurrency.notNull).toBe(true);
    expect(sellCurrency.hasDefault).toBe(true);
    expect(sellCurrency.default).toBe("PHP");
  });

  it("has fxSource nullable (required only when buy/sell currencies differ, enforced app-layer per design.md §5)", async () => {
    const { tradingPolicies } = await import("../trading_pricing");
    expect(hasColumn(tradingPolicies, "fxSource")).toBe(true);
    expect(column(tradingPolicies, "fxSource").notNull).toBe(false);
  });

  it("has isActive notNull default true, effectiveFrom notNull default now, effectiveTo nullable — the columns the app-layer 'one active policy per (party, item)' invariant is enforced against (design.md §2 comment: not a DB partial unique index)", async () => {
    const { tradingPolicies } = await import("../trading_pricing");

    const isActive = column(tradingPolicies, "isActive");
    expect(isActive.notNull).toBe(true);
    expect(isActive.hasDefault).toBe(true);
    expect(isActive.default).toBe(true);

    const effectiveFrom = column(tradingPolicies, "effectiveFrom");
    expect(effectiveFrom.notNull).toBe(true);
    expect(effectiveFrom.hasDefault).toBe(true);

    const effectiveTo = column(tradingPolicies, "effectiveTo");
    expect(effectiveTo.notNull).toBe(false);
  });

  it("does NOT declare a bare (party_id, item_id) DB unique constraint — the invariant is application-layer only, per design.md §2's explicit comment", async () => {
    const { tradingPolicies } = await import("../trading_pricing");
    const uniques = uniqueConstraints(tradingPolicies).map((cols) =>
      [...cols].sort(),
    );
    expect(uniques).not.toContainEqual(["item_id", "party_id"]);
  });

  it("has createdByUserId as notNull", async () => {
    const { tradingPolicies } = await import("../trading_pricing");
    expect(column(tradingPolicies, "createdByUserId").notNull).toBe(true);
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { tradingPolicies } = await import("../trading_pricing");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(tradingPolicies, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});

describe("trading_pricing.ts — trading_invoice_lines table (R2, R3, design.md §3 TradingPriceSnapshot contract)", () => {
  it("is named 'trading_invoice_lines'", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    expect(tableName(tradingInvoiceLines)).toBe("trading_invoice_lines");
  });

  it("has direction notNull typed as tradingInvoiceDirectionEnum, covering both 'purchase' and 'sale' rows in one table", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    const direction = column(tradingInvoiceLines, "direction");
    expect(direction.notNull).toBe(true);
    expect(direction.enumValues).toEqual(["purchase", "sale"]);
  });

  it("has pickListItemId nullable referencing pick_list_items.id (populated on sale rows only)", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    expect(hasColumn(tradingInvoiceLines, "pickListItemId")).toBe(true);
    expect(column(tradingInvoiceLines, "pickListItemId").notNull).toBe(false);
    expect(
      referencesTable(
        tradingInvoiceLines,
        "pick_list_item_id",
        "pick_list_items",
        "id",
      ),
    ).toBe(true);
  });

  it("has supplierInvoiceRef nullable varchar(100) (populated on purchase rows only)", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    const supplierInvoiceRef = column(
      tradingInvoiceLines,
      "supplierInvoiceRef",
    );
    expect(supplierInvoiceRef.notNull).toBe(false);
    expect(supplierInvoiceRef.length).toBe(100);
  });

  it("has partyId notNull referencing parties.id (customer on sale rows, supplier on purchase rows)", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    expect(column(tradingInvoiceLines, "partyId").notNull).toBe(true);
    expect(
      referencesTable(tradingInvoiceLines, "party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has itemId notNull referencing items.id", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    expect(column(tradingInvoiceLines, "itemId").notNull).toBe(true);
    expect(
      referencesTable(tradingInvoiceLines, "item_id", "items", "id"),
    ).toBe(true);
  });

  it("has qty notNull decimal(12,4)", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    const qty = column(tradingInvoiceLines, "qty");
    expect(qty.notNull).toBe(true);
    expect(qty.precision).toBe(12);
    expect(qty.scale).toBe(4);
  });

  it("has buyCost notNull decimal(12,4) — snapshotted from trading_policies at freeze time, never recomputed (design.md §2 comment)", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    const buyCost = column(tradingInvoiceLines, "buyCost");
    expect(buyCost.notNull).toBe(true);
    expect(buyCost.precision).toBe(12);
    expect(buyCost.scale).toBe(4);
  });

  it("has sellPrice nullable decimal(12,4) — null for purchase rows, populated for sale rows", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    const sellPrice = column(tradingInvoiceLines, "sellPrice");
    expect(sellPrice.notNull).toBe(false);
    expect(sellPrice.precision).toBe(12);
    expect(sellPrice.scale).toBe(4);
  });

  it("has marginAmount nullable decimal(14,4) — null for purchase rows, internal-only projection per design.md §5 (matches TradingPriceSnapshot.margin_amount)", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    const marginAmount = column(tradingInvoiceLines, "marginAmount");
    expect(marginAmount.notNull).toBe(false);
    expect(marginAmount.precision).toBe(14);
    expect(marginAmount.scale).toBe(4);
  });

  it("has currency notNull varchar(3) ('PHP' | 'USD' per the TradingPriceSnapshot contract)", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    const currency = column(tradingInvoiceLines, "currency");
    expect(currency.notNull).toBe(true);
    expect(currency.length).toBe(3);
  });

  it("has sourcePolicyId nullable referencing trading_policies.id (null for purchase rows)", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    expect(hasColumn(tradingInvoiceLines, "sourcePolicyId")).toBe(true);
    expect(column(tradingInvoiceLines, "sourcePolicyId").notNull).toBe(false);
    expect(
      referencesTable(
        tradingInvoiceLines,
        "source_policy_id",
        "trading_policies",
        "id",
      ),
    ).toBe(true);
  });

  it("has snapshotHash notNull varchar(64) — SHA-256 tamper-detection hash per design.md §3", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    const snapshotHash = column(tradingInvoiceLines, "snapshotHash");
    expect(snapshotHash.notNull).toBe(true);
    expect(snapshotHash.length).toBe(64);
  });

  it("has hsCode nullable varchar(20)", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    const hsCode = column(tradingInvoiceLines, "hsCode");
    expect(hsCode.notNull).toBe(false);
    expect(hsCode.length).toBe(20);
  });

  it("has lockedAt notNull (ISO timestamp per the TradingPriceSnapshot contract's locked_at) — no default, set explicitly at freeze time", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    const lockedAt = column(tradingInvoiceLines, "lockedAt");
    expect(lockedAt.notNull).toBe(true);
  });

  it("has createdByUserId as notNull", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    expect(column(tradingInvoiceLines, "createdByUserId").notNull).toBe(
      true,
    );
  });

  it("has createdAt notNull with default", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    const createdAt = column(tradingInvoiceLines, "createdAt");
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });

  it("has no updatedAt column — a frozen trading_invoice_lines row is never edited (design.md §3: 'Immutable after locked_at; a later price correction creates a new row, never edits history')", async () => {
    const { tradingInvoiceLines } = await import("../trading_pricing");
    expect(hasColumn(tradingInvoiceLines, "updatedAt")).toBe(false);
  });
});

describe("trading_pricing.ts — barrel re-export (this repo's lib/db/schema/index.ts convention, see its file-header comment)", () => {
  it("is re-exported from lib/db/schema/index.ts as tradingPolicies and tradingInvoiceLines", async () => {
    const schemaIndex = await import("../index");
    expect(schemaIndex.tradingPolicies).toBeDefined();
    expect(schemaIndex.tradingInvoiceLines).toBeDefined();
    expect(tableName(schemaIndex.tradingPolicies)).toBe("trading_policies");
    expect(tableName(schemaIndex.tradingInvoiceLines)).toBe(
      "trading_invoice_lines",
    );
  });
});
