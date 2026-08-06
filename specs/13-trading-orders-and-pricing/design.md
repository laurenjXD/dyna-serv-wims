# Trading Orders & Pricing — Design

Status: Approved
Updated: 2026-08-05

## 1. Design intent

All list/table views in this feature consume the **Shared Table-Action and Filter/Search Contract** in `05-ui-shell-and-navigation` §8; this design adds only Trading-specific fields and capabilities and never replaces RLS with client filtering.

Trading pricing is an online, server-authoritative commercial boundary between a customer order and the physical withdrawal workflow. It resolves a price, freezes an auditable snapshot, and hands that snapshot to `08` for commitment and `10` for document rendering.

This design keeps Trading stock and price data separate from VMI period billing and Supplies operations. It does not let item-master defaults or client forms become final transaction truth.

## 2. Foundational dependencies and source tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, `brand-design-system.md`, and `revision-log.md`.
- `01-core-data-model` for parties/items/lots/flow partitions, core price/reference fields, pick-list linkage, and currency/forex references.
- `02-rbac-roles` for capabilities, party/flow scope, RLS, and audit.
- `03-offline-mode-and-client-storage` for the Tier 2 online-only boundary.
- `04-services-and-infrastructure` for Auth, runtime, idempotency, external/forex integrations if approved, monitoring, and jobs.
- `05-ui-shell-and-navigation` for office shell and responsive order/pricing UI.
- `06-party-and-item-enrollment` for master party/item/category references.
- `08-outgoing-withdrawal-and-two-stage-commitment` for allocation/commitment/dispatch.
- `10-pick-list-and-acknowledgement-receipt` for immutable document snapshots and artifacts.
- `12-vmi-billing` for the boundary that prevents document reference price from becoming the VMI bill.

### Core tables/read models

| Source | Use | Ownership |
| --- | --- | --- |
| `parties` | Customer/end-customer and authorized order scope. | `06` master data; RBAC/RLS governs access. |
| `items` | Item identity, UOM/SPQ, reference buying/selling fields, and cross-references. | `06`/core master data; not final transaction price by itself. |
| `lots` | Trading flow/availability/ownership context consumed by `08`. | Core/08 inventory boundary. |
| `pick_lists`/`pick_list_items` | Final committed operational linkage and document price snapshot. | `08`/core owns physical workflow; `13` supplies price contract. |
| `forex_rates` | Approved currency conversion source if the final pricing design uses it. | Core/finance owner; no client rates. |

### Trading-owned persistence (provisional)

The core schema does not yet define complete Trading order/price tables. The intended model is:

```text
trading_orders
  id, order_number, customer_party_id, flow_type='trading',
  status ('price_quote_requested' | 'price_set_ready' | 'committed'
          | 'dispatched' | 'settled' | 'cancelled'),
  currency ('PHP' | 'USD'), version,
  requested_at, price_set_at, committed_at,
  dispatched_at, settled_at, cancelled_at,
  created_by, correlation_id

trading_order_items
  id, order_id, item_id, customer_item_code, requested_qty, uom,
  price_snapshot_id, status, version

trading_price_snapshots
  id, trading_order_id, trading_order_item_id, item_id, lot_id,
  unit_price (numeric, stored as decimal string),
  currency ('PHP' | 'USD'),
  tax_rate (numeric %), discount_rate (numeric %),
  effective_price (computed: unit_price × (1 + tax_rate/100) × (1 − discount_rate/100), stored for integrity),
  forex_rate (null when currency = 'PHP'),
  snapshot_hash (SHA-256 of line data),
  locked_at, created_by
```

Column names, exact types, and whether order lines link directly to `pick_lists` must be confirmed before migrations. The snapshot is immutable; price corrections create a new approved revision record rather than editing history.

## 3. Pricing contract

The finalized server contract consumed by `08` and `10`:

```typescript
type TradingPriceSnapshot = {
  trading_order_id: string
  trading_order_item_id: string
  item_id: string
  lot_id: string           // bound at pick-list generation
  unit_price: string       // decimal string, never float
  currency: 'PHP' | 'USD'
  tax_rate: string         // percentage, e.g. "12.00"
  discount_rate: string    // percentage, e.g. "0.00"
  effective_price: string  // computed, stored for integrity
  forex_rate: string | null // null if currency is PHP
  snapshot_hash: string    // SHA-256
  locked_at: string        // ISO 8601
}
```

The contract guarantees:

- All monetary values are decimal strings; floating-point types are forbidden for price fields.
- Currency is explicit (`'PHP' | 'USD'`) and never inferred from locale or browser state.
- `effective_price` is computed server-side as `unit_price × (1 + tax_rate/100) × (1 − discount_rate/100)` and stored; it is not recomputed by consumers.
- `snapshot_hash` is a SHA-256 of the line data fields; it detects any post-freeze mutation.
- Internal buying-cost and margin fields are not included in this type; they are projected separately under `trading.margin_view` authorization.
- The snapshot is immutable after `locked_at`; corrections create a new revision record.

**Integration rules:**

- `08` retrieves this snapshot via a server-side query keyed on `trading_order_id` before Stage 1 commitment. It never recomputes prices. A missing or hash-mismatched snapshot causes `08` to reject the pick-list generation request.
- `10` embeds this snapshot verbatim in the generated pick list and acknowledgement receipt. The `snapshot_hash` is stored on the document artifact for tamper detection. `10` does not calculate or replace any price field.

