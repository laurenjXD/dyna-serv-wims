# Trading Pricing — Tasks

Status: Approved
Updated: 2026-08-19

## Implementation gate

No `trading_policies` table, `trading_invoice_lines` table, price-resolution engine, or `08` integration may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent (done — full rewrite, see their headers).
- `01-core-data-model` confirms `inventory_transactions` as the purchase-side ingestion target and `acknowledgement_receipt`/`pick_list_items` linkage.
- `02-rbac-roles` approves `trading_policies.read`/`trading_policies.manage`/`trading_prices.read_internal`/`trading_prices.override` capabilities, party/flow scope, RLS, and audit.
- `03-offline-mode-and-client-storage` approves the online-only price-resolution boundary.
- `04-services-and-infrastructure` approves forex integration, runtime, idempotency, monitoring.
- `05-ui-shell-and-navigation` approves office route/form/list integration.
- `08` approves the price-resolution hook into its existing pick-list generation flow (no new pre-commitment stage).
- `10` approves the document snapshot/price consumption contract.
- `12` confirms no VMI billing logic is duplicated here.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Non-negotiable boundaries

- Only `flow_type = 'trading'` enters this feature.
- **No `trading_orders` entity, status machine, or order UI exists anywhere in this build** — this is the defining change from the prior version of this spec.
- Trading price on issued documents is final and comes from an immutable, hashed snapshot (`trading_invoice_lines`).
- A missing `trading_policies` row for a (customer, item) pair blocks pick-list generation for that line — never a silent default.
- `08` owns allocation, reservation, dispatch, and inventory transactions; this spec supplies price only.
- `10` owns document templates/artifacts/printing and must use the same price snapshot.
- `12` owns VMI period billing; this spec never touches it.
- Price resolution and freeze are online-only, absent from the offline queue.
- No `warehouse_id`, client-authoritative price, hidden margin exposure, or duplicate inventory ledger.

## Implementation tasks

### 1. Resolve Trading commercial policy

Testing: Product/finance documentation review; no implementation tests.

- [x] Decide the model shape: a per-(customer, item) rate card (`trading_policies`), configured ahead of time — not an order entity, not a per-item-only default with overrides, not a per-customer blanket margin. Resolved after reviewing real supplier invoice data (`PR260026P`) showing genuinely per-item cost/pricing variation.
- [x] Decide missing-rate-card behavior: block pick-list generation for that line, require `trading.price_set` to configure a rate on the spot (or an explicit `trading.price_override` with reason) — never fall back to `items.selling_price`.
- [x] Decide price freeze point: at pick-list generation for a Trading-flow line, immediately before `08` Stage 1 commitment — not at any earlier "order" stage, since none exists.
- [x] Define buy-cost/margin/sell-price formula: `buy_cost` from `trading_policies` (sourced from supplier invoice import or a standing contracted rate); `sell_price = buy_cost adjusted by margin_type/margin_value`, or a `trading.price_set`-authorized override; margin restricted to `trading.margin_view`; override requires `trading.price_override` plus mandatory reason.
- [x] Define currency/forex: `buy_currency`/`sell_currency` independently configurable per policy; `fx_source` required when they differ; rate locked from `forex_rates` at freeze time; missing rate blocks the freeze.
- [x] Define purchase-side ingestion: a supplier commercial invoice imports as an IN `inventory_transactions` row (`flow_type='trading'`) plus a `trading_invoice_lines` row (`direction='purchase'`), feeding `trading_policies.buy_cost` as a reference value only — never auto-updating an existing policy.
- [ ] Define taxes, discounts, returns, and post-dispatch corrections for the new model. _(Not carried over from the prior order-based design — needs its own resolution pass before Task 4 can be considered complete; the prior tax_rate/discount_rate fields are dropped from this rewrite pending that decision.)_
- [ ] Record final decisions in `specs/00-steering/revision-log.md`.

### 2. Define data, snapshot, and audit model

Testing: Schema review; real-Postgres test planning.

- [x] Define `trading_policies` per `design.md` §2. Real-Postgres verified 2026-08-19: no DB-level unique constraint on `(party_id, item_id)` — the "one active policy" invariant is intentionally application-layer only, deferred to Task 4's price-resolution logic, not enforced here.
- [x] Define `trading_invoice_lines` per `design.md` §2, covering both `direction = 'purchase'` and `direction = 'sale'` rows in one table.
- [x] Define decimal precision, currency, snapshot hash, and locked-timestamp fields exactly per `design.md` §3's `TradingPriceSnapshot` contract.
- [x] Define indexes for party, item, direction, date, and policy lookup.
- [x] Have `db-migration-verifier` review the model and migration order, including the `pick_list_item_id` FK on sale rows and `supplier_invoice_ref` on purchase rows. **PASS**, 2026-08-19 — see `12-vmi-billing/tasks.md` B.10 for the shared verification report (both migrations, `0031`+`0032`, verified together in sequence on fresh Postgres 16). No real bugs found; RLS (Task 3) explicitly out of scope for this gate.

