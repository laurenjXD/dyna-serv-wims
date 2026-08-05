# Core Data Model — Tasks
Status: Approved

## Implementation Tasks

- [ ] **1. Drizzle ORM Schema Definitions**
  - [ ] Define PostgreSQL enums in `lib/db/schema/enums.ts` (`partyRoleEnum` with vendor/supplier/customer/end_customer/internal_warehouse, `flowTypeEnum`, `locationTypeEnum`, `lotStatusEnum`, `wrrStatusEnum`, `movementTypeEnum`)
  - [ ] Define `parties` and `party_roles` tables in `lib/db/schema/parties.ts` (Req 2.1, Design 1.2)
  - [ ] Define `item_categories` and `items` tables in `lib/db/schema/items.ts` with `dsgc_item_number`, `customer_item_code`, `spq`, box dimensions (`length_cm`, `width_cm`, `height_cm`), and `volume_cbm` (Req 2.2, Design 1.2)
  - [ ] Define `locations` table in `lib/db/schema/locations.ts` with `Rack+Level-Position` label (e.g. `A1-01`) and `max_cbm_capacity` (Req 2.3, Design 1.2)
  - [ ] Define `lots` table in `lib/db/schema/lots.ts` with WRR-sourced `lot_number`, `wrr_item_id`, `flow_type`, `peza_number`, `commercial_invoice_no`, `ip_number`, `unit_cost`, `manufacture_date`, `expiry_date`, and `status` (Req 2.5/6, Design 1.2)
  - [ ] Define `lot_location_balances` with unique lot/location placement rows, `qty_received`, `qty_remaining`, `qty_committed`, versioning, and non-negative/committed-within-remaining constraints (Req 13, Design 1.2)
  - [ ] Define the `lot_inventory_totals` aggregate read model and document `qty_available = qty_remaining - qty_committed` as derived-only (Req 13, Design 1.2)
  - [ ] Define `inventory_commitments` and `inventory_commitment_lines` as the durable Stage 1 reservation relation, including uniqueness, lifecycle, expiry, release, execution, and concurrency constraints (Req 14, Design 1.2)
  - [ ] Define `wrr_documents` and `wrr_items` tables in `lib/db/schema/wrr.ts` with `cipl_file_url`, `peza_number`, `supplier_invoice_ref`, `ip_number` (Req 2.4, Design 1.2)
  - [ ] Define `forex_rates` daily exchange rate table in `lib/db/schema/forex.ts` (Req 2.7, Design 1.2)
  - [ ] Define `inventory_transactions` immutable ledger table in `lib/db/schema/transactions.ts` (Req 2.6, Design 1.2)
  - [ ] Re-export all schema tables and inferred TypeScript types in `lib/db/schema/index.ts` and `lib/db/types.ts`

- [ ] **2. Database Migration Scripts**
  - [ ] Generate initial SQL migration `0001_core_data_model.sql` using Drizzle Kit (`npx drizzle-kit generate`)
  - [ ] Add foreign key constraints, indexes on barcodes/location labels/lot numbers, scoped WRR lot-number uniqueness, and non-negative check constraints

## Testing Requirements (per `00-steering/testing.md`)

- [ ] **Unit Tests (Vitest)**
  - Validate Drizzle schema definitions and Zod validation schemas for core entity creation
  - Test `flow_type` partition constraints, packaging metrics (`spq > 0`, `volume_cbm > 0`), and location capacity validations

- [ ] **Integration Tests (Real Postgres)**
  - Run `db-migration-verifier` agent against real Postgres database to execute `0001_core_data_model.sql`
  - Verify primary keys, foreign key cascades, unique indexes, lot/location quantity checks, reservation concurrency/release/expiry constraints, and ledger immutability constraints

- [ ] **E2E Tests (Playwright)**
  - Not applicable for core data model schema definition phase

- [ ] **Manual QA**
  - Verify migration file naming and schema export consistency across `/lib/db/schema`

## Sign-off

- [ ] All applicable testing layers above pass
- [x] Product owner approval — Name: User / System Date: 2026-08-05
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________

## Resolution note

The operational quantity/location gap is resolved by this design contract:
`lots` holds lot identity/lifecycle, `lot_location_balances` holds authoritative
distributed physical quantities, `lot_inventory_totals` provides derived lot
aggregates, and `inventory_commitments` / `inventory_commitment_lines` own
durable outbound reservation state. No `stock_levels`, `warehouse_id`, or
feature-specific reservation ledger is permitted.
