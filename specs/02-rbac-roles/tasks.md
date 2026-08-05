# RBAC & Roles — Implementation Plan

Status: Draft
Updated: 2026-08-05

## Scope and implementation gate

This plan covers authentication-linked role resolution, permission enforcement, party-scoped access, administrative user/role management, and auditability for the single-warehouse system.

The role model is explicitly unstable (`specs/00-steering/revision-log.md`). The role names, permission granularity, party-user relationship, and delegation rules below are implementation work items and decision points—not settled requirements. No application or migration code may be written until:

- `requirements.md` defines the approved business rules and acceptance criteria.
- `design.md` cites its foundational dependencies (`01-core-data-model`, `04-services-and-infrastructure`, and `05-ui-shell-and-navigation` where applicable), names the tables it touches, and specifies the RLS/session architecture.
- This file is updated with concrete tasks against that approved design.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Dependencies and constraints

- Depends on the party and identity structures established by `01-core-data-model`; do not duplicate or rename `parties` or `party_roles` here.
- Uses Supabase Auth for identity and sessions, Drizzle for application-side typed access, and PostgreSQL RLS as the authoritative data boundary.
- Role resolution MUST use the authenticated session, never a client-supplied user, role, or party identifier.
- There is one physical warehouse; no `warehouse_id` is introduced.
- `parties`, `items`, and `locations` are the canonical terms. Do not introduce `suppliers`, `SKU`, or `bins` as entity/table names.
- RBAC must remain separable from workflow-specific approval, pricing, offline-sync, and billing rules. Those features may consume permission checks but must not redefine the role model.

## Implementation tasks

### 1. Resolve and formalize the authorization model

- [ ] Confirm the supported identity classes and operational roles with the product owner (at minimum: warehouse staff, supervisors, administrators, and party users; exact role granularity remains open).
- [x] Define the permission vocabulary as stable capabilities rather than UI route names, including resource, action, and scope dimensions.
- [x] Define whether a user may hold multiple roles and how effective permissions are combined.
- [x] Define the relationship between an authenticated user and one or more parties, including whether party users can be limited to specific party records or flow partitions.
- [x] Define administrator and supervisor boundaries, including who may invite, deactivate, assign, or revoke users and roles.
- [x] Define default-deny behavior, inactive-user behavior, session expiry behavior, and what happens when a role assignment is revoked during an active session.
- [x] Define whether emergency access, impersonation, delegation, or break-glass access is supported. If any is supported, require explicit expiry and audit events.
- [x] Record all resolved decisions in `requirements.md`, `design.md`, and `specs/00-steering/revision-log.md` where they supersede the flagged unstable model.

#### Decisions for Task 1

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 1A | Role structure | **A. Fixed roles only** — simplest, but feature code becomes coupled to role names. **B. Custom roles only** — flexible, but increases admin and testing complexity. **C. Fixed system roles backed by capabilities** — stable starting roles while code checks permissions. | **C** | **C** |
| 1B | Initial system roles | **A. `warehouse_staff`, `supervisor`, `administrator`, `party_user`**. **B. Split floor roles immediately** into receiving, picking, inspection, and dispatch roles. **C. Only `staff`, `administrator`, and `party_user`**. | **A**; split floor roles later only when requirements prove different access boundaries. | **A** |
| 1C | Permission shape | **A. Boolean capability names** such as `receiving.confirm`. **B. Resource/action pairs** such as `receiving:confirm`. **C. Resource/action/scope records** with scope evaluated separately. | **C** because party scope and operational scope must be explicit. | **C** |
| 1D | Multiple roles | **A. One role per user**. **B. Multiple roles with additive permissions**. **C. Multiple roles with explicit deny overrides**. | **B**; default deny plus additive grants is easier to reason about than deny precedence. | **B** |
| 1E | Party-user scope | **A. Exactly one party per user**. **B. One or more explicitly assigned parties**. **C. All parties sharing a party role or flow type**. | **B** for flexibility without implicit cross-party access. | **B** |
| 1F | Flow-type scope | **A. Party scope only**. **B. Party plus optional `flow_type` scope**. **C. Role-specific hard-coded flow access**. | **B** if users can represent the same party differently across VMI/Trading; otherwise **A**. Resolve from business examples before approval. | **B** |
| 1G | Privileged-account safeguards | **A. No special safeguard**. **B. Prevent removing the final administrator**. **C. Require two-person approval for every admin change**. | **B** for the initial release. | **B** |
| 1H | Emergency access | **A. No impersonation or break-glass access in v1**. **B. Time-limited break-glass access**. **C. Administrator impersonation of users**. | **A**; add later only with a concrete support requirement and full auditing. | **A** |
| 1I | Revocation behavior | **A. Takes effect at next login**. **B. Takes effect when the access token expires**. **C. Takes effect on the next protected request through live assignment checks**. | **C** for role/scope revocation and deactivation. | **C** |

