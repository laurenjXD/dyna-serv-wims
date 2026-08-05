# RBAC & Roles — Design

Status: Draft

Depends on:

- `specs/00-steering/tech.md`
- `specs/00-steering/structure.md`
- `specs/00-steering/brand-design-system.md`
- `specs/00-steering/testing.md`
- `specs/01-core-data-model/requirements.md`
- `specs/01-core-data-model/design.md`
- `specs/02-rbac-roles/requirements.md`
- `specs/03-offline-mode-and-client-storage/` for sync-time authorization integration
- `specs/04-services-and-infrastructure/` for Supabase Auth, email, rate limits, and monitoring
- `specs/05-ui-shell-and-navigation/` for protected route groups and navigation

## 1. Design summary

RBAC uses fixed system roles backed by centrally defined capabilities. Users may hold multiple active roles; grants combine additively, and all ungranted access is denied. Party users also require explicit party scope, optionally narrowed by `flow_type`.

Supabase Auth owns identity and sessions. PostgreSQL owns profiles, roles, capabilities, assignments, party scopes, and durable security events. Every protected request resolves current authorization data from PostgreSQL. The result is memoized only within that request, so deactivation or revocation takes effect on the next protected request.

Authorization is enforced in three layers:

1. The UI hides or disables unavailable actions for clarity.
2. Server code calls a shared capability-and-scope guard.
3. PostgreSQL RLS independently enforces row access using the authenticated user's identity and current database assignments.

The UI layer is not a security boundary. Middleware is an authentication convenience, not a replacement for server checks or RLS.

## 2. Foundational dependencies and touched tables

### 2.1 Foundational specs

- `01-core-data-model` supplies canonical business entities and the party/flow relationships used by RLS.
- `03-offline-mode-and-client-storage` must re-authorize queued Tier 1 operations during sync.
- `04-services-and-infrastructure` supplies Auth administration, private email delivery, Upstash rate limiting, Sentry, and deployment configuration.
- `05-ui-shell-and-navigation` consumes the effective capability set to build protected navigation.

### 2.2 Tables from `01-core-data-model`

This feature does not redefine the following tables. It references or protects them:

| Table | RBAC use |
|---|---|
| `parties` | Canonical target of party-scope assignments and admin party selector. |
| `party_roles` | Read only for business classification; never used as an application-user role table. |
| `items` | Protected master data; party visibility must be derived from an approved related record rather than broad catalog access. |
| `item_categories` | Protected reference/master data according to the consuming capability. |
| `locations` | Operational warehouse data protected by capabilities; no `warehouse_id` scope. |
| `lots` | Party/flow-scoped inventory through `owner_party_id` and `flow_type` where those fields represent the requesting party. |
| `wrr_documents` | Party/flow-scoped inbound documents through `vendor_party_id` and `flow_type`. |
| `wrr_items` | Inherits scope from its parent `wrr_documents` record. |
| `wrr_inspection_logs` | Inherits WRR/vendor scope and has stricter evidence-file access. |
| `inventory_transactions` | Operational ledger; party visibility is derived through its related lot or source document. |
| `pick_lists` | Party/flow-scoped outbound documents through `customer_party_id` and `flow_type`. |
| `pick_list_items` | Inherits scope from its parent `pick_lists` record. |
| `forex_rates` | Read/manage access is capability-based and not party-scoped. |

The final RLS policy for each table is delivered with the feature that finalizes that table's business relationship. RBAC supplies shared policy helpers and the default-deny contract. A downstream spec must not expose a table until its party/resource scope path is explicit and tested.

## 3. Authorization model

### 3.1 System roles

| Role key | Purpose | Scope behavior |
|---|---|---|
| `warehouse_staff` | Floor and operational work. | Operational/global within the one warehouse, limited by granted workflow capabilities. |
| `supervisor` | Oversight and selected workflow approvals. | Operational/global; approval capabilities remain separate per workflow. |
| `administrator` | User/access administration, master configuration, and global audit oversight. | Global for explicitly granted admin capabilities; still evaluated by RLS. |
| `party_user` | Scoped party self-service. | Requires active `user_party_scopes`; no implicit scope from email or role alone. |

The role catalog is seeded by migration. `is_system = true` roles cannot be deleted or edited through the v1 UI. Feature code never branches on these role keys; it checks capabilities.

### 3.2 Capability model

A grant is represented as:

```text
resource + action + scope_kind
```

Initial scope kinds:

| Scope kind | Meaning |
|---|---|
| `global` | Capability applies across the single warehouse, subject to row policy and business-state checks. |
| `assigned_party` | Capability applies only when the row matches an active `user_party_scopes` assignment. |

`user_party_scopes.flow_type` further narrows `assigned_party`. A null `flow_type` means all *externally applicable* flows for that assigned party — this explicitly excludes `'supplies'`, never all three `flow_type` values. This exclusion is not prose intent alone; it is enforced at the mechanism level by two independent layers so no single implementation slip exposes Supplies data:

