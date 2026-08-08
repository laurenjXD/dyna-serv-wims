# Party & Item Enrollment — Requirements

Status: Approved

## 1. Purpose and scope

This feature provides controlled master-data enrollment and maintenance for `parties`, `items`, and `locations` used by the VMI, Trading, and Supplies flows in one physical warehouse. It provides searchable forms, validation, duplicate prevention, lifecycle controls, and safe references to existing categories, parties, and physical storage locations. It also provides a party-detail action for sending a transactional operational email to a party's contact person through the existing services pipeline.

It does not define application roles/RLS, inventory transactions, receiving, pricing finalization, billing, product classification rules, offline synchronization, or the email delivery/retry pipeline itself (that pipeline belongs to `04-services-and-infrastructure` and is only invoked, not redefined, here).

**Scope note (added 2026-08-07):** Location enrollment (R3, below) was not originally part of this spec's title or framing, which covered only party and item master data. It is added here because `01-core-data-model`'s `locations` table and `02-rbac-roles`' `locations.read`/`locations.manage` capabilities already exist with no owning spec for create/edit — a genuine gap, not a documentation oversight. See `specs/00-steering/revision-log.md`'s 2026-08-07 entry for the full rationale, matching the precedent already applied when `01-core-data-model` picked up the Master Inventory UI and `05-ui-shell-and-navigation` picked up the general landing page.

## 2. Terminology and ownership boundaries

- A `party` is a vendor, supplier, customer, end-customer, or internal warehouse entity. `party_roles` are business classifications, not application-user roles.
- An `item` is the shared product master record. Do not create a `SKU` entity or separate VMI/Trading/Supplies item tables.
- A `location` is a physical warehouse storage/staging slot (`zone`, `rack`, `level`, `position`, formatted `label`, `location_type`, `max_cbm_capacity`, `is_active`) — not a `bin`. This feature owns creating and editing `locations` records; it does not own placement, putaway recommendation, occupied-CBM calculation, or any inventory-transaction use of a location, which remain owned by `01-core-data-model`'s read models and the receiving/transfer/withdrawal workflow specs.
- `item_categories` are selected as reference data. Category hierarchy/classification management belongs to `17-product-categorization-and-classification` once approved.
- Application roles, user accounts, party scopes, and capability grants belong to `02-rbac-roles`.
- Trading buying/selling price behavior belongs to `13-trading-orders-and-pricing`; VMI billing behavior belongs to `12-vmi-billing`. Enrollment must not finalize a transaction price or billing outcome.
- Offline party/item/location mutations are not permitted by default. Master-data changes require online authoritative validation and authorization.
- The "Contact Party" email action (R1.9, below) triggers `04-services-and-infrastructure`'s existing operational Resend sending pipeline (`email_deliveries`, correlation IDs, retry/idempotency). This feature does not own that pipeline's delivery, retry, or webhook mechanics — it only supplies the trigger and the recipient/content contract.

## 3. Actors and surfaces

- **Administrators** manage party, item, and location master data when granted the approved capabilities. Only Administrators hold `locations.manage` per the `02` catalog.
- **Supervisors** may enroll or review items/parties only if the approved capability matrix grants the operation. Supervisors hold `locations.read` but not `locations.manage`, so they may view but not create/edit location records.
- **Warehouse staff** consume approved party/item/location records in floor workflows; they do not gain enrollment rights from using a floor screen. Warehouse staff hold `locations.read` for consuming location data in receiving/putaway/picking flows, but never `locations.manage`.
- **Party users** do not create or alter global party/item/location master data through this feature unless a future approved requirement grants a narrowly scoped operation.
- Enrollment is primarily an office surface, but review and lookup must remain usable on mobile. It is not a floor scan flow. Location enrollment follows this same office-primary, mobile-reviewable treatment — creating/editing racks is an office task, but warehouse staff must still be able to look up a location's `label`/capacity on a handheld device while working the floor.

## 4. Functional requirements

### R1. Party enrollment