### 2. Specify identity, role, permission, and scope data

- [x] Identify which identity data remains in Supabase Auth and which authorization data is stored in application tables.
- [x] Confirm whether the existing `party_roles` table from `01-core-data-model` represents business roles for parties only, application roles for users, or both; do not overload one concept for the other.
- [x] Design the minimum authorization tables/relations needed for user-role assignments, role-permission assignments, user-party scope, status, timestamps, and revocation metadata.
- [x] Define unique constraints preventing duplicate assignments and invalid self-references.
- [x] Define referential actions for user deactivation, role removal, and party deletion without silently deleting audit history.
- [x] Define indexes for session-time permission resolution and party-scoped queries.
- [x] Define whether permission changes are evaluated live on every request or cached, and specify cache invalidation/revocation behavior if caching is used.
- [x] Add a data dictionary to `design.md`; feature specs must reference these tables by name rather than redefining schema inline.

#### Decisions for Task 2

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 2A | Auth profile storage | **A. Store all profile/role data in Supabase Auth metadata**. **B. Keep identity in Auth and authorization/profile data in application tables**. **C. Duplicate full authorization state in both places**. | **B**; Auth supplies identity, while PostgreSQL remains authoritative for authorization. | **B** |
| 2B | Meaning of `party_roles` | **A. Reuse it for user roles**. **B. Keep it exclusively for business classifications of a `party`**. **C. Rename it and replace it with one shared role table**. | **B**; application roles and party business roles are different concepts. | **B** |
| 2C | Authorization schema | **A. Role enum on a user profile**. **B. `user_roles` plus hard-coded role-to-permission mapping in code**. **C. `roles`, `permissions`, `user_roles`, `role_permissions`, and `user_party_scopes` tables**. | **C**, with system roles protected from accidental deletion. | **C** |
| 2D | User profile key | **A. Separate UUID unrelated to Auth**. **B. Application profile primary key equals `auth.users.id`**. **C. Email is the linking key**. | **B**; never use mutable email as identity. | **B** |
| 2E | Assignment history | **A. Hard-delete revoked assignments**. **B. Keep `revoked_at`, `revoked_by`, and reason on assignments**. **C. Copy old assignments into a separate archive table**. | **B**, combined with append-only audit events. | **B** |
| 2F | Audit storage | **A. General application audit table**. **B. RBAC-specific security event table**. **C. External monitoring only**. | **A** if `01-core-data-model` defines a cross-cutting audit table; otherwise **B**. Never rely on **C** alone. | **B** |
| 2G | Permission resolution | **A. Embed permissions in JWT claims until token expiry**. **B. Query current assignments on every protected request**. **C. Redis-cache permissions across requests**. | **B**, with request-local memoization; revisit **C** only after measurement. | **B** |
| 2H | Party-scope representation | **A. `party_id` directly on user profile**. **B. Join table with active/revoked assignment metadata**. **C. Derive scope from email domain**. | **B**. | **B** |

### 3. Design the authorization decision path

- [x] Define the server-side session resolver and its typed result: authenticated identity, active assignments, effective permissions, and party scope.
- [x] Define reusable server-side authorization helpers for route handlers, Server Actions, background jobs, and database access.
- [x] Define the distinction between authentication failure (`unauthenticated`), authorization failure (`forbidden`), and missing/invalid resource (`not found`) without leaking scoped data.
- [x] Define how authorization context is propagated to Drizzle queries and how all party-scoped queries remain compatible with PostgreSQL RLS.
- [x] Define protections against client-side-only gating, forged role claims, stale session claims, privilege escalation, and IDOR-style resource access.
- [x] Define service-role/background-job behavior explicitly; privileged service credentials must not become a bypass for user-scoped actions without an auditable actor and reason.
- [x] Define authorization behavior for realtime subscriptions, storage objects, email-triggering actions, and any API routes that do not pass through the normal page shell.

