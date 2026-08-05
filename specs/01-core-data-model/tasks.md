# Core Data Model — Tasks
Status: Approved

## Implementation Tasks

- [ ] **1. Drizzle ORM Schema Definitions**
  - [ ] Define PostgreSQL enums in `lib/db/schema/enums.ts` (`partyRoleEnum` with vendor/supplier/customer/end_customer/internal_warehouse, `flowTypeEnum`, `locationTypeEnum`, `lotStatusEnum`, `wrrStatusEnum`, `movementTypeEnum`, `pickListStatusEnum`, `conformanceStatusEnum`, `nonConformanceReasonEnum`)
  - [ ] Define `parties` and `party_roles` tables in `lib/db/schema/parties.ts` (Req 2.1, Design 1.2)
  - [ ] Define `item_categories` and `items` tables in `lib/db/schema/items.ts` with `dsgc_item_number`, `customer_item_code`, `spq`, box dimensions (`length_cm`, `width_cm`, `height_cm`), and `volume_cbm` (Req 2.2, Design 1.2)
  - [ ] Define `locations` table in `lib/db/schema/locations.ts` with `Rack+Level-Position` label (e.g. `A1-01`) and `max_cbm_capacity` (Req 2.3, Design 1.2)
  - [ ] Define `lots` table in `lib/db/schema/lots.ts` with WRR-sourced `lot_number`, `wrr_item_id`, `flow_type`, `peza_number`, `commercial_invoice_no`, `ip_number`, `unit_cost`, `manufacture_date`, `expiry_date`, and `status` (Req 2.5/6, Design 1.2)
  - [ ] Define `lot_location_balances` with unique lot/location placement rows, `qty_received`, `qty_remaining`, `qty_committed`, versioning, and non-negative/committed-within-remaining constraints (Req 13, Design 1.2)
  - [ ] Define the `lot_inventory_totals` aggregate read model and document `qty_available = qty_remaining - qty_committed` as derived-only (Req 13, Design 1.2)
  - [ ] Define `inventory_commitments` and `inventory_commitment_lines` as the durable Stage 1 reservation relation, including uniqueness, lifecycle, expiry, release, execution, and concurrency constraints (Req 14, Design 1.2)
  - [ ] Define `wrr_documents` and `wrr_items` tables in `lib/db/schema/wrr.ts` with `cipl_file_url`, `peza_number`, `supplier_invoice_ref`, `ip_number` (Req 2.4, Design 1.2)
  - [ ] Define `wrr_inspection_logs` table in `lib/db/schema/wrr.ts` with `conformance_status`, `non_conformance_reason`, `remarks`, `evidence_photo_url`, and `action_taken` (Req 9, Design 1.2, Design 3.14)
  - [ ] Define `forex_rates` daily exchange rate table in `lib/db/schema/forex.ts` (Req 2.7, Design 1.2)
  - [ ] Define `inventory_transactions` immutable ledger table in `lib/db/schema/transactions.ts` (Req 2.6, Design 1.2)
  - [ ] Define `pick_lists` and `pick_list_items` tables in `lib/db/schema/pick_lists.ts`, including the priced-snapshot fields (`item_code`, `customer_item_code`, `lot_number`, `location_label`, `unit_price`) that make the document self-contained (Req 15, Design 1.2, Design 3.13)
  - [ ] Re-export all schema tables and inferred TypeScript types in `lib/db/schema/index.ts` and `lib/db/types.ts`

- [ ] **2. Database Migration Scripts**
  - [ ] Generate initial SQL migration `0001_core_data_model.sql` using Drizzle Kit (`npx drizzle-kit generate`)
  - [ ] Add foreign key constraints, indexes on barcodes/location labels/lot numbers, scoped WRR lot-number uniqueness, and non-negative check constraints

## Testing Requirements (per `00-steering/testing.md`)

- [ ] **Unit Tests (Vitest)**
  - Validate Drizzle schema definitions and Zod validation schemas for core entity creation
  - Test `flow_type` partition constraints, packaging metrics (`spq > 0`, `volume_cbm > 0`), and location capacity validations
  - Not yet applicable: no `lib/db/schema` code exists to unit test. Applies once Implementation Task 1 is executed.

- [x] **Integration Tests (Real Postgres) — pre-implementation design verification, twice**
  - `0001_core_data_model.sql` does not exist yet (no code written per the implementation gate), so `db-migration-verifier` hand-translated `design.md` §1.1/§1.2 into literal DDL and ran it against real disposable Postgres 16, per its role of gating a DB-touching `tasks.md` before sign-off.
  - First pass (2026-08-05): **FAIL** — six real spec bugs found (nullable `wrr_items.item_id`, missing `commitmentStatusEnum`, prose-only tables, missing imports, missing `peza_number`, undocumented SPQ enforcement boundary). All six fixed in `design.md`; see `revision-log.md`.
  - Second pass (2026-08-05): **PASS** — all six fixes verified with real INSERT/UPDATE/DELETE against Postgres 16, plus a literal `tsc --noEmit` compile check on the extracted TypeScript blocks. Confirmed `lots.item_id` correctly stayed `NOT NULL` (only `wrr_items.item_id` went nullable). One non-blocking observation surfaced: `lots.lot_number` has no DB-level uniqueness constraint — consistent with the already-resolved decision that the lot UUID, not the business `lot_number`, is the internal identity (`revision-log.md`, "Lot-number source"); not a gap.
  - The literal migration-file execution this bullet originally described applies once Implementation Task 2 generates `0001_core_data_model.sql` — that run still needs to happen against the actual generated file before deployment, even though the design itself is now verified buildable.

- [ ] **E2E Tests (Playwright)**
  - Not applicable for core data model schema definition phase

- [ ] **Manual QA**
  - Verify migration file naming and schema export consistency across `/lib/db/schema`
  - Not yet applicable: no `/lib/db/schema` files exist yet.

## Sign-off

- [x] All applicable testing layers above pass — real-Postgres design verification (the only testing layer applicable before any code exists) passed on 2026-08-05; unit/E2E/manual QA are code-dependent and apply once Implementation Tasks 1-2 are executed, not before this sign-off gate.
- [x] Product owner approval — Name: User / System Date: 2026-08-05
- [x] Second approver approval — Name/Role: User / System (auto-sign-off per standing instruction — see `revision-log.md`) Date: 2026-08-05

## Resolution note

The operational quantity/location gap is resolved by this design contract:
`lots` holds lot identity/lifecycle, `lot_location_balances` holds authoritative
distributed physical quantities, `lot_inventory_totals` provides derived lot
aggregates, and `inventory_commitments` / `inventory_commitment_lines` own
durable outbound reservation state. No `stock_levels`, `warehouse_id`, or
feature-specific reservation ledger is permitted.