## 4. Order and workflow architecture

The Trading order lifecycle (defined in `requirements.md` §5) drives the integration sequence:

```text
price_quote_requested
  → validate party / flow_type='trading' / item / quantity / UOM
  → authorized user sets unit_price (trading.price_set required)
price_set/ready
  → immutable trading_price_snapshots created per order line
  → forex_rate locked from forex_rates (USD orders only)
  → order is now eligible for 08 pick-list generation
committed  ← 08 Stage 1: generates pick_list, resolves lot_id, reserves inventory
  → 08 physical pick and dispatch scan
dispatched ← 08 Stage 2: inventory_transaction (movement_type='pick') recorded
  → 10 generates priced pick_list and acknowledgement_receipt from frozen snapshot
settled    ← 10 finalizes acknowledgement_receipt; order and documents become immutable
```

`13` does not allocate lots or change inventory. If `08` fails allocation, the price snapshot remains historical for that order; the order may be revised or cancelled only through the approved order policy. Repricing is never performed silently during a retry.

## 5. Margin, currency, and commercial rules

All seven pricing decisions are resolved. See `requirements.md` §6 for the full decision record. Design-level policy summary:

- **Price authority**: `trading.price_set` capability required to confirm a unit selling price. `items.selling_price` is reference data only.
- **Price formula**: `effective_price = unit_price × (1 + tax_rate/100) × (1 − discount_rate/100)`. Tax and discount rates are optional per order line and stored on the snapshot.
- **Margin**: `(effective_price − items.buying_price) / effective_price`. Visible only to users with `trading.margin_view`; never projected to party/customer users.
- **Currency**: PHP base; USD per-order override. Forex rate sourced from `forex_rates` and locked at `price_set_at`. No client-supplied rate accepted. Missing rate blocks commitment.
- **Overrides**: `trading.price_override` capability required plus a mandatory written reason. All overrides appended to an immutable audit log.
- **Effective dates**: Active from `price_set_at` until cancelled or settled. No future-dated price schedules in v1.
- **Deferred to v2**: freight surcharges, minimum margin floors, customer-submitted orders, Supplies shared document pricing.

`items.buying_price` and `items.selling_price` are never used as the final transaction price without explicit authorized confirmation. VMI price references are not resolved by this model; VMI period billing remains `12`’s responsibility.

## 6. Authorization and RLS

Every order and price command follows:

```text
server Auth session
  → current capability + party/flow scope
  → validated Trading order/item/customer state
  → price policy/source authorization
  → immutable snapshot/order transaction
```

Potential capability vocabulary is resource/action based (`trading_orders.read`, `trading_orders.manage`, `trading_prices.read_internal`, `trading_prices.manage`, `trading_prices.override`), but final identifiers belong to `02`.

Party users may see their own scoped customer-facing orders/prices only if explicitly granted. They must not see internal buy cost, margin, other parties, or unscoped item catalog data. RLS is default deny and is evaluated on the current authenticated request.

## 7. UI and shell integration

Provisional routes:

```text
app/(authenticated)/
  trading/
    orders/page.tsx
    orders/new/page.tsx
    orders/[orderId]/page.tsx
    orders/[orderId]/pricing/page.tsx
    pricing/history/page.tsx       # internal capability only
```

The UI uses `05`’s office surface: searchable order list, detail, line editor, price summary, explicit freeze/commit handoff, and safe errors. It remains usable at narrow widths. It must clearly distinguish draft/reference price, frozen final document price, and internal margin; no color-only status is used.

The UI never sends price authority via hidden fields or browser storage. A price preview is not final until the server returns a frozen snapshot reference.

## 8. Offline, Realtime, and infrastructure integration

No Trading order/pricing mutation is Tier 1. Cached read projections may be bounded and scope-safe, but cached price/permission data cannot create or freeze a price.

Realtime may invalidate order/price status; authoritative refetch is required. External forex/price services, if selected, are called server-side with timeouts, auditability, and deterministic snapshotting. A provider outage blocks new final snapshots according to the approved policy; it must not silently use an unknown rate.

## 9. Integration contracts

- `08` retrieves the `TradingPriceSnapshot` via a server-side query keyed on `trading_order_id` before Stage 1 commitment. It stores the `snapshot_hash` with the committed outbound context and rejects a missing, stale, or hash-mismatched snapshot. `08` never recomputes prices.
- `10` embeds the same `TradingPriceSnapshot` verbatim in the generated `pick_list` and `acknowledgement_receipt`. The `snapshot_hash` is stored on the document artifact for tamper detection. `10` does not calculate or replace any price field.
- `12` remains authoritative for VMI period billing and may define a separate VMI document reference contract.
- `09` may be extended for approved price overrides only after a separate approval policy defines target/version/authority; the initial approval type is FIFO override.

## 10. Design verification before approval

- [x] Resolve all open pricing/commercial decisions — resolved in `requirements.md` §6; steering revision log update pending.
- [ ] Reconcile Trading order/price tables, precision, constraints, and snapshot linkage with `01`/`08`/`10`.
- [ ] Confirm capability identifiers, internal/customer projections, and RLS with `02`.
- [ ] Confirm online-only behavior with `03` and external service/runtime with `04`.
- [ ] Confirm VMI boundary with `12` and document fields with `10`.
- [ ] Run `rbac-rls-reviewer`, `design-system-auditor`, and `db-migration-verifier` before approval.
