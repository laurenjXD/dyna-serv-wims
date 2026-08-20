# Trading Pricing — Design

Status: Approved
Updated: 2026-08-19 (Full rewrite — see `requirements.md` header for what this supersedes and why)

## 1. Design intent

Trading Pricing is a **rate card**, not an order-lifecycle system. The commercial decision (what a customer pays for an item) is made once, ahead of time, per `(customer, item)` pair, and simply gets looked up and frozen at the moment a pick list is generated for a Trading-flow line. This removes an entire pre-commitment order stage (`price_quote_requested → price_set/ready → committed`) that `08` never actually needed — `08`'s existing Stock View → pick-list-generation flow is already the single operational trigger for outbound Trading movement; this spec supplies the price that flow consumes, not a parallel entry point.

All list/table views in this feature consume the **Shared Table-Action and Filter/Search Contract** in `05-ui-shell-and-navigation` §8.

## 2. Foundational dependencies and source tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, `revision-log.md`.
- `01-core-data-model` for parties/items/lots/flow partitions and `inventory_transactions` (the purchase-side ingestion target, see §4).
- `02-rbac-roles` for capabilities, RLS, audit.
- `03-offline-mode-and-client-storage` for the Tier 2 online-only boundary.
- `04-services-and-infrastructure` for Auth, runtime, idempotency, monitoring.
- `05-ui-shell-and-navigation` for office shell.
- `06-party-and-item-enrollment` for master party/item references.
- `08-outgoing-withdrawal-and-two-stage-commitment` — the pick-list generation flow this spec's price resolution plugs into (§4).
- `10-pick-list-and-acknowledgement-receipt` for the frozen snapshot's document consumption.
- `12-vmi-billing` for the boundary confirming this spec never touches VMI period billing.

### Core tables/read models

| Source | Use | Ownership |
| --- | --- | --- |
| `parties` | Customer scope for `trading_policies`. | `06` master data; RBAC/RLS governs access. |
| `items` | Item identity, UOM/SPQ. `items.buying_price`/`selling_price` remain reference-only, never a final cost/price basis. | `06`/core master data. |
| `lots`, `inventory_transactions` | Trading flow/availability context consumed by `08`; purchase-side ingestion target for supplier invoices (§4). | Core/08 inventory boundary. |
| `pick_lists`/`pick_list_items`/`acknowledgement_receipt` | Final committed operational linkage and document price snapshot. | `08`/`10` own physical workflow and documents; `13` supplies the price contract. |
| `forex_rates` | Currency conversion when buy/sell currencies differ. | Core/finance owner. |

### Trading-owned persistence

