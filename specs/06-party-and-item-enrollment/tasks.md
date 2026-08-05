# Party & Item Enrollment — Implementation Plan

Status: Draft

## Implementation gate

No application code, migration, server action, route, or master-data mutation may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent.
- `01-core-data-model` is approved and its final `parties`, `party_roles`, `items`, and `item_categories` fields/constraints are reconciled here.
- `02-rbac-roles` approves the capability/session/scope/RLS contract.
- `17-product-categorization-and-classification` confirms category ownership and read contract.
- `12-vmi-billing` and `13-trading-orders-and-pricing` confirm that enrollment does not redefine billing or final transaction pricing.
- `05-ui-shell-and-navigation` and `03-offline-mode-and-client-storage` confirm shell and online-only mutation boundaries.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Dependencies and constraints

- Canonical entities are `parties`, `items`, and `locations`; this feature uses `parties` and `items` and does not introduce `suppliers` or `SKU` entities.
- `party_roles` are business classifications, never application-user roles.
- One warehouse only; no `warehouse_id`.
- Master-data mutations are online-only in v1 and may not enter the offline Tier 1 queue.
- UI visibility is not authorization; every read/mutation requires the approved server capability and RLS boundary.
- Enrollment does not create lots, WRRs, inventory transactions, approvals, billing outcomes, or final priced documents.

## Implementation tasks

### 1. Resolve the master-data contract

Testing: Documentation/schema review; no implementation tests.

- [ ] Reconcile the exact party fields, item fields, enum values, nullability, precision, unique constraints, active-state behavior, and audit expectations with approved `01-core-data-model` documents.
- [ ] Resolve whether the current core schema's `supplier_item_code` naming and other item field names are final and update dependent specs consistently.
- [ ] Confirm that item enrollment remains a shared master record with no persisted flow ownership until a core/downstream relation is approved.
- [ ] Confirm the meaning and lifecycle of core item reference price fields without redefining Trading or VMI pricing.
- [ ] Confirm whether category creation belongs exclusively to spec `17` and define the read/reference contract.
- [ ] Define duplicate normalization rules for codes, barcodes, names, emails, phone numbers, and cross-reference fields.
- [ ] Define deactivation/reference-impact rules for parties and items and the safe stale-edit/version strategy.
- [ ] Define which changes require an audit event, reason, confirmation, or second approval.
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

### 5. Integrate with shell, infrastructure, and domain boundaries

Testing: Type-check/build contract; Playwright shell smoke tests; infrastructure/provider contract checks where applicable.

- [ ] Mount routes through the approved authenticated office surface from `05-ui-shell-and-navigation`.
- [ ] Register routes using capability references rather than role-name conditions.
- [ ] Use shared page headers, loading/error/not-found, stale-edit, confirmation, and status patterns.
- [ ] Use the approved Supabase Auth/session, server action/route-handler, validated environment, monitoring, and migration boundaries from `04`.
- [ ] Add safe correlation IDs and redacted monitoring context for failed enrollment operations.
- [ ] Add optional scoped Realtime invalidation only if approved; always refetch authoritative records.
- [ ] Prove no party/item mutation is registered with the offline queue or accepted from offline state.

### 6. Testing and review

Testing: All applicable layers below.

- [ ] Run `design-system-auditor` against office/mobile form behavior, focus, typography, contrast, touch targets, and error feedback.
- [ ] Run `rbac-rls-reviewer` against every read/mutation path and cross-party identifier case.
- [ ] Run real-Postgres migrations and integration tests before sign-off for constraints, foreign keys, uniqueness, deactivation/reference behavior, and RLS.
- [ ] Add representative feature contract tests proving downstream receiving, WRR, inventory, and withdrawal workflows can reference enrolled records without copying master-data logic.

## Testing matrix

### Unit tests (Vitest)

- [ ] Party/item input schemas, normalization, field lengths, conditional requirements, and safe error mapping.
- [ ] Barcode/code/cross-reference duplicate preflight behavior.
- [ ] Packaging, dimensions, volume, UOM, SPQ, weight, reorder, and perishability validation/calculation.
- [ ] Active/inactive and optimistic-concurrency state helpers.
- [ ] Navigation/capability metadata and online-only mutation policy.

### Integration tests

- [ ] Real Postgres: apply the complete migration chain and verify canonical constraints and foreign keys for `parties`, `party_roles`, `items`, and `item_categories`.
- [ ] Real Postgres: verify duplicate party/item codes and barcodes are rejected under concurrency.
- [ ] Real Postgres: verify RLS default deny, authorized global access, party-scope boundaries, and no cross-party inference through search/detail paths.
- [ ] Verify deactivation preserves historical references and blocks unsafe new use according to approved domain rules.
- [ ] Verify failed/rejected writes do not leave partial party-role or item-reference mutations.

### E2E tests (Playwright)

- [ ] Authorized user creates, searches, edits, and deactivates a party.
- [ ] Authorized user creates, searches, edits, and deactivates an item with category/default-party selectors.
- [ ] Duplicate and invalid field submissions show actionable accessible errors.
- [ ] Stale edit produces a conflict/reload path without silent overwrite.
- [ ] Unauthorized user cannot see or invoke protected mutation controls; direct route access fails safely.
- [ ] Party user cannot infer unrelated party/item records through search, filters, counts, or IDs.
- [ ] Forms remain usable at representative office/mobile widths and with keyboard navigation.
- [ ] Offline mode blocks all enrollment mutations and does not add them to the queue.

### Manual QA

- [ ] Verify role labels (`vendor`, `supplier`, `customer`, `end_customer`, `internal_warehouse`) are presented as business classifications and not application roles.
- [ ] Verify no UI uses `suppliers`, `SKU`, `bins`, or `warehouse_id` as entity concepts.
- [ ] Verify price/help text does not imply final Trading pricing or authoritative VMI billing.
- [ ] Verify database/reference impact behavior before deactivation.

## Sign-off

- [ ] `01-core-data-model` fields and constraints are approved and reconciled.
- [ ] RBAC/RLS review passes.
- [ ] All applicable tests pass, including real-Postgres testing.
- [ ] No offline mutation leakage is present.
- [ ] `design-system-auditor` review passes.
- [ ] Product owner approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