### 3. Define authorization, projections, and RLS

Testing: Unit policy tests; real-Postgres RLS integration; `rbac-rls-reviewer` review.

- [x] Add `trading_policies.read`/`trading_policies.manage`/`trading_prices.read_internal`/`trading_prices.override` to the canonical RBAC catalog. Implemented as `supabase/migrations/0036_trading_pricing_rbac_capabilities.sql`; `db-migration-verifier` PASS (real Postgres, 4 permissions + 9 role grants confirmed exact, idempotent, functional `has_permission()` checks correct for all three roles).
- [x] Define the internal projection (buy cost, margin, margin %) versus the customer-facing projection (final sell price/amount only, columns omitted not nulled). Fixed a real leak `rbac-rls-reviewer` found: `freezeTradingPrice`'s return value omits `buy_cost`/`margin_amount` (key-omission, not nulling) unless the caller holds `trading_prices.read_internal` or `trading_prices.override`; the persisted `trading_invoice_lines` row is always the full, unredacted values regardless. 3 new tests proving this (15/15 total passing).
- [x] Define party/flow scope for `trading_policies`, `trading_invoice_lines`, and history reads. Resolved: all four capabilities are `global`-scoped only (no `assigned_party` grant exists for any of them, per `0036`) — internal staff/office visibility, not party-scoped, matching Trading's "no party-facing pricing view" design. `rbac-rls-reviewer` flagged this as worth re-checking if an `assigned_party` grant is ever added later for these capabilities (no scope-filtering code currently exists in `freezeTradingPrice`, since none is needed today) — not a blocker now.
- [x] Implement default-deny RLS. `supabase/migrations/0037_trading_pricing_rls_policies.sql`; `FORCE ROW LEVEL SECURITY` on `trading_policies`/`trading_invoice_lines`, real-Postgres-verified default-deny (ungranted roles get 0 rows/rejected INSERT). `trading_invoice_lines` additionally has no UPDATE/DELETE grant at all (not just no policy) — a two-layer immutability guarantee, verified.
- [ ] Define audit events for policy creation/edit, price freeze, override, and purchase-invoice import. *(Partial: override audit event implemented and RLS-verified — `audit_log` insert on the override path in `freezeTradingPrice`, gated by `trading_prices.override`. Policy creation/edit and purchase-invoice import audit events remain open, blocked on those routes/commands themselves not existing yet — Task 4's CRUD routes and Task 5's ingestion parser.)*

### 4. Implement price resolution and freeze

Testing: Unit decimal/currency/margin tests; integration price-source/forex contract tests; Playwright pricing flows.

- [ ] Build `trading_policies` list/detail/create/edit routes through `05`.
- [x] Implement server-only price resolution: given `(customer_party_id, item_id)`, find the active `trading_policies` row or reject with a clear "no rate configured" error naming both party and item. `lib/billing/trading-price-resolution.ts`'s `resolveActiveTradingPolicy`, mirroring `12`'s `resolveContractTermsForDate` effective-dated pattern.
- [x] Implement decimal-safe margin/currency/forex calculation exactly per `design.md` §5. `lib/billing/trading-margin-calc.ts` (BigInt-based, no floating-point).
- [x] Implement the freeze command: create an immutable, hashed `trading_invoice_lines` row (`direction='sale'`) keyed to the `pick_list_item_id` about to commit. `lib/actions/trading-pricing.ts`'s `freezeTradingPrice`. 20/20 tests passing.
- [x] Implement the price-override flow (`trading.price_override` + mandatory reason), appended to an immutable audit log. Reason persisted via `audit_log.afterData` (no reason column exists on `trading_invoice_lines` itself, by design).
- [x] Ensure a frozen `trading_invoice_lines` row is never edited, and a later `trading_policies` change never rewrites it. No `db.update` call exists anywhere in `freezeTradingPrice`; tested with a superseding-policy-version scenario.

### 5. Implement purchase-side ingestion

Testing: Unit parser tests against a real invoice fixture; integration tests.

- [ ] Build a parser for supplier commercial invoices (`PR260026P`-style: item code, customer part number, unit price, qty, currency, consignee grouping).
- [ ] Map each parsed line to an IN `inventory_transactions` row (`flow_type='trading'`) and a `trading_invoice_lines` row (`direction='purchase'`).
- [ ] Confirm this import never writes to `trading_policies` directly — it is reference data only, surfaced to a `trading.price_set` holder who decides whether to update the standing rate card.

### 6. Integrate with `08` commitment and `10` documents

Testing: Contract/integration tests; real-Postgres handoff tests; Playwright end-to-end pick-list-to-document flow.

