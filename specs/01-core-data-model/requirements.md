# Core Data Model — Requirements
Status: Approved
Updated: 2026-10-23 — Zone-only RCV/Hold location amendment approved
Depends on: specs/00-steering/ (product.md, tech.md, structure.md)

## 1. Overview
The Core Data Model defines the foundational database entities, relationships, constraints, and audit ledgers for Hyperion 3PL / Dyna-Serv. It establishes a single unified schema supporting VMI, Trading, and Supplies inventory partitions out of one physical warehouse.

## 2. User Stories

### Party & Role Management
- **WHEN** staff enroll a business entity, **THE SYSTEM SHALL** record a single `parties` entity (capturing `code`, `name`, `contact_person`, `email`, `phone`, `tax_id`, `address`, `notes`) and assign one or more `party_roles` (`'vendor'`, `'supplier'`, `'customer'`, `'end_customer'`, `'internal_warehouse'`), **SO THAT** vendor consignment, trading procurement, customer withdrawals, end-customer delivery, and internal warehouse operations are scoped per transaction.

### Item Catalog & Packaging Metrics
- **WHEN** staff enroll a product or SKU, **THE SYSTEM SHALL** provide a single unified enrollment form that dynamically reveals conditional fields based on the selected inventory flow (`vmi`, `trading`, `supplies`), storing item identifiers (`code` / Dyna-Serv Item Code, `supplier_item_code`, `customer_item_code`, `dsgc_item_number`), metadata (`name`, `description`, `barcode`, `item_type`, `category_id` / subcategory), default supplier (`default_supplier_party_id`), pricing & valuation (`currency`, `buying_price`, `selling_price`), packaging metrics (`uom`, `spq` pcs/roll per box, `spq_meter` length per roll, outer box dimensions `length_cm`, `width_cm`, `height_cm`, gross `volume_cm3`, calculated `volume_cbm`, `boxes_per_pallet`, `weight_kg`), `min_reorder_level`, and `is_perishable` flag, **SO THAT** barcode scanning, supplier/customer cross-referencing, roll/meter conversions, pallet loading, storage capacity limits, weight constraints, reorder alerts, and VMI/Trading billing use standardized enrollment metrics in one schema table.

### Physical Location Management
- **WHEN** warehouse managers configure storage slots, **THE SYSTEM SHALL** enforce a location label structure formatted as `Rack+Level-Position` (e.g., `A1-01` for Rack `A`, Level `1`, Position `01`) with `max_cbm_capacity` and assign a `location_type` (`'receiving_bay'`, `'inspection'`, `'storage'`, `'picking'`, `'dispatch'`), **SO THAT** physical capacity and putaway algorithms operate on clear location boundaries without `warehouse_id` references, while holding pre-received inspection stock in `'inspection'` prior to inventory balance increment.

#### Zone-only tracking areas amendment — 2026-10-23 (Pending Reapproval)

- `locations.zone` SHALL be one of `storage`, `rcv`, or `hold`.
- `storage` rows SHALL require rack `A`–`I`, level `1`–`4`, position `1`–`30` for rack A or `1`–`15` for racks B–I, positive `max_cbm_capacity`, and a server-generated `Rack+Level-Position` label.
- `rcv` and `hold` rows are tracking-only records. They SHALL store `NULL` for rack, level, position, label, and `max_cbm_capacity`; no physical rack label or capacity is generated for them.
- The existing `location_type` field remains a separate workflow classification and is not used to invent rack data for tracking-only rows.

### Pre-Receiving Staging (CIPL / WRR)
- **WHEN** back-office staff encode an incoming Commercial Invoice & Packing List (CIPL), **THE SYSTEM SHALL** create a `wrr_document` in `staged_pending_arrival` status with expected `wrr_items`, optional attached physical CIPL file document (`cipl_file_url`), `peza_number` (PEZA permit reference), `commercial_invoice_no`, `mawb_mbl_number`, and `ip_number` (Import Permit number), and SHALL retain per-line shipping lot, manufacture date, and receiving remarks, **SO THAT** incoming stock is declared pre-arrival with full regulatory, supplier, and warehouse-receiving-report references.

### Lot Creation & Business Partitioning
- **WHEN** floor staff physically receive and confirm a staged WRR, **THE SYSTEM SHALL** create physical `lots` partitioned by `flow_type` (`'vmi'`, `'trading'`, `'supplies'`), copying the single canonical `lot_number` and its source `wrr_item_id` from the WRR, inheriting `peza_number`, `commercial_invoice_no`, and `ip_number`, and storing `manufacture_date`, `expiry_date`, `unit_price` (in USD), and owner `party_id`, **SO THAT** FEFO/FIFO rotation, regulatory compliance, and valuation remain strictly maintained.

