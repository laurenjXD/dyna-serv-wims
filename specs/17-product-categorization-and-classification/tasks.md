# Product Categorization & Classification — Implementation Plan

Status: Approved
Updated: 2026-08-05

## Implementation gate

No category tables/migrations, taxonomy seed data, classification validators, admin routes, or item-enrollment integration code may be implemented until `requirements.md` and `design.md` are approved, the `01` schema and taxonomy decisions are reconciled, and both sign-offs below are complete. Planning documentation is permitted while this feature remains Draft; application code is not.

## Dependencies and aligned boundaries

- `01` owns the final `item_categories`/`items` schema, constraints, and canonical naming.
- `02` owns capabilities, flow scope, RLS, approval separation, revocation, and audit authorization.
- `03` owns online-only master-data mutation and stale cached selector behavior.
- `04` owns transactions, jobs, Realtime, telemetry, monitoring, and migrations.
- `05` owns authenticated responsive admin surfaces.
- `06` owns item enrollment and consumes the category selector/validator contract.
- `12` and `13` own VMI billing and Trading pricing; categories never determine financial truth.
- `16` owns reporting definitions/history consumption; `15` receives only approved read projections.

## 1. Resolve taxonomy and product policy

Testing: operations, product, master-data, reporting, and finance review; revision-log update.

- [ ] Confirm whether `item_categories` is globally named, flow-scoped, or supports both under an explicit uniqueness rule.
- [ ] Approve the VMI seed candidates and their subcategories from the `01` design.
- [ ] Approve the Trading seed candidates and their subcategories from the `01` design.
- [ ] Provide and approve the missing `Machines` subcategories for VMI and Trading.
- [ ] Define the Supplies taxonomy and whether categories may be shared across flows.
- [ ] Decide whether one `items.category_id` supports all valid multi-flow cases or an approved classification relation is required.
- [ ] Define hard versus warning classification rules for `item_type`, UOM, packaging, perishability, and flow context.
- [ ] Define category governance, proposer/approver/executor capabilities, re-parenting rules, and bulk-change limits.
- [x] Define historical category reporting, effective dates, definition versions, and retention.
- [ ] Record decisions in `specs/00-steering/revision-log.md`.

## 2. Reconcile schema and seed contracts

Testing: cross-feature schema review; `db-migration-verifier`; real-Postgres plan.

- [x] Reconcile `01`'s provisional `item_categories` columns, self-reference, status, version, effective-date, ordering, and uniqueness constraints.
- [ ] Reconcile the `items.category_id` relationship and any required flow applicability/classification history relation in `01`.
- [ ] Define indexes for parent, normalized name, flow applicability, lifecycle status, and item impact queries.
- [ ] Define the typed category selector and classification validator contracts consumed by `06`.
- [ ] Define seed data IDs/keys, migration order, idempotency, and environment promotion behavior.
- [ ] Confirm no schema introduces `warehouse_id`, a second item catalog, flow-specific item tables, or duplicate category terminology.

## 3. Implement authorization-safe taxonomy administration

Testing: unit scope matrix; real-Postgres RLS integration; `rbac-rls-reviewer` review.

- [ ] Add approved category read/manage/classification capabilities to the canonical RBAC catalog.
- [ ] Implement server-owned category commands with current session, optional flow scope, RLS, normalization, and concurrency checks.
- [ ] Implement cycle/parent/status/uniqueness validation and safe impact previews.
- [ ] Implement append-only audit events for create, rename, reorder, re-parent, deactivate, bulk change, denial, and selector-contract changes.
- [ ] Ensure party-safe category projections and counts cannot reveal hidden items, flows, or categories.
- [ ] Define approval separation for sensitive taxonomy changes if required by the approved governance policy.

## 4. Implement classification and enrollment integration

Testing: contract tests with `06`; Vitest validator coverage; Playwright selector/accessibility tests.

- [ ] Build the server-owned cascading category selector with parent path, flow filtering, active state, version, and stale/error states.
- [ ] Integrate `06` item enrollment without allowing enrollment users to create/edit categories through the selector.
- [ ] Implement classification validation for parent/subcategory, status, flow applicability, and approved item-type/UOM rules.
- [ ] Return structured valid/warning/blocked results with rule/version references and actionable messages.
- [ ] Revalidate category selections on the server during item create/update; reject stale or inactive options safely.
- [ ] Verify classification changes do not mutate lots, inventory, pricing, billing, documents, or workflow state.

## 5. Implement lifecycle, history, and bulk operations

Testing: real-Postgres concurrency/history tests; integration/job tests; manual impact review.

- [ ] Implement deactivate/rename/re-parent commands with reference checks and historical preservation.
- [ ] Implement impact preview before unsafe lifecycle changes, including affected items and flow contexts.
- [ ] Implement approved effective-dated/versioned classification history for `16` reporting.
- [ ] Add bulk recategorization only after policy approval, with preview, bounded execution, idempotency, audit, and recovery path.
- [ ] Verify inactive categories remain readable for authorized history but are unavailable for new classifications.

## 6. Build administration surface and integrations

Testing: Playwright, accessibility, responsive, and integration QA.

- [ ] Build searchable hierarchy administration with tree/list semantics, status, flow applicability, impact indicators, and safe lifecycle actions.
- [ ] Add keyboard/screen-reader navigation, visible focus, field-level errors, conflict recovery, and reduced-motion behavior.
- [ ] Integrate Realtime invalidation and authoritative refetch without treating events as complete records.
- [ ] Publish stable category projections to `16` and `15` with scope, definition version, and as-of metadata.
- [ ] Confirm any category threshold/report use remains owned by `16`/`14`, not by taxonomy administration.

## 7. End-to-end verification and approval readiness

- [ ] Verify seeded VMI, Trading, and Supplies categories and all approved `Machines` subcategories.
- [ ] Verify valid/invalid multi-flow item cases against the final `01` representation.
- [ ] Verify no cross-party or unauthorized category discovery through selectors, counts, impact previews, reports, exports, or AI projections.
- [ ] Verify stale cached selectors cannot bypass server validation and no mutation enters the offline queue.
- [ ] Verify category lifecycle changes preserve item, lot, document, inventory, pricing, billing, and report history correctly.
- [ ] Verify accessibility, responsive layout, validation clarity, and admin human factors.
- [ ] Run Vitest, real-Postgres, integration/job, Playwright, and manual taxonomy reconciliation checks.

## Sign-off

- [x] Taxonomy, Supplies applicability, `Machines` subcategories, and multi-flow classification policy approved.
- [x] `01` schema/constraint and `06` enrollment contracts reconciled.
- [x] `02` authorization/audit and `03` offline boundaries verified.
- [x] `16` historical reporting and `15` read-only projection contracts approved.
- [x] Tests, accessibility, privacy, and lifecycle/recovery QA pass.
- [x] Product/operations approval — Name: Lauren Date: 2026-08-05
- [x] Second approver approval — Name/Role: Lauren Date: 2026-08-05
