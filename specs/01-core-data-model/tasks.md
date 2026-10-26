# Core Data Model — Tasks
Status: Pending Reapproval
Updated: 2026-10-22 — Organization / Inventory Model and workflow-integrity amendment approved

## Implementation Tasks

- [x] **1. Drizzle ORM Schema Definitions** — **implemented and fully verified 2026-08-07**
  - [x] Define PostgreSQL enums in `lib/db/schema/enums.ts` (`partyRoleEnum` with vendor/supplier/customer/end_customer/internal_warehouse, `flowTypeEnum`, `locationTypeEnum`, `lotStatusEnum`, `wrrStatusEnum`, `movementTypeEnum`, `pickListStatusEnum`, `conformanceStatusEnum`, `nonConformanceReasonEnum`, `commitmentStatusEnum`)
  - [x] Define `parties` and `party_roles` tables in `lib/db/schema/parties.ts` (Req 2.1, Design 1.2)
  - [x] Define `item_categories` and `items` tables in `lib/db/schema/items.ts` with `dsgc_item_number`, `customer_item_code`, `spq`, box dimensions (`length_cm`, `width_cm`, `height_cm`), and `volume_cbm` (Req 2.2, Design 1.2)
  - [x] Define `locations` table in `lib/db/schema/locations.ts` with `Rack+Level-Position` label (e.g. `A1-01`) and `max_cbm_capacity` (Req 2.3, Design 1.2)
  - [x] Define `lots` table in `lib/db/schema/lots.ts` with operational WRR-sourced `lot_number`/`wrr_item_id` plus approved migration provenance via `migration_batch_id`, `flow_type`, `peza_number`, `commercial_invoice_no`, `ip_number`, `unit_cost`, `manufacture_date`, `expiry_date`, and `status` (Req 2.5/6, Design 1.2)
  - [x] Define `lot_location_balances` with unique lot/location placement rows, `qty_received`, `qty_remaining`, `qty_committed`, versioning, and non-negative/committed-within-remaining constraints (Req 13, Design 1.2)
  - [x] Define the `lot_inventory_totals` aggregate read model and document `qty_available = qty_remaining - qty_committed` as derived-only (Req 13, Design 1.2) — hand-written `CREATE VIEW` in `supabase/migrations/0002_lot_inventory_totals_and_indexes.sql`, real-Postgres verified
  - [x] Define the `master_inventory_tracking` and `lot_history_export` derived read-model contracts, including `lot_number` aging, the `displayed_item_code`/`item_code_is_provisional` flow-based item-code resolution, connected event identity, and financial projection separation (Req 16, Design 3.4) — **and** the `location_transaction_ledger`/`party_transaction_ledger` read models added 2026-08-07 (Design 3 item 4). Implemented as five views in `supabase/migrations/0003_derived_read_models.sql` (financial fields split into a separate `master_inventory_tracking_financial` view, no computed margin/profit/revenue — that calculation remains unsettled VMI/Trading billing logic owned downstream, not guessed at here). Independently real-Postgres verified by `db-migration-verifier`, including the double-counting edge case for a party that is simultaneously a vendor and a VMI lot owner.
  - [x] Define `inventory_commitments` and `inventory_commitment_lines` as the durable Stage 1 reservation relation, including uniqueness, lifecycle, expiry, release, execution, and concurrency constraints (Req 14, Design 1.2)
  - [x] Define `wrr_documents` and `wrr_items` tables in `lib/db/schema/wrr.ts` with `cipl_file_url`, `peza_number`, `commercial_invoice_no`, `ip_number`, `mawb_mbl_number`, and (2026-08-09 amendment) nullable staging `putaway_location_id` (Req 2.4, Design 1.2)
  - [ ] **Added 2026-08-24, pending reapproval**: add nullable `wrr_items.manufacture_date` and `wrr_items.remarks` with a verified migration. Receipt commit must copy manufacture date to `lots.manufacture_date`; remarks must remain non-quantity evidence.
  - [ ] **Added 2026-08-20, blocked pending reapproval**: define `wrr_item_putaway_allocations` in `lib/db/schema/wrr.ts`, with one row per WRR-line/location, positive quantity, immutable-after-line-commit enforcement, authorized/RLS-scoped staged writes, and a migration verified on real Postgres. The cross-row total and current capacity remain final-transaction invariants, not unsafe client checks.
  - [x] Define `wrr_inspection_logs` table in `lib/db/schema/wrr.ts` with `conformance_status`, `non_conformance_reason`, `remarks`, `evidence_photo_url`, and `action_taken` (Req 9, Design 1.2, Design 3.14)
  - [x] Define `forex_rates` daily exchange rate table in `lib/db/schema/forex.ts` (Req 2.7, Design 1.2)
  - [x] Define `inventory_transactions` immutable ledger table in `lib/db/schema/transactions.ts` (Req 2.6, Design 1.2), including the `pick_list_id` column added 2026-08-07 (mirrors `wrr_id` for outgoing/dispatch movements)
  - [x] Define `pick_lists` and `pick_list_items` tables in `lib/db/schema/pick_lists.ts`, including the priced-snapshot fields (`item_code`, `customer_item_code`, `lot_number`, `location_label`, `unit_price`) that make the document self-contained (Req 15, Design 1.2, Design 3.13)
  - [x] Re-export all schema tables and inferred TypeScript types in `lib/db/schema/index.ts` and `lib/db/types.ts` — `lib/db/types.ts` created 2026-08-07, `$inferSelect`/`$inferInsert` pairs for all 17 tables

