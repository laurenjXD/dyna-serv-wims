# Party & Item Enrollment — Design

Status: Approved
Updated: 2026-08-05

## 1. Design intent

Party and item enrollment is an authenticated office/master-data surface backed by the canonical core tables. It uses server-owned commands, typed validation, explicit capability checks, and database constraints. It does not create a parallel catalog, flow-specific item tables, or client-authoritative master data.

The design follows `specs/00-steering/brand-design-system.md`: office layouts may use wider forms and tables, but the screen remains usable on mobile with approved focus, contrast, touch-target, and error-state behavior.

## 2. Foundational dependencies and tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, and `brand-design-system.md`.
- `01-core-data-model` for the canonical table definitions and database constraints.
- `02-rbac-roles` for capabilities, party/flow scope, RLS, session resolution, and audit events.
- `03-offline-mode-and-client-storage` for the Tier 2/online-only master-data boundary.
- `04-services-and-infrastructure` for Auth, server runtime, migrations, monitoring, Storage, and optional Realtime.
- `05-ui-shell-and-navigation` for authenticated layouts, page headers, responsive behavior, and feedback regions.
- `17-product-categorization-and-classification` for category hierarchy/classification ownership.

### Core tables touched

| Table | Use in this feature | Ownership boundary |
|---|---|---|
| `parties` | Create, read, update, deactivate, and search party master records. | Core schema owns columns/constraints; RBAC owns authorization. |
| `party_roles` | Add/remove business classifications attached to a party. | Not application-user roles; RBAC user roles remain separate. |
| `items` | Create, read, update, deactivate, and search shared item master records. | Core schema owns item fields; pricing/flow workflows own business interpretation. |
| `item_categories` | Read approved category references for item enrollment. | Category hierarchy management belongs to spec `17`. |

No `lots`, `inventory_transactions`, `wrr_documents`, `wrr_items`, `locations`, pricing tables, billing tables, user-role tables, or offline queue stores are owned by this feature. A server command may join related records for authorization/reference checks, but must not redefine them here.

### Canonical field names reconciled with approved `01-core-data-model`

The following column names are final per the approved `01` schema. All forms, validation schemas, server actions, and integration tests for this feature must use these exact names.

**`parties`** — `id`, `code` (varchar 50, NOT NULL UNIQUE), `name` (varchar 255, NOT NULL), `contact_person` (varchar 255), `email` (varchar 255), `phone` (varchar 50), `tax_id` (varchar 50), `address` (text), `notes` (text), `is_active` (boolean NOT NULL, default `true`), `created_at`, `updated_at`.

**`party_roles`** — `id`, `party_id` (FK → `parties.id`, CASCADE on delete, NOT NULL), `role` (enum NOT NULL — approved values: `vendor`, `supplier`, `customer`, `end_customer`, `internal_warehouse`), `created_at`. No `updated_at`. No database-level unique constraint on `(party_id, role)` in the approved schema; the server action must enforce no duplicate role assignment per party.

**`item_categories`** — `id`, `name` (varchar 100, NOT NULL), `flow_type` (nullable enum: `vmi`, `trading`, `supplies`), `parent_id` (self-referential FK, null for top-level categories), `description` (text), `created_at`. No `updated_at`; category management belongs exclusively to `17-product-categorization-and-classification`.

**`items`** — `id`, `code` (varchar 100, NOT NULL UNIQUE), `supplier_item_code` (varchar 100), `customer_item_code` (varchar 100), `dsgc_item_number` (varchar 100), `name` (varchar 255, NOT NULL), `description` (text), `barcode` (varchar 100, NOT NULL UNIQUE), `item_type` (varchar 50, NOT NULL, default `standard`), `category_id` (FK → `item_categories.id`, nullable), `default_supplier_party_id` (FK → `parties.id`, nullable), `uom` (varchar 50, NOT NULL, default `piece`), `currency` (varchar 10, NOT NULL, default `USD`), `buying_price` (decimal 12,4, nullable), `selling_price` (decimal 12,4, nullable), `spq` (integer NOT NULL, default `1`), `spq_meter` (decimal 10,2, nullable), `length_cm` (decimal 10,2), `width_cm` (decimal 10,2), `height_cm` (decimal 10,2), `volume_cm3` (decimal 12,2), `volume_cbm` (decimal 10,4, NOT NULL), `boxes_per_pallet` (integer, nullable), `weight_kg` (decimal 10,3), `min_reorder_level` (integer NOT NULL, default `0`), `is_perishable` (boolean NOT NULL, default `false`), `is_active` (boolean NOT NULL, default `true`), `created_at`, `updated_at`.

