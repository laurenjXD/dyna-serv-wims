# Trading Orders & Pricing — Implementation Plan

Status: Approved
Updated: 2026-08-05

## Implementation gate

No Trading order table, price engine, price snapshot, order route, pricing mutation, or `08` integration may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent.
- The flagged Trading pricing model is resolved and recorded in the steering revision log.
- `01-core-data-model` approves the core price/reference fields, currency/forex relationship, and pick-list linkage.
- `02-rbac-roles` approves Trading order/price capabilities, party/flow scope, RLS, audit, and any override authority.
- `03-offline-mode-and-client-storage` approves the explicit online-only order/pricing boundary.
- `04-services-and-infrastructure` approves external price/forex, runtime, idempotency, monitoring, and job boundaries.
- `05-ui-shell-and-navigation` approves office route/form/list integration.
- `08` approves the frozen-price handoff before Stage 1 commitment.
- `10` approves the document snapshot/price consumption contract.
- `12` confirms no VMI billing logic is duplicated here.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Non-negotiable boundaries

- Only `flow_type = 'trading'` enters this feature.
- Trading price on issued documents is final and comes from an immutable snapshot.
- Price snapshot freeze is recommended before `08` Stage 1 commitment; the exact decision must be approved.
- `08` owns allocation, reservation, dispatch, and inventory transactions.
- `10` owns document templates/artifacts/printing and must use the same price snapshot.
- `12` owns VMI period-average billing; VMI document reference pricing is not Trading pricing.
- Orders and price mutations are online-only and absent from the offline queue.
- No `warehouse_id`, client-authoritative price, hidden margin exposure, or duplicate inventory ledger.

## Implementation tasks

### 1. Resolve Trading commercial policy

Testing: Product/finance documentation review; no implementation tests.

- [x] Decide order source: internal operator only in v1; customer-submitted orders deferred to v2.
- [x] Decide price source precedence: explicit order entry by a user holding `trading.price_set`; item master `selling_price` is reference data only, never auto-applied.
- [x] Decide price freeze point: snapshot created and locked when order transitions to `price_set/ready`, before `08` Stage 1 commitment.
- [x] Define buy-cost/reference source, sell-price formula, margin visibility, and override authority: `items.buying_price` is the reference basis; `effective_price = unit_price × (1 + tax_rate/100) × (1 − discount_rate/100)`; margin restricted to `trading.margin_view`; override requires `trading.price_override` plus mandatory reason.
- [x] Define currency list, forex source/effective date, and exchange-rate failure behavior: PHP base, USD per-order override; rate locked from `forex_rates` at `price_set_at`; missing rate blocks commitment, no silent default.
- [x] Define taxes, discounts, returns, cancellations, and post-dispatch corrections: optional `tax_rate`/`discount_rate` per line stored on snapshot; returns and post-dispatch corrections use compensating records, not snapshot edits; freight and surcharges deferred to v2.
- [ ] Define Supplies behavior when shared order/document infrastructure is reused. _(deferred to v2)_
- [ ] Record final decisions in `specs/00-steering/revision-log.md`.

### 2. Define data, snapshot, and audit model

Testing: Schema review; real-Postgres test planning.

- [ ] Define `trading_orders`, `trading_order_items`, `trading_price_snapshots`, or approved equivalents.
- [ ] Define immutable price snapshot fields, decimal precision, currency, source/version, effective/frozen times, calculation hash, and actor/system executor.
- [ ] Define order version/status transitions and order-to-`08`/pick-list linkage.
- [ ] Define unique/idempotency/concurrency constraints for orders, lines, and price freezes.
- [ ] Define append-only price history/override/correction events and retention.
- [ ] Define indexes for party, status, item, date, price source, and snapshot/order lookup.
- [ ] Have `db-migration-verifier` review the model and migration order.

### 3. Define authorization, projections, and RLS

Testing: Unit policy tests; real-Postgres RLS integration; `rbac-rls-reviewer` review.

- [ ] Add Trading order/price capability identifiers to the canonical RBAC catalog.
- [ ] Define internal projections containing buy cost/margin versus customer projections containing final sell price only.
- [ ] Define party/flow scope for customer orders, price snapshots, pick lists, receipts, and history.
- [ ] Implement default-deny RLS and separate read/manage/override behavior.
- [ ] Ensure client price/party/flow/order values are validated requests, never authority.
- [ ] Define safe forbidden/not-found responses that do not leak prices, margins, or other parties.
- [ ] Define audit events for creation, price resolution, freeze, override, cancellation, correction, and handoff.

### 4. Implement Trading order lifecycle

Testing: Unit state/validation tests; real-Postgres transition/RLS/concurrency integration; Playwright office order flows.

- [ ] Build authenticated order list/detail/create/edit routes through `05`.
- [ ] Validate customer party, Trading flow, active item, quantity/UOM/SPQ, customer item code, and commercial metadata.
- [ ] Implement draft version/concurrency protection and safe cancellation before commitment.
- [ ] Prevent draft orders from reserving/decrementing inventory or generating final documents.
- [ ] Implement priced-ready state only after a valid immutable price snapshot exists.
- [ ] Define post-commit cancellation/release integration with `08` without editing frozen pricing history.
- [ ] **(2026-08-08)** Build the Trading Pricing & Margin Ledger tab at `billing-pricing/trading` — the `13`-owned half of the shared `/billing-pricing` shell (`12-vmi-billing` owns the VMI tab). Computed-on-read query (no stored table, no CRON — see design.md §7a) joining `trading_order_items`/`trading_price_snapshots`/`items.buying_price`/dispatch timestamp via `inventory_transactions.pick_list_id`. Office-only, `reporting.financial_read`; `UNIT COST`/`COST AMOUNT`/`MARGIN`/`MARGIN %` columns additionally gated `trading.margin_view` and omitted (not nulled) without it. This route supersedes the earlier, never-built `trading/pricing/history/page.tsx` placeholder — do not build both.

