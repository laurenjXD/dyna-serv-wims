# Party & Item Enrollment — Implementation Plan

Status: Under Revision
Updated: 2026-10-23 — Zone-only RCV/Hold location amendment pending reapproval

## Implementation gate

No application code, migration, server action, route, or master-data mutation may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent.
- `01-core-data-model` is approved and its final `parties`, `party_roles`, `items`, `item_categories`, and `locations` fields/constraints are reconciled here.
- `02-rbac-roles` approves the capability/session/scope/RLS contract, including `locations.read`/`locations.manage`.
- `17-product-categorization-and-classification` confirms category ownership and read contract.
- `12-vmi-billing` and `13-trading-orders-and-pricing` confirm that enrollment does not redefine billing or final transaction pricing.
- `05-ui-shell-and-navigation` and `03-offline-mode-and-client-storage` confirm shell and online-only mutation boundaries.
- `04-services-and-infrastructure` confirms the Contact Party action reuses the existing Resend/`email_deliveries` pipeline without redefining it. **(Added 2026-08-07)**
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Dependencies and constraints

- Canonical entities are `parties`, `items`, and `locations`; this feature now owns enrollment for all three (added 2026-08-07 — see `specs/00-steering/revision-log.md` for the location-enrollment scope-expansion rationale) and does not introduce `suppliers` or `SKU` entities.
- `party_roles` are business classifications, never application-user roles.
- One warehouse only; no `warehouse_id`.
- Master-data mutations, including location mutations and the Contact Party email trigger, are online-only in v1 and may not enter the offline Tier 1 queue.
- UI visibility is not authorization; every read/mutation requires the approved server capability and RLS boundary.
- Enrollment does not create lots, WRRs, inventory transactions, approvals, billing outcomes, or final priced documents.
- The Contact Party action consumes `04-services-and-infrastructure`'s existing operational Resend pipeline as-is; this feature does not redefine or duplicate that pipeline. **(Added 2026-08-07)**
- The location Movement Ledger and party Transaction Ledger consume `01-core-data-model`'s `location_transaction_ledger`/`party_transaction_ledger` read models as-is, both gated by the page's existing `locations.read`/`parties.read` capability rather than a new one; this feature does not define or duplicate those read-model queries. **(Added 2026-08-07)**

## Implementation tasks

### 1. Resolve the master-data contract

Testing: Documentation/schema review; no implementation tests.