1. `has_party_scope(party_id, flow_type)` (§7.2) never treats a null-`flow_type` assignment row as matching `flow_type = 'supplies'`. Its match logic is `requested_flow_type = assignment.flow_type OR (assignment.flow_type IS NULL AND requested_flow_type <> 'supplies')`, not a bare null-means-wildcard check.
2. `can_access_party_resource` (§7.2) independently hard-blocks any `assigned_party`-scope-kind capability check where the target row's `flow_type = 'supplies'`, regardless of what `has_party_scope` alone would return. This is a second, redundant gate — not a restatement of the first.

Per requirements.md §3.4 and acceptance criterion #7, `party_user` grants never expose internal Supplies data in v1. Consequently, every RBAC-owned and downstream capability that touches a `flow_type`-partitioned resource for Supplies MUST be modeled with `scope_kind = 'global'` in the canonical capability catalog (§3.2), never `assigned_party` — `assigned_party` scope is defined to be flow-restricted to VMI/Trading only, and Supplies access is granted exclusively through operational roles (`warehouse_staff`, `supervisor`, `administrator`), never through `user_party_scopes`.

Initial RBAC-owned capability identifiers:

| Resource | Actions | Default role |
|---|---|---|
| `users` | `read`, `invite`, `activate`, `deactivate` | `administrator` |
| `access_assignments` | `read`, `grant`, `revoke` | `administrator` |
| `party_scopes` | `read`, `grant`, `revoke` | `administrator` |
| `security_events` | `read` | `administrator` |

Downstream capabilities follow the same vocabulary, for example `receiving.confirm`, `inventory.read`, `fifo_override.approve`, and `documents.read`. Names are added to this canonical catalog only when the owning feature's requirements define the operation.

### 3.3 Effective authorization

For an active user:

```text
effective grants = union(active role assignments -> active role capability grants)
effective party scope = active user-party-flow assignments
```

There are no explicit denies. A request is permitted only when:

1. The user profile is active.
2. An active role grant contains the requested resource/action.
3. The grant's scope kind is satisfied.
4. The target row meets its resource/business-state rules.
5. RLS permits the database operation.

## 4. RBAC data model

All names below are proposed by this feature and must be reconciled with the final `01-core-data-model` migrations before implementation.

### 4.1 `user_profiles`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key; same value as `auth.users.id`. |
| `display_name` | Text | Required administrative display name. |
| `status` | Enum | `invited`, `active`, or `inactive`. |
| `activated_at` | Timestamptz | Null until activated. |
| `activated_by_user_id` | UUID | Nullable self-reference for system bootstrap. |
| `deactivated_at` | Timestamptz | Set on deactivation. |
| `deactivated_by_user_id` | UUID | Actor that deactivated the account. |
| `deactivation_reason` | Text | Required on deactivation. |
| `created_at` | Timestamptz | Required. |
| `updated_at` | Timestamptz | Required. |

The normal lifecycle deactivates rather than deletes users. Production tooling must restrict deletion of Auth identities when referenced by audit/history records. If a legal deletion requirement is later introduced, it needs a separate anonymization design.

### 4.2 `roles`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key. |
| `key` | Text | Unique immutable key. |
| `name` | Text | Human-readable label. |
| `description` | Text | Administrative explanation. |
| `is_system` | Boolean | True for all v1 roles. |
| `is_active` | Boolean | Inactive roles contribute no grants. |
| `created_at`, `updated_at` | Timestamptz | Required. |

### 4.3 `permissions`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key. |
| `resource` | Text | Stable machine identifier. |
| `action` | Text | Stable machine identifier. |
| `description` | Text | Human-readable effect. |
| `is_active` | Boolean | Inactive permissions grant nothing. |
| `created_at`, `updated_at` | Timestamptz | Required. |

Unique constraint: `(resource, action)`.

### 4.4 `role_permissions`

| Column | Type | Rules |
|---|---|---|
| `role_id` | UUID | Foreign key to `roles`. |
| `permission_id` | UUID | Foreign key to `permissions`. |
| `scope_kind` | Enum | `global` or `assigned_party`. |
| `created_at` | Timestamptz | Required. |

Primary/unique key: `(role_id, permission_id, scope_kind)`. System-role mappings are migration-managed in v1.

### 4.5 `user_roles`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key. |
| `user_id` | UUID | Foreign key to `user_profiles`. |
| `role_id` | UUID | Foreign key to `roles`. |
| `valid_from` | Timestamptz | Defaults to grant time. |
| `valid_until` | Timestamptz | Nullable expiry. |
| `granted_at` | Timestamptz | Required. |
| `granted_by_user_id` | UUID | Required after bootstrap. |
| `grant_reason` | Text | Required for sensitive grants. |
| `revoked_at` | Timestamptz | Null while active. |
| `revoked_by_user_id` | UUID | Required when revoked. |
| `revocation_reason` | Text | Required when revoked. |