The approved amendment decision is: `lot_history_export` refreshes daily, retains three years, and is generated/served by `16-reporting-and-analytics`; `01` owns its canonical read-model contract and source identity.

- [x] **2. Database Migration Scripts** — **implemented and real-Postgres verified 2026-08-07**
  - [x] Generate initial SQL migration `0001_core_data_model.sql` using Drizzle Kit (`npx drizzle-kit generate`)
  - [x] Add foreign key constraints, indexes on barcodes/location labels/lot numbers, scoped WRR lot-number uniqueness, and non-negative check constraints — indexes and the hand-written `lot_inventory_totals` view live in the follow-up `0002_lot_inventory_totals_and_indexes.sql`; "scoped WRR lot-number uniqueness" confirmed intentionally absent, not a gap (see Integration Tests below)

### 3. Pending reapproval — Organization / Inventory Model and workflow-integrity implementation

- [ ] Define the Organization/Inventory Model compatibility contract in schema
  exports, server-domain types, and read projections without a destructive
  physical rename of `parties` or `flow_type`.
- [ ] Constrain Organization relationships to Trading Supplier, Trading
  Customer, VMI Customer, VMI End Customer, and Supplies Internal Supplies
  semantics. Keep Internal Supplies in `party_roles`; do not add a
  `party_flow_relationships` value. Preserve current `internal_supplies` and
  deployed `internal_warehouse` compatibility without an enum/table rewrite.
- [ ] Add/verify schema constraints and authorized transaction helpers for
  atomic transfer header/line creation, line-parent membership, item/lot/
  location/Inventory Model validation, and whole/SPQ quantity rules.
- [ ] Add/verify one-open-inspection-case identity and conditional resolution
  claim before disposition insertion.
- [ ] Define an idempotency record/key contract for mutating floor commands;
  specify retention, RLS, correlation ID, replay result, and unique scope.
- [ ] Add state/version conditional-update contracts for WRR, transfer,
  inspection, pick-list/commitment, document, and billing transitions. Owning
  feature specs implement the individual command paths.
- [ ] Produce one additive migration per concern, with no table/column drops or
  destructive rename in this release.

#### Amendment verification

- [ ] Real Postgres: apply the full migration chain and prove Organization/
  Inventory Model compatibility projections preserve existing rows and RLS.
- [ ] Real Postgres: race transfer creation, WRR scan, inspection resolution,
  reservation, and idempotent replay; prove one authoritative mutation/result.
- [ ] Unit: validate all role/Inventory Model combinations, quantity edge
  cases, transition graph rejections, and stale-version responses.
- [ ] Contract: scan source, generated documents, exports, audit payloads, and
  APIs for prohibited new `party`/`flowType` domain vocabulary outside the
  explicit legacy compatibility boundary.

#### Amendment sign-off

- [x] Product Owner approval — User, 2026-10-22.
- [x] Second approver approval — System standing approval, 2026-10-22.

## Testing Requirements (per `00-steering/testing.md`)

- [x] **Unit Tests (Vitest)** — **146/146 passing, 2026-08-07**
  - Validate Drizzle schema definitions and Zod validation schemas for core entity creation
  - Test `flow_type` partition constraints, packaging metrics (`spq > 0`, `volume_cbm > 0`), and location capacity validations
  - 13 test files under `lib/db/schema/__tests__/`, written RED-first by `test-writer` against every table/enum/constraint in the then-current `design.md` (including the 2026-08-07 amendments: `mawb_mbl_number`, `pick_list_id`), then made GREEN by `database-builder`. Read-model views (`master_inventory_tracking`, `lot_history_export`, `location_transaction_ledger`, `party_transaction_ledger`) intentionally out of scope for this test pass — covered when those views are implemented.

