# Trading Orders & Pricing — Design

Status: Draft

## 1. Design intent

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
|---|---|---|
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
  status, currency, version, requested_at, committed_at,
  dispatched_at, cancelled_at, created_by, correlation_id

trading_order_items
  order_id, item_id, customer_item_code, requested_qty, uom,
  price_snapshot_id, status, version

trading_price_snapshots
  id, order_id, order_item_id, source/version, currency,
  buy_cost_reference, sell_unit_price, discount/adjustment fields,
  line_total, margin/reference fields, effective_at,
  frozen_at, created_by/system_executor, calculation_hash
```

Names, fields, tax/discount representation, and whether order lines can link directly to `pick_lists` must be approved before migrations. The snapshot must be immutable; price corrections create a new approved revision rather than editing history.

## 3. Pricing contract

The conceptual server contract is:

```ts
type TradingPriceSnapshot = {
  orderId: string;
  orderItemId: string;
  itemId: string;
  quantity: string;
  uom: string;
  currency: string;
  unitBuyCostReference?: string;
  unitSellPrice: string;
  adjustments?: readonly PriceAdjustment[];
  lineTotal: string;
  marginReference?: string;
  sourceVersion: string;
  effectiveAt: string;
  frozenAt: string;
  calculationHash: string;
};
```

The final types/precision/rounding and field names are provisional. The contract must guarantee:

- all monetary calculations use decimal-safe server logic;
- currency is explicit and not inferred from locale/browser;
- client totals are advisory;
- price source and effective version are auditable;
- the snapshot is immutable after freeze;
- internal cost/margin fields are filtered from party-facing projections.

Recommended v1 freeze point: price snapshot is frozen in the same business step that makes the order eligible for `08` Stage 1 commitment. `08` receives the snapshot by ID/hash and refuses a missing or mismatched snapshot. `10` copies the final customer-facing price from the same snapshot.

## 4. Order and workflow architecture

```text
Trading order draft
  → validate party/flow/item/quantity
  → resolve Trading price snapshot
  → freeze snapshot / priced-ready
  → 08 allocation + two-stage commitment
  → 10 pick_list projection
  → 08 physical dispatch
  → 10 acknowledgement_receipt projection
```

`13` does not allocate lots or change inventory. If `08` fails allocation, the price snapshot remains historical for that order; the order may be revised/cancelled only through the approved order policy. Repricing is not silently performed during a retry.

## 5. Margin, currency, and commercial rules

The final design must define the monetary policy before implementation. At minimum it must specify:

- source of buy-cost/reference and customer sell price;
- customer-specific versus item-default precedence;
- currency and forex source/effective date;
- decimal precision and rounding at unit, line, and document levels;
- taxes, discounts, freight, surcharges, minimum margins, and price floors;
- who may override a price and whether an approval workflow is required;
- return/credit/cancellation behavior.

Until approved, `13` treats these as open decisions and must not infer them from `items.buying_price`/`items.selling_price` or browser input.

VMI price references are not resolved by this model. VMI period billing remains `12`’s responsibility; a shared document can display a VMI reference snapshot only through its approved contract.

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

- `08` requests a valid `TradingPriceSnapshot` before Stage 1 commitment and stores the snapshot reference/hash with the committed outbound context.
- `10` receives the same final snapshot for `pick_list` and `acknowledgement_receipt`; it does not calculate or replace prices.
- `12` remains authoritative for VMI period billing and may define a separate VMI document reference contract.
- `09` may be extended for approved price overrides only after a separate approval policy defines target/version/authority; the initial approval type is FIFO override.

## 10. Design verification before approval

- [ ] Resolve all open pricing/commercial decisions and update `requirements.md`/steering revision log.
- [ ] Reconcile Trading order/price tables, precision, constraints, and snapshot linkage with `01`/`08`/`10`.
- [ ] Confirm capability identifiers, internal/customer projections, and RLS with `02`.
- [ ] Confirm online-only behavior with `03` and external service/runtime with `04`.
- [ ] Confirm VMI boundary with `12` and document fields with `10`.
- [ ] Run `rbac-rls-reviewer`, `design-system-auditor`, and `db-migration-verifier` before approval.