#### Decisions for Task 3

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 3A | Enforcement interface | **A. Each feature checks role names directly**. **B. Central `requirePermission(capability, scope)` helper**. **C. Middleware-only route protection**. | **B**; middleware may reject unauthenticated routes but cannot replace resource-level checks. | **B** |
| 3B | Authorization context | **A. Identity only; query roles ad hoc**. **B. Typed context containing identity, active roles, capabilities, and party scope**. **C. Pass role and party from client forms**. | **B**. | **B** |
| 3C | Party-scoped missing resource response | **A. Always return `403 Forbidden`**. **B. Return `404 Not Found` when revealing existence would leak data**. **C. Redirect to dashboard**. | **B**, while true capability failures may return **403**. | **B** |
| 3D | Database access path | **A. Service-role client for all server queries plus application checks**. **B. User-session database client so RLS evaluates the caller**. **C. Direct database connection with no RLS**. | **B** for user actions; reserve service-role access for narrowly defined system jobs. | **B** |
| 3E | Security-definer functions | **A. Use broadly for convenience**. **B. Avoid entirely**. **C. Use only for narrowly scoped operations with fixed `search_path`, explicit checks, and tests**. | **C**. | **C** |
| 3F | Background-job attribution | **A. Record only the service account**. **B. Record original actor plus system executor and reason/correlation ID**. **C. Do not audit automated work**. | **B** whenever a job originates from a user action; system-only jobs record a named system actor and reason. | **B** |
| 3G | Realtime authorization | **A. Filter events in the browser**. **B. Apply database/RLS-backed channel authorization and scoped subscriptions**. **C. Disable realtime everywhere**. | **B** for approved realtime features. | **B** |
| 3H | Storage authorization | **A. Public URLs**. **B. Private buckets with RLS/signed access after server authorization**. **C. Obscure filenames in public buckets**. | **B**. | **B** |

### 4. Design and verify PostgreSQL RLS policies

- [x] Map every authorization-managed table to its allowed actor, action, and scope combinations.
- [x] Implement default-deny RLS policies for authenticated access, with explicit policies for each approved scope.
- [x] Ensure party users can access only records belonging to their authorized party scope and cannot infer other parties through joins, counts, errors, or realtime events.
- [x] Ensure operational users receive only the approved warehouse/workflow access and cannot gain privileges by changing request parameters.
- [x] Ensure administrators retain required global oversight while all sensitive mutations remain attributable to an authenticated actor.
- [ ] Define and test insert/update/delete policy behavior separately; do not assume a select policy protects mutations.
- [x] Define policy behavior for audit records so they are append-only and readable only at the approved scope.
- [x] Have the `rbac-rls-reviewer` review the design and policies before sign-off.
- [ ] Run real-Postgres integration tests against the complete migration sequence before sign-off, as required by `specs/00-steering/testing.md`.

#### Decisions for Task 4

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 4A | RLS baseline | **A. Enable RLS only on party-facing tables**. **B. Enable RLS on every application table containing protected or scoped data**. **C. Depend on server-only access and omit RLS**. | **B**, default deny. | **B** |
| 4B | Policy organization | **A. One large policy per table**. **B. Separate policies by operation and actor/scope where clarity improves**. **C. Generate policies dynamically at runtime**. | **B**. | **B** |
| 4C | Scope lookup | **A. Read party scope from mutable JWT metadata**. **B. Join `auth.uid()` to active database assignments**. **C. Accept `party_id` from the request**. | **B**. | **B** |
| 4D | Administrator access | **A. Administrators bypass RLS with service-role credentials**. **B. Explicit administrator policies still evaluated under RLS**. **C. Administrators have no direct data access**. | **B** for interactive admin actions. | **B** |
| 4E | Audit mutability | **A. Admins may edit audit records**. **B. Insert-only events with no update/delete policy for ordinary or admin users**. **C. Store audit records only in Sentry**. | **B**. | **B** |
| 4F | Policy helper functions | **A. Repeat all joins in each policy**. **B. Stable SQL helper functions for common checks, reviewed for recursion and privilege safety**. **C. Application helpers only**. | **B** where it materially simplifies policies; simple policies may use **A**. | **B** |
| 4G | Test database | **A. Mocked database only**. **B. Local/ephemeral real PostgreSQL with migrations in order**. **C. Production database**. | **B**, as mandated by `testing.md`. | **B** |