A partial unique index prevents more than one active assignment for the same `(user_id, role_id)`. Historical revoked assignments remain immutable except for the one controlled transition from active to revoked.

### 4.6 `user_party_scopes`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key. |
| `user_id` | UUID | Foreign key to `user_profiles`. |
| `party_id` | UUID | Foreign key to `parties`. |
| `flow_type` | Existing enum | Nullable; null means all allowed flows for this party. |
| `valid_from`, `valid_until` | Timestamptz | Active interval. |
| `granted_at`, `granted_by_user_id` | Timestamp/UUID | Required. |
| `grant_reason` | Text | Administrative rationale. |
| `revoked_at`, `revoked_by_user_id` | Timestamp/UUID | Set by controlled revocation. |
| `revocation_reason` | Text | Required when revoked. |

An active-assignment uniqueness rule treats null `flow_type` as a real value so duplicate all-flow assignments cannot be created. This MUST use Postgres 15+'s native `UNIQUE ... NULLS NOT DISTINCT` index modifier (`CREATE UNIQUE INDEX ... ON user_party_scopes (user_id, party_id, flow_type) NULLS NOT DISTINCT WHERE revoked_at IS NULL`) — a `COALESCE(flow_type::text, '__sentinel__')` expression index is **not** viable, because the implicit enum→text cast (`enum_out`) is `STABLE`, not `IMMUTABLE`, and Postgres rejects non-immutable functions in an index expression at creation time. Granting an all-flow assignment while narrower active assignments exist must either be rejected with a clear conflict or replace them transactionally; the administration service uses replacement with confirmation and audit events.

### 4.7 `rbac_security_events`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key. |
| `event_type` | Text/enum | Stable event category. |
| `actor_user_id` | UUID | Nullable when identity is unknown, such as failed sign-in. |
| `executor_type` | Enum | `user`, `system`, or `background_job`. |
| `executor_id` | Text | Named service/job identifier when applicable. |
| `target_type` | Text | User, assignment, scope, session, or protected resource. |
| `target_id` | Text/UUID | Target identifier where safe. |
| `reason` | Text | Required for sensitive access changes. |
| `details` | JSONB | Redacted structured metadata; no secrets. |
| `correlation_id` | Text/UUID | Request/job trace identifier. |
| `ip_hash` | Text | Optional privacy-preserving abuse correlation, subject to infrastructure policy. |
| `created_at` | Timestamptz | Server/database generated. |

No ordinary or administrator policy permits update or delete. Inserts occur through controlled server/database paths that derive the actor from the session; clients cannot submit arbitrary actor identities.

## 5. Entity relationships

```mermaid
erDiagram
    AUTH_USERS ||--|| USER_PROFILES : identifies
    USER_PROFILES ||--o{ USER_ROLES : receives
    ROLES ||--o{ USER_ROLES : assigned_as
    ROLES ||--o{ ROLE_PERMISSIONS : grants
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : included_in
    USER_PROFILES ||--o{ USER_PARTY_SCOPES : scoped_by
    PARTIES ||--o{ USER_PARTY_SCOPES : authorizes
    USER_PROFILES ||--o{ RBAC_SECURITY_EVENTS : acts_in
```

`party_roles` is deliberately absent from the user authorization relationship. It remains a business classification attached to `parties`.

## 6. Request authorization architecture

### 6.1 Server request flow

```mermaid
flowchart LR
    A[Incoming request] --> B[Validate Supabase session]
    B -->|No valid session| C[Unauthenticated response]
    B --> D[Load active profile, role grants, and party scopes]
    D -->|Inactive or missing| E[Forbidden response]
    D --> F[Build request-local authorization context]
    F --> G[Require resource/action and scope]
    G -->|Denied| H[Safe denial + security signal]
    G --> I[Execute in user-bound RLS transaction]
    I --> J[Return scoped result]
```

The authorization context contains:

- `userId`
- profile status
- active role keys for display/audit only
- effective `(resource, action, scope_kind)` grants
- active `(party_id, flow_type)` scopes
- request/correlation ID

The client never supplies this context. Client values may be treated only as untrusted requested identifiers.

### 6.2 Shared guard contract

The server-side interface is conceptually:

```text
requirePermission(resource, action, optional target scope)
```

It is used by Server Actions, route handlers, server components that load protected data, and background-job entry points. It returns the trusted authorization context or a typed denial. Downstream code must not use conditions such as `role === "supervisor"`.

### 6.3 Drizzle and Supabase RLS session propagation

The locked stack requires Drizzle and PostgreSQL RLS. Direct PostgreSQL connections do not automatically receive PostgREST's request JWT context, so every user-scoped Drizzle operation must run inside a transaction wrapper that:

1. Validates the Supabase access token on the server.
2. Starts a database transaction.
3. Sets transaction-local authenticated role/JWT claims needed by `auth.uid()`.
4. Executes the callback through the transaction-bound Drizzle client only.
5. Commits or rolls back before the connection returns to the pool.

No user-scoped query may escape this wrapper, and no session claim may be set at connection scope. This prevents identity leakage through pooled connections. The implementation design must be validated against the selected Supabase connection mode in `04-services-and-infrastructure` with real Postgres before code is approved. If the selected connection mode cannot safely propagate transaction-local claims, protected user data access must use the Supabase session client/Data API while Drizzle remains the schema and trusted-server query layer; RLS must not be weakened to preserve ORM uniformity.

The wrapper's commit/rollback step MUST be implemented with guaranteed rollback on any callback exception (e.g. try/finally around the callback, rolling back unless the callback completed and commit was explicitly reached) — a callback that throws must never leave the transaction open or implicitly committed.

### 6.4 Request-local memoization

Authorization resolution may be memoized for the life of one request. There is no Redis or JWT permission cache in v1. A new request always re-evaluates current profile, assignment, expiry, and revocation state.

## 7. PostgreSQL RLS design

### 7.1 Default-deny baseline

- Enable and force RLS on protected application tables where supported by the ownership model.
- Define policies separately for select, insert, update, and delete.
- Grant no broad authenticated table privileges beyond those required by explicit policies.
- Interactive administrators use explicit policies, not service-role bypass.
- Service-role operations are isolated, named, audited, and unavailable to browser code.

### 7.2 Shared policy helpers

Proposed stable helper functions:

| Helper | Purpose |
|---|---|
| `current_user_is_active()` | Confirms `auth.uid()` maps to an active profile. |
| `has_permission(resource, action, scope_kind)` | Confirms an active role grant for the current user. |
| `has_party_scope(party_id, flow_type)` | Confirms an active matching party assignment. A null-`flow_type` assignment row matches any requested `flow_type` **except** `'supplies'` — it is not a bare wildcard (§3.2). |
| `can_access_party_resource(resource, action, party_id, flow_type)` | Combines capability and party scope for policies, and independently hard-denies when `flow_type = 'supplies'` regardless of `has_party_scope`'s result (§3.2's second gate). |

Helpers that need to read authorization tables may use `SECURITY DEFINER` only to avoid policy recursion. They must use a fixed `search_path`, schema-qualified objects, non-user-controlled SQL, least-privilege ownership, and restricted execute grants. Real-Postgres tests must prove they cannot be used to enumerate assignments or escalate privilege.

**Owner/privilege strategy**: `role_permissions` and `user_party_scopes` carry their own restrictive RLS (§7.3) that would otherwise hide most rows from the calling user. Since these helpers must read across that boundary to compute an answer for the caller, "least-privilege ownership" means: the functions are owned by a single dedicated `rbac_definer` role (not `postgres`, not the application's ordinary migration owner) that holds `BYPASSRLS` and table-level `SELECT` only on the specific RBAC tables these four functions read — no broader grant. Ordinary authenticated roles receive `EXECUTE` on the functions themselves, never table-level access to `role_permissions`/`user_party_scopes` directly.

Real-Postgres verification (2026-08-05) found this ownership description incomplete — the DDL as literally specified above fails to run without three additional grants, none of which are optional or implementation-specific tuning:

- `current_user_is_active`, `has_permission`, `has_party_scope`, and `can_access_party_resource` all call `auth.uid()`. `SECURITY DEFINER` runs as the *owner*, not the caller, so `rbac_definer` itself needs `GRANT USAGE ON SCHEMA auth TO rbac_definer; GRANT EXECUTE ON FUNCTION auth.uid() TO rbac_definer;` — without it, every call fails with `permission denied for schema auth`.
- `can_access_party_resource` calls the other `rbac_internal`-qualified helpers internally, so `rbac_definer` also needs `GRANT USAGE ON SCHEMA rbac_internal TO rbac_definer` (the schema itself, distinct from `EXECUTE` on the individual functions already covered above) — without it, `permission denied for schema rbac_internal`.
- Any admin mutation function (§8.3's grant/revoke operations, owned by a separate `rbac_admin_ops` role per §8.5's invariant-checking requirement) that internally re-checks the caller's capability by calling `rbac_internal.has_permission(...)` (per §8's defense-in-depth requirement that these functions independently re-verify rather than trust the caller) needs `GRANT EXECUTE ON FUNCTION rbac_internal.has_permission TO rbac_admin_ops` — without it, the entire admin mutation path fails with `permission denied for function has_permission`, not just an edge case.

All three grants belong in the same migration that creates these functions, not left as an implementation-time discovery.