- [x] Reconcile the exact party fields, item fields, enum values, nullability, precision, unique constraints, active-state behavior, and audit expectations with approved `01-core-data-model` documents. (`01` approved; exact column names, types, constraints, and enum values reconciled in `design.md` §2 and §5/§6, 2026-08-05.)
- [x] Resolve whether the current core schema's `supplier_item_code` naming and other item field names are final and update dependent specs consistently. (`01` approved with final names: `supplier_item_code`, `customer_item_code`, `dsgc_item_number`; `design.md` updated, 2026-08-05.)
- [x] Confirm that item enrollment remains a shared master record with no persisted flow ownership until a core/downstream relation is approved. (Confirmed: `items` table in approved `01` has no `flow_type` column; `design.md` §6 Flow-specific fields subsection documents this explicitly, 2026-08-05.)
- [x] Confirm the meaning and lifecycle of core item reference price fields without redefining Trading or VMI pricing. (`01` approved with `buying_price`/`selling_price` as nullable `decimal(12,4)` reference columns; `design.md` §6 Price boundary strengthened to prohibit writing these to any order line, commitment, or billing row, 2026-08-05.)
- [x] Confirm whether category creation belongs exclusively to spec `17` and define the read/reference contract. (Confirmed: `design.md` §6 Category ownership explicitly states `item_categories` is read-only in `06`; creation/editing/hierarchy belong exclusively to `17`, 2026-08-05.)
- [x] **(Added 2026-08-07)** Reconcile the exact `locations` fields, enum values, label-format rule, and unique constraint with approved `01-core-data-model`, and confirm the enrollment/ownership boundary against the receiving/transfer/withdrawal specs. (`01` approved; `locations` field block reconciled in `design.md` §2; ownership boundary — enrollment here, putaway/occupied-CBM/inventory-transaction use in `07`/`08`/`11` — documented in `design.md` §6a, 2026-08-07.)
- [x] **(Added 2026-08-07)** Confirm the Contact Party email action's capability gate and pipeline reuse. (Gated by `parties.manage`; reuses `04`'s existing Resend/`email_deliveries` pipeline unchanged, per `design.md` §5a, 2026-08-07.)
- [x] Define duplicate normalization rules for codes, barcodes, names, emails, phone numbers, and cross-reference fields. *(Resolved 2026-08-09: item codes, barcodes (`dsw_id`, `supplier_item_code`, `customer_item_code`), and location labels are hard-blocked by unique DB constraints — conflict returns a validation error. Party names and contact fields trigger a soft application-layer warning; supervisor can override and a duplicate record is created. DB does not enforce party-name uniqueness. See revision-log.md.)* (Database UNIQUE constraints on `parties.code`, `items.code`, and `items.barcode` are confirmed in approved `01`; application-layer normalization rules — e.g. case folding, whitespace stripping before uniqueness check — require application design decisions not yet finalized.)
- [ ] Define deactivation/reference-impact rules for parties and items and the safe stale-edit/version strategy. (Deactivation impact rules for items documented in `design.md` §6; party deactivation impact documented in §5. Full stale-edit/optimistic-concurrency strategy — including conflict UX and version token design — requires additional application design work and `02` RLS approval before implementation.)
- [ ] Define which changes require an audit event, reason, confirmation, or second approval. (Requires `02-rbac-roles` audit event catalog and `04-services-and-infrastructure` audit boundary to be finalized before implementation.)
- [ ] Record cross-spec decisions in `specs/00-steering/revision-log.md` where needed.

### 2. Define authorization and data boundaries

Testing: Authorization contract tests; real-Postgres integration before sign-off.

- [ ] Add candidate resource/action capabilities to the canonical RBAC catalog and get `02` approval; do not implement role-name checks.
- [ ] Define global operational/admin access versus party-scoped read access for parties, items, and categories.
- [ ] Define how party-user item visibility is derived without exposing the whole catalog through `default_supplier_party_id` or search.
- [ ] Define RLS policies for `parties`, `party_roles`, `items`, and `item_categories` with default deny and separate read/write behavior.
- [ ] Define server-side authorization helpers for create, update, deactivate, role classification, and category reference reads.
- [ ] Define not-found/forbidden behavior that prevents cross-party existence leakage.
- [ ] Have `rbac-rls-reviewer` review the policy matrix and server/data access design.

### 3. Design and implement party enrollment

Testing: Unit validation tests; real-Postgres constraints/RLS integration; Playwright create/edit/deactivate flows.

- [ ] Define the typed party input/read models without duplicating Drizzle schema definitions.
- [ ] Build party create form with required fields, normalization, role selection, accessible validation, and safe server submission.
- [ ] Validate party code/name/role requirements on both client and server.
- [ ] Enforce uniqueness and duplicate handling through authoritative database constraints and actionable error mapping.
- [ ] Build paginated/searchable party list with capability/scope-safe filtering.
- [ ] Build party detail/edit flow with optimistic concurrency and conflict recovery.
- [ ] Build deactivation flow with explicit confirmation, impact messaging, and audit attribution.
- [ ] Prevent destructive deletion when references exist; preserve historical records.
- [ ] Ensure party role changes do not create or modify application-user RBAC assignments.
- [ ] Build the party detail Transaction Ledger: render `01-core-data-model`'s `party_transaction_ledger` read model as a read-only, paginated table gated by `parties.read` — the same capability as the page itself, no new gate (requirements.md R2.6; design.md §5b Transaction Ledger subsection).

### 4. Design and implement item enrollment

Testing: Unit validation/calculation tests; real-Postgres constraints/RLS integration; Playwright create/edit/deactivate flows.