### 5. Implement session and account lifecycle

- [x] Configure Supabase Auth integration for sign-in, sign-out, session refresh, and protected server requests according to `04-services-and-infrastructure`.
- [x] Define invitation/onboarding flow, including initial role assignment and prevention of unapproved self-registration.
- [x] Implement active/inactive account handling and forced session invalidation after deactivation or critical privilege changes.
- [x] Implement password/account recovery and email behavior using the approved service boundary; do not expose authorization details in recovery responses.
- [x] Define rate limiting and monitoring hooks for authentication and authorization failures using the project’s approved infrastructure.
- [x] Add structured security events for sign-in failures, invitation, activation/deactivation, role changes, scope changes, and denied access.

#### Decisions for Task 5

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 5A | Account creation | **A. Public self-registration**. **B. Administrator invitation only**. **C. Email-domain allowlist with self-registration**. | **B** for warehouse and party accounts unless requirements establish public onboarding. | **B** |
| 5B | Initial authorization | **A. Invitation includes active roles immediately**. **B. New users start inactive until an administrator activates assignments**. **C. Every new user defaults to warehouse staff**. | **B** for safest default; invitation may collect intended assignments for later activation. | **B** |
| 5C | Session model | **A. Supabase browser session with server-side validation/refresh**. **B. Custom session cookies independent of Supabase**. **C. Long-lived API keys for users**. | **A**. | **A** |
| 5D | Critical-change revocation | **A. Wait for token expiry**. **B. Live database checks make authorization changes immediate, with session revocation on deactivation**. **C. Ask the user to log out manually**. | **B**. | **B** |
| 5E | Password recovery | **A. Standard Supabase recovery email through the approved email setup**. **B. Administrator sets user passwords**. **C. No recovery support**. | **A**. | **A** |
| 5F | Rate limiting | **A. Per-IP only**. **B. Layered limits by IP and normalized account identifier, with tighter recovery/invite limits**. **C. CAPTCHA only**. | **B**, using the approved Upstash boundary. | **B** |
| 5G | Failed-sign-in messaging | **A. Say whether the email exists**. **B. Use a generic response while logging the precise internal reason**. **C. Show role/account status publicly**. | **B**. | **B** |
| 5H | Security-event destination | **A. Database audit only**. **B. Sentry only**. **C. Durable database audit plus monitoring/alerting for operational signals**. | **C**. | **C** |

### 6. Implement administrative management flows

- [x] Build the approved admin flow for listing, inviting, activating, deactivating, and reviewing users.
- [x] Build role assignment and revocation with confirmation, reason capture where required, and visible effective-date/status information.
- [x] Build party-scope assignment and revocation for party users, with safeguards against accidental cross-party exposure.
- [x] Prevent an administrator from removing the last active account with the required global administrative capability unless an approved recovery path exists.
- [x] Add an audit view/filter for authorization changes and security events at the approved administrative scope.
- [ ] Apply `brand-design-system.md` and the UI-shell conventions once `05-ui-shell-and-navigation` is available; this is an office/admin surface, not a floor scan flow.

#### Decisions for Task 6

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 6A | Admin information architecture | **A. One dense user-and-role screen**. **B. User list plus user detail/edit flow and separate role/permission reference**. **C. Command-line administration only**. | **B**. | **B** |
| 6B | Role customization in v1 | **A. Admins can create and edit arbitrary roles**. **B. Admins assign protected system roles but cannot redefine capabilities**. **C. Developers edit roles directly in the database**. | **B** for v1. | **B** |
| 6C | Assignment changes | **A. Save immediately with no confirmation**. **B. Confirmation for privilege grants/revocations, with reason required for sensitive changes**. **C. Require two-person approval for every change**. | **B**. | **B** |
| 6D | Party-scope assignment UI | **A. Free-text party ID**. **B. Searchable party selector showing canonical party code/name and current scope**. **C. Infer from user email**. | **B**. | **B** |
| 6E | Last-administrator handling | **A. Allow removal**. **B. Block it with a clear recovery instruction**. **C. Automatically promote another user**. | **B**. | **B** |
| 6F | Audit visibility | **A. Administrators only**. **B. Administrators plus a read-only auditor capability**. **C. All supervisors**. | **B**, even if the initial auditor capability is assigned only to administrators. | **B** |
| 6G | Deactivation | **A. Hard-delete user profile**. **B. Mark inactive, revoke assignments/sessions, and retain audit history**. **C. Remove only the Auth user**. | **B**. | **B** |