**PostgREST/RPC exposure**: these functions are policy-internal only and MUST NOT be reachable as callable Supabase RPC endpoints for browser/client code. A role-based `EXECUTE` grant distinction cannot achieve this: because §6.3's transaction wrapper sets transaction-local claims so RLS evaluates the caller as the `authenticated` Postgres role, RLS policy evaluation runs under the *same* `authenticated` role that Supabase's `/rest/v1/rpc/*` routing would use for a direct client call — there is no separate "role used inside RLS but not by PostgREST" to grant `EXECUTE` to differently. The actual mechanism is **schema placement**: these four functions live in a dedicated schema (e.g. `rbac_internal`) that is never added to Supabase's PostgREST "Exposed schemas" configuration. PostgREST only auto-routes `/rpc/*` endpoints for functions in exposed schemas; a direct SQL query (used inside RLS policy bodies, and by the trusted Drizzle server-side transaction wrapper, which connects over Postgres wire protocol rather than through PostgREST) can still call a schema-qualified function in `rbac_internal` regardless of PostgREST's exposure config, since Postgres itself doesn't consult that config when evaluating an RLS expression or a direct query. `authenticated` still needs `EXECUTE` on the functions for RLS evaluation to succeed for ordinary users — exposure is closed by schema placement, not by withholding `EXECUTE`. Real-Postgres tests must confirm no `/rpc/rbac_internal.*` (or unqualified `/rpc/has_party_scope` etc.) endpoint exists via a live PostgREST introspection/OpenAPI check, not just an application-layer assumption.

### 7.3 RBAC-table policies

| Table | Self access | Administrator access | Mutation path |
|---|---|---|---|
| `user_profiles` | Read minimal own profile/status. | Read all with `users.read`. | Controlled lifecycle functions/services. |
| `roles` | Read active role labels needed for own access display. | Read all. | Migration-managed in v1. |
| `permissions` | Read own effective capability view, not arbitrary hidden metadata where unnecessary. | Read all. | Migration-managed in v1. |
| `role_permissions` | No broad direct read required. | Read with assignment capability. | Migration-managed in v1. |
| `user_roles` | Read own active/history-safe projection. | Read with `access_assignments.read`. | Controlled grant/revoke operation. |
| `user_party_scopes` | Read own active/history-safe projection. | Read with `party_scopes.read`. | Controlled grant/revoke operation. |
| `rbac_security_events` | No default access. | Read with `security_events.read`. | Controlled insert only; no update/delete. |

### 7.4 Core-resource policy patterns

Every pattern below MUST call `can_access_party_resource`, never `has_party_scope` directly, as the RLS predicate. This is not a restatement: `has_party_scope` alone is the first gate described in §3.2/§7.2, and `can_access_party_resource`'s independent `flow_type = 'supplies'` hard-deny is the second, non-derivative gate. A policy that calls `has_party_scope` directly has only one gate wired in, defeating the "no single implementation slip exposes Supplies data" design intent even though the helper itself is correct.

- `wrr_documents`: party reads require an `assigned_party` capability plus `can_access_party_resource('wrr_documents', 'read', vendor_party_id, flow_type)`.
- `wrr_items` and `wrr_inspection_logs`: authorize through the parent WRR; evidence files use the same parent relationship.
- `lots`: the party relationship is flow-dependent and needs two branches, not one uniform `owner_party_id` policy:
  - **VMI** (`flow_type = 'vmi'`): `owner_party_id` is required per `01-core-data-model/design.md` and is the vendor's identity; `can_access_party_resource('lots', 'read', owner_party_id, 'vmi')` is sufficient.
  - **Trading** (`flow_type = 'trading'`): `owner_party_id` is optional and does not reliably represent the customer (the warehouse owns Trading stock pre-sale, per `product.md`; the same physical lot can be split across multiple customer pick lists over its lifetime). Trading party users receive **no direct row-level `SELECT` grant on `lots` at all** — not even through a `pick_list_items` join. A join-based grant would let a party that picked from a shared lot once retain indefinite read access to that lot's current state, including quantity changes driven entirely by a *different* customer's later picks — a cross-party inference channel through quantity drift, prohibited by requirements.md FR-4.6. Instead, a Trading party user's visibility into lot identity is satisfied entirely by the priced snapshot fields already carried on their own `pick_list_items` rows (`lot_number`, `location_label`, etc., per `01-core-data-model/design.md`'s `pick_list_items` schema) — those are point-in-time document facts, not a live join to the shared `lots` row, and require no `lots` grant to read.
  - **Supplies** (`flow_type = 'supplies'`): never party-scoped; see §3.2's global-scope-only rule.