No provisional field names (`sku`, `warehouse_id`, or flow-specific columns) appear in the approved schema. The cross-reference fields `supplier_item_code`, `customer_item_code`, and `dsgc_item_number` are the final names; forms and API contracts must not use alternate names for these columns.

## 3. Route and shell integration

Target routes, subject to the final route inventory from `05`:

```text
app/(authenticated)/
  master-data/
    parties/
      page.tsx              # searchable list
      new/page.tsx          # create form
      [partyId]/page.tsx    # detail/review
      [partyId]/edit/page.tsx
    items/
      page.tsx              # searchable list
      new/page.tsx          # create form
      [itemId]/page.tsx     # detail/review
      [itemId]/edit/page.tsx
```

The exact route names are provisional. The routes use the authenticated shell and office surface from `05-ui-shell-and-navigation`. The shell supplies page title/context, global navigation, session controls, and global error/status regions; this feature supplies forms, lists, validation, and domain-specific confirmation.

The navigation registry must reference capability contracts, not role names. A user who may read but not manage records sees review/search surfaces without mutation actions, subject to final RBAC decisions.

## 4. Command boundary

All mutations use server actions or route handlers through a shared pattern:

```text
request
  → authenticated server session
  → capability + party-scope check
  → input schema validation/normalization
  → optimistic-concurrency check
  → database transaction
       ├── parties/items mutation
       ├── party_roles relation mutation where applicable
       ├── audit/security event as approved
       └── related reference validation
  → safe result + revalidated list/detail view
```

The applicable capability identifiers are confirmed against the `02-rbac-roles` §3.2 finalized catalog: `parties.read` (global), `parties.manage` (global), `items.read` (global), and `items.manage` (global). Party role classification mutations (adding or removing `party_roles` records) are performed under `parties.manage` authorization; no separate `party_roles.manage` capability exists in the `02` catalog. Access to `item_categories` records for selection during enrollment is covered by `items.read`; no standalone `item_categories.read` capability is defined in the `02` catalog. Any downstream spec that requires a new resource key must add it to the `02` catalog before implementation; this feature must not invent capability names outside that catalog.

The client may send a requested record identifier, but the server resolves the actual record and current scope. A client-supplied `party_id`, role, flow, or category ID never grants access.

## 5. Party model and workflows

### Create

1. User opens the party create route through an authorized capability (`parties.manage`).
2. The form collects `code` (required, normalized, unique), `name` (required), `contact_person`, `email`, `phone`, `tax_id`, `address`, and `notes` using the exact column names from the approved `parties` schema. `is_active` defaults to `true`.
3. The user selects one or more business roles from the canonical `partyRoleEnum`: `vendor`, `supplier`, `customer`, `end_customer`, or `internal_warehouse`. These are business classifications only; they do not grant application access.
4. The server revalidates uniqueness of `code`, role validity (no duplicate `(party_id, role)` pairs), and actor capability in one transaction.
5. The `parties` row and any `party_roles` rows are committed, with an audit event if required by the approved audit design.

### Edit/deactivate

Edits use a version/updated-at precondition. A stale edit returns a conflict and offers reload/review; it does not silently overwrite.

Deactivation sets `is_active = false` on the `parties` row. It is a lifecycle update, not a database row delete. Before committing, the server evaluates impact on open WRR documents (`vendor_party_id` references), items using this party as `default_supplier_party_id`, active `user_party_scopes` assignments, and any other dependent records. Historical records remain addressable to authorized users. The specific blocking and non-blocking conditions belong to the owning workflow and RBAC domain designs and must not be assumed client-side.

`party_roles` changes are business classifications. They do not grant or revoke application access. User-party scope changes remain exclusively in `02-rbac-roles`.

## 6. Item model and workflows