### 7. Integrate authorization with feature boundaries

- [x] Publish a permission matrix for downstream specs, including the approval queue, receiving, withdrawals, transfers, reporting, party/item administration, and document access.
- [x] Add authorization checks at every server mutation and protected data read; UI visibility is supplementary only.
- [x] Define which operations are deliberately unavailable offline. RBAC must not accidentally authorize Tier 2 actions such as approval, pricing, or FIFO allocation through the offline queue.
- [x] Define authorization for notifications and realtime events so users receive only events within their effective scope.
- [ ] Add contract tests proving downstream features consume the shared authorization interface rather than embedding role-name conditionals.

#### Decisions for Task 7

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 7A | Downstream integration contract | **A. Check role names in every feature**. **B. Shared capability constants and authorization helpers**. **C. Route visibility only**. | **B**. | **B** |
| 7B | Permission matrix ownership | **A. Keep separate copies in each feature spec**. **B. Maintain the canonical matrix in RBAC design and let feature specs reference capability IDs**. **C. Keep it only in source code**. | **B**. | **B** |
| 7C | UI behavior | **A. Hide unauthorized actions only**. **B. Hide/disable for usability while the server and RLS independently enforce access**. **C. Show every action and rely on errors**. | **B**. | **B** |
| 7D | Offline authorization | **A. Cache full privileges and permit all actions offline**. **B. Allow only explicitly approved Tier 1 operations and re-authorize on sync**. **C. Disable all offline work**. | **B**, subject to spec `03`. | **B** |
| 7E | Approval capability | **A. All supervisors implicitly approve every workflow**. **B. Separate approval capabilities by workflow/resource**. **C. Administrators only**. | **B** so `09-approval-queue` can grant least privilege. | **B** |
| 7F | Notification/realtime scope | **A. Client filters a global stream**. **B. Server/database-scoped subscriptions derived from effective authorization**. **C. Send all events to staff roles**. | **B**. | **B** |
| 7G | Document access | **A. Anyone with a URL can access**. **B. Apply the same resource and party scope as the source record**. **C. Administrator-only access**. | **B**. | **B** |

## Decision record

All recommended defaults were accepted for this draft. The authoritative selections are:

- Task 1: `1A=C`, `1B=A`, `1C=C`, `1D=B`, `1E=B`, `1F=B`, `1G=B`, `1H=A`, `1I=C`.
- Task 2: `2A=B`, `2B=B`, `2C=C`, `2D=B`, `2E=B`, `2F=B`, `2G=B`, `2H=B`.
- Task 3: `3A=B`, `3B=B`, `3C=B`, `3D=B`, `3E=C`, `3F=B`, `3G=B`, `3H=B`.
- Task 4: `4A=B`, `4B=B`, `4C=B`, `4D=B`, `4E=B`, `4F=B`, `4G=B`.
- Task 5: `5A=B`, `5B=B`, `5C=A`, `5D=B`, `5E=A`, `5F=B`, `5G=B`, `5H=C`.
- Task 6: `6A=B`, `6B=B`, `6C=B`, `6D=B`, `6E=B`, `6F=B`, `6G=B`.
- Task 7: `7A=B`, `7B=B`, `7C=B`, `7D=B`, `7E=B`, `7F=B`, `7G=B`.

Conditional recommendations were resolved as `1F=B` (party plus optional `flow_type` scope), `2F=B` (RBAC-specific security events because spec `01` does not define a general audit table), and `4F=B` (reviewed SQL policy helper functions). These selections are formalized in `requirements.md` and `design.md`; they do not replace the approval sign-offs below.

## Testing requirements

### Unit tests (Vitest)