1. An authorized user SHALL be able to create a party with `code`, `name`, contact person, email, phone, tax ID, address line 1, address line 2, payment terms, and notes as defined by the approved core-data schema.
2. A party code SHALL be required, normalized, and unique according to the approved database constraint.
3. A party name SHALL be required and validated for safe length/content limits.
4. A party SHALL have one or more approved business `party_roles` where required by the business flow; duplicate role assignments SHALL be rejected.
5. The form SHALL distinguish business party roles from application-user roles and SHALL not create user accounts or RBAC grants as a side effect.
6. The form SHALL provide a clear active/inactive lifecycle state.
7. Deactivation SHALL prevent new use where the owning workflow requires an active party, while preserving historical references and auditability.
8. Hard deletion SHALL be unavailable for a party referenced by operational, document, inventory, or authorization records; the approved design SHALL define the safe archival/deactivation behavior.
9. **(Added 2026-08-07 — Contact Party email action)** An authorized user SHALL be able to trigger a transactional email to a party's `contact_person` at the party's `email` address directly from the party detail/enrollment view. The system SHALL send this email exclusively through the approved `04-services-and-infrastructure` operational Resend sender pipeline (server-side call using `RESEND_FROM_OPERATIONS`, tracked via `email_deliveries` with a correlation ID) and SHALL NOT require, collect, or use any individual user's personal email account, credentials, or mailbox. The action is gated by the `parties.manage` capability (see rationale in §5's authorization note). The system SHALL record who triggered the send and when, using the existing `email_deliveries`/audit correlation mechanism already defined in `04`; this feature SHALL NOT invent a parallel tracking table. Delivery failure SHALL fail open per `04`'s existing retry semantics and SHALL NOT block or reverse any party-record state.

### R2. Party search and maintenance

1. Authorized users SHALL be able to search/filter parties by canonical code, name, active state, and business role.
2. Search results SHALL not expose parties outside the caller's current capability/scope.
3. Party detail SHALL show current master data, business roles, lifecycle state, and safe reference counts/links only where the caller is authorized to see them.
4. Updates SHALL use optimistic concurrency or an equivalent stale-edit protection so one user's changes do not silently overwrite another's.
5. Sensitive changes SHALL record actor, timestamp, changed fields, and reason where required by the approved audit contract.
6. **(Added 2026-08-07 — Transaction Ledger)** The party detail view SHALL display a read-only, paginated Transaction Ledger sourced from `01-core-data-model`'s `party_transaction_ledger` derived read model, showing every `inventory_transactions` row connected to that party as vendor, customer, or VMI owner. This ledger SHALL inherit the same `parties.read` capability that already gates viewing the party detail page; it SHALL NOT introduce a new or stricter capability.

### R3. Location enrollment (added 2026-08-07)

1. An authorized user SHALL be able to create a `locations` record with `zone`, `rack`, `level`, `position`, `location_type`, and `max_cbm_capacity` as defined by the approved `01-core-data-model` schema.
2. The system SHALL auto-generate the `label` field from `rack`, `level`, and `position` using the approved `Rack+Level-Position` format (e.g. `A1-01`); the user SHALL NOT free-type the `label` value directly.
3. `label` SHALL be validated for uniqueness both before submit and by the authoritative database UNIQUE constraint; a collision (e.g. from a duplicate `rack`/`level`/`position` combination) SHALL be rejected with an actionable, field-level error.
4. `location_type` SHALL be selected from the approved `location_type` enum values (`receiving_bay`, `inspection`, `storage`, `picking`, `dispatch`) and SHALL NOT accept free text or an unenumerated value.
5. `max_cbm_capacity` SHALL be required and validated as a positive decimal consistent with the approved `decimal(10,4)` column precision.
6. The form SHALL provide a clear active/inactive lifecycle state (`is_active`), defaulting to active on create.
7. Deactivation SHALL prevent new use of the location where the owning inventory/putaway workflow requires an active location, while preserving historical `lot_location_balances` and `inventory_transactions` references to that location and their auditability. This feature SHALL NOT recompute, reassign, or block existing occupied-CBM balances at an already-deactivated location; that remains owned by the receiving/transfer/withdrawal workflow specs.
8. Hard deletion SHALL be unavailable for a location referenced by any `lot_location_balances`, `inventory_transactions`, or other operational record; the approved design SHALL define the safe deactivation-only behavior, matching the pattern already used for parties and items in this spec.
9. This feature owns location record creation/editing only. It SHALL NOT define or implement putaway recommendation logic, occupied-CBM calculation, capacity-preview UI, or any inventory-transaction consumption of a location — those remain owned by `01-core-data-model`'s read models and the receiving (`07`)/transfer (`11`)/withdrawal (`08`) workflow specs, which reference `locations` records created here.
10. **(Added 2026-08-07 — Movement Ledger)** The location detail view SHALL display a read-only, paginated Movement Ledger sourced from `01-core-data-model`'s `location_transaction_ledger` derived read model, showing every `inventory_transactions` row connected to that location. This ledger SHALL inherit the same `locations.read` capability that already gates viewing the location detail page; it SHALL NOT introduce a new or stricter capability.