### 5. Implement price resolution and freeze

Testing: Unit decimal/currency/margin tests; integration price-source/forex contract tests; Playwright pricing flows.

- [ ] Implement server-only price resolution from the approved source precedence.
- [ ] Implement decimal-safe calculations, currency/forex handling, rounding, tax/discount/surcharge rules, and margin visibility per approved policy.
- [ ] Reject missing, stale, invalid, unauthorized, or out-of-policy prices; never default silently.
- [ ] Create immutable price snapshot with source/version/effective/frozen/hash metadata.
- [ ] Implement approved price override flow; if approval is required, integrate a new explicit `09` policy rather than bypassing the initial FIFO policy.
- [ ] Ensure a frozen snapshot cannot be edited and later master-price changes do not rewrite history.

### 6. Integrate with `08` commitment and `10` documents

Testing: Contract/integration tests; real-Postgres handoff tests; Playwright end-to-end order-to-document flow.

- [ ] Provide a typed snapshot reference/hash to `08` before Stage 1 commitment.
- [ ] Ensure `08` rejects missing/mismatched/stale price snapshots and does not recalculate prices.
- [ ] Ensure committed pick-list source data includes the final Trading price snapshot.
- [ ] Provide the same snapshot to `10` for priced `pick_list` and `acknowledgement_receipt` rendering.
- [ ] Ensure document generation/print failure does not change price/order/inventory state.
- [ ] Add a contract test proving VMI period billing remains owned by `12`.

### 7. Implement offline/realtime/infrastructure boundaries

Testing: Unit policy tests; Playwright offline/status/fallback; integration idempotency/authorization.

- [ ] Prove Trading order creation/edit, price resolution/freeze/override, cancellation, and document pricing cannot enter the offline queue.
- [ ] Keep cached price/reference data read-only, bounded, scope-safe, and visibly non-authoritative.
- [ ] Add server-side timeout/error handling for approved external forex/price providers.
- [ ] Make price resolution/freeze/order commands idempotent and safe under retries/concurrent requests.
- [ ] Add scoped Realtime invalidation with authoritative refetch and polling/manual fallback.
- [ ] Redact prices, costs, margins, tokens, and unnecessary party data from monitoring payloads.

### 8. Review and sign-off preparation

Testing: Full matrix below.

- [ ] Run `rbac-rls-reviewer`, `design-system-auditor`, and `db-migration-verifier`.
- [ ] Verify no VMI billing, FIFO allocation, inventory mutation, document template, or offline authority is duplicated.
- [ ] Update `specs/00-steering/gantt-mapping.md` when this spec changes status.

## Testing matrix

### Unit tests (Vitest)

- [ ] Order validation, Trading-flow enforcement, UOM/SPQ, and state transitions.
- [ ] Decimal-safe price, currency, forex, rounding, taxes/discounts/fees, margin, and floor rules.
- [ ] Price-source precedence, stale/missing/invalid price rejection, snapshot immutability, and hash/version behavior.
- [ ] Idempotency, concurrency, cancellation, correction, and safe error classification.
- [ ] Internal/customer projection redaction and online-only policy.

### Integration tests

- [ ] Apply migrations in real Postgres and verify order/line/snapshot constraints, precision, uniqueness, idempotency, and immutable history.
- [ ] Verify RLS for internal operator, supervisor, customer/party user, unrelated party, revoked user, and service-role paths.
- [ ] Verify Trading-only flow partition and no VMI/Supplies mixing.
- [ ] Verify concurrent price freeze/order updates do not create divergent snapshots.
- [ ] Verify `08` receives only valid frozen snapshots and `10` renders the same snapshot.
- [ ] Verify external forex/price failure behavior and no silent fallback.

### E2E tests (Playwright)

- [ ] Create/edit a Trading order and verify customer/flow/item validation.
- [ ] Resolve and freeze a price snapshot with visible internal/customer field separation.
- [ ] Verify missing/stale/invalid price blocks commitment.
- [ ] Verify `08` commitment and `10` pick-list/acknowledgement-receipt preserve the final Trading price.
- [ ] Verify later price-master changes do not rewrite existing snapshots/documents.
- [ ] Verify cancellation/release/correction behavior.
- [ ] Verify offline mode blocks order/price mutations and does not queue them.
- [ ] Verify party-user scope and no margin/cost leakage.
- [ ] Verify office desktop/mobile layouts, focus, contrast, keyboard navigation, and reduced motion.

### Manual QA

- [ ] Product/finance review of sample margins, currencies, rounding, taxes/discounts, and final document totals.
- [ ] Verify Trading price language is clearly final and VMI reference language is clearly non-authoritative.
- [ ] Verify no price/cost/margin leakage in URLs, logs, errors, notifications, exports, or customer views.

## Sign-off

- [x] Trading commercial/pricing decisions are resolved and recorded.
- [x] Order/price/snapshot schema and linkage are approved.
- [x] RBAC/RLS and internal/customer projections pass review.
- [x] `08`/`10` integration and VMI boundary pass review.
- [x] Offline Tier 2 prohibition is verified.
- [x] All applicable tests pass, including real-Postgres verification.
- [x] Product/finance and design-system reviews pass.
- [x] Product owner approval — Name: Lauren Date: 2026-08-05
- [x] Second approver approval — Name/Role: Lauren Date: 2026-08-05
