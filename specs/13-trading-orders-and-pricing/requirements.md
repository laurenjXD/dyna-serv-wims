# Trading Orders & Pricing — Requirements

Status: Approved
Updated: 2026-08-05

## 1. Purpose and scope

This feature governs Trading/3PL customer orders and the price decisions that flow into the outbound withdrawal, `pick_list`, and `acknowledgement_receipt` documents. It keeps warehouse-owned Trading stock and customer transactions partitioned from VMI and Supplies.

The feature owns Trading order state, price resolution, margin visibility, price snapshots, and the contract consumed by `08` and `10`. It does not own physical allocation/dispatch, FIFO override approvals, document rendering, or VMI period billing.

## 2. Trading principles and boundaries

- A Trading transaction uses `flow_type = 'trading'` and must not mix with VMI or Supplies quantities, ownership, pricing, or billing.
- Trading price on an issued document is final for that document.
- Price must be resolved and frozen as an immutable transaction snapshot before the outbound commitment can produce the operational pick list, unless an approved revision explicitly changes the freeze point.
- The authoritative source for a VMI bill is the period-average billing model in `12`; a VMI document reference price is never a Trading price or authoritative bill.
- Item-level `buying_price`/`selling_price` values from `06`/core are defaults or references unless the approved Trading policy says otherwise; they do not silently override a transaction snapshot.
- Pricing and order actions are online-only and cannot be authorized from cached/offline state.
- One warehouse only; no `warehouse_id` or second inventory partition is introduced.

## 3. Actors and surfaces

- **Trading/order operator** — creates and manages orders within granted capability/scope.
- **Supervisor/authorized reviewer** — reviews exceptions only if a specific approved capability exists; a generic supervisor role is not a price override authority.
- **Warehouse staff** — executes the committed physical pick/dispatch through `08`; they do not change Trading prices on the floor.
- **Party/customer user** — sees only explicitly scoped Trading orders/documents and cannot see other parties’ prices, margins, or inventory.
- **Administrator/auditor** — reviews configuration/history under approved capabilities; service credentials do not grant blanket interactive access.

Order/pricing work is office-first but must remain usable on mobile. It is not a floor/offline workflow.

## 4. Functional requirements

### R1. Trading order creation

1. An authorized user SHALL be able to create a Trading order for an authorized customer/end-customer party and one or more `items`.
2. The order SHALL explicitly use `flow_type = 'trading'`; VMI and Supplies lines SHALL be rejected.
3. Each line SHALL identify item, requested quantity/UOM, customer item reference where applicable, requested delivery/handoff context, and any approved commercial metadata.
4. The server SHALL validate active party/item state, party/flow scope, quantity/UOM/SPQ rules, and available Trading inventory through the owning withdrawal/allocation boundary.
5. A draft order SHALL not reserve, decrement, or create a `pick_list` until the approved commitment command in `08` succeeds.
6. Draft edits SHALL use version/concurrency protection and SHALL not silently overwrite another user’s changes.

### R2. Price resolution

1. The system SHALL resolve a Trading buy-cost/reference and sell-price outcome according to the approved Trading pricing policy.
2. Price resolution SHALL identify source, currency, effective time, item/order line, quantity basis, and actor/system executor where applicable.
3. The price service SHALL distinguish internal cost/reference values from the final customer-facing Trading price.
4. The service SHALL validate non-negative/positive values, currency, precision, quantity basis, and any approved margin/floor rules on the server.
5. A missing, expired, invalid, or unauthorized price SHALL block final Trading commitment rather than silently defaulting to zero or a stale value.
6. Client-supplied unit price, total, margin, currency conversion, or discount SHALL be treated as a request for validation, not as authoritative truth.

### R3. Price snapshot and final-document contract

1. Before `08` creates the committed operational `pick_list`, the system SHALL create or resolve an immutable Trading price snapshot for each order line.
2. The snapshot SHALL include item/order line, quantity/UOM, unit buy-cost/reference where approved, final unit sell price, currency, discounts/adjustments if approved, line total, price source/version, effective timestamp, and calculation metadata required for audit.
3. The same approved snapshot SHALL flow to `08` and `10`; document rendering SHALL not recalculate or replace it.
4. Trading price on the `pick_list` and `acknowledgement_receipt` SHALL be final for those documents.
5. A later price-master change SHALL not rewrite an already frozen order/document snapshot.
6. A price correction requires an approved superseding/revision process and cannot mutate a historical issued document in place.

### R4. Margin and commercial visibility

