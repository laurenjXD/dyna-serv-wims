# Party & Item Enrollment — Requirements

Status: Approved

## 1. Purpose and scope

This feature provides controlled master-data enrollment and maintenance for `parties` and `items` used by the VMI, Trading, and Supplies flows in one physical warehouse. It provides searchable forms, validation, duplicate prevention, lifecycle controls, and safe references to existing categories and parties.

It does not define application roles/RLS, inventory transactions, receiving, pricing finalization, billing, product classification rules, or offline synchronization.

## 2. Terminology and ownership boundaries

- A `party` is a vendor, supplier, customer, end-customer, or internal warehouse entity. `party_roles` are business classifications, not application-user roles.
- An `item` is the shared product master record. Do not create a `SKU` entity or separate VMI/Trading/Supplies item tables.
- `item_categories` are selected as reference data. Category hierarchy/classification management belongs to `17-product-categorization-and-classification` once approved.
- Application roles, user accounts, party scopes, and capability grants belong to `02-rbac-roles`.
- Trading buying/selling price behavior belongs to `13-trading-orders-and-pricing`; VMI billing behavior belongs to `12-vmi-billing`. Enrollment must not finalize a transaction price or billing outcome.
- Offline party/item mutations are not permitted by default. Master-data changes require online authoritative validation and authorization.

## 3. Actors and surfaces

- **Administrators** manage party and item master data when granted the approved capabilities.
- **Supervisors** may enroll or review items/parties only if the approved capability matrix grants the operation.
- **Warehouse staff** consume approved party/item records in floor workflows; they do not gain enrollment rights from using a floor screen.
- **Party users** do not create or alter global party/item master data through this feature unless a future approved requirement grants a narrowly scoped operation.
- Enrollment is primarily an office surface, but review and lookup must remain usable on mobile. It is not a floor scan flow.

## 4. Functional requirements

### R1. Party enrollment

1. An authorized user SHALL be able to create a party with `code`, `name`, contact person, email, phone, tax ID, address, and notes as defined by the approved core-data schema.
2. A party code SHALL be required, normalized, and unique according to the approved database constraint.
3. A party name SHALL be required and validated for safe length/content limits.
4. A party SHALL have one or more approved business `party_roles` where required by the business flow; duplicate role assignments SHALL be rejected.
5. The form SHALL distinguish business party roles from application-user roles and SHALL not create user accounts or RBAC grants as a side effect.
6. The form SHALL provide a clear active/inactive lifecycle state.
7. Deactivation SHALL prevent new use where the owning workflow requires an active party, while preserving historical references and auditability.
8. Hard deletion SHALL be unavailable for a party referenced by operational, document, inventory, or authorization records; the approved design SHALL define the safe archival/deactivation behavior.

### R2. Party search and maintenance

1. Authorized users SHALL be able to search/filter parties by canonical code, name, active state, and business role.
2. Search results SHALL not expose parties outside the caller's current capability/scope.
3. Party detail SHALL show current master data, business roles, lifecycle state, and safe reference counts/links only where the caller is authorized to see them.
4. Updates SHALL use optimistic concurrency or an equivalent stale-edit protection so one user's changes do not silently overwrite another's.
5. Sensitive changes SHALL record actor, timestamp, changed fields, and reason where required by the approved audit contract.

### R3. Item enrollment

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

### R4. Shared item-flow boundary

1. The enrollment experience MAY explain which flows use an item and may reveal conditional guidance by flow.
2. It SHALL not persist a flow ownership/applicability relation unless `01-core-data-model` or an approved downstream spec defines that relation and its constraints.
3. VMI, Trading, and Supplies records SHALL remain partitioned in their owning workflows; an item master record alone SHALL not grant access to any flow's inventory or pricing data.
4. Any future flow-specific item attributes SHALL identify their owning spec, table/relation, authorization scope, and migration before implementation.

### R5. Authorization and audit

1. Every protected read and mutation SHALL use the shared capability-and-scope interface from `02-rbac-roles`.
2. The UI MAY hide unavailable actions, but the server and RLS SHALL enforce the decision independently.
3. Client-supplied user, role, party scope, or capability values SHALL never establish authorization.
4. The feature SHALL use capability identifiers expressed as resource/action contracts, not role-name conditionals. Final identifiers require RBAC approval.
5. Party-user visibility SHALL be limited to explicitly assigned party/flow scope; global master-data administration is not implied by access to one party's records.
6. Create, update, deactivate, role-classification, and sensitive reference changes SHALL be attributable to an actor and correlation ID through the approved audit boundary.

### R6. Offline and realtime behavior

1. Party/item create, update, deactivate, role assignment, and category mutation SHALL be online-only in v1.
2. Cached item/party data MAY be used as a read-only floor reference only when allowed by `03-offline-mode-and-client-storage` and the owning workflow.
3. No enrollment mutation SHALL enter the Tier 1 offline queue.
4. Realtime updates MAY invalidate or refresh an office list, but the client SHALL refetch authoritative records and SHALL not treat an event as authorization or as the complete record.

### R7. Accessibility and responsive behavior

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

## 6. Dependencies and exclusions

- Depends on `01-core-data-model` for the approved `parties`, `party_roles`, `items`, and `item_categories` structures and constraints. That spec is currently Draft; exact fields must be reconciled before approval.
- Depends on `02-rbac-roles` for capabilities, party/flow scope, RLS, session resolution, and audit events. RBAC is currently flagged for revision.
- Depends on `03-offline-mode-and-client-storage` for the explicit prohibition on offline master-data mutations.
- Depends on `04-services-and-infrastructure` for Auth, Storage if item assets are added, Realtime, monitoring, and migration/runtime boundaries.
- Depends on `05-ui-shell-and-navigation` for authenticated route/layout, office responsive treatment, page header, and global feedback contracts.
- `17-product-categorization-and-classification` owns classification hierarchy and category-management rules.
- `12-vmi-billing` and `13-trading-orders-and-pricing` own billing and transaction-price semantics.