```typescript
// lib/db/schema/trading_pricing.ts

import { pgTable, uuid, varchar, decimal, boolean, text, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { parties } from "./parties";
import { items } from "./items";

export const tradingMarginTypeEnum = pgEnum("trading_margin_type", ["percentage", "fixed_amount"]);

// R1 — the rate card. One active row per (party, item); prior rows are
// deactivated, not deleted, when a policy is revised, so historical sales
// remain traceable to the policy that produced them.
export const tradingPolicies = pgTable("trading_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id).notNull(), // customer
  itemId: uuid("item_id").references(() => items.id).notNull(),

  buyCost: decimal("buy_cost", { precision: 12, scale: 4 }).notNull(),
  buyCurrency: varchar("buy_currency", { length: 3 }).notNull().default("USD"),

  marginType: tradingMarginTypeEnum("margin_type").notNull(),
  marginValue: decimal("margin_value", { precision: 10, scale: 4 }).notNull(), // e.g. 15.00 (%) or a flat $/unit

  // Derived by default (buy_cost adjusted by margin); a trading.price_set
  // holder may override directly — sellPriceIsOverride distinguishes the two
  // for audit/display, never silently blurred together.
  sellPrice: decimal("sell_price", { precision: 12, scale: 4 }).notNull(),
  sellPriceIsOverride: boolean("sell_price_is_override").default(false).notNull(),
  sellCurrency: varchar("sell_currency", { length: 3 }).notNull().default("PHP"),
  fxSource: varchar("fx_source", { length: 50 }), // required when buyCurrency != sellCurrency

  isActive: boolean("is_active").default(true).notNull(),
  effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
  effectiveTo: timestamp("effective_to"), // set when superseded, never deleted

  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Only one currently-active policy per (party, item) — enforced at the
  // application layer on write (isActive transition), not a DB partial
  // unique index, matching this project's established preference for
  // application-layer enforcement of "one active X" invariants where a
  // partial index would need conditional logic beyond a plain UNIQUE.
}));

export const tradingInvoiceDirectionEnum = pgEnum("trading_invoice_direction", ["purchase", "sale"]);

// R2/R3 — the frozen transaction record. direction='purchase' rows come from
// supplier invoice import (§4); direction='sale' rows are the frozen price
// snapshot handed to 08/10.
export const tradingInvoiceLines = pgTable("trading_invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  direction: tradingInvoiceDirectionEnum("direction").notNull(),

  // Sale rows: FK to the pick_list_item this price was frozen for.
  // Purchase rows: null (no pick-list exists yet for an inbound purchase).
  pickListItemId: uuid("pick_list_item_id"),
  // Purchase rows: the supplier's own invoice number (e.g. 'PR260026P').
  // Sale rows: null.
  supplierInvoiceRef: varchar("supplier_invoice_ref", { length: 100 }),

  partyId: uuid("party_id").references(() => parties.id).notNull(), // customer (sale) or supplier (purchase)
  itemId: uuid("item_id").references(() => items.id).notNull(),
  qty: decimal("qty", { precision: 12, scale: 4 }).notNull(),

  // Snapshotted from trading_policies at freeze time — never recomputed if
  // the policy later changes.
  buyCost: decimal("buy_cost", { precision: 12, scale: 4 }).notNull(),
  sellPrice: decimal("sell_price", { precision: 12, scale: 4 }), // null for purchase rows
  marginAmount: decimal("margin_amount", { precision: 14, scale: 4 }), // null for purchase rows

  currency: varchar("currency", { length: 3 }).notNull(),
  sourcePolicyId: uuid("source_policy_id").references(() => tradingPolicies.id), // null for purchase rows
  snapshotHash: varchar("snapshot_hash", { length: 64 }).notNull(), // SHA-256 of the line data

  hsCode: varchar("hs_code", { length: 20 }),
  lockedAt: timestamp("locked_at").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

## 3. Pricing contract

The finalized server contract consumed by `08` and `10`:

```typescript
type TradingPriceSnapshot = {
  trading_invoice_line_id: string
  pick_list_item_id: string
  item_id: string
  party_id: string          // customer
  buy_cost: string           // decimal string, never float
  sell_price: string
  margin_amount: string      // internal only — see §5 projection rule
  currency: 'PHP' | 'USD'
  snapshot_hash: string      // SHA-256
  locked_at: string          // ISO 8601
}
```

Guarantees:
- All monetary values are decimal strings; floating-point types are forbidden for price fields.
- `snapshot_hash` detects any post-freeze mutation attempt.
- Internal `buy_cost`/`margin_amount` are never included in a customer-facing projection of this type — see §5.
- Immutable after `locked_at`; a later price correction creates a new `trading_invoice_lines` row, never edits history.

**Integration rules:**
- `08` retrieves this snapshot via a server-side query keyed on the `pick_list_item_id` it is about to commit, at Stage 1. It never recomputes prices. A missing or hash-mismatched snapshot causes `08` to reject the pick-list generation request.
- `10` embeds the same snapshot verbatim in the generated `pick_list` and `acknowledgement_receipt`. `snapshot_hash` is stored on the document artifact for tamper detection.

## 4. Price resolution and purchase-side ingestion

```text
Sale (price resolution, plugs into 08's existing pick-list generation):
  08 Stock View → operator selects Trading-flow item + customer + qty
    → 13 looks up active trading_policies WHERE party_id = customer AND item_id = item
    → found: freeze into trading_invoice_lines (direction='sale'), compute
        snapshot_hash, return TradingPriceSnapshot to 08
    → not found: reject with a clear error naming the missing (customer, item)
        pair; a trading.price_set holder must create a trading_policies row
        (or an explicit one-off override, trading.price_override + reason)
        before generation can proceed. No default price is ever applied.
  08 Stage 1 commitment proceeds only with a valid snapshot.

Purchase (ingestion, independent of any sale):
  Supplier commercial invoice (item code, customer part number, unit price,
  qty, currency) → parsed line-by-line
    → IN inventory_transactions row, flow_type='trading'
    → trading_invoice_lines row, direction='purchase', supplier_invoice_ref
        = the invoice number, buy_cost = unit_price, sell_price = null
  This does not itself set or change any trading_policies row — a
  trading.price_set holder decides whether/how a new purchase informs the
  standing rate card, the same "never auto-apply" boundary as everywhere
  else in this spec.
```

`13` does not allocate lots or change inventory — that remains `08`'s job entirely. If `08` fails allocation after a snapshot is frozen, the snapshot stays historical; nothing is silently repriced on retry.

## 5. Margin, currency, and commercial rules

- **Price authority**: `trading.price_set` required to create/edit a `trading_policies` row or override a resolved price. `items.selling_price`/`items.buying_price` are reference data only, never auto-applied.
- **Margin formula**: `sell_price = buy_cost + (buy_cost × margin_value/100)` for `margin_type = 'percentage'`, or `buy_cost + margin_value` for `'fixed_amount'` — unless `sell_price_is_override = true`, in which case the stored value is authoritative and the formula is display-only context.
- **Margin visibility**: `buy_cost`, `margin_amount`, and margin % are visible only to `trading.margin_view` (Administrator & Supervisor). A caller with `reporting.financial_read` but not `trading.margin_view` sees price/amount columns only, with cost/margin columns omitted entirely — not nulled — from any response, matching this project's established financial-projection pattern (`01` §3 item 4, `16` FR-2.4).
- **Currency**: `buy_currency`/`sell_currency` independently configurable per policy (evidenced: buy in USD from a supplier, sell in PHP to a customer). `fx_source` required when they differ; forex sourced from `forex_rates`, locked at freeze time. Missing rate blocks the freeze.
- **Overrides**: `trading.price_override` plus a mandatory written reason, appended to an immutable audit log.
- **Deferred to v2**: customer-submitted orders (there was never an order UI to begin with in this model), freight surcharges, minimum margin floors, Supplies shared document pricing.

## 6. Authorization and RLS

```text
server Auth session
  → current capability + party/flow scope
  → resolve trading_policies for (customer, item)
  → freeze trading_invoice_lines
```

Capability vocabulary (final identifiers owned by `02`): `trading_policies.read`, `trading_policies.manage` (= `price_set`), `trading_prices.read_internal` (= `margin_view`), `trading_prices.override`.

Organization users may see their own scoped sale price/amount only (via `22-parties-portal`), never `trading_policies`, `buy_cost`, or margin. RLS is default deny.

## 7. UI and shell integration

```text
app/(authenticated)/
  billing-pricing/
    trading/
      page.tsx                        # rate-card list + Trading Pricing & Margin Ledger tab
      policies/[partyId]/[itemId]/edit/page.tsx   # trading_policies create/edit
```

No `orders/` routes exist in this feature — removed entirely from the prior design.

### 7a. Trading Pricing & Margin Ledger

Unchanged in shape from the prior design's already-approved intent: one row per dispatched sale, computed on read (a query/view, not a stored table):

| DATE | ITEM | QTY | UNIT COST | UNIT PRICE | AMOUNT | COST AMOUNT | MARGIN | MARGIN % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dispatch timestamp (`08` Stage 2, via the dispatched `inventory_transactions` row's `pick_list_id`) | `items.name`/`code` | `trading_invoice_lines.qty` | `buy_cost` | `sell_price` | QTY × UNIT PRICE | QTY × UNIT COST | AMOUNT − COST AMOUNT | MARGIN / AMOUNT |

Sourced directly from `trading_invoice_lines WHERE direction = 'sale'` — no `trading_order_items` join, since that table no longer exists.

Office-only, gated `reporting.financial_read`. `UNIT COST`, `COST AMOUNT`, `MARGIN`, `MARGIN %` additionally require `trading.margin_view`, omitted (not nulled) without it. Date-range filterable, defaults to the current month, item/party filterable.

## 8. Offline, Realtime, and infrastructure integration

No `trading_policies` write or price freeze is Tier 1. Cached price/policy reads may be bounded and scope-safe but cannot create or freeze a price. A forex provider outage blocks new freezes for cross-currency pairs; it must not silently use a stale or unknown rate.

## 9. Integration contracts

- `08` retrieves the `TradingPriceSnapshot` via a server-side query keyed on `pick_list_item_id` before Stage 1 commitment; rejects a missing, stale, or hash-mismatched snapshot; never recomputes prices.
- `10` embeds the same snapshot verbatim in `pick_list` and `acknowledgement_receipt`; stores `snapshot_hash` for tamper detection.
- `12` remains solely authoritative for VMI period billing; this spec never touches it.