- [ ] Define typed item input/read models mapped to the approved `items` schema.
- [ ] Build the item form with canonical identifiers, barcode, name/description, item type, category selector, default supplier selector, UOM, packaging, dimensions, weight, reorder, perishability, active state, and approved reference fields.
- [ ] Implement conditional UOM/item-type sections for `spq_meter`, pallet/box metrics, dimensions, and perishability without creating unsupported flow-specific columns.
- [ ] Implement one authoritative volume calculation/rounding rule and show the result to the user.
- [ ] Validate positive/non-negative values, decimal precision, required combinations, and barcode/code normalization on client and server.
- [ ] Implement searchable active-party selector for default supplier; reject free-text identifiers as the relation.
- [ ] Implement category selector against authorized `item_categories` records; defer category management to `17`.
- [ ] Build paginated/searchable item list and detail/edit/deactivate flows.
- [ ] Prevent destructive deletion when lots, WRR records, or inventory transactions reference the item.
- [ ] Ensure reference price fields cannot finalize Trading prices or VMI billing outcomes.

### 4a. Design and implement location enrollment (added 2026-08-07, maps to requirements.md R3, design.md §2/§6a)

Testing: Unit validation/calculation tests; real-Postgres constraints/RLS integration; Playwright create/edit/deactivate flows.

- [ ] Define typed location input/read models mapped to the approved `locations` schema (design.md §2 canonical fields block).
- [ ] Build the location form with a `Storage`/`RCV`/`Hold` zone select; disable and grey rack, level, position, and max CBM for RCV/Hold; server computes the storage `Rack+Level-Position` label (design.md §6a).
- [ ] Validate storage rack A–I, level 1–4, position A 1–30/B–I 1–15, positive max CBM, and RCV/Hold NULL-field semantics on client and server.
- [ ] Enforce server-side `label` uniqueness re-validation on both create and edit (design.md §6a Create step 4, Edit/deactivate).
- [ ] Build paginated/searchable location Table View with `locations.read`-scoped filtering; include Storage, RCV, and Hold rows, leaving rack-specific cells blank for RCV/Hold (design.md §7).
- [ ] Build location detail/edit/deactivate flow with the same stale-edit protection pattern used for parties/items.
- [ ] Prevent destructive deletion when `lot_location_balances` or `inventory_transactions` reference the location; preserve historical records (requirements.md R3.8, design.md §6a Edit/deactivate).
- [ ] Gate create/edit/deactivate behind `locations.manage`; gate read/list behind `locations.read` — verify both against the `02-rbac-roles` §3.2 catalog before implementation, do not invent capability names.
- [ ] Confirm no location mutation is registered with the offline queue (requirements.md R7.3; design.md §9).
- [ ] Build the location detail Movement Ledger: render `01-core-data-model`'s `location_transaction_ledger` read model as a read-only, paginated table gated by `locations.read` — the same capability as the page itself, no new gate (requirements.md R3.10; design.md §6a Movement Ledger subsection).

### 4b. Design and implement the Contact Party email action (added 2026-08-07, maps to requirements.md R1.9, design.md §5a)

Testing: Unit tests for the server action's input/authorization/error-mapping; integration test against `04`'s `email_deliveries` contract (mocked provider); Playwright trigger flow.