### Daily Forex Rates & Inventory Valuation
- **WHEN** financial reporting or inventory valuation dashboards render master stock balances, **THE SYSTEM SHALL** evaluate pieces on hand, boxes on hand (`pcs / spq`), CBM occupied (`boxes × volume_cbm`), USD inventory value (`pcs × unit_price`), and convert to PHP using the daily exchange rate in `forex_rates`, **SO THAT** inventory balances and monetary valuation are accurately tracked in USD and PHP.

### Item Drill-Down & FEFO/FIFO Location Breakdown
- **WHEN** a user views the Master Inventory dashboard, **THE SYSTEM SHALL** prioritize and display the Item Code first in the view, and **WHEN** a user clicks an item, **THE SYSTEM SHALL** display the active lots ordered by FEFO/FIFO sequence with their stacked location tags, lot numbers, and available quantities, and provide an action button to open a **History Modal** showing chronological movement history (date, time, user, total quantity received, dispatched/withdrawn), **SO THAT** the primary view remains focused on immediate fulfillment needs while full audit history remains easily accessible.

### Master Inventory Tracking & Analytics Read Models
- **WHEN** the Master Inventory or Analytics surface calculates inventory age, **THE SYSTEM SHALL** use `lot_number` as the absolute business identity and derive the age start from the earliest confirmed receiving `inventory_transaction` connected to that `lot_number`; `lots.created_at` alone SHALL not be the aging basis.
- **WHEN** a user filters or groups Master Inventory, **THE SYSTEM SHALL** support category, item code, `flow_type`, party, `lot_number`, `locations`, status, and date range, while preserving a detail result keyed by `lot_number`.
- **WHEN** an Excel report is exported, **THE SYSTEM SHALL** expose a connected lot-history read model with one detail row per receiving, putaway, transfer, inspection/disposition, pick, and current-balance event. Grouped summaries SHALL never replace or merge the connected detail history.
- **WHEN** a row displays an item code, **THE SYSTEM SHALL** display `supplier_item_code` for `flow_type = 'vmi'` and `dsgc_item_number` for `flow_type = 'trading'` or `'supplies'`. The synonym `dsgc part number` is prohibited.
  - **WHEN** financial metrics are requested, the canonical read model MAY expose approved revenue, cost, profit, margin, and price references only through a projection whose access is enforced by the RBAC/RLS owner; floor staff and party users SHALL receive no financial columns.

The `01` canonical `lot_history_export` read-model contract refreshes daily, retains three years of history, and is generated and served by `16-reporting-and-analytics`. `01` owns the canonical model and source identity; `16` owns the reporting projection/export job and delivery surface.

### Integrated Inventory Picking & FIFO Override
- **WHEN** staff prepare an outbound withdrawal, **THE SYSTEM SHALL** allow them to initiate picking directly from the Master Inventory page (removing the standalone picking page), displaying a dropdown of available lot numbers that enforces strict FIFO/FEFO sequence across dispersed locations, and **WHEN** staff attempt to override the FIFO sequence (e.g., picking a newer lot out-of-order), **THE SYSTEM SHALL** require a manager's approval via the Approval Queue before generating the final pick list, **SO THAT** picking operations are seamlessly integrated with inventory visibility while strictly enforcing rotation compliance.

## 3. Acceptance Criteria

1. **Warehouse Unification**:
   - The database schema MUST NOT contain a `warehouse_id` column anywhere.

2. **Entity Terminology**:
   - Database tables MUST be named `parties`, `party_roles`, `items`, `item_categories`, `locations`, `lots`, `lot_location_balances`, `inventory_units`, `inventory_commitments`, `inventory_commitment_lines`, `wrr_documents`, `wrr_items`, `wrr_item_putaway_allocations`, `wrr_inspection_logs`, `forex_rates`, `inventory_transactions`, `pick_lists`, and `pick_list_items`. `inventory_units` is the durable physical-box identity/location layer and is not a quantity ledger; `lot_inventory_totals` is a derived read model, not a stored table. **Schema amendment (2026-08-06, not yet verified — see design.md §6)**: `wrr_advance_notices` is a new table added after this spec's original approval, originating from `22-parties-portal` R11's supplier-initiated barcode pre-labeling flow; it requires its own `db-migration-verifier` pass before implementation and does not inherit this spec's existing sign-off.

3. **Party Role Set**:
   - `party_roles` MUST support `'vendor'`, `'supplier'`, `'customer'`, `'end_customer'`, and `'internal_warehouse'`.

4. **Item Identifiers & Packaging**:
   - `items` MUST store `dsgc_item_number` and `customer_item_code` alongside internal `code` and `barcode`.

5. **Regulatory & Invoice References**:
   - Both `wrr_documents` and `lots` MUST support `peza_number`, `commercial_invoice_no` (representing the CIPL), and `ip_number`.

