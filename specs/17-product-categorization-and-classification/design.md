# Product Categorization & Classification — Design

Status: Draft
Updated: 2026-08-05

## 1. Design intent

`17` is the governed taxonomy service for product classification. It maintains a canonical hierarchy and exposes typed read/validation contracts to item enrollment, operations, reporting, and approved AI projections. It is master data, not inventory state.

The design starts with the provisional `01` shape—`item_categories` with `name`, optional `flow_type`, `parent_id`, and `description`—but does not treat that draft shape as final. Status, ordering, versioning, effective dates, and any item classification history must be reconciled with `01` before migrations or application code are written.

## 2. Foundational dependencies and tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, and `brand-design-system.md`;
- `01-core-data-model` for `item_categories`, `items`, `flow_type`, and canonical constraints;
- `02-rbac-roles` for capabilities, scope, RLS, session resolution, and audit;
- `03-offline-mode-and-client-storage` for online-only master-data mutations;
- `04-services-and-infrastructure` for Auth, transactions, jobs, Realtime, monitoring, and migrations;
- `05-ui-shell-and-navigation` for authenticated responsive admin surfaces;
- `06-party-and-item-enrollment` for the consuming item-classification flow;
- `16-reporting-and-analytics` for stable historical category/report projections;
- `15-ai-chatbot` for the bounded read-only projection, if enabled.

### Core tables touched

| Table | Use in this feature | Ownership boundary |
|---|---|---|
| `item_categories` | Create, read, update, lifecycle, hierarchy, applicability, and version policy. | `01` owns final schema/constraints; `17` owns taxonomy rules. |
| `items` | Read item references for impact checks and approved classification validation; update only through the owner contract if classification is stored here. | `06` owns item enrollment/maintenance; `17` must not become a parallel item editor. |

No `lots`, `locations`, `inventory_transactions`, `wrr_documents`, `pick_list`, `acknowledgement_receipt`, pricing, billing, RBAC assignment, or offline queue tables are owned by `17`.

### 2.1 Taxonomy ownership, hierarchy, ordering, active status, versioning, and effective dates

**Ownership.** The `item_categories` table is owned by `17` for all business rules and lifecycle operations. `06-party-and-item-enrollment` reads `item_categories` as reference data only — it never creates, updates, or deactivates categories through enrollment flows. `01-core-data-model` owns the final schema and constraints; `17` owns the meaning and governance of each field.

**Hierarchy.** `parent_id` is a self-referential FK on `item_categories` (nullable = root/top category). The maximum supported depth is **3 levels** (top → sub → leaf). This limit is enforced by the server command on create and re-parent operations; no migration-time constraint is required, but the depth check is mandatory before any category insert or re-parent.

**Ordering.** A `display_order` integer column governs sort position within the same parent level. Categories at the same level are sorted ascending by `display_order`; ties fall back to `name`. Administration surfaces expose drag-to-reorder or explicit `display_order` input. The field has no global uniqueness constraint — only relative ordering within a sibling set is meaningful.

**Active status.** `is_active` boolean. Setting a parent category inactive cascades to **UI presentation only**: child categories and any items referencing them are hidden from enrollment selectors and active-category views. Child records are **not deleted and not themselves set inactive** by a parent deactivation. Reactivating the parent restores full visibility. This preserves referential integrity and avoids a cascading deactivation that would require a coordinated bulk re-activation undo path.

**Versioning.** `updated_at` (auto-managed timestamp) and `updated_by` (UUID FK to the acting user) are required audit fields on `item_categories`. These fields provide sufficient change attribution for v1. Full event-sourced version history is not required in v1; the append-only `rbac_security_events` audit log (owned by `02`) carries the change trail.

**Effective dates.** Not required in v1. Categories become effective immediately on creation or reactivation. There is no scheduled future activation or future deactivation. This simplification is intentional; scheduled activation would require a background job and coordination overhead not justified by the v1 scope.

## 3. Provisional logical model

```text
item_categories
  id
  name
  parent_id      -> item_categories.id (nullable = root/top category; max depth 3, server-enforced)
  flow_type      (nullable only if approved as broadly applicable)
  description
  display_order  integer; sort position within the same parent (ascending; ties fall back to name)
  is_active      boolean; parent deactivation hides children from selectors without cascading is_active to child records
  updated_at     auto-managed timestamp (audit)
  updated_by     uuid FK to acting user (audit)
  created_at
  created_by
```

The minimum invariants are:

- a category cannot parent itself or any descendant;
- an active child requires an active, valid parent;
- a flow-scoped child cannot be broader than its approved parent policy;
- category names and normalized keys follow the approved scope-specific uniqueness rule;
- inactive categories remain readable for authorized history but are not selectable for new classifications;
- a category change is append-audited and carries a definition/version marker.

If one shared `items.category_id` cannot represent an item used across distinct flow taxonomies, the approved design must add a canonical classification relation or a clearly defined shared-category model in `01`. The implementation must not simulate that relation in client state.

## 4. Taxonomy seed and governance flow