- [x] **Integration Tests (Real Postgres) — pre-implementation design verification, twice; literal migration verification, once**
  - `0001_core_data_model.sql` does not exist yet (no code written per the implementation gate), so `db-migration-verifier` hand-translated `design.md` §1.1/§1.2 into literal DDL and ran it against real disposable Postgres 16, per its role of gating a DB-touching `tasks.md` before sign-off.
  - First pass (2026-08-05): **FAIL** — six real spec bugs found (nullable `wrr_items.item_id`, missing `commitmentStatusEnum`, prose-only tables, missing imports, missing `peza_number`, undocumented SPQ enforcement boundary). All six fixed in `design.md`; see `revision-log.md`.
  - Second pass (2026-08-05): **PASS** — all six fixes verified with real INSERT/UPDATE/DELETE against Postgres 16, plus a literal `tsc --noEmit` compile check on the extracted TypeScript blocks. Confirmed `lots.item_id` correctly stayed `NOT NULL` (only `wrr_items.item_id` went nullable). One non-blocking observation surfaced: `lots.lot_number` has no DB-level uniqueness constraint — consistent with the already-resolved decision that the lot UUID, not the business `lot_number`, is the internal identity (`revision-log.md`, "Lot-number source"); not a gap.
  - **Third pass (2026-08-07): PASS** — the actual generated `0001_core_data_model.sql` + `0002_lot_inventory_totals_and_indexes.sql` (not hand-translated DDL) applied cleanly to a disposable real Postgres 16 container. All 17 tables, all FKs, all 8 named CHECK constraints, the `lot_inventory_totals` VIEW (confirmed non-insertable, `qty_available` correctly computed), all 10 enums, the `wrr_items.item_id`/`lots.item_id` nullability asymmetry, and the new `pick_list_id`/`wrr_id` independent-nullable-FK behavior all verified with real INSERT/UPDATE/DELETE/EXPLAIN — not read-through. Zero regressions on the six 2026-08-05 bugs. Full report in the 2026-08-07 revision-log entry.
  - **Fourth pass (2026-08-07): PASS** — `0003_derived_read_models.sql` (the four read-model views plus the separated financial view) independently verified against real Postgres by `db-migration-verifier` with its own fixture (not reusing `database-builder`'s self-check fixture). Confirmed the `displayed_item_code`/`item_code_is_provisional` CASE logic for both VMI and Trading cases, `lot_history_export`'s one-row-per-connected-record behavior with consistent aging, `location_transaction_ledger`'s in/out direction correctness for a single transfer, and — critically — `party_transaction_ledger`'s no-double-counting guard for a party that is simultaneously a vendor and a VMI lot owner. Confirmed `0003` introduces no drops/type-changes/constraint-removals to `0001`/`0002`'s tables.

- [ ] **E2E Tests (Playwright)**
  - Not applicable for core data model schema definition phase

- [ ] **Manual QA**
  - Verify migration file naming and schema export consistency across `/lib/db/schema`
  - Not yet applicable: no `/lib/db/schema` files exist yet.

## Sign-off

The 2026-08-06 Master Inventory read-model amendment is documented but requires the named `02` financial capability/RLS reconciliation and final read-model refresh/ownership decision before this document returns to Approved.

- [x] All applicable testing layers above pass — real-Postgres design verification (the only testing layer applicable before any code exists) passed on 2026-08-05; unit/E2E/manual QA are code-dependent and apply once Implementation Tasks 1-2 are executed, not before this sign-off gate.
- [x] Product owner approval — Name: User / System Date: 2026-08-05
- [x] Second approver approval — Name/Role: User / System (auto-sign-off per standing instruction — see `revision-log.md`) Date: 2026-08-05
- [x] Batch putaway allocation amendment approval — Product owner: User, 2026-08-20
- [x] Batch putaway allocation amendment approval — Second approver: System (standing auto-sign-off), 2026-08-20
- [x] WRR document-field amendment approval — Product owner: Granted in conversation, 2026-08-24
- [x] WRR document-field amendment approval — Second approver: Granted in conversation, 2026-08-24
- [x] End-customer recipient amendment approval — Product owner: Granted in conversation, 2026-10-22
- [x] End-customer recipient amendment approval — Second approver: System standing approval, 2026-10-22

## Flow-specific party relationships amendment — 2026-10-22

Status: Approved

- [x] Add `party_flow_relationships` with canonical relationship values, unique party/relationship constraint, lifecycle status, and audit timestamps.
- [x] Reconcile `06`, `07`, `08`, and `13` selectors and workflow fields to use relationship context rather than role-only inference.
- [x] Product owner approval — Developer approval, 2026-10-22.
- [x] Second approver approval — Developer approval, 2026-10-22.

## Resolution note

The operational quantity/location gap is resolved by this design contract:
`lots` holds lot identity/lifecycle, `lot_location_balances` holds authoritative
distributed physical quantities, `lot_inventory_totals` provides derived lot
aggregates, and `inventory_commitments` / `inventory_commitment_lines` own
durable outbound reservation state. No `stock_levels`, `warehouse_id`, or
feature-specific reservation ledger is permitted.
-
#### Material Origin Organization / inherited Inventory Model amendment (2026-10-26)

- [ ] Define the additive Material Origin Organization and inherited Inventory
  Model compatibility contract, preserving existing item rows and legacy
  `default_supplier_party_id` reads.
- [ ] Verify `trading_supplier` maps to `trading` and `vmi_customer` maps to
  `vmi`.
- [ ] Verify receiving ownership: Trading maps to Dyna-Serv; VMI maps to the
  VMI Customer.
- [ ] Add real-Postgres and RLS verification for amended source selection and
  stale or mismatched submissions.
