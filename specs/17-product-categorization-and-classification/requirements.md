# Product Categorization & Classification — Requirements

Status: Draft

## 1. Purpose and scope

This feature defines and maintains the controlled product taxonomy used by the shared `items` master record across VMI, Trading, and Supplies. It owns category hierarchy, flow applicability, classification validation, controlled taxonomy changes, and the read contract consumed by item enrollment and reporting.

It does not create a second item catalog, alter lots or inventory, resolve prices, calculate VMI billing, allocate FIFO/FEFO stock, or grant user authority. The same item may be used by multiple flows; category applicability and inventory ownership are separate concerns.

The v1 scope includes:

- top-category and subcategory hierarchy using `item_categories`;
- optional flow-specific category applicability for `vmi`, `trading`, and `supplies`;
- controlled category creation, rename, deactivation, and re-parenting where safe;
- item classification validation against an approved category/UOM/item-type contract;
- seeded VMI and Trading taxonomy review and migration;
- searchable category administration and read-only selectors for `06` and other consumers;
- audit, versioning, and safe handling of category changes after items or inventory reference them.

## 2. Alignment principles and ownership boundaries

- One shared `items` table remains authoritative for item identity. `17` does not create flow-specific item tables or a replacement catalog.
- `item_categories` is the canonical category reference. Its final columns and constraints belong to `01-core-data-model`; `17` owns the category business rules and lifecycle.
- `06-party-and-item-enrollment` creates/maintains item records and stores the approved category reference. It does not create or alter the taxonomy.
- `01` owns core item fields, `item_type`, UOM and packaging fields, `flow_type` on lots/WRR, and the database relationship to `item_categories`.
- `02-rbac-roles` owns capabilities, party/flow scope, RLS, and audit authorization. Category filters do not grant access.
- `03-offline-mode-and-client-storage` owns offline behavior. Category mutation and classification changes are online-only in v1.
- `04-services-and-infrastructure` owns runtime, jobs, migrations, telemetry, and Realtime support.
- `05-ui-shell-and-navigation` owns authenticated routes, responsive layout, and shared feedback patterns.
- `12-vmi-billing` and `13-trading-orders-and-pricing` own financial meaning; categories may organize reports but never determine a bill, price, margin, or ownership.
- `16-reporting-and-analytics` consumes stable category definitions and historical classification snapshots for reporting; it does not redefine them.
- One warehouse is assumed; no `warehouse_id` is introduced.

## 3. Actors and use cases

- **Administrators:** manage approved taxonomy, lifecycle, ordering, and classification policy under the appropriate capability.
- **Supervisors/master-data reviewers:** review proposed category changes or classify items when explicitly authorized.
- **Enrollment users:** select a valid category/subcategory and receive actionable classification guidance through `06`.
- **Warehouse staff:** consume item/category labels in receiving, picking, packing, transfer, and inspection views; they do not manage taxonomy.
- **Reporting and AI consumers:** receive only approved, scoped, versioned category projections.
- **Party users:** see only category/item fields allowed by their current party and optional flow scope.

## 4. Functional requirements

### R1. Canonical taxonomy

1. The system SHALL maintain a parent-child hierarchy in canonical `item_categories`, where a top category has no parent and a subcategory references an approved parent.
2. A category SHALL have a stable identifier, normalized name, lifecycle status, description/help text where approved, and an auditable definition/version.
3. Category names SHALL be unique within the approved scope. The final uniqueness rule—global or flow-scoped—must be reconciled with `01` before approval.
4. The hierarchy SHALL prevent cycles, self-parenting, invalid parent depth, and a subcategory being attached to an inactive parent.
5. A category SHALL not be treated as a party role, application role, item, lot, location, or flow-owned inventory record.
6. The taxonomy SHALL support explicit flow applicability for `vmi`, `trading`, and `supplies` only where approved. A null/unscoped category means broadly applicable only if the policy explicitly defines that meaning.

### R2. Seeded taxonomy and flow alignment

1. The initial taxonomy SHALL be reviewed against the provisional `01` design before seed data is approved.
2. The current VMI seed candidates are `Packaging Material`, `Raw Material`, `Fabrication`, `Spare Parts`, and `Machines`, with the documented VMI subcategory candidates preserved for review.
3. The current Trading seed candidates are `Packaging Material`, `Raw Material`, `Fabrication`, `Spare Parts`, and `Machines`, with the documented Trading subcategory candidates preserved for review.
4. The exact `Machines` subcategories SHALL be supplied and approved before production seed data is finalized.
5. Supplies categories and whether any category is shared across all flows SHALL be explicitly decided; `17` SHALL not infer them from VMI or Trading.
6. Seed changes SHALL be versioned and auditable. A seed label SHALL not be silently repurposed after items reference it.

### R3. Item classification rules

1. An item classification SHALL reference an active approved category valid for the applicable context and SHALL not accept arbitrary names or unchecked identifiers.
2. The server SHALL validate the parent/subcategory relationship, category status, flow applicability where a flow context is supplied, and any approved item-type/UOM constraints.
3. Classification validation MAY provide warnings for unusual combinations, but only approved hard rules may block item enrollment or downstream operations.
4. Category selection SHALL not itself create inventory, lots, WRR records, pricing, billing, approvals, or documents.
5. If an item is used in multiple flows, the system SHALL preserve one shared item identity and shall make any flow-specific classification/applicability explicit rather than silently overwriting the category.
6. If the final schema supports only one `items.category_id`, the cross-flow classification policy SHALL be resolved before approval; `17` SHALL not invent a second relation in application code.