1. The system MAY calculate and display buy/sell margin, margin percentage, and cost/reference totals to authorized internal users.
2. Customer/party users SHALL see only the approved customer-facing price fields and SHALL not infer internal cost, margin, or other parties’ pricing.
3. Margin calculations SHALL use the frozen snapshot and approved currency/rounding rules.
4. The system SHALL define how taxes, discounts, freight, surcharges, returns, credit adjustments, and currency conversion affect price/margin before implementation.
5. A displayed margin SHALL not itself authorize an order, pick, dispatch, billing, or price override.

### R5. Order state and outbound integration

1. The final order state model SHALL distinguish draft, priced/ready, committed, dispatched/fulfilled, cancelled, expired, and exception states as approved.
2. Price resolution SHALL be a prerequisite for the state that permits `08` commitment.
3. `13` SHALL pass a typed Trading order/price snapshot to `08`; `08` remains responsible for FIFO/FEFO allocation, reservation, physical execution, inventory decrement, and `movement_type = 'pick'` transaction.
4. A failed or released `08` commitment SHALL not silently alter the frozen price snapshot; the approved order revision/cancellation policy applies.
5. After dispatch, `10` SHALL use the same final price snapshot for the priced acknowledgement receipt.
6. Trading order state SHALL not be inferred from document generation, email delivery, or notification receipt.

### R6. Returns, cancellations, and corrections

1. Cancellation before commitment SHALL be explicitly authorized and shall not create inventory movement.
2. Cancellation/release after commitment SHALL use `08`’s reservation-release workflow and shall preserve the price/order history.
3. Returns, credit adjustments, and post-dispatch price corrections SHALL use explicit approved workflows and compensating records; they SHALL not edit the original pick transaction or issued document.
4. The final ownership of Trading returns/credits must be decided before implementation; this feature SHALL not silently implement an accounting subsystem.

### R7. Authorization, audit, and privacy

1. Order creation, price resolution, price override, snapshot freeze, cancellation, customer access, and history reads SHALL use current RBAC capabilities and party/flow scope.
2. A price override capability, if supported, SHALL be explicit, separately auditable, online-only, and not implied by a supervisor role.
3. Client-supplied party, flow, item, quantity, price, role, or approval values SHALL not establish authorization or final price.
4. Price changes, snapshot creation, overrides, cancellations, and corrections SHALL record actor/system executor, timestamp, reason, source/version, and correlation ID.
5. Party users SHALL not infer unrelated orders, prices, margins, inventory, or documents through IDs, filters, counts, errors, realtime, or URLs.

### R8. Offline, realtime, and document behavior

1. Order creation/edit, price resolution, price override, snapshot freeze, cancellation, and final Trading document pricing SHALL be online-only.
2. No Trading order or price mutation SHALL enter the Tier 1 offline queue.
3. Realtime MAY signal order/price status changes, but the client SHALL refetch authoritative state and SHALL not treat an event as price approval.
4. `10` owns document templates/artifacts/printing; `13` supplies the final typed price snapshot.
5. A generated document failure SHALL not alter the order price or reverse inventory; the approved document retry/attention path applies.

## 5. Trading order lifecycle

A Trading order exists and is priced independently from pick-list generation. The pick-list generation command in `08` references an already-priced Trading order — it does not create the pricing.

```text
price_quote_requested → price_set/ready → committed (when 08 generates pick list) → dispatched → settled
                                                        └── cancelled
```

### State definitions

- **price_quote_requested** — The Trading order has been created and line-validated (party, item, quantity, UOM). No price is set. The order is not eligible for `08` commitment.
- **price_set/ready** — An authorized user holding `trading.price_set` has confirmed the unit selling price. An immutable `trading_price_snapshots` record exists for each order line. The forex rate (if USD) has been locked from `forex_rates`. The order is now eligible for `08` to generate a pick list.
- **committed** — `08` has successfully generated a pick list against this Trading order. Inventory is reserved via `inventory_commitments`. The price snapshot is bound; `lot_id` is resolved at pick-list generation.
- **dispatched** — `08` Stage 2 dispatch is complete. Inventory decrement and `movement_type = 'pick'` transaction are recorded. `10` generates the priced pick list and acknowledgement receipt from the frozen snapshot.
- **settled** — `10` has finalized the acknowledgement receipt. A settled Trading order and its linked documents are immutable. No field, price, or document may be altered.
- **cancelled** — Explicitly cancelled. Rules:
  - A `price_quote_requested` or `price_set/ready` order may be cancelled by a user holding `trading.orders.cancel`.
  - A `committed` order requires its linked pick list to be cancelled first through `08`'s reservation-release workflow. The Trading order is updated to `cancelled` only after the pick list confirms cancellation.
  - `dispatched` and `settled` orders cannot be cancelled; only the returns/corrections workflow applies.