### R4. Item enrollment

1. An authorized user SHALL be able to create an item with the approved core fields: internal `code`, `name`, description, barcode, item type, category reference, cross-reference codes, default supplier party reference, UOM, packaging metrics, weight, reorder level, perishability, and active state.
2. Internal item code and barcode SHALL be normalized and unique according to the approved core-data constraints.
3. The form SHALL validate positive packaging and dimensional values, including `spq`, dimensions, `volume_cbm`, weight, and reorder level according to the approved schema precision and business rules.
4. If `volume_cbm` is calculated from dimensions, the system SHALL show the calculation and prevent silent disagreement between stored dimensions and stored volume.
5. Conditional fields such as `spq_meter`, `boxes_per_pallet`, expiry/perishability data, and UOM-specific values SHALL be shown and validated only when applicable to the selected item type/UOM.
6. A default supplier SHALL be selected from existing authorized parties; free-text party identifiers SHALL not be accepted as the primary relation.
7. Category selection SHALL use approved `item_categories` records and SHALL not accept arbitrary unvalidated category IDs or create a new classification hierarchy inside this feature.
8. The form MAY collect approved reference/default valuation fields supported by the core schema, but SHALL not treat enrollment values as the final Trading document price or authoritative VMI period billing value.
9. Item deactivation SHALL prevent new operational use where required while preserving historical inventory, documents, and transaction references.
10. Hard deletion SHALL be unavailable for an item referenced by lots, WRR records, documents, or inventory transactions.

### R5. Shared item-flow boundary

1. The enrollment experience MAY explain which flows use an item and may reveal conditional guidance by flow.
2. It SHALL not persist a flow ownership/applicability relation unless `01-core-data-model` or an approved downstream spec defines that relation and its constraints.
3. VMI, Trading, and Supplies records SHALL remain partitioned in their owning workflows; an item master record alone SHALL not grant access to any flow's inventory or pricing data.
4. Any future flow-specific item attributes SHALL identify their owning spec, table/relation, authorization scope, and migration before implementation.

### R6. Authorization and audit

1. Every protected read and mutation SHALL use the shared capability-and-scope interface from `02-rbac-roles`.
2. The UI MAY hide unavailable actions, but the server and RLS SHALL enforce the decision independently.
3. Client-supplied user, role, party scope, or capability values SHALL never establish authorization.
4. The feature SHALL use capability identifiers expressed as resource/action contracts, not role-name conditionals. Final identifiers require RBAC approval.
5. Party-user visibility SHALL be limited to explicitly assigned party/flow scope; global master-data administration is not implied by access to one party's records.
6. Create, update, deactivate, role-classification, sensitive reference changes, location record mutations, and Contact Party email triggers SHALL be attributable to an actor and correlation ID through the approved audit boundary.
7. **(Added 2026-08-07)** Location create/edit/deactivate SHALL require `locations.manage`; location read/list (including the selector consumed by other workflows) SHALL require `locations.read`. Both capability identifiers are verified against `02-rbac-roles/design.md` §3.2's finalized catalog (`locations` resource, `read`/`manage` actions; `read` held by `warehouse_staff`, `supervisor`, `administrator`; `manage` held by `administrator` only). This feature MUST NOT invent alternate location capability names.
8. **(Added 2026-08-07)** The Contact Party email action (R1.9) SHALL require `parties.manage`, not `parties.read`. Rationale: sending an outbound communication on the party's behalf is a state-changing operational action (it creates a durable `email_deliveries` record and reaches an external recipient), not a passive view, so it is gated at the same level as party record mutation rather than party read.

### R7. Offline and realtime behavior

1. Party/item/location create, update, deactivate, role assignment, category mutation, and the Contact Party email trigger SHALL be online-only in v1.
2. Cached item/party/location data MAY be used as a read-only floor reference only when allowed by `03-offline-mode-and-client-storage` and the owning workflow.
3. No enrollment mutation, location mutation, or Contact Party email trigger SHALL enter the Tier 1 offline queue. Per `03-offline-mode-and-client-storage/design.md` §5.1's closed v1 Tier 1 allowlist (`receiving_scan_observation`, `pick_list_scan_observation`, `inspection_observation`), none of these actions qualify — this is a confirmed exclusion, not an open question.
4. Realtime updates MAY invalidate or refresh an office list, but the client SHALL refetch authoritative records and SHALL not treat an event as authorization or as the complete record.

### R8. Accessibility and responsive behavior

