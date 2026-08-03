# Core Data Model — Tasks
Status: Draft

## Implementation Tasks

- [ ] **1. Drizzle ORM Schema Definitions**
  - [ ] Define PostgreSQL enums in `lib/db/schema/enums.ts` (`partyRoleEnum` with vendor/supplier/customer/end_customer/internal_warehouse, `flowTypeEnum`, `locationTypeEnum`, `lotStatusEnum`, `wrrStatusEnum`, `movementTypeEnum`)
  - [ ] Define `parties` and `party_roles` tables in `lib/db/schema/parties.ts` (Req 2.1, Design 1.2)
  - [ ] Define `item_categories` and `items` tables in `lib/db/schema/items.ts` with `dsgc_item_number`, `customer_item_code`, `spq`, box dimensions (`length_cm`, `width_cm`, `height_cm`), and `volume_cbm` (Req 2.2, Design 1.2)
  - [ ] Define `locations` table in `lib/db/schema/locations.ts` with `Rack+Level-Position` label (e.g. `A1-01`) and `max_cbm_capacity` (Req 2.3, Design 1.2)
  - [ ] Define `lots` table in `lib/db/schema/lots.ts` with `flow_type`, `vendor_lot_number`, `peza_number`, `supplier_invoice_ref`, `ip_number`, `unit_cost`, `manufacture_date`, `expiry_date`, and `status` (Req 2.5, Design 1.2)
  - [ ] Define `wrr_documents` and `wrr_items` tables in `lib/db/schema/wrr.ts` with `cipl_file_url`, `peza_number`, `supplier_invoice_ref`, `ip_number` (Req 2.4, Design 1.2)
  - [ ] Define `forex_rates` daily exchange rate table in `lib/db/schema/forex.ts` (Req 2.7, Design 1.2)
  - [ ] Define `inventory_transactions` immutable ledger table in `lib/db/schema/transactions.ts` (Req 2.6, Design 1.2)
  - [ ] Re-export all schema tables and inferred TypeScript types in `lib/db/schema/index.ts` and `lib/db/types.ts`

- [ ] **2. Database Migration Scripts**
  - [ ] Generate initial SQL migration `0001_core_data_model.sql` using Drizzle Kit (`npx drizzle-kit generate`)
  - [ ] Add foreign key constraints, indexes on barcodes/location labels/lot numbers, and non-negative check constraints

## Testing Requirements (per `00-steering/testing.md`)

- [ ] **Unit Tests (Vitest)**
  - Validate Drizzle schema definitions and Zod validation schemas for core entity creation
  - Test `flow_type` partition constraints, packaging metrics (`spq > 0`, `volume_cbm > 0`), and location capacity validations

- [ ] **Integration Tests (Real Postgres)**
  - Run `db-migration-verifier` agent against real Postgres database to execute `0001_core_data_model.sql`
  - Verify primary keys, foreign key cascades, unique indexes, and ledger immutability constraints

- [ ] **E2E Tests (Playwright)**
  - Not applicable for core data model schema definition phase

- [ ] **Manual QA**
  - Verify migration file naming and schema export consistency across `/lib/db/schema`

## Sign-off

- [ ] All applicable testing layers above pass
- [ ] Product owner approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
