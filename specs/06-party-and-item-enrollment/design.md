# Party & Item Enrollment — Design

Status: Approved
Updated: 2026-08-05

## 1. Design intent

All list/table views in this feature consume the **Shared Table-Action and Filter/Search Contract** in `05-ui-shell-and-navigation` §8; this design adds only enrollment-specific fields and capabilities and never replaces RLS with client filtering.

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
| `parties` | Create, read, update, deactivate, and search party master records; source of `email`/`contact_person` for the Contact Party action. | Core schema owns columns/constraints; RBAC owns authorization. |
| `party_roles` | Add/remove business classifications attached to a party. | Not application-user roles; RBAC user roles remain separate. |
| `items` | Create, read, update, deactivate, and search shared item master records. | Core schema owns item fields; pricing/flow workflows own business interpretation. |
| `item_categories` | Read approved category references for item enrollment. | Category hierarchy management belongs to spec `17`. |
| `locations` | Create, read, update, and deactivate physical storage/staging location records. **(Added 2026-08-07)** | Core schema owns columns/constraints; this feature owns enrollment only — occupied-CBM calculation, putaway recommendation, and inventory-transaction use belong to `07`/`08`/`11`. |
| `email_deliveries` | Written by `04-services-and-infrastructure`'s pipeline when the Contact Party action is triggered; this feature reads delivery status for display only. **(Added 2026-08-07)** | `04` owns the table, retry/idempotency mechanics, and webhook updates. This feature never writes to it directly. |
| `inventory_transactions` | Read via `01-core-data-model`'s `location_transaction_ledger` and `party_transaction_ledger` derived read models for the location detail and party detail views' ledger sections. **(Added 2026-08-07)** | `01` owns the canonical table and both read-model contracts (§3 item 4). This feature never writes to `inventory_transactions` and never redefines the read models here. |

No `lots`, `wrr_documents`, `wrr_items`, pricing tables, billing tables, user-role tables, or offline queue stores are owned by this feature. `inventory_transactions` is consumed read-only, exclusively through `01`'s `location_transaction_ledger`/`party_transaction_ledger` read models (added 2026-08-07) — this feature never writes to it and never defines an independent query against it. A server command may join related records for authorization/reference checks, but must not redefine them here.

### Canonical field names reconciled with approved `01-core-data-model`

The following column names are final per the approved `01` schema. All forms, validation schemas, server actions, and integration tests for this feature must use these exact names.

**`parties`** — `id`, `code` (varchar 50, NOT NULL UNIQUE), `name` (varchar 255, NOT NULL), `contact_person` (varchar 255), `email` (varchar 255), `phone` (varchar 50), `tax_id` (varchar 50), `address` (text), `notes` (text), `is_active` (boolean NOT NULL, default `true`), `created_at`, `updated_at`.

**`party_roles`** — `id`, `party_id` (FK → `parties.id`, CASCADE on delete, NOT NULL), `role` (enum NOT NULL — approved values: `vendor`, `supplier`, `customer`, `end_customer`, `internal_warehouse`), `created_at`. No `updated_at`. No database-level unique constraint on `(party_id, role)` in the approved schema; the server action must enforce no duplicate role assignment per party.

**`item_categories`** — `id`, `name` (varchar 100, NOT NULL), `flow_type` (nullable enum: `vmi`, `trading`, `supplies`), `parent_id` (self-referential FK, null for top-level categories), `description` (text), `created_at`. No `updated_at`; category management belongs exclusively to `17-product-categorization-and-classification`.

**`items`** — `id`, `code` (varchar 100, NOT NULL UNIQUE), `supplier_item_code` (varchar 100), `customer_item_code` (varchar 100), `dsgc_item_number` (varchar 100), `name` (varchar 255, NOT NULL), `description` (text), `barcode` (varchar 100, NOT NULL UNIQUE), `item_type` (varchar 50, NOT NULL, default `standard`), `category_id` (FK → `item_categories.id`, nullable), `default_supplier_party_id` (FK → `parties.id`, nullable), `uom` (varchar 50, NOT NULL, default `piece`), `currency` (varchar 10, NOT NULL, default `USD`), `buying_price` (decimal 12,4, nullable), `selling_price` (decimal 12,4, nullable), `spq` (integer NOT NULL, default `1`), `spq_meter` (decimal 10,2, nullable), `length_cm` (decimal 10,2), `width_cm` (decimal 10,2), `height_cm` (decimal 10,2), `volume_cm3` (decimal 12,2), `volume_cbm` (decimal 10,4, NOT NULL), `boxes_per_pallet` (integer, nullable), `weight_kg` (decimal 10,3), `min_reorder_level` (integer NOT NULL, default `0`), `is_perishable` (boolean NOT NULL, default `false`), `is_active` (boolean NOT NULL, default `true`), `created_at`, `updated_at`.