- [ ] Test permission-matrix evaluation, multi-role combination rules, scope matching, default deny, and inactive/revoked assignments.
- [ ] Test session-to-authorization-context resolution with forged, stale, missing, and malformed claims.
- [ ] Test authorization helper outcomes for allowed, unauthenticated, forbidden, and not-found cases.
- [ ] Test audit-event construction and redaction of sensitive authentication data.

### Integration tests against real Postgres

- [ ] Run all RBAC migrations in order against real Postgres.
- [ ] Test RLS for each approved role, party scope, resource, and mutation action using separate authenticated identities.
- [ ] Prove cross-party reads, writes, joins, aggregates, realtime-related query paths, and storage metadata cannot bypass scope.
- [ ] Prove revocation/deactivation takes effect according to the approved session/cache policy.
- [ ] Prove audit records are append-only and attributable.
- [ ] Run the `db-migration-verifier` agent and resolve all findings before sign-off.
- [ ] Run the `rbac-rls-reviewer` agent and resolve or explicitly document all findings before sign-off.

### E2E tests (Playwright)

- [ ] Test sign-in, invitation/onboarding, session expiry, logout, and recovery paths.
- [ ] Test representative admin user/role/scope management flows.
- [ ] Test protected navigation and direct URL/API access for each approved role.
- [ ] Test that a party user cannot access another party’s records through navigation, direct identifiers, filters, or browser history.
- [ ] Test privilege changes taking effect in a new request/session according to the approved policy.

### Manual QA

- [ ] Verify keyboard and screen-reader behavior for admin authorization screens.
- [ ] Verify denial and error messages do not disclose protected resource existence or role configuration.
- [ ] Verify security events and audit entries are understandable to an administrator and contain actor, action, target, scope, timestamp, and reason where required.

## Sign-off

- [x] Requirements and design reviewed against current steering decisions — the 54 decision-table selections are synced with requirements.md/design.md (2026-08-05), and design.md itself reflects every resolved cross-cutting decision from `revision-log.md`. Additional content added 2026-08-05 to close revision-plan gaps: (1) operational capability catalog with stable resource keys, action vocabularies, scope kinds, and default role assignments for all first-wave domains (design.md §3.2); (2) self-approval prohibition rule for every approval capability, enforced server-side (requirements.md FR-3.7, design.md §3.4, acceptance criterion 16); (3) default-deny RLS entries for the six previously unmapped tables — `parties`, `party_roles`, `item_categories`, `lot_location_balances`, `inventory_commitments`, `inventory_commitment_lines` — (design.md §7.4); (4) exhaustive `event_type` enumeration for `rbac_security_events` (design.md §4.7).
- [ ] Unit, real-Postgres integration, E2E, and applicable manual tests pass — real-Postgres integration substantially done (see design.md §13's "Real-Postgres verification status" note, 2026-08-05): the Supplies-leak scenario, the last-administrator concurrency race, the `rbac_definer`/`BYPASSRLS` helper path, `rbac_security_events` append-only, and both partial-unique-index invariants all verified PASS with real data. Explicitly not yet verified: live PostgREST RPC-exposure introspection, the `party_visible_items` view itself, the full three-way `lots` VMI/Trading/Supplies RLS matrix, pooler-mode JWT propagation, and a full revoke-then-access-attempt flow. Unit/E2E/manual remain not-yet-applicable (code-dependent, no `lib/db/schema` exists yet).
- [x] `rbac-rls-reviewer` review complete — two full design-review rounds (2026-08-05): found and closed a blocking Supplies-data-leak gap plus five underspecified mechanisms in round one; round two confirmed the core fix and sharpened three of the five (`can_access_party_resource` wiring, the `lots` Trading-branch cross-party inference channel, the `items` masking-view mechanism, PostgREST schema-placement).
- [x] `db-migration-verifier` review complete — real-Postgres run (2026-08-05) found and fixed 4 implementation-detail bugs invisible from reading the SQL alone (a non-`IMMUTABLE` function in a partial-unique-index expression; three missing `GRANT USAGE`/`EXECUTE` statements on `auth`, `rbac_internal`, and `rbac_internal.has_permission` that would have broken every helper call and the entire admin mutation path). All 6 requested verification items now PASS; see design.md §13 for exactly what remains for a follow-up pass.
- [ ] Product owner approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