### Shared item record

The form maps to the `items` columns approved by `01-core-data-model`: `code` (required, unique — the Dyna-Serv internal item code), `supplier_item_code`, `customer_item_code`, and `dsgc_item_number` (cross-reference codes, all optional), `name` (required), `description`, `barcode` (required, unique), `item_type` (required, default `standard`), `category_id` (FK to `item_categories`, nullable), `default_supplier_party_id` (FK to `parties`, nullable), `uom` (required, default `piece`), `currency` (required, default `USD`), `buying_price` and `selling_price` (nullable reference values — see Price boundary below), `spq` (required, default `1`), `spq_meter` (conditional), `length_cm`, `width_cm`, `height_cm`, `volume_cm3`, `volume_cbm` (NOT NULL), `boxes_per_pallet`, `weight_kg`, `min_reorder_level` (required, default `0`), `is_perishable` (required, default `false`), and `is_active` (required, default `true`).

The UI can use an item type/UOM selection to reveal relevant fields, but it must not create a persisted flow ownership field absent from the approved core schema. The same item master may be referenced by VMI, Trading, and Supplies workflows; ownership, lot partition, pricing, and billing are resolved in those workflows.

### Packaging and dimensional validation

The following rules are derived from the approved `01-core-data-model` precision and type constraints:

- **`spq`**: must be a positive integer (≥ 1). Default is `1`. VMI and Trading withdrawal quantities must be full `spq` multiples; Supplies permits individual pieces. These withdrawal rules are enforced by the owning workflow specs, not by a CHECK constraint here.
- **`spq_meter`**: required and must be a positive decimal when `uom = 'roll'` or the item type uses meter-based measurement. Must be null for all other UOM types.
- **`uom`**: must be one of the approved dropdown values (`piece`, `roll`, `meter`). Default is `piece`.
- **`currency`**: must be one of the approved values (`USD`, `PHP`). Default is `USD`.
- **`length_cm`**, **`width_cm`**, **`height_cm`**: when any one is provided, all three must be provided. Each must be a positive decimal (> 0), stored as `decimal(10,2)`.
- **`volume_cm3`**: `length_cm × width_cm × height_cm`, rounded to 2 decimal places, stored as `decimal(12,2)`.
- **`volume_cbm`**: `length_cm × width_cm × height_cm ÷ 1,000,000`, rounded to 4 decimal places per the approved `decimal(10,4)` column. This field is NOT NULL in the approved schema; if dimensions are not yet known at enrollment, the form must require an explicit direct `volume_cbm` entry. The UI must display the derived value from dimensions and must prevent silent disagreement between stored dimensions and stored `volume_cbm`. A user may not manually override a calculated `volume_cbm` without the core schema permitting an audited override.
- **`boxes_per_pallet`**: positive integer (≥ 1) when provided; null is permitted.
- **`weight_kg`**: non-negative decimal when provided, stored as `decimal(10,3)`; null is permitted.
- **`min_reorder_level`**: non-negative integer, default `0`. NOT NULL in the approved schema.
- **Perishability**: `is_perishable = true` flags the downstream receiving requirement for manufacture and expiry data capture. Enrollment does not create a lot, a WRR record, or a receiving transaction.

### Default supplier

The default supplier selector queries active authorized `parties` whose `party_roles` include `supplier` or `vendor`. It stores the selected party as `default_supplier_party_id` (FK to `parties.id`) on the `items` row. Inactive parties must not appear in the selector. The selector must not accept free-text party identifiers as the primary relation, and it must not create a party inline.

### Price boundary

The approved `01-core-data-model` schema includes `buying_price` and `selling_price` on `items` as nullable `decimal(12,4)` columns. These are master reference values only. They are never written to a Trading order line, never used as the committed document price for any outbound transaction, and never used as the authoritative VMI period billing value.

- Any use of `buying_price` or `selling_price` in a pricing workflow goes exclusively through `13-trading-orders-and-pricing`'s own price resolution logic.
- VMI period billing is computed from `lot_location_balances` occupied CBM over time, owned exclusively by `12-vmi-billing`.
- Enrollment forms may display `buying_price` and `selling_price` as informational master values and allow authorized administrators to update them. The form must include visible help text that these values do not directly determine any document or billing price.
- No enrollment server action may write `buying_price` or `selling_price` to a Trading order line, an `inventory_commitment_line`, or a VMI billing ledger row.