- `pick_lists`: party reads require matching `customer_party_id` and `flow_type`, via `can_access_party_resource('pick_lists', 'read', customer_party_id, flow_type)`.
- `pick_list_items`: authorize through the parent pick list.
- `inventory_transactions`: no direct party column and no party-user grant in v1. Party users read outbound activity through their own `pick_list_items` snapshot (as with `lots` above), not through `inventory_transactions`; no global or joined party-user ledger access.
- `items`: party-user catalog visibility is never a direct broad-catalog read, and standard RLS cannot itself exclude specific columns from an otherwise-visible row — a bare row policy on the base `items` table is therefore insufficient to protect `default_supplier_party_id`/`buying_price`/`selling_price`. Party users receive **no direct `SELECT` grant on the base `items` table**. Instead, a dedicated view `party_visible_items` exposes only the columns needed to render a caller's own document (`code`, `name`, `description`, `barcode`, `uom`, `spq`, `spq_meter`, dimensions, `volume_cbm`, `is_perishable`), with the row filter (`item_id` reachable via the caller's own readable `wrr_items`/`pick_list_items`) embedded directly in the view's `WHERE` clause. **The view must be a default (non-`security_invoker`) view, owned by the same privileged owner role used for the RBAC helper functions (§7.2) with `SELECT` on the base `items` table** — a `security_invoker` view would be subject to `items`' own base-table RLS on top of the view's filter, and since party users correctly have zero direct grant on the base table, a `security_invoker` view would always return zero rows regardless of its own filter, defeating its purpose. (The inverse mistake — loosening `items`' base RLS so a `security_invoker` view works — would let a direct `SELECT buying_price FROM items` on a now-visible row leak exactly the column this pattern exists to protect.) A default-owner view sidesteps this entirely: Postgres evaluates table-access privileges for a plain view using the *view owner's* privileges, not the querying session's, so the owner's direct grant on `items` satisfies the view's own read while the view's `WHERE` clause — not base-table RLS — is what actually authorizes each row. `default_supplier_party_id`, `buying_price`, `selling_price`, and `min_reorder_level` are never selected by the view, so no query path — including a future admin screen's query reused in a party context — can return them to a party user regardless of what it selects.
- `locations` and `forex_rates`: operational/global capabilities only unless a downstream requirement defines a safe party projection.

Policies must avoid leaking data through permissive joins, aggregate functions, views, realtime publication, or storage metadata.

## 8. Administrative operations

Every operation in this section runs through a controlled server function/service, not a direct client-authenticated RLS INSERT/UPDATE (§7.3 marks these tables' mutation path as "Controlled lifecycle functions/services"). Because of that, each function step below that says "Require `<capability>`" means the privileged function itself re-evaluates that capability against the current caller inside its own transaction — it does not trust that the calling Server Action already called `requirePermission()` upstream. A privileged function that only performed its side effects without its own authorization check would be a bypass path independent of whatever the calling code did correctly.

### 8.1 Invitation flow

1. Require `users.invite` with global scope.
2. Apply IP and normalized-email rate limits.
3. Send a Supabase Auth invitation through a server-only administration service.
4. Create or reconcile `user_profiles` with status `invited`.
5. Record intended role/scope assignments without activating access.
6. Append an invitation security event.

Auth invitation and application profile creation cannot be assumed to share one database transaction. The service must be idempotent and support safe retry/reconciliation when one side succeeds and the other fails.

### 8.2 Activation flow

Activation is a transaction over application authorization state:

1. Require `users.activate`.
2. Validate at least one appropriate active role assignment.
3. Validate party scope when activating `party_user` access.
4. Set profile status to `active` and attribution fields.
5. Append the activation event in the same database transaction.

### 8.3 Grant and revocation

Role and party-scope grants/revocations use controlled server operations or narrowly scoped SQL functions. They validate the target, prevent duplicate/conflicting active assignments, require confirmation and reasons for sensitive changes, and append security events transactionally.

Revocation updates the existing active assignment with revocation metadata. It does not delete history.

When a revocation removes an `administrator` role assignment (independent of whether the profile is also being deactivated — `user_roles.revoked_at` and `user_profiles.status` are independent), it MUST invoke the same last-administrator invariant check and lock described in §8.5 before committing. This is a distinct code path from §8.4's deactivation flow and is not covered by it: a user can be stripped of the `administrator` role while remaining an otherwise-active profile.

### 8.4 Deactivation

1. Lock the relevant administrator assignments while checking the last-administrator invariant.
2. Mark the profile inactive and record actor, timestamp, and reason.
3. Revoke or expire active assignments according to the lifecycle implementation.
4. Append a deactivation event transactionally.
5. Revoke Auth sessions through the server-only Auth administration boundary.

Database authorization stops on the next protected request even if external session revocation is delayed.

### 8.5 Last-administrator invariant

Any operation that could remove the final active holder of the global administrator capabilities must count eligible active users and mutate under a transaction/advisory lock. A simple pre-check in application code is insufficient because concurrent requests could both pass.

The lock MUST be a single fixed-key `pg_advisory_xact_lock` on a constant identifying "the administrator-capability invariant" — serializing every revoke/deactivate operation against every other one globally, regardless of which specific administrator each targets. A row-level lock scoped to only the target administrator's own `user_roles`/`user_profiles` row is insufficient and does not close the race: two concurrent requests revoking two *different* administrators would lock two non-overlapping rows, each independently count 2 active administrators (each seeing the other's row still active and uncommitted), each conclude "one will remain," and both commit — leaving zero. The fixed-key advisory lock forces the second transaction to wait until the first commits and its count reflects the first revocation, so the second transaction's count check sees the true post-first-revocation state.