The provisional seed review begins with the `01` design:

```text
VMI:
  Packaging Material -> Plastic Tray, U-Clip, Carrier Tape, End-Plug, Cover Tape
  Raw Material       -> Polysheet, Resin
  Fabrication        -> custom fabrication items
  Spare Parts        -> equipment spare parts
  Machines           -> pending approved subcategories

Trading:
  Packaging Material -> ESD, Chemicals
  Raw Material       -> general raw materials and consumables
  Fabrication        -> Plastic, Metal
  Spare Parts        -> Tester Boards
  Machines           -> pending approved subcategories

Supplies:
  taxonomy and shared-category policy -> pending explicit decision
```

These are seed candidates, not approved production facts. A taxonomy proposal is reviewed for duplicate names, parent/child meaning, flow applicability, item impact, reporting impact, and downstream UOM/item-type rules. Approval/execute separation, if required by `02` or governance policy, is enforced by server commands and audit—not by a UI-only button state.

## 5. Command and validation boundaries

All mutations follow:

```text
request
  -> authenticated session
  -> current capability + optional flow scope
  -> input normalization and hierarchy validation
  -> impact/concurrency check
  -> database transaction
       - category mutation and version/effective metadata
       - approved audit/security event
       - optional classification migration marker
  -> safe result + authoritative refetch
```

The category selector contract is read-only:

```text
getCategoryOptions({ flowType?, parentId?, includeInactive? })
  -> authorized active options + parent path + definition version + freshness
```

`06` uses this contract to populate cascading selectors. It submits the selected canonical ID to its own server command, which revalidates existence, status, hierarchy, and flow applicability. A category option cannot establish authorization or make a client-supplied flow authoritative.

The classification validator returns structured results such as `valid`, `warning`, or `blocked`, with rule/version references and safe user-facing messages. It does not mutate inventory or call pricing/billing logic.

## 6. Lifecycle, migration, and history

Create and rename operations use normalized values and optimistic concurrency. Deactivation is preferred over deletion when any item, lot, document, report, or audit record references the category. Re-parenting and bulk recategorization first produce an impact preview showing affected active items, flow contexts, and downstream report implications.

When an item classification changes, the system must preserve the prior classification/version for historical reporting if the approved `01` model requires it. `16` consumes an effective-dated or snapshot-capable projection; it must not infer past category membership from the current name.

Category changes do not rewrite `inventory_transactions`, lot flow, WRR history, pick/receipt content, Trading price snapshots, or VMI billing-period records. A later report may show the current category and the as-of historical category according to the approved history contract.

**Item classification history rule.** Changing an item's category assignment updates `items.category_id`. This affects future reporting and enrollment UI grouping only. Existing lots, WRR records, inventory transactions, and pick list items retain their item reference without change — they are not re-classified. Historical records always display the category that was current at the time of the operation (via item snapshot or join at query time).

**Category metadata boundary.** Category is display/organizational metadata. A category change MUST NOT trigger re-pricing of Trading orders, re-calculation of VMI billing, or any inventory transaction. Any feature that uses category as a billing or pricing input (there are none in v1) would require explicit cross-spec approval.

## 7. Authorization, RLS, privacy, and offline behavior

The effective access rule is:

```text
current capability
  + allowed category resource/action
  + optional flow scope
  + RLS policy
  + field/operation visibility
```

Global taxonomy administration is restricted to approved internal capabilities. Party users receive only the category/item projection explicitly permitted for their party and flow. Search, counts, autocomplete, impact previews, and errors use the same scope and safe denial behavior.

Category mutations and classification changes are online-only. A cached selector may be displayed as stale reference data, but an online server validation is required before any item mutation. Realtime only invalidates caches; it is not the source of truth.

## 8. UI and shell behavior

The administration surface is office-first and responsive. It uses accessible tree/list semantics, a visible parent path, flow applicability labels, lifecycle badges with text/icons, impact preview, and a clear single primary action per form step. It follows the approved tokens and does not introduce taxonomy-specific colors or typography.

The item-enrollment consumer remains owned by `06`. Its selector should be cascading and context-aware, but it must not expose an admin mutation affordance to a user who only has `items.manage`. Mobile review remains usable without turning category administration into a floor scan flow.

## 9. Testing strategy

- **Vitest:** hierarchy invariants, cycle detection, normalization/uniqueness, flow applicability, classification rules, warning/block behavior, version/effective-date logic, and selector contract.
- **Real Postgres:** self-referential constraints, RLS, scoped reads, concurrency, inactive-reference preservation, impact queries, audit append behavior, and bulk-operation idempotency.
- **Integration/jobs:** seed migration, category-change propagation/invalidation, bulk classification, retries, and safe failure recovery.
- **Playwright:** admin hierarchy, cascading selectors in `06`, validation/conflict states, authorization isolation, responsive behavior, keyboard/screen-reader use, and offline stale selector behavior.
- **Manual QA:** taxonomy review with operations, item-enrollment usability, report/history reconciliation with `16`, and confirmation that no category change changes pricing, billing, or inventory state.
