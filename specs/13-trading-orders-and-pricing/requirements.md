# Trading Orders & Pricing — Requirements

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## 1. Purpose and scope

This feature governs Trading customer orders and price decisions that flow into outbound withdrawal, pick list, and **Delivery Receipt / Acknowledgement Receipt** documents.

It keeps warehouse-owned Trading stock and customer transactions partitioned from VMI and Supplies.

### Terminology Alignment
Across all user-facing pricing screens, forms, headers, and previews:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.

*(Note: `parties` and `flow_type` remain canonical database identifiers.)*

## 2. Trading Pricing Rules

Trading margins and pricing formulas enforce standard business rules:
- **Cost of Goods (COGS)** = `items.buying_price` (Buy Cost)
- **Selling Price** = Customer price set by user holding `trading.price_set`
- **Gross Margin** = `Selling Price - Cost of Goods`
- **Margin %** = `Gross Margin / Selling Price`

Margin data is strictly restricted to internal users holding `trading.margin_view` (Administrator & Supervisor). Organization users in **Organization Portal** NEVER see cost, margin, or COGS fields.

## 3. Sub-Tab Architecture

Trading pricing lives as Sub-tab 2 of Billing & Pricing (`/billing-pricing`):
- **VMI Billing**: Contract configuration and monthly SOA generation.
- **Trading Pricing**: Customer pricing matrix, margin calculation, and price overrides.

## 4. Functional requirements

### R1. Order creation & Inventory Model partition

1. Orders specify destination Organization and `flow_type = 'trading'`.
2. Prices are resolved and frozen into `trading_price_snapshots` prior to Stage 1 commitment in `08`.

### R2. Price resolution & Margin calculations

1. Selling price set by authorized user (`trading.price_set`).
2. Gross Margin and Margin % calculated automatically using approved formulas.
3. Overrides require `trading.price_override` and a mandatory written reason.

### R3. Visual design system & 3-component error feedback

1. Surfaces use Level 0 Cream White (`#FFF7ED`) background, Level 1 Solid White (`#FFFFFF`) cards with `#2563EB` Vibrant Blue accents, and Etna Sans Serif + Glacial Indifference typography.
2. All pricing validation/override errors display 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**).

## 5. Acceptance criteria

- [ ] Trading price snapshots are frozen before Stage 1 commitment.
- [ ] User-facing UI labels use Organization, Inventory Model, and Organization Portal exclusively.
- [ ] Margin formulas (COGS, Selling Price, Gross Margin, Margin %) calculate accurately.
- [ ] Margin data is hidden from Organization users.
- [ ] 3-component error feedback is present on all pricing errors.