### Category ownership

`item_categories` records are read-only from this feature's perspective. Creation, editing, and hierarchy management belong exclusively to `17-product-categorization-and-classification`. The item enrollment form selects from existing approved `item_categories` records using the `category_id` FK on `items`. It must not create, rename, or reorder category records. An `item_categories` record may carry an optional `flow_type` scope (`vmi`, `trading`, or `supplies`) managed by `17`; enrollment must not modify that value.

### Barcode immutability

Once a barcode is assigned to an item and that item has any associated `lots` record, `wrr_items` record, or `inventory_transactions` record, the `barcode` value may not be changed through the standard edit flow. The `barcode` column carries a database-level UNIQUE constraint in the approved `01` schema; it is the primary physical scan identifier for all floor workflows.

If a barcode change is required after operational use, a new item must be enrolled with the correct barcode. Any migration of historical references requires an explicit authorized migration path with a full audit trail; it may not be performed through the standard item edit form. The server must reject a `barcode` update on any item that has a related `lots`, `wrr_items`, or `inventory_transactions` row and return a descriptive error. No client-side check alone is sufficient; this rule is enforced server-side before the database write.

### Item deactivation impact

Setting `is_active = false` on an `items` row blocks new operational use in downstream workflows:

- New `wrr_items` lines referencing an inactive item are rejected by the server.
- New `lots` against an inactive item are not created during receiving.
- An inactive item must not appear as a selectable item in new pick-list generation.
- The default supplier selector must not surface inactive items.

Existing committed lots, open `wrr_items` lines on in-progress WRR documents, and already-allocated `inventory_commitment_lines` are **not** automatically cancelled when an item is deactivated. The owning workflows (`07-incoming-receiving`, `08-outgoing-withdrawal-and-two-stage-commitment`) handle those records according to their own state machines. Historical `inventory_transactions`, `lots`, and `pick_list_items` records remain accessible to authorized users for audit and reporting.

Deactivation is a lifecycle update, not a database row delete. All downstream enforcement is implemented in the owning workflow server actions; the `is_active` flag on the `items` row provides the gate.

### Flow-specific fields

The approved `items` table in `01-core-data-model` contains no `flow_type` column and no flow-ownership attribute. The item master record is shared across VMI, Trading, and Supplies workflows. Differences in how each flow interprets or uses an item are expressed exclusively in the owning workflow specs, not as attributes on the item record:

- VMI-specific behavior (CBM-based billing rates, vendor lot ownership) is owned by `12-vmi-billing` and the `lots`/`lot_location_balances` model.
- Trading-specific behavior (buying/selling price on an order line, margin calculation) is owned by `13-trading-orders-and-pricing`.
- Supplies-specific behavior (internal consumption, piece-level withdrawal) is owned by the relevant Supplies workflow specs.

The `item_type` field (varchar, default `standard`) distinguishes physical product types within the shared catalog (e.g., `raw_material`, `packaging`, `fabrication`, `spare_parts`, `machines`). It is not a flow-ownership field. Conditional form fields revealed by item type or UOM selection (`spq_meter`, dimensional fields, perishability) are UI guidance only; they do not persist flow-specific columns.

### Unknown-item recovery during receiving

When `07-incoming-receiving` encounters a WRR line whose scanned barcode does not match any `barcode` value in the `items` table, the following protocol applies:

1. **Floor staff cannot create items during receiving.** The scan flow flags the unknown barcode and halts progression of that WRR line. Floor scan capability does not grant item enrollment rights.
2. **`07` creates a "pending enrollment" exception** that places the affected WRR line in a held state. The WRR document as a whole is not cancelled; only the blocked line is halted pending resolution.
3. **An authorized administrator or supervisor** resolves the hold by enrolling the missing item online through this feature (`06`) using the standard item create form, full barcode uniqueness validation, and all master-data controls.
4. **After enrollment**, `07` resumes the WRR line. The `wrr_items.item_id` FK — nullable in the approved `01` schema specifically to support this scenario — is updated to reference the newly enrolled item before receipt confirmation.
5. **No offline item creation is permitted.** The enrollment step is online-only in v1 and does not enter the Tier 1 offline queue.
6. **No bypass of the barcode uniqueness constraint** is available through the receiving path. The `barcode` column on `items` has a database-level UNIQUE constraint in the approved `01` schema.