## 9. Admin UI design

This is an office-first administrative surface that remains usable on mobile. It follows `brand-design-system.md` and the route/navigation decisions in spec `05`.

Proposed information architecture:

| Route/surface | Purpose |
|---|---|
| User list | Search/filter users by status, system role, party, and flow scope. |
| User detail | Show identity, status, active/history assignments, party scopes, and related security events. |
| Invite flow | Invite user and capture intended role/scope. |
| Access-change dialog | Confirm grant/revoke, summarize resulting access, and capture reason when required. |
| Role reference | Read-only system-role and capability matrix. |
| Security events | Filter durable events by actor, target, type, and date. |

UI rules:

- Show canonical party code and name in selectors.
- Never accept a free-text party UUID as the primary admin control.
- Clearly distinguish invited, active, and inactive status with text/icon as well as color.
- Warn and block last-administrator removal.
- Hide or disable unavailable controls for usability, while preserving server/RLS enforcement.
- Do not provide custom-role editing, impersonation, or break-glass controls in v1.

## 10. Auth, error, and abuse handling

### 10.1 Public responses

- Sign-in and recovery use generic responses when account existence or status would otherwise be disclosed.
- Party-scoped resources outside scope normally return not found.
- Authenticated users lacking a known capability receive forbidden without revealing hidden role configuration.

### 10.2 Rate limiting

Upstash rate limits are keyed by both IP and normalized account identifier where available. Invite, sign-in, and recovery use separate buckets and stricter thresholds for high-risk operations. Exact values belong to spec `04` and environment configuration.

### 10.3 Security monitoring

Durable authorization events live in PostgreSQL. Sentry receives selected operational signals such as repeated denied admin actions, invite/recovery abuse, and failures in session propagation. Monitoring payloads must be redacted and must not contain tokens or credentials.

## 11. Realtime, storage, notifications, and offline integration

### Realtime

Subscriptions use RLS-backed/scoped channels. A global stream filtered in the browser is prohibited. Revocation applies when the client reconnects or refreshes its authorized subscription; high-risk realtime actions still require request-time authorization.

### Storage

Protected CIPL files, inspection evidence, and generated documents use private buckets. Access is granted only after authorizing the source record, using short-lived signed URLs or session-bound storage policies. Object paths include stable source identifiers for policy joins but do not themselves grant access.

### Notifications

Notification recipients are computed from current capabilities and scopes. Notification bodies and links must not reveal records the recipient cannot currently open.

### Offline sync

The client may display cached UI state, but it cannot mint new authority. During sync, every queued Tier 1 operation re-runs authentication, capability, scope, business-state, and RLS checks. Tier 2 actions—including approvals, pricing, FIFO override/allocation, and RBAC management—are never accepted solely from offline state.

## 12. Migration and seed strategy

Implementation uses sequential migrations under `supabase/migrations/`, one concern per file, after the final core-data migration number is known. The intended order is:

1. RBAC enums and tables.
2. Constraints, active-assignment indexes, and immutable-history protections.
3. Seed system roles, permissions, and role-permission mappings.
4. Shared authorization helper functions.
5. RLS enablement and RBAC-table policies.
6. Core-resource policies only as their owning schemas and relationships are approved.
7. Bootstrap the first administrator through a one-time, auditable deployment procedure.

Migrations must be rerunnable only where explicitly designed, must not renumber existing migrations, and must be tested in full order against real Postgres.

## 13. Testing design

### Unit tests

- Effective additive role grants.
- Active interval and revocation evaluation.
- Party plus optional flow scope matching.
- Default deny and typed unauthenticated/forbidden/not-found results.
- Last-administrator service validation.
- Security-event redaction and required reasons.

### Real-Postgres integration tests