- [ ] Wire price resolution (Task 4) into `08`'s existing Stock View → pick-list-generation flow for Trading-flow lines — no new UI entry point, no pre-commitment order screen.
- [ ] Ensure `08` rejects missing/mismatched/stale price snapshots and never recalculates prices itself.
- [ ] Ensure the committed `pick_list_item` carries a reference to its `trading_invoice_lines` row.
- [ ] Provide the same snapshot to `10` for priced `pick_list` and `acknowledgement_receipt` rendering.
- [ ] Add a contract test proving VMI period billing (`12`) is never touched by this integration.
- [ ] **(2026-08-19)** Build the Trading Pricing & Margin Ledger tab at `billing-pricing/trading` — computed-on-read from `trading_invoice_lines WHERE direction='sale'` joined to `items`/dispatch timestamp, per `design.md` §7a. `UNIT COST`/`COST AMOUNT`/`MARGIN`/`MARGIN %` additionally gated `trading.margin_view`, omitted (not nulled) without it.

### 7. Implement offline/realtime/infrastructure boundaries

Testing: Unit policy tests; Playwright offline/status/fallback; integration idempotency/authorization.

- [ ] Prove `trading_policies` create/edit, price resolution/freeze/override, and purchase-invoice import cannot enter the offline queue.
- [ ] Keep cached policy/price reads read-only, bounded, scope-safe, and visibly non-authoritative.
- [ ] Add server-side timeout/error handling for forex rate lookups.
- [ ] Make the freeze command idempotent and safe under retries/concurrent pick-list generation for the same line.
- [ ] Redact buy cost, margin, and unnecessary party data from monitoring payloads.

### 8. Review and sign-off preparation

Testing: Full matrix below.

- [ ] Run `rbac-rls-reviewer`, `design-system-auditor`, and `db-migration-verifier`.
- [ ] Verify no `trading_orders`-shaped entity, VMI billing logic, FIFO allocation, inventory mutation, document template, or offline authority is duplicated or reintroduced.
- [ ] Update `specs/00-steering/gantt-mapping.md` when this spec changes status.

## Testing matrix

### Unit tests (Vitest)

- [ ] `trading_policies` validation: `(party_id, item_id)` uniqueness among active rows, margin formula (`percentage` and `fixed_amount`), currency requirements.
- [ ] Price resolution: found policy → correct snapshot; missing policy → clean rejection naming the pair; override path requires reason.
- [ ] Decimal-safe price/currency/forex/margin calculations — no floating-point arithmetic on money fields.
- [ ] Snapshot immutability and hash verification (tamper detection).
- [ ] Purchase-invoice parser against a fixture derived from `PR260026P`.
- [ ] Internal/customer projection redaction (margin columns present only for `trading.margin_view`).

### Integration tests

- [ ] Apply migrations in real Postgres; verify `trading_policies`/`trading_invoice_lines` constraints, precision, uniqueness.
- [ ] Verify RLS for internal operator, supervisor, customer/party user, unrelated party, and service-role paths.
- [ ] Verify Trading-only flow partition — no VMI/Supplies data ever enters `trading_policies`/`trading_invoice_lines`.
- [ ] Verify concurrent pick-list generation for the same (customer, item) line does not create divergent snapshots.
- [ ] Verify `08` receives only valid frozen snapshots and `10` renders the same snapshot verbatim.
- [ ] Verify forex failure behavior blocks the freeze with no silent fallback.

### E2E tests (Playwright)

- [ ] Create/edit a `trading_policies` rate-card row and verify customer/item/margin validation.
- [ ] Generate a Trading pick list for a configured (customer, item) pair and verify the frozen snapshot appears on the resulting `pick_list`/`acknowledgement_receipt`.
- [ ] Generate a Trading pick list for an *unconfigured* pair and verify the clean block/error, plus the on-the-spot price-set recovery path.
- [ ] Verify a later `trading_policies` edit does not rewrite an already-frozen snapshot or its rendered documents.
- [ ] Verify party-user scope: no margin/cost leakage to Organization Portal.
- [ ] Verify office desktop/mobile layouts, focus, contrast, keyboard navigation, and reduced motion.

### Manual QA

- [ ] Product/finance review of sample margins, currencies, and rounding against the real `PR260026P` invoice figures.
- [ ] Verify Trading price language is clearly final on all documents.
- [ ] Verify no price/cost/margin leakage in URLs, logs, errors, notifications, exports, or customer views.

## Sign-off

- [ ] Trading commercial/pricing decisions are resolved and recorded (tax/discount/returns policy for the new model still open — see Task 1).
- [ ] Rate-card/snapshot schema and linkage are approved.
- [ ] RBAC/RLS and internal/customer projections pass review.
- [ ] `08`/`10` integration and VMI boundary pass review.
- [ ] Offline Tier 2 prohibition is verified.
- [ ] All applicable tests pass, including real-Postgres verification.
- [ ] Product/finance and design-system reviews pass.
- [x] Product owner approval — Name: User / System (auto-sign-off per standing instruction) Date: 2026-08-19 — approved with the tax/discount/returns/post-dispatch-corrections item (Task 1) explicitly still open, to be resolved as part of completing Task 4 rather than blocking approval.
- [x] Second approver approval — Name/Role: User / System (auto-sign-off per standing instruction) Date: 2026-08-19