### Key rules

1. A Trading order must reach `price_set/ready` before `08` can generate a pick list against it.
2. Cancelling a committed Trading order requires the associated pick list to be cancelled first.
3. A settled Trading order is immutable — no mutation to the order, its lines, its snapshot, or its documents is permitted.
4. Order state is never inferred from document generation, email delivery, or notification receipt; the server is always authoritative.

## 6. Resolved pricing decisions

All seven pricing decisions are resolved. These decisions govern R2, R3, R4, and the snapshot schema in `design.md`.

- [x] **Price authority**: Unit selling price is set by an authorized office user (supervisor or admin) holding the `trading.price_set` capability. Item master `selling_price` from `items` is reference data only and is never auto-applied without explicit confirmation by an authorized user. No client-supplied price is treated as authoritative.

- [x] **Price snapshots**: An immutable `trading_price_snapshots` record is created when the Trading order transitions to `price_set/ready`. It captures: `item_id`, `unit_price`, `currency`, `tax_rate`, `discount_rate`, `effective_price` (after tax and discount), `snapshot_hash` (SHA-256 of the line data), and `locked_at`. The snapshot cannot be altered after creation; a price correction requires an approved superseding revision and creates a new record.

- [x] **Margins**: `items.buying_price` and `items.selling_price` are the reference margin basis. Actual margin = `(effective_price − buying_price) / effective_price`. Margin data and buying-cost fields are restricted to users holding `trading.margin_view` (admin/supervisor only). Party and customer users never see margin, buying cost, or other parties' pricing.

- [x] **Overrides**: A price override requires the `trading.price_override` capability and a mandatory written reason. All overrides are appended to an immutable audit log recording actor, timestamp, prior value, new value, reason, and correlation ID. Override capability is separate from `trading.price_set` and must be explicitly granted; it is not implied by a supervisor role.

- [x] **Currencies**: PHP is the base currency. USD override is allowed per Trading order. The applicable forex rate is sourced from `forex_rates` and locked at the moment the order transitions to `price_set/ready`. No client-supplied exchange rate is accepted. A missing `forex_rates` record for a USD order blocks commitment rather than defaulting silently. Trading orders may only be created by authorized internal users in v1; customer-submitted orders are deferred.

- [x] **Tax/discount**: Optional `tax_rate` (%) and `discount_rate` (%) per order line. Applied as: `effective_price = unit_price × (1 + tax_rate/100) × (1 − discount_rate/100)`. Both rates are stored on the price snapshot. Returns, cancellations after commitment, and post-dispatch corrections use explicit approved workflows and compensating records; they do not mutate the original snapshot or issued document. Freight, surcharges, and minimum margin floors are deferred to v2. Supplies order/price behavior via shared document infrastructure is deferred to v2.

- [x] **Effective dates**: Prices are effective from `price_set_at` (the timestamp the order reaches `price_set/ready`) until the order is cancelled or settled. No future-dated price schedules are supported in v1.

## 7. Acceptance criteria

- [ ] A Trading order cannot mix VMI/Supplies flow or bypass party/flow scope.
- [ ] A valid price snapshot is required before final commitment and is frozen for the pick list/acknowledgement receipt.
- [ ] Trading price on issued documents is final; later price changes do not rewrite history.
- [ ] Internal margin/cost is visible only to authorized users.
- [ ] `08` owns allocation/commitment/dispatch and `10` owns document rendering; `13` supplies pricing only.
- [ ] Price/order mutations are blocked offline and absent from the offline queue.
- [ ] Duplicate, stale, unauthorized, invalid-currency, invalid-margin, and concurrent updates fail safely.
- [ ] Real-Postgres, pricing, RLS, E2E, and document contract tests pass before approval.

## 8. Dependencies and exclusions

- Depends on `01-core-data-model` for `parties`, `items`, `lots`, `pick_lists`, `pick_list_items`, currency/price fields, and flow partitioning; price/order persistence gaps must be reconciled.
- Depends on `02-rbac-roles` for order/price capabilities, party/flow scope, RLS, audit, and any override authority.
- Depends on `03-offline-mode-and-client-storage` for online-only Trading order/pricing boundaries.
- Depends on `04-services-and-infrastructure` for Auth, forex/external services if approved, jobs, monitoring, idempotency, and runtime boundaries.
- Depends on `05-ui-shell-and-navigation` for office routes and responsive form/list/detail contracts.
- Depends on `06` for party/item master data.
- Depends on `08` for allocation/commitment/dispatch integration and `10` for document projection.
- Depends on `12` only to preserve the VMI billing boundary; this feature does not calculate VMI bills.
