# Trading Pricing — Requirements

Status: Approved
Updated: 2026-08-19 (Full rewrite — replaces the `trading_orders` lifecycle with a pre-configured rate-card model. Folder/spec number `13-trading-orders-and-pricing` is kept as the stable identifier other specs already reference; "Orders" no longer describes the actual model — see below.)

Supersedes the prior `Status: Approved` version of this document in full. The prior `trading_orders` → `trading_order_items` → `trading_price_snapshots` order lifecycle is retired, not extended.

## 1. Purpose and scope

Trading Pricing governs how a price is resolved for Trading-flow stock (warehouse-owned, bought from a supplier, sold to a customer) at the moment it's picked and dispatched. **There is no separate order entity.** A price is configured ahead of time, per customer and item, as a standing rate-card row; when a pick list is generated for a Trading-flow item, the system looks up that customer+item's rate card and freezes it into an immutable, hashed snapshot before the pick list reaches `08`'s Stage 1 commitment.

It keeps warehouse-owned Trading stock and customer transactions partitioned from VMI and Supplies, and keeps `08`/`10` as the sole owners of allocation, dispatch, and document rendering — this spec supplies the frozen price they consume, and nothing else.

### Terminology Alignment

Across all user-facing pricing screens, forms, headers, and previews:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.

*(Note: `parties` and `flow_type` remain canonical database identifiers.)*

## 2. Trading Pricing Rules

- **Cost of Goods (COGS)** = `trading_policies.buy_cost`, sourced from the supplier commercial invoice (e.g. a UBoT-style import, landed at cost) or a standing contracted rate — **not** `items.buying_price`, which stays reference-only master data never used as a final cost basis. `trading_policies` is the authoritative per-(party, item) cost basis.
- **Sell Price** = `trading_policies.sell_price` — either system-derived from `buy_cost` and the configured margin rule, or manually overridden by a user holding `trading.price_set`.
- **Margin** = `sell_price − buy_cost` (or `%` = `margin / sell_price`), computed from the configured `margin_type`/`margin_value`.
- **No configured rate card, no sale.** If no active `trading_policies` row exists for a given (customer, item) pair, pick-list generation for that line blocks and requires a price to be set on the spot by a `trading.price_set` holder — never a silent fallback to `items.selling_price` or any other default.

Margin data is strictly restricted to internal users holding `trading.margin_view` (Administrator & Supervisor). Organization users in **Organization Portal** NEVER see cost, margin, or COGS fields.

## 3. Sub-Tab Architecture

Trading pricing lives as Sub-tab 2 of Billing & Pricing (`/billing-pricing`):
- **VMI Billing**: owned by `12`.
- **Trading Pricing**: rate-card management (`trading_policies` CRUD) and the Trading Pricing & Margin Ledger (one row per dispatched sale, computed on read).

## 4. Functional requirements

### R1. Rate card (`trading_policies`)

1. A `trading_policies` row is keyed by `(party_id, item_id)` — the customer and the specific item, per the resolved decision that margin can differ by item, not just by customer.
2. Each row stores `buy_cost`/`buy_currency` (the cost basis), `margin_type` (`percentage` | `fixed_amount`), `margin_value`, a derived-or-overridden `sell_price`/`sell_currency`, and `fx_source` when buy/sell currencies differ.
3. Only a user holding `trading.price_set` may create or edit a `trading_policies` row. `items.selling_price`/`items.buying_price` are never auto-applied as `sell_price`/`buy_cost`.

### R2. Price resolution at pick-list generation

1. When a pick list is generated for a Trading-flow line, the system resolves the active `trading_policies` row for `(customer_party_id, item_id)`. Missing row → block, per §2.
2. The resolved `buy_cost`, `sell_price`, and computed margin are frozen into an immutable, hashed `trading_invoice_lines` row (`direction = 'sale'`) at that moment — before `08` Stage 1 commitment, never recomputed afterward even if the underlying `trading_policies` row later changes.
3. Price overrides at resolution time require `trading.price_override` and a mandatory written reason, appended to an immutable audit log.

### R3. Purchase-side ingestion

1. A supplier commercial invoice (landed cost, per line item — item code, customer part number, unit price, qty, currency) imports as an IN movement tagged `flow_type = 'trading'` and produces a `trading_invoice_lines` row with `direction = 'purchase'`.
2. This import feeds `trading_policies.buy_cost` as a reference/starting value for that item going forward; it does not itself constitute a sale or touch margin calculations.

### R4. Visual design system & error feedback

1. UI matches the visual system already live throughout this app.
2. All pricing validation/override/missing-rate-card errors display 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**).

## 5. Acceptance criteria

- [ ] No `trading_orders` entity, status machine, or order list/detail UI exists anywhere in this feature.
- [ ] Pick-list generation for a Trading line blocks cleanly (no silent default) when no active `trading_policies` row exists for that customer+item.
- [ ] A resolved price freezes into an immutable, hashed `trading_invoice_lines` row before `08` Stage 1 commitment.
- [ ] `08`/`10` consume the frozen snapshot verbatim and never recompute a price.
- [ ] Margin (`buy_cost`, `sell_price`, margin, margin %) is visible only to `trading.margin_view` holders; Organization users never see cost/margin fields.
- [ ] User-facing UI labels use Organization, Inventory Model, and Organization Portal exclusively.
- [ ] 3-component error feedback is present on all pricing errors.