6. **WRR-Sourced Lot Number**:
   - `wrr_items.lot_number` MUST be the source business lot number from the WRR and MUST be required for receipt confirmation.
   - `lots.lot_number` MUST be copied from the confirmed WRR item and linked by `lots.wrr_item_id` for operational receipts. An approved opening-balance migration MAY instead link the lot to `migration_batches.migration_batch_id` and MUST create an `inventory_reconciliation` transaction; it MUST NOT invent a receiving WRR.
   - The internal UUID remains the database identity. `lot_number` MUST NOT be globally unique because the same business lot number may recur across distinct WRR receipts or items; uniqueness MUST be scoped to the relevant WRR item/lot context. No second vendor-lot field is permitted.
   - **Amended 2026-08-20, pending reapproval:** `wrr_items.putaway_location_id` MAY remain null and is not authoritative for a split receipt. `store`-disposition lines use one or more staged `wrr_item_putaway_allocations`; their positive quantities must total the line's expected quantity and target active `storage` locations before receipt confirmation. `inspect` lines leave it null and are posted to one active `inspection` location by `07`'s confirmation command.
   - **Amended 2026-08-24, pending reapproval:** `wrr_items` MUST retain optional `manufacture_date` and `remarks` entered during WRR staging. On receipt commit, `manufacture_date` MUST be copied to `lots.manufacture_date`. `remarks` remains WRR evidence and MUST NOT alter inventory quantity or availability.

7. **Partition-Based Withdrawal SPQ Enforcement**:
   - Validation engines MUST reject withdrawal requests for `vmi` or `trading` lots if the requested piece quantity is not an exact multiple of `items.spq` ($\text{qty} \pmod{\text{spq}} = 0$).
   - `supplies` partition MUST allow individual piece-level withdrawals ($\text{qty} \ge 1$).

8. **Daily Forex Valuation**:
   - `forex_rates` MUST store daily exchange rates (`effective_date`, `usd_to_php_rate`) to calculate real-time PHP inventory valuation from USD unit prices.

9. **WRR CIPL Attachments**:
   - `wrr_documents` MUST support storing a physical file attachment URL (`cipl_file_url`) alongside encoded expected line items.

10. **Location Labeling & Capacity**:
   - `storage` locations MUST enforce positive `max_cbm_capacity`, rack `A`–`I`, level `1`–`4`, and position `1`–`30` for rack A or `1`–`15` for racks B–I, with formatted label naming as `Rack+Level-Position` (e.g. `A1-01`). `rcv` and `hold` tracking rows MUST allow the rack-specific fields, label, and capacity to remain NULL.

11. **FIFO/FEFO Eligibility Gate**:
    - Lot picking algorithms MUST evaluate `lots.status = 'available'` as the sole eligibility flag.

12. **Ledger Immutability & History**:
   - `inventory_transactions` records MUST NOT be updated or deleted after insertion. Inbound and outbound movements MUST record full historical logs. Variance adjustments MUST insert a new transaction with `movement_type = 'inventory_reconciliation'`.

13. **Outbound Documentation Ledger**:
   - All outbound `inventory_transactions` (withdrawals/dispatch) MUST capture the `ar_reference_no` (Acknowledgement Receipt Reference).

14. **Distributed Lot Quantity and Placement**:
   - The schema MUST represent one lot across multiple `locations` through `lot_location_balances`; it MUST NOT introduce `warehouse_id` or a duplicate `stock_levels` ledger.
   - Each balance row MUST store `qty_received`, `qty_remaining`, and `qty_committed`, enforce non-negative quantities, and enforce `qty_committed <= qty_remaining`.
   - `qty_available` MUST be derived as `qty_remaining - qty_committed` and MUST NOT be stored.
   - A batch-received WRR line MAY distribute one lot across multiple locations. `wrr_item_putaway_allocations` is a pre-commit plan, not a second inventory ledger; only its successful receipt commit creates authoritative `lot_location_balances` and immutable receiving transactions.
   - Every received physical box SHALL have one stable `inventory_units.unit_id`, a 1-based source-line box index, and its exact current `location_id`. Reprinting the same WRR box label MUST retain the same identity. Picking selects these rows while authoritative quantities remain exclusively in `lot_location_balances`.

15. **Durable Outbound Reservation**:
   - Stage 1 commitment MUST create `inventory_commitments` and `inventory_commitment_lines` linked to the committed `pick_list` and exact lot/location balance rows.
   - Stage 2 dispatch, cancellation/release, and expiry MUST update the reservation and affected balance rows atomically and idempotently.

16. **Master Inventory Traceability Contract**:
   - A canonical read model MUST retain `lot_number`, `flow_type`, item/category identity, location, quantities, and the source record reference for every connected history event.
   - The read model MUST distinguish operational fields from financial projections so RLS/RBAC can deny financial columns at the data layer.
   - Aging MUST use confirmed receiving history keyed by `lot_number`, never an arbitrary client date or `lots.created_at` alone.