### R4. Taxonomy lifecycle and historical integrity

1. Authorized users SHALL be able to create, edit, reorder, and deactivate categories according to the approved capability and review policy.
2. Deactivation SHALL prevent new item classifications where required but SHALL preserve historical item, lot, document, inventory, and report references.
3. A category referenced by an active or historical item SHALL not be hard-deleted.
4. Renaming or re-parenting SHALL use optimistic concurrency and SHALL record the prior and new values, actor, reason, effective time, and definition/version.
5. Re-parenting SHALL be blocked or require an explicit migration plan when it would invalidate an existing item classification or flow applicability.
6. Historical reports SHALL be able to identify the category definition/version that applied at the report's as-of time.
7. Bulk recategorization, if approved, SHALL be an online, bounded, auditable operation with preview, validation, idempotency, and rollback/recovery guidance; it SHALL not rewrite inventory history.

### R5. Administration and read surfaces

1. Administrators SHALL have a searchable hierarchy view showing active/inactive state, parent, flow applicability, item reference count where authorized, and pending/unsafe changes.
2. The hierarchy view SHALL support safe preview of the impact of deactivation, re-parenting, or rename before commit.
3. Item enrollment SHALL receive filtered category options from a server-owned read contract, including valid parent/subcategory relationships and flow context.
4. Reporting, receiving, picking, packing, transfer, inspection, and AI surfaces SHALL consume stable category labels/IDs through their owning contracts.
5. Empty, loading, stale, validation-error, conflict, and unauthorized states SHALL be distinct. A missing category SHALL not silently fall back to an unrelated category.

### R6. Authorization, privacy, and audit

1. Category reads and mutations SHALL resolve current capability, optional flow scope, and RLS through `02-rbac-roles`.
2. Client-supplied role, party, flow, category status, or permission values SHALL never establish authority.
3. Party users SHALL see only categories and item classifications explicitly allowed by their party/flow scope; global taxonomy administration is not implied.
4. Category create, update, reorder, re-parent, deactivate, bulk classification, denied access, and read-contract changes SHALL be attributable and auditable with actor/system executor, timestamp, reason, version, and correlation ID.
5. Counts, autocomplete, hierarchy search, errors, exports, and item reference previews SHALL not disclose categories or item relationships outside the caller's scope.

### R7. Offline and realtime behavior

1. Category create, update, delete/deactivate, re-parent, bulk recategorization, and item-classification mutations SHALL be online-only in v1.
2. Cached category selectors MAY be used as a read-only convenience where `03` and the owning workflow permit, but stale state SHALL be visible and server validation SHALL run on submit.
3. No taxonomy mutation or classification mutation SHALL enter the Tier 1 offline queue.
4. Realtime MAY invalidate category lists/selectors, but clients SHALL refetch authoritative hierarchy and SHALL not treat an event as a complete or authorized record.

### R8. Accessibility and responsive behavior

1. Category administration is an office-first surface but SHALL remain usable at the approved mobile width.
2. Hierarchy relationships SHALL be conveyed by text and accessible structure, not color alone or indentation alone.
3. Forms SHALL provide labels, field-level validation, keyboard navigation, visible focus, conflict recovery, and clear confirmation for destructive/lifecycle actions.
4. The UI SHALL follow the approved design tokens, typography, contrast, touch targets, reduced-motion, and responsive rules; no feature-specific visual tokens may be introduced.

## 5. Acceptance criteria

- [ ] The final taxonomy uses canonical `item_categories` with valid parent-child relationships and no cycles.
- [ ] VMI and Trading seed candidates are reviewed, Supplies applicability is explicitly decided, and `Machines` subcategories are approved before seeding.
- [ ] `06` can consume a server-authorized filtered category selector without creating taxonomy records.
- [ ] Invalid parent, inactive, flow-inapplicable, duplicate, cyclic, and stale classifications fail safely.
- [ ] Deactivation/rename/re-parenting preserves historical references and is fully audited.
- [ ] Classification does not alter item identity, lots, inventory, pricing, billing, documents, or workflow state.
- [ ] Offline mutations are blocked and stale cached selectors cannot bypass server validation.
- [ ] Unauthorized category discovery through search, counts, selectors, reports, exports, or AI projections is prevented.

## 6. Decisions required before approval

- Final `item_categories` columns, status/version fields, indexes, parent-depth rule, and uniqueness constraint in `01`.
- Exact VMI, Trading, and Supplies taxonomy, including all `Machines` subcategories and shared-category policy.
- Whether one `items.category_id` is sufficient or an approved item-to-category/applicability relation is required for multi-flow use.
- Final classification rules linking category to `item_type`, UOM, packaging, perishability, or other item attributes.
- Category governance: who may propose/approve/execute changes, whether two-person approval is required, and bulk-change limits.
- Report/history behavior for category changes and the contract consumed by `16` and `15`.