Ownership boundary: `06` owns the enrollment step (item master record creation, validation, and barcode assignment). `07` owns the exception/hold state on the WRR line, the trigger that flags the unknown barcode, and the resume logic after enrollment is confirmed.

## 7. Search, list, and detail behavior

- List queries use server-side filtering/pagination and only return fields allowed by the caller's capability/scope.
- Search matches normalized canonical code/name and approved cross-reference fields; it must not expose hidden records through counts, autocomplete, or error messages.
- Detail views show lifecycle status and safe related references. They do not become an inventory dashboard or expose lots/transactions without the owning feature's authorization.
- Realtime, if enabled, invalidates the relevant list/detail query and triggers an authoritative refetch. It is not used as the sole source of truth.
- Empty, loading, error, and stale-edit states use the shared shell and feature contracts from `05`.

## 8. Authorization and RLS

The server checks the current session and capability before each read/mutation. PostgreSQL RLS remains the authoritative data boundary for protected `parties`, `party_roles`, `items`, and `item_categories` access once the core/RBAC policies are approved.

Potential scope rules:

- Global master-data management is restricted to the approved operational/admin capabilities.
- Party users do not gain global catalog access from a party assignment; any party-facing item projection requires an explicit approved relation and capability.
- A `default_supplier_party_id` on an item must not accidentally expose the entire item record to an unrelated party user.
- `party_roles` are not consulted as user roles and do not bypass current capability checks.
- Unknown or out-of-scope records use the approved not-found/forbidden behavior without existence leakage.

The final policy matrix and SQL policy implementation are supplied with the core/RBAC migration sequence and reviewed by `rbac-rls-reviewer`.

## 9. Offline, Realtime, and audit boundaries

- Create/update/deactivate and business-role mutations are excluded from the offline Tier 1 registry.
- Offline floor workflows may consume a stale, bounded read cache only when their owning feature and offline policy allow it; the enrollment feature does not own that cache.
- Audit/business events are written server-side in the authoritative transaction. The browser cannot fabricate an audit outcome.
- Realtime is optional and must be scoped; events cause invalidation/refetch, not local authorization.

## 10. Design verification before approval

- [x] Reconcile all fields and constraints with the approved `01-core-data-model` schema; resolve current naming/field inconsistencies before implementation. (Resolved 2026-08-05: exact column names, types, nullability, and constraints reconciled in §2 canonical fields block and §5/§6 throughout.)
- [x] Confirm the final capability identifiers with `02-rbac-roles`. (Resolved 2026-08-05: capability vocabulary in §4 updated to match the finalized `02` §3.2 catalog — `parties.read`, `parties.manage`, `items.read`, `items.manage`; `party_roles.manage` and `item_categories.read` removed as they do not exist in the `02` catalog.) RLS policy implementation still requires `02` approval before implementation.
- [x] Confirm category read/create ownership with `17-product-categorization-and-classification`. (Resolved 2026-08-05: §6 Category ownership subsection explicitly states `item_categories` is read-only from `06`'s perspective; creation/editing/hierarchy belong exclusively to `17`.)
- [x] Confirm reference/default price semantics with `12-vmi-billing` and `13-trading-orders-and-pricing`. (Resolved 2026-08-05: §6 Price boundary explicitly prohibits writing `buying_price`/`selling_price` to any order line, commitment, or billing ledger row; full price resolution belongs to `13`/`12` respectively.)
- [ ] Confirm Auth, audit, Storage, Realtime, and migration boundaries with `04-services-and-infrastructure`.
- [ ] Confirm route, page-header, responsive, and feedback contracts with `05-ui-shell-and-navigation`.
- [ ] Confirm no mutation is admitted to the offline queue under `03-offline-mode-and-client-storage`.
- [ ] Run `rbac-rls-reviewer` and `design-system-auditor` before sign-off.