1. Enrollment is office-first but SHALL remain usable down to the approved mobile width.
2. Forms SHALL provide labels, help text, validation messages, keyboard navigation, visible focus, and programmatic error association.
3. Save/deactivate actions SHALL have clear confirmation and a single obvious primary action per step.
4. The UI SHALL follow the approved brand tokens, typography, contrast, touch targets, motion, and no-color-only status rules.
5. Long forms SHALL be grouped into understandable sections and SHALL preserve entered values when recoverable validation errors occur.

## 5. Acceptance criteria

- [ ] An authorized administrator can create, search, edit, and deactivate a party with business roles without creating application-user access.
- [ ] An authorized administrator can create, search, edit, and deactivate an item using validated canonical party/category references.
- [ ] Duplicate party codes, item codes, and barcodes are prevented both before submit and by the authoritative database constraint.
- [ ] Invalid packaging/dimension/UOM combinations are rejected with actionable field-level feedback.
- [ ] Historical references remain valid after deactivation, and destructive deletion is blocked when references exist.
- [ ] Final Trading price, VMI billing, flow ownership, and RBAC policy are not redefined by this feature.
- [ ] Enrollment mutations are blocked offline and cannot enter the offline queue.
- [ ] Cross-party, unauthorized, stale-edit, and direct-identifier manipulation cases fail safely.
- [ ] Required Unit, integration, E2E, and manual checks in `tasks.md` pass before approval.
- [ ] **(Added 2026-08-07)** An authorized administrator can create, search, edit, and deactivate a `locations` record with an auto-generated, unique `Rack+Level-Position` label and a validated `max_cbm_capacity`; a supervisor can view but not create/edit; warehouse staff can view but not create/edit; destructive deletion is blocked when `lot_location_balances`/`inventory_transactions` reference the location.
- [ ] **(Added 2026-08-07)** An authorized user holding `parties.manage` can trigger a Contact Party email from the party detail view; the send is routed through `04`'s existing Resend operational pipeline and recorded in `email_deliveries` with actor/timestamp/correlation ID; no personal user mailbox or credential is involved at any point; delivery failure does not block or alter party record state.
- [ ] **(Added 2026-08-07)** A user holding `locations.read` viewing a location's detail page sees a read-only, paginated Movement Ledger sourced from `location_transaction_ledger`, gated by the same `locations.read` capability as the page itself.
- [ ] **(Added 2026-08-07)** A user holding `parties.read` viewing a party's detail page sees a read-only, paginated Transaction Ledger sourced from `party_transaction_ledger`, gated by the same `parties.read` capability as the page itself.

## 6. Dependencies and exclusions

- Depends on `01-core-data-model` for the approved `parties`, `party_roles`, `items`, `item_categories`, and `locations` structures and constraints. That spec is currently Draft; exact fields must be reconciled before approval.
- Depends on `02-rbac-roles` for capabilities, party/flow scope, RLS, session resolution, and audit events, including the `locations.read`/`locations.manage` catalog entries consumed by R3. RBAC is currently flagged for revision.
- Depends on `03-offline-mode-and-client-storage` for the explicit prohibition on offline master-data mutations, confirmed against its closed Tier 1 allowlist for the new location and Contact Party actions.
- Depends on `04-services-and-infrastructure` for Auth, Storage if item assets are added, Realtime, monitoring, migration/runtime boundaries, and — for the Contact Party action — the existing operational Resend sender pipeline and `email_deliveries` tracking, consumed as-is and not redefined here.
- Depends on `05-ui-shell-and-navigation` for authenticated route/layout, office responsive treatment, page header, global feedback contracts, and the `/locations` route catalog entry.
- `17-product-categorization-and-classification` owns classification hierarchy and category-management rules.
- `12-vmi-billing` and `13-trading-orders-and-pricing` own billing and transaction-price semantics.
- `07-incoming-receiving`, `11-transfer-and-inspection`, and `08-outgoing-withdrawal-and-two-stage-commitment` own all putaway, occupied-CBM, and inventory-transaction use of `locations` records created by this feature.
- **(Added 2026-08-07)** The Movement Ledger and Transaction Ledger both depend on `01-core-data-model`'s `location_transaction_ledger`/`party_transaction_ledger` derived read models (§3 item 4 of that spec's design.md), which in turn depend on the `inventory_transactions.pick_list_id` column added the same day (mirroring the existing `wrr_id` column) to give outgoing transactions a customer-party link equivalent to the incoming side's vendor-party link. `01-core-data-model` is Approved for this contract; no dependency gap exists for this addition.
