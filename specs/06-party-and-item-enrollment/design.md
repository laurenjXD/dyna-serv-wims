# Party & Item Enrollment — Design

Status: Draft

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

The final capability identifiers are added to the RBAC catalog by the owning requirements/design approval. Candidate resource/action vocabulary is `parties.read`, `parties.manage`, `party_roles.manage`, `items.read`, `items.manage`, and `item_categories.read`; these are not approved until `02` reconciles them.

The client may send a requested record identifier, but the server resolves the actual record and current scope. A client-supplied `party_id`, role, flow, or category ID never grants access.

## 5. Party model and workflows

### Create

1. User opens the party create route through an authorized capability.
2. The form validates required code/name/contact fields and normalizes code/email/phone according to approved rules.
3. The user selects one or more business roles from the canonical role enum/reference.
4. The server revalidates uniqueness, role validity, and actor capability in one transaction.
5. The party and role records are committed, with an audit event if required by the approved audit design.

### Edit/deactivate

Edits use a version/updated-at precondition. A stale edit returns a conflict and offers reload/review; it does not silently overwrite.

Deactivation is a lifecycle update, not deletion. Before deactivation, the server evaluates the approved impact rules for future WRR, item defaults, user party scopes, and downstream workflows. Historical records remain addressable to authorized users. The exact “in use” checks belong in the approved core/domain design and must not be guessed in the client.

`party_roles` changes are business classifications. They do not grant or revoke application access. User-party scope changes remain exclusively in `02-rbac-roles`.

## 6. Item model and workflows

### Shared item record

The form maps to the approved `items` columns: internal code, cross-reference fields, name/description, barcode, item type, category, default supplier party, UOM, packaging metrics, dimensions/volume, weight, reorder level, perishability, active state, and any core-approved reference valuation fields.

The UI can use an item type/UOM selection to reveal relevant fields, but it must not create a persisted flow ownership field absent from the approved core schema. The same item master may be referenced by VMI, Trading, and Supplies workflows; ownership, lot partition, pricing, and billing are resolved in those workflows.

### Packaging validation

- `spq` is positive where required and is interpreted as the base-unit quantity per package according to the approved UOM rules.
- `spq_meter` is required only for the approved roll/meter combinations.
- Dimensions, weight, `boxes_per_pallet`, and reorder levels follow positive/non-negative constraints and decimal precision from the core schema.
- `volume_cm3` and `volume_cbm` use the single approved calculation and rounding rule; a user may not override a calculated value unless the core design explicitly permits an audited override.
- Perishable item rules flag the downstream receiving requirement for manufacture/expiry data; enrollment does not create a lot or receiving record.

### Default supplier

The default supplier selector queries active authorized `parties` with the relevant business role. It stores the approved foreign key on `items`; it does not create a party inline unless the product requirements explicitly add a controlled nested flow.

### Price boundary

If the core `items` table retains `buying_price`/`selling_price`, enrollment treats them as master/reference values only within the approved semantics. It cannot finalize a Trading order/document price, override a transaction price, or compute authoritative VMI period billing. Those operations remain online and owned by `13`/`12`.

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

- [ ] Reconcile all fields and constraints with the approved `01-core-data-model` schema; resolve current naming/field inconsistencies before implementation.
- [ ] Confirm the final capability identifiers and RLS policies with `02-rbac-roles`.
- [ ] Confirm category read/create ownership with `17-product-categorization-and-classification`.
- [ ] Confirm reference/default price semantics with `12-vmi-billing` and `13-trading-orders-and-pricing`.
- [ ] Confirm Auth, audit, Storage, Realtime, and migration boundaries with `04-services-and-infrastructure`.
- [ ] Confirm route, page-header, responsive, and feedback contracts with `05-ui-shell-and-navigation`.
- [ ] Confirm no mutation is admitted to the offline queue under `03-offline-mode-and-client-storage`.
- [ ] Run `rbac-rls-reviewer` and `design-system-auditor` before sign-off.