No provisional field names (`sku`, `warehouse_id`, or flow-specific columns) appear in the approved schema. The cross-reference fields `supplier_item_code`, `customer_item_code`, and `dsgc_item_number` are the final names; forms and API contracts must not use alternate names for these columns.

**`locations`** (added 2026-08-07, per `01-core-data-model/design.md`'s `locations` table) — `id`, `zone` (varchar 50, NOT NULL), `rack` (varchar 50, NOT NULL), `level` (varchar 50, NOT NULL), `position` (varchar 50, NOT NULL), `label` (varchar 100, NOT NULL, UNIQUE — server-generated as `Rack+Level-Position`, e.g. `A1-01`; never free-typed), `location_type` (`location_type` enum, NOT NULL, default `storage` — approved values `receiving_bay`, `inspection`, `storage`, `picking`, `dispatch`), `max_cbm_capacity` (decimal 10,4, NOT NULL), `is_active` (boolean NOT NULL, default `true`), `created_at`. No `updated_at` column in the approved `01` schema for `locations`; edits update the row in place without a tracked modification timestamp beyond what the audit boundary records separately.

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
    locations/              # added 2026-08-07
      page.tsx              # searchable list
      new/page.tsx          # create form
      [locationId]/page.tsx      # detail/review
      [locationId]/edit/page.tsx
```

The `locations` routes follow the identical structural pattern as `parties`/`items` above — same list/create/detail/edit shape, same shell integration — so this reads as the spec's third master-data type rather than a bolted-on surface. Per `05-ui-shell-and-navigation/design.md` §3.2's route catalog, the top-level route is `/locations`, office surface, gated by `locations.manage` for the navigation entry (consistent with `/parties`/`/items` being gated by their respective `.manage` capabilities), owned by this spec (`06`).

The party detail view (`[partyId]/page.tsx`) gains a "Contact Party" action (added 2026-08-07) — see §5a below. No new route is introduced for it; it is an action on the existing detail page.

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

The applicable capability identifiers are confirmed against the `02-rbac-roles` §3.2 finalized catalog: `parties.read` (global), `parties.manage` (global), `items.read` (global), and `items.manage` (global). Party role classification mutations (adding or removing `party_roles` records) are performed under `parties.manage` authorization; no separate `party_roles.manage` capability exists in the `02` catalog. Access to `item_categories` records for selection during enrollment is covered by `items.read`; no standalone `item_categories.read` capability is defined in the `02` catalog. **(Added 2026-08-07)** Location create/update/deactivate is performed under `locations.manage`; location read/list is covered by `locations.read`. Both are confirmed against the `02` §3.2 catalog (`locations` resource key, `read`/`manage` actions — `read` held by `warehouse_staff`, `supervisor`, `administrator`; `manage` held by `administrator` only) and against `05-ui-shell-and-navigation/design.md`'s route-catalog capability table, which lists the same `locations` resource with the same two actions. The Contact Party email trigger (§5a) is performed under `parties.manage`, not a new capability. Any downstream spec that requires a new resource key must add it to the `02` catalog before implementation; this feature must not invent capability names outside that catalog.

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

### 5a. Contact Party email action (added 2026-08-07)

**Scope call for v1:** a single "Contact Party" button on the party detail view (`[partyId]/page.tsx`), gated by `parties.manage`. Clicking it opens a minimal composer: a fixed, pre-approved transactional template addressed to `parties.contact_person` at `parties.email`, with an optional free-text message field appended to the template body. A full email-composer/thread UI, attachments, or a message history view are explicitly out of scope for v1 — this is a single fire-and-forget notification trigger, not a messaging feature.

**Flow:**

1. Authorized user (holding `parties.manage`) clicks "Contact Party" on the party detail view and optionally enters free-text content.
2. A server action validates the capability, resolves the current `parties` row server-side (the client never supplies `email`/`contact_person` directly — only the `party_id`), and rejects the action if `parties.email` is null/empty for that party, returning an actionable error instead of silently no-op-ing.
3. The server action calls `04-services-and-infrastructure`'s existing operational Resend pipeline (design.md §12.1's "Application/Edge Function -> Resend API" path, using `RESEND_FROM_OPERATIONS`) exactly as already used for "WRR/inspection alerts, notifications, documents, reports" per that table — this is one more trigger into that same pipeline, not a new send path.
4. The pipeline writes an `email_deliveries` row per `04` §12.2 (`template_key`/`template_version` for this notification template, `resource_type = 'party'`, `resource_id = parties.id`, `idempotency_key`, correlation ID) and follows `04`'s existing async retry/backoff and webhook-driven status update mechanics (§12.3, §12.4) unchanged.
5. Failure semantics match `04`'s existing fail-open rule (design.md's dependency-failure table, "Resend — application email" row): a Resend API timeout or transient failure retries asynchronously via the `email_deliveries` job and never blocks, reverses, or holds up any party record state. The button click itself is a fire-and-forget trigger from the caller's perspective; delivery status is observable later (e.g. a "last contacted" indicator sourced from `email_deliveries`) but is not a synchronous precondition for anything else in this feature.
6. Who triggered the send and when is recorded via the existing `email_deliveries`/audit correlation mechanism already defined in `04` §12.2/§15 (actor, timestamp, correlation ID) — no parallel tracking table is created by this feature.

**Explicitly not involved:** no user's personal email account, mailbox, OAuth grant, or SMTP credential is read, stored, or used at any point. The send is a server-side call to Resend's API using the application's own verified `RESEND_FROM_OPERATIONS` sender identity — architecturally identical to every other operational email already listed in `04`'s table, not a new subsystem.

### 5b. Transaction Ledger (added 2026-08-07)

The party detail view (`[partyId]/page.tsx`) renders a "Transaction Ledger" section beneath the existing party master-data content. It displays `01-core-data-model`'s `party_transaction_ledger` derived read model (§3 item 4) for the currently viewed `party_id` — a read-only, paginated table of every `inventory_transactions` row connected to that party as vendor (via `wrr_documents.vendor_party_id`), customer (via `pick_lists.customer_party_id` and the `inventory_transactions.pick_list_id` column added 2026-08-07), or VMI owner (via `lots.owner_party_id`). Columns follow `party_transaction_ledger`'s defined field set: movement type, quantity, item, lot number, direction/source, performed-by, timestamp, and the Reference field (`commercial_invoice_no` for incoming, `ar_reference_no` for outgoing).

This is a read-only view. No new capability is introduced: the ledger is gated by the same `parties.read` capability that already gates viewing the party detail page (per §4's command boundary and `05-ui-shell-and-navigation/design.md`'s `/parties` route-table row, both confirmed against the `02-rbac-roles` §3.2 catalog), not a stricter or separate gate. This feature does not compute, cache, or duplicate the ledger query — it renders `01`'s read model as-is, the same consumption pattern already used for `master_inventory_tracking`/`lot_history_export` elsewhere in this repo.

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

## 6a. Location model and workflows (added 2026-08-07)

This is the spec's third master-data type, following the identical create/edit/deactivate pattern as parties (§5) and items (§6). It uses the same office-primary, mobile-reviewable surface treatment stated in `requirements.md` §3: creating/editing a rack is an office task, but a warehouseman must be able to look up a location's label and remaining capacity on a handheld device while working the floor — this is a lookup/review case, not a floor scan-and-mutate flow, so it does not require the floor-priority form treatment `brand-design-system.md` §3 reserves for scan-driven screens.

### Create

1. User opens the location create route through an authorized capability (`locations.manage` — Administrator only per the `02` catalog).
2. The form collects `zone`, `rack`, `level`, `position`, `location_type` (dropdown, default `storage`), and `max_cbm_capacity` using the exact column names from the approved `locations` schema. `is_active` defaults to `true`.
3. The server (not the client) computes `label` as `Rack+Level-Position` from the submitted `rack`, `level`, `position` values, exactly matching `01-core-data-model`'s documented format (e.g. Rack `A`, Level `1`, Position `01` → `A1-01`). The computed label is shown to the user for confirmation before submit, but the authoritative value is server-computed and re-verified at write time — a client-supplied label is never trusted.
4. The server revalidates `label` uniqueness (catching the case where two different `zone`/`rack`/`level`/`position` combinations would resolve to the same formatted label), `location_type` enum membership, `max_cbm_capacity` positivity, and actor capability in one transaction.
5. The `locations` row is committed, with an audit event if required by the approved audit design.

### Edit/deactivate

Edits use the same stale-edit protection pattern as parties/items (§5/§6). Changing `rack`, `level`, or `position` on an existing location recomputes and re-validates `label` uniqueness server-side before commit, following the same rule as create.

Deactivation sets `is_active = false` on the `locations` row. It is a lifecycle update, not a database row delete. Before committing, the server evaluates impact on existing `lot_location_balances` rows occupying the location and any in-progress putaway/transfer/pick operations referencing it; this feature does not recompute or reassign those balances — it only gates new use via `is_active`, matching the same boundary already stated for item deactivation in §6. The specific blocking/non-blocking conditions for *new* placement into a deactivated location belong to the owning workflow designs (`07`, `08`, `11`), which read `locations.is_active` as their gate.

Hard deletion is unavailable for a location referenced by any `lot_location_balances` or `inventory_transactions` row, matching the party/item pattern in §5/§6.

### Location type and capacity

`location_type` distinguishes physical zones (`receiving_bay`, `inspection`, `storage`, `picking`, `dispatch`) per the approved `01` enum. This feature does not implement putaway recommendation, occupied-CBM computation, or capacity-preview UI — those consume `locations.max_cbm_capacity` and are owned by `01-core-data-model`'s read models and `07-incoming-receiving`'s putaway design. This feature's responsibility ends at storing a correct, validated `max_cbm_capacity` value on the `locations` row.

### Movement Ledger (added 2026-08-07)

The location detail view (`[locationId]/page.tsx`) renders a "Movement Ledger" section beneath the existing location master-data content. It displays `01-core-data-model`'s `location_transaction_ledger` derived read model (§3 item 4) for the currently viewed `location_id` — a read-only, paginated table of every `inventory_transactions` row where `from_location_id` or `to_location_id` matches that location, ordered by `created_at`. Columns follow `location_transaction_ledger`'s defined field set: movement type, quantity, item, lot number, direction relative to this location (in/out), performed-by, timestamp, and the Reference field (`commercial_invoice_no` for incoming, `ar_reference_no` for outgoing) — the same Reference pattern already established for Master Inventory's Movement History.

This is a read-only view. No new capability is introduced: the ledger is gated by the same `locations.read` capability that already gates viewing the location detail page (per §4's command boundary and `05-ui-shell-and-navigation/design.md`'s `/locations` route-table row, both confirmed against the `02-rbac-roles` §3.2 catalog), not a stricter or separate gate. This feature does not compute, cache, or duplicate the ledger query — it renders `01`'s read model as-is.

## 7. Search, list, and detail behavior

- List queries use server-side filtering/pagination and only return fields allowed by the caller's capability/scope.
- Search matches normalized canonical code/name and approved cross-reference fields; it must not expose hidden records through counts, autocomplete, or error messages.
- Detail views show lifecycle status and safe related references. They do not become an inventory dashboard or expose lots/transactions without the owning feature's authorization.
- Realtime, if enabled, invalidates the relevant list/detail query and triggers an authoritative refetch. It is not used as the sole source of truth.
- Empty, loading, error, and stale-edit states use the shared shell and feature contracts from `05`.
- **(Added 2026-08-07)** Location list/search matches normalized `zone`, `rack`, `level`, `position`, `label`, and `location_type`; results are filtered by `locations.read` scope. Location detail shows lifecycle status but does not become an occupied-CBM or inventory dashboard — that projection belongs to `01`'s Master Inventory read model and `16-reporting-and-analytics`.

## 8. Authorization and RLS

The server checks the current session and capability before each read/mutation. PostgreSQL RLS remains the authoritative data boundary for protected `parties`, `party_roles`, `items`, `item_categories`, and `locations` access once the core/RBAC policies are approved.

Potential scope rules:

- Global master-data management is restricted to the approved operational/admin capabilities.
- Party users do not gain global catalog access from a party assignment; any party-facing item projection requires an explicit approved relation and capability.
- A `default_supplier_party_id` on an item must not accidentally expose the entire item record to an unrelated party user.
- `party_roles` are not consulted as user roles and do not bypass current capability checks.
- Unknown or out-of-scope records use the approved not-found/forbidden behavior without existence leakage.
- **(Added 2026-08-07)** `locations.manage` is Administrator-only; `locations.read` is held by `warehouse_staff`, `supervisor`, and `administrator`. No party-user role holds either capability in the `02` catalog — location records are internal operational data with no party-facing projection in v1.
- **(Added 2026-08-07)** The Contact Party email trigger requires `parties.manage` server-side; the server resolves `parties.email`/`contact_person` itself and never accepts a client-supplied recipient address.

The final policy matrix and SQL policy implementation are supplied with the core/RBAC migration sequence and reviewed by `rbac-rls-reviewer`.

## 9. Offline, Realtime, and audit boundaries

- Create/update/deactivate and business-role mutations are excluded from the offline Tier 1 registry.
- Offline floor workflows may consume a stale, bounded read cache only when their owning feature and offline policy allow it; the enrollment feature does not own that cache.
- Audit/business events are written server-side in the authoritative transaction. The browser cannot fabricate an audit outcome.
- Realtime is optional and must be scoped; events cause invalidation/refetch, not local authorization.
- **(Added 2026-08-07 — Offline Behavior tiering)** Location create/update/deactivate and the Contact Party email trigger are **Tier 2 (online-only)**. This is confirmed, not unresolved: `03-offline-mode-and-client-storage/design.md` §5.1 defines a closed v1 Tier 1 allowlist of exactly three queueable operation types (`receiving_scan_observation`, `pick_list_scan_observation`, `inspection_observation`), none of which cover master-data mutation or outbound email. Both new actions follow the same Tier 2 boundary already established for every other mutation in this feature (party/item create/update/deactivate, per requirements.md R7) — no new tiering exception was introduced.

## 10. Design verification before approval

- [x] Reconcile all fields and constraints with the approved `01-core-data-model` schema; resolve current naming/field inconsistencies before implementation. (Resolved 2026-08-05: exact column names, types, nullability, and constraints reconciled in §2 canonical fields block and §5/§6 throughout. Extended 2026-08-07: `locations` field block added to §2; location workflows added as §6a.)
- [x] Confirm the final capability identifiers with `02-rbac-roles`. (Resolved 2026-08-05: capability vocabulary in §4 updated to match the finalized `02` §3.2 catalog — `parties.read`, `parties.manage`, `items.read`, `items.manage`; `party_roles.manage` and `item_categories.read` removed as they do not exist in the `02` catalog. Extended 2026-08-07: `locations.read`/`locations.manage` confirmed against the same `02` §3.2 catalog and cited in §4/§8; Contact Party action confirmed as `parties.manage`.) RLS policy implementation still requires `02` approval before implementation.
- [x] Confirm category read/create ownership with `17-product-categorization-and-classification`. (Resolved 2026-08-05: §6 Category ownership subsection explicitly states `item_categories` is read-only from `06`'s perspective; creation/editing/hierarchy belong exclusively to `17`.)
- [x] Confirm reference/default price semantics with `12-vmi-billing` and `13-trading-orders-and-pricing`. (Resolved 2026-08-05: §6 Price boundary explicitly prohibits writing `buying_price`/`selling_price` to any order line, commitment, or billing ledger row; full price resolution belongs to `13`/`12` respectively.)
- [x] **(Added 2026-08-07)** Confirm location putaway/occupied-CBM/capacity-preview ownership boundary with `07-incoming-receiving`, `08-outgoing-withdrawal-and-two-stage-commitment`, and `11-transfer-and-inspection`. (Resolved: §6a explicitly scopes this feature to location record enrollment only; those three specs and `01`'s read models own all inventory-transaction use of a location.)
- [x] **(Added 2026-08-07)** Confirm the Contact Party email action reuses `04-services-and-infrastructure`'s existing Resend/`email_deliveries` pipeline without redefining it. (Resolved: §5a cites `04` §12.1-§12.4 by section for pipeline mechanics; no new email subsystem, table, or sender identity is introduced.)
- [x] **(Added 2026-08-07)** Confirm the location detail Movement Ledger and party detail Transaction Ledger render `01-core-data-model`'s existing `location_transaction_ledger`/`party_transaction_ledger` read models without a new capability or a duplicated query. (Resolved: §6a's Movement Ledger subsection and §5b's Transaction Ledger subsection both cite `01` §3 item 4 by name and confirm the ledgers inherit `locations.read`/`parties.read` respectively, the same capability that already gates each detail page.)
- [ ] Confirm Auth, audit, Storage, Realtime, and migration boundaries with `04-services-and-infrastructure`.
- [ ] Confirm route, page-header, responsive, and feedback contracts with `05-ui-shell-and-navigation`.
- [ ] Confirm no mutation is admitted to the offline queue under `03-offline-mode-and-client-storage`.
- [ ] Run `rbac-rls-reviewer` and `design-system-auditor` before sign-off.