## 4. Out of Scope
- Role-based access control policy enforcement (specified in `02-rbac-roles`).
- Offline sync queue engine & IndexedDB schema (specified in `03-offline-mode-and-client-storage`).
- Automated CBM billing rate calculation & period invoicing (specified in `12-vmi-billing`).
- Withdrawal two-stage commitment & price margin logic (specified in `08` and `13`).
- Specific printed form layout requirements for the WRR (handled in `07-incoming-receiving`).

## 5. Approved amendment — outbound end-customer identity (2026-10-22)

- `customer` means the company's direct commercial buyer for VMI and Trading.
- `end_customer` is the outbound recipient classification. A party may also be a `supplier` or `customer`.
- `pick_lists` SHALL retain the existing VMI/customer relationship and add a required `end_customer_party_id` for the physical recipient.
- Existing rows SHALL be backfilled from `customer_party_id` before the new field becomes required. In the normal same-party case both IDs are equal.

## 6. Approved amendment — flow-specific party relationships (2026-10-22)

- A single `parties` row SHALL remain the organization master record.
- The system SHALL store explicit active flow-specific relationships so one Customer organization can be selected distinctly as a VMI Customer or Trading Customer, and a Supplier can be selected as a Trading inbound source.
- Relationship values SHALL be `vmi_customer`, `trading_customer`, and `trading_supplier`; they SHALL be unique per party and independently activatable without duplicating the organization.

## 7. Pending reapproval — Organization / Inventory Model and workflow-integrity amendment (2026-10-22)

### 7.1 Canonical product terminology with compatibility boundary

- **Organization** SHALL be the canonical product and new domain/API term for
  an organization or company. `party`/`parties` is legacy physical-schema
  vocabulary during the staged migration only; it SHALL not appear in new
  user-facing copy or new domain contracts.
- **Inventory Model** SHALL be the canonical product and new domain/API term
  for the `vmi`, `trading`, and `supplies` partition. `flow_type`/`flowType`
  is legacy physical-schema vocabulary during the staged migration only.
- The first release SHALL use expand → migrate → contract: add approved
  Organization/Inventory Model compatibility contracts, migrate callers and
  documents, verify data and RLS, then retire legacy names. It MUST NOT perform
  a destructive table or column rename in the first release.

### 7.2 Organization roles and inventory-model relationships

- The only organization role families are:
  1. **Supplier** — Trading only;
  2. **Customer** — explicitly either Trading Customer or VMI Customer;
  3. **End Customer** — VMI only.
  4. **Internal Supplies** — Supplies only.
- Existing `internal_supplies` is the current application-schema role value.
  Older deployed `internal_warehouse` values SHALL render as Internal Supplies
  through a read-compatible adapter until their already-planned migration is
  verified. This terminology amendment SHALL NOT alter the enum, table, or
  existing records by itself.
- Internal Supplies SHALL remain valid only for the Supplies Inventory Model
  and SHALL NOT create a `party_flow_relationships` row.
- Stock owner, stock source, and destination SHALL be treated as transaction or
  lot context, not additional Organization roles.
- Every relationship selection SHALL validate the Organization, active status,
  allowed role, and Inventory Model inside the authoritative transaction.

### 7.3 Core transaction integrity requirements

- A transfer SHALL persist its header and all `transfer_lines` atomically. Each
  line SHALL belong to the submitted transfer and validate item, lot, source
  location, Inventory Model, whole/SPQ-compatible quantity, and available
  balance before it is accepted.
- Transfer, WRR, inspection case, pick list, commitment, billing period, and
  generated-document transitions SHALL use an explicit allowed-transition
  graph. Every state-changing update SHALL condition on its expected current
  status/version and check that exactly one row changed.
- An inspection case SHALL have at most one open case for the approved source
  identity/context, and resolution SHALL atomically claim the open case before
  recording its disposition.
- Quantity fields used for inventory movement or commitment SHALL reject null,
  non-finite, zero, negative, fractional, and non-SPQ-compatible values where
  whole physical units are required.
- Every mutating floor command SHALL have a stable operation identity and
  return the original authoritative result on a safe retry after a lost
  response. It SHALL never apply stock movement twice.
-
### Material Origin Organization amendment (2026-10-26)

Material Enrollment may select an active Organization with either the
`trading_supplier` or `vmi_customer` relationship and derive the Material's
default Inventory Model from that relationship. This is an enrollment default,
not the authoritative physical stock-owner field. At receipt, Trading lots are
owned by Dyna-Serv and VMI lots are owned by the selected VMI Customer. The
additive compatibility contract and migration path for this default belong to
the reapproved `06-party-and-item-enrollment` amendment.