- [ ] Add the "Contact Party" button to the party detail view (`[partyId]/page.tsx`), gated by `parties.manage`.
- [ ] Build the minimal composer: fixed template + optional free-text field, per design.md §5a's stated v1 scope (no full composer/thread UI).
- [ ] Implement the server action: resolve `parties.email`/`contact_person` server-side (never client-supplied), reject if `email` is null/empty with an actionable error, and invoke `04-services-and-infrastructure`'s existing Resend operational pipeline exactly as already used for other operational emails — no new pipeline, table, or sender identity.
- [ ] Verify the send is tracked via `04`'s existing `email_deliveries` row (`template_key`/`template_version`, `resource_type = 'party'`, `resource_id`, `idempotency_key`, correlation ID) with no parallel tracking table introduced by this feature.
- [ ] Verify failure semantics match `04`'s fail-open/async-retry rule and never block, hold, or reverse party record state.
- [ ] Confirm no personal user email account, mailbox, or credential is read, stored, or used anywhere in this flow.
- [ ] Confirm the action is excluded from the Tier 1 offline queue (design.md §9's Offline Behavior tiering note).

### 5. Integrate with shell, infrastructure, and domain boundaries

Testing: Type-check/build contract; Playwright shell smoke tests; infrastructure/provider contract checks where applicable.

- [ ] Mount routes through the approved authenticated office surface from `05-ui-shell-and-navigation`.
- [ ] Register routes using capability references rather than role-name conditions.
- [ ] Use shared page headers, loading/error/not-found, stale-edit, confirmation, and status patterns.
- [ ] Use the approved Supabase Auth/session, server action/route-handler, validated environment, monitoring, and migration boundaries from `04`.
- [ ] Add safe correlation IDs and redacted monitoring context for failed enrollment operations.
- [ ] Add optional scoped Realtime invalidation only if approved; always refetch authoritative records.
- [ ] Prove no party/item/location mutation, and no Contact Party email trigger, is registered with the offline queue or accepted from offline state.
- [ ] **(Added 2026-08-07)** Add the `/locations` row to `05-ui-shell-and-navigation/design.md` §3.2's route catalog table: office surface, `locations.manage` capability, owning spec `06-party-and-item-enrollment`, launch status matching the existing `/parties`/`/items` rows. Do not modify any other row.

### 6. Testing and review

Testing: All applicable layers below.

- [ ] Run `design-system-auditor` against office/mobile form behavior, focus, typography, contrast, touch targets, and error feedback.
- [ ] Run `rbac-rls-reviewer` against every read/mutation path and cross-party identifier case.
- [ ] Run real-Postgres migrations and integration tests before sign-off for constraints, foreign keys, uniqueness, deactivation/reference behavior, and RLS.
- [ ] Add representative feature contract tests proving downstream receiving, WRR, inventory, and withdrawal workflows can reference enrolled records without copying master-data logic.

## Testing matrix

### Unit tests (Vitest)

- [ ] Party/item/location input schemas, normalization, field lengths, conditional requirements, and safe error mapping.
- [ ] Barcode/code/cross-reference duplicate preflight behavior.
- [ ] Packaging, dimensions, volume, UOM, SPQ, weight, reorder, and perishability validation/calculation.
- [ ] Active/inactive and optimistic-concurrency state helpers.
- [ ] Navigation/capability metadata and online-only mutation policy.
- [ ] **(Added 2026-08-07)** Location `label` generation (`Rack+Level-Position`) from `rack`/`level`/`position`; `location_type` enum validation; `max_cbm_capacity` positivity.
- [ ] **(Added 2026-08-07)** Contact Party server action: capability check, null/empty `email` rejection, correct template/resource-reference construction, no client-supplied recipient accepted.
- [ ] **(Added 2026-08-07)** Movement Ledger/Transaction Ledger query helpers: correct filtering by `location_id`/`party_id`, correct direction/source labeling, correct Reference-field resolution (`commercial_invoice_no` vs `ar_reference_no`), pagination boundary handling.

### Integration tests

- [ ] Real Postgres: apply the complete migration chain and verify canonical constraints and foreign keys for `parties`, `party_roles`, `items`, `item_categories`, and `locations`.
- [ ] Real Postgres: verify duplicate party/item codes and barcodes are rejected under concurrency.
- [ ] **(Added 2026-08-07)** Real Postgres: verify duplicate `locations.label` values are rejected under concurrency, including the case where two different `rack`/`level`/`position` combinations resolve to the same formatted label.
- [ ] Real Postgres: verify RLS default deny, authorized global access, party-scope boundaries, and no cross-party inference through search/detail paths.
- [ ] **(Added 2026-08-07)** Real Postgres: verify `locations.manage` is enforced Administrator-only and `locations.read` is enforced for `warehouse_staff`/`supervisor`/`administrator`, matching the `02` catalog.
- [ ] Verify deactivation preserves historical references and blocks unsafe new use according to approved domain rules.
- [ ] Verify failed/rejected writes do not leave partial party-role, item-reference, or location mutations.
- [ ] **(Added 2026-08-07)** Verify (mocked provider) the Contact Party trigger produces exactly one `email_deliveries` row per send with a correct correlation ID, and that a simulated provider failure does not roll back or alter the `parties` row.
- [ ] **(Added 2026-08-07)** Real Postgres: verify `location_transaction_ledger` returns exactly the `inventory_transactions` rows where `from_location_id`/`to_location_id` matches the queried location, and `party_transaction_ledger` returns exactly the union of vendor (`wrr_documents.vendor_party_id`), customer (`pick_lists.customer_party_id` via `inventory_transactions.pick_list_id`), and VMI-owner (`lots.owner_party_id`) rows for the queried party, with no cross-party/cross-location leakage under RLS.

### E2E tests (Playwright)

- [ ] Authorized user creates, searches, edits, and deactivates a party.
- [ ] Authorized user creates, searches, edits, and deactivates an item with category/default-party selectors.
- [ ] **(Added 2026-08-07)** Authorized Administrator creates, searches, edits, and deactivates a location; a Supervisor/warehouse-staff session can view but cannot see or invoke create/edit/deactivate controls.
- [ ] **(Added 2026-08-07)** Authorized user with `parties.manage` triggers a Contact Party send from the party detail view and sees confirmation; a user without `parties.manage` cannot see or invoke the button.
- [ ] **(Added 2026-08-07)** A user holding `locations.read` sees the Movement Ledger on a location detail page and can paginate it; a user without `locations.read` cannot reach the page at all (route-gate, not a separate ledger gate).
- [ ] **(Added 2026-08-07)** A user holding `parties.read` sees the Transaction Ledger on a party detail page and can paginate it; a user without `parties.read` cannot reach the page at all (route-gate, not a separate ledger gate).
- [ ] Duplicate and invalid field submissions show actionable accessible errors.
- [ ] Stale edit produces a conflict/reload path without silent overwrite.
- [ ] Unauthorized user cannot see or invoke protected mutation controls; direct route access fails safely.
- [ ] Party user cannot infer unrelated party/item/location records through search, filters, counts, or IDs.
- [ ] Forms remain usable at representative office/mobile widths and with keyboard navigation.
- [ ] Offline mode blocks all enrollment mutations, the Contact Party trigger, and location mutations, and does not add any of them to the queue.

### Manual QA

- [ ] Verify role labels (Supplier, Customer, End-Customer, Internal Supplies) are presented as business classifications and not application roles; legacy labels are migration-only.
- [ ] Verify Supplier is the only role admitted by the default inbound-source selector; Customer is the direct buyer for VMI and Trading; End-Customer is the non-billable recipient role, and billing follows the transaction's customer/bill-to role.
- [ ] Verify no UI uses `suppliers`, `SKU`, `bins`, or `warehouse_id` as entity concepts.
- [ ] Verify price/help text does not imply final Trading pricing or authoritative VMI billing.
- [ ] Verify database/reference impact behavior before deactivation.
- [ ] **(Added 2026-08-07)** Verify the location label displayed to the user before submit always matches the server-computed/stored value; no discrepancy between preview and stored `label`.
- [ ] **(Added 2026-08-07)** Verify the Contact Party composer's help text/UX makes clear this is a server-sent operational notification, not a message from the clicking user's own inbox.

## Phase 2 amendment — canonical roles, RBE, Data Management, and billable-party boundary (2026-10-14)

Status: Pending Reapproval

- [ ] Coordinate the `01-core-data-model` migration from `vendor` to `supplier` and `internal_warehouse` to `internal_supplies`; deduplicate role rows and add the `(party_id, role)` unique constraint.
- [x] Add `party_rbe_classifications` with EE/ELSE/ETC values, unique party/classification rows, customer-role eligibility, and a database-enforced maximum of three selections.
- [x] Define and execute an auditable backfill for existing customer RBE classifications; reject ambiguous records for manual review.
- [ ] Make party, canonical roles, and RBE mutations atomic and server-authorized; reject legacy role values for new writes.
- [ ] Implement conditional enrollment: RBE fields only for Customer, no billing/SOA output for End-Customer, and no client-only enforcement.
- [ ] Implement the shared billable-party policy with `12-vmi-billing`/customer consumers: SOA and billing follow the transaction's Customer/bill-to party for VMI and Trading, Supplier invoices are addressed to Dyna Serv, and End-Customers are excluded as recipients.
- [ ] Add Data Management subtabs for Organizations, Material, Locations, and Exports; preserve canonical database identifiers while updating labels.
- [ ] Add a complete server-backed export with capability checks, scope filtering, canonical roles/RBE values, and no page-size truncation.
- [ ] Extend email generation with optional CC validation and pipeline handoff; add regression coverage.
- [ ] Add unit, integration, RLS, migration, and Playwright coverage for role migration, RBE cardinality, conditional enrollment, export completeness, and billable-party boundaries.
- [ ] Re-run cross-spec reviews with `01-core-data-model`, `02-rbac-roles`, `12-vmi-billing`, `13-trading-orders-and-pricing`, and the design-system auditor.
- [ ] After implementation and test evidence are complete, obtain both required sign-offs and change all three 06 documents back to `Status: Approved`.

## Sign-off

## Zone-only tracking areas amendment — 2026-10-23

Status: Pending Reapproval

- [ ] Update the shared schema/migration contract for nullable RCV/Hold fields and storage-only labels/capacity.
- [ ] Product owner approval — pending.
- [ ] Technical/data-model/RBAC review and second approval — pending.

- [ ] `01-core-data-model` fields and constraints are amended, approved, and reconciled for canonical roles and RBE.
- [ ] RBAC/RLS review passes for Data Management subtabs and exports.
- [ ] All applicable tests pass, including migration and real-Postgres testing.
- [ ] No offline mutation leakage is present.
- [ ] `design-system-auditor` review passes for updated terminology and responsive export/subtab surfaces.
- [x] Product owner approval — Developer approval, 2026-10-14.
- [x] Second approver approval — Developer approval, 2026-10-14.

## Flow-specific relationships amendment — 2026-10-22

Status: Approved

- [x] Add Organization-form management for VMI Customer, Trading Customer, and Trading Supplier relationships.
- [x] Enforce role compatibility and duplicate prevention server-side.
- [x] Product owner approval — Developer approval, 2026-10-22.
- [x] Second approver approval — Developer approval, 2026-10-22.

## Pending reapproval — Organization role-family correction implementation

- [ ] Retain Internal Supplies in new Organization role controls, validation,
  filters, exports, and user-facing terminology; map both current
  `internal_supplies` and deployed legacy `internal_warehouse` through a
  documented read-compatible adapter without replacing the enum.
- [ ] Enforce the four Organization role families and their Inventory Model
  relationship matrix in server validation and database constraints.
- [ ] Verify the already-existing role migration and deployment state before
  any backfill; preserve and render historical `internal_warehouse` references
  as Internal Supplies without data loss or a new relationship row.
- [ ] Add unit, real-Postgres/RLS, and Playwright coverage for all valid and
  invalid role/Inventory Model selections, multi-role Organizations, stale
  enrollment forms, and legacy-record rendering.

### Amendment sign-off

- [x] Product Owner approval — User, 2026-10-22 (cross-cutting plan).
- [ ] Technical/data-model/RBAC review and real-Postgres verification.
- [x] Second amendment sign-off — System standing approval, 2026-10-22.

## Role semantics amendment — outbound recipient and relationship boundaries (2026-10-22)

Status: Approved

The canonical business classifications now have explicit relationship meanings: Supplier is the Trading-side inbound source; Customer is the company's direct buyer for VMI and Trading; End-Customer is the non-billable outbound recipient; Internal Supplies is internal warehouse use. Customer and End-Customer may coexist on a party master record, while each transaction selects its bill-to/customer and ship-to/end-customer roles. The item default-supplier selector is Supplier-only (with legacy `vendor` migration compatibility), and outbound recipient selection is governed by `end_customer_party_id` in the approved `08`/`10` contract.

- [x] Product owner approval — Developer approval, 2026-10-22.
- [x] Second approver approval — Developer approval, 2026-10-22.