- Execute the entire migration chain.
- Use separate authenticated identities for all four system roles and multiple party/flow scopes.
- Test select, insert, update, and delete independently.
- Test direct IDs, joins, views, aggregates, and policy helper functions.
- Test that a null-`flow_type` `user_party_scopes` assignment does not grant `has_party_scope`/`can_access_party_resource` access to a `flow_type = 'supplies'` row, using a real party that has both VMI/Trading and Supplies-flow records.
- Test that `has_permission`, `has_party_scope`, and `can_access_party_resource` cannot be invoked directly via the anon/authenticated PostgREST RPC role.
- Test the specific two-concurrent-different-administrators race from §8.5: two transactions each revoking a *different* one of exactly two active administrators must not both commit; exactly one must fail the invariant check.
- Test that a Trading party user has no direct `SELECT` on `lots` or `inventory_transactions` (query fails/returns zero rows even for a lot the party legitimately picked from), and that their lot visibility is fully satisfied by their own `pick_list_items` snapshot rows.
- Test that a party user's queries against `party_visible_items` never return `default_supplier_party_id`, `buying_price`, `selling_price`, or `min_reorder_level`, and that the party user has no direct `SELECT` grant on the base `items` table.
- Test via live PostgREST introspection (OpenAPI/schema endpoint) that no `/rpc/*` route exists for `has_permission`, `has_party_scope`, `can_access_party_resource`, or `current_user_is_active`, confirming schema placement actually removed them from the exposed API surface rather than relying on an EXECUTE-grant assumption.
- Verify transaction-local JWT/session propagation cannot leak between pooled connections.
- Verify revoked/deactivated access fails on the next transaction/request.
- Verify security events are append-only and actor attribution cannot be forged.
- Run `db-migration-verifier` and `rbac-rls-reviewer` before sign-off.

**Real-Postgres verification status (2026-08-05)** — `db-migration-verifier` ran a disposable Postgres 16 against a literal translation of this design (stand-in `01` tables built column-for-column from `01-core-data-model/design.md`, since no actual migrations exist yet). **Verified PASS** with real data/real concurrent sessions: the full migration chain applies cleanly (after fixing the two DDL bugs folded into §4.6 and §7.2 above); the Supplies-leak scenario (real `lots` rows, real RLS `SELECT`, `warehouse_staff`/`party_user`/unrelated-party sessions as positive and negative controls); the two-concurrent-different-administrators race (real separate Postgres backends, plus a control experiment using the row-level-lock-only approach §8.5 calls insufficient, which reproduced the exact zero-administrators failure this design prevents); the `rbac_definer`/`BYPASSRLS` helper path from an ordinary `authenticated` session with zero direct table grants (after fixing the three grant gaps folded into §7.2 above); `rbac_security_events` append-only (`UPDATE`/`DELETE`/forged-actor `INSERT` all rejected); and both partial-unique-index invariants including the null-as-real-value semantics. **Not yet verified** (explicitly out of this pass's scope, not silently skipped): live PostgREST `/rpc` introspection confirming schema placement actually blocks client RPC exposure; the `party_visible_items` view itself (not built in this pass — its ownership-model contradiction was caught by inspection during the same review and is fixed above, but needs its own real-Postgres run before that `tasks.md` line item is marked tested); the Trading-branch "zero direct grant on `lots`" rule specifically (the VMI/Supplies split was verified; the full three-way VMI/Trading/Supplies matrix from §7.4 was not); transaction-local JWT/session propagation across a real pooler; and a full revoke-then-access-attempt flow proving next-request revocation.

### Playwright E2E tests

- Invitation, activation, sign-in, refresh, sign-out, and recovery.
- Admin user list/detail and role/scope grant/revoke flows.
- Direct route and API attempts by unauthorized roles.
- Cross-party and cross-flow identifier manipulation.
- Last-administrator blocking.
- Protected document and storage access.
- Navigation updates after a permission change according to the next-request rule.

### Manual QA

- Keyboard and screen-reader operation of admin screens.
- Responsive admin layouts.
- Generic public errors and safe protected-resource errors.
- Audit event readability and redaction.

## 14. Requirement traceability

| Requirement | Design sections |
|---|---|
| FR-1 Identity/profile | 4.1, 6.1, 6.3 |
| FR-2 Invitation/activation | 8.1, 8.2, 10 |
| FR-3 Roles/capabilities | 3, 4.2-4.5 |
| FR-4 Party/flow scope | 3.2-3.3, 4.6, 7.4 |
| FR-5 Resolution/revocation | 6, 8.3-8.4 |
| FR-6 Enforcement/RLS | 6.3, 7 |
| FR-7 Admin management | 8, 9 |
| FR-8 Security events | 4.7, 7.3, 8, 10.3 |
| FR-9 Realtime/files/notifications | 7.4, 11 |
| FR-10 Offline | 11 |
| FR-11 Rate limiting/errors | 10 |

## 15. Known design dependencies before approval

- Verify the safe Drizzle transaction/JWT propagation pattern against the exact Supabase pooler/connection mode selected by spec `04`.
- Reconcile proposed foreign keys and migration order with the approved final form of spec `01`.
- Complete downstream capability identifiers and role grants as specs `07` through `19` define their operations.
- Set production audit retention, rate-limit thresholds, session-revocation behavior, and bootstrap procedure in spec `04`.
- Complete the RLS matrix per protected core table before implementation approval; the examples in section 7.4 are patterns, not a signed-off policy inventory.
