# RBAC & Roles — Implementation Plan

Status: Draft

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
- [ ] Define the permission vocabulary as stable capabilities rather than UI route names, including resource, action, and scope dimensions.
- [ ] Define whether a user may hold multiple roles and how effective permissions are combined.
- [ ] Define the relationship between an authenticated user and one or more parties, including whether party users can be limited to specific party records or flow partitions.
- [ ] Define administrator and supervisor boundaries, including who may invite, deactivate, assign, or revoke users and roles.
- [ ] Define default-deny behavior, inactive-user behavior, session expiry behavior, and what happens when a role assignment is revoked during an active session.
- [ ] Define whether emergency access, impersonation, delegation, or break-glass access is supported. If any is supported, require explicit expiry and audit events.
- [ ] Record all resolved decisions in `requirements.md`, `design.md`, and `specs/00-steering/revision-log.md` where they supersede the flagged unstable model.

#### Decisions for Task 1

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 1A | Role structure | **A. Fixed roles only** — simplest, but feature code becomes coupled to role names. **B. Custom roles only** — flexible, but increases admin and testing complexity. **C. Fixed system roles backed by capabilities** — stable starting roles while code checks permissions. | **C** |  |
| 1B | Initial system roles | **A. `warehouse_staff`, `supervisor`, `administrator`, `party_user`**. **B. Split floor roles immediately** into receiving, picking, inspection, and dispatch roles. **C. Only `staff`, `administrator`, and `party_user`**. | **A**; split floor roles later only when requirements prove different access boundaries. | ___ |
| 1C | Permission shape | **A. Boolean capability names** such as `receiving.confirm`. **B. Resource/action pairs** such as `receiving:confirm`. **C. Resource/action/scope records** with scope evaluated separately. | **C** because party scope and operational scope must be explicit. | ___ |
| 1D | Multiple roles | **A. One role per user**. **B. Multiple roles with additive permissions**. **C. Multiple roles with explicit deny overrides**. | **B**; default deny plus additive grants is easier to reason about than deny precedence. | ___ |
| 1E | Party-user scope | **A. Exactly one party per user**. **B. One or more explicitly assigned parties**. **C. All parties sharing a party role or flow type**. | **B** for flexibility without implicit cross-party access. | ___ |
| 1F | Flow-type scope | **A. Party scope only**. **B. Party plus optional `flow_type` scope**. **C. Role-specific hard-coded flow access**. | **B** if users can represent the same party differently across VMI/Trading; otherwise **A**. Resolve from business examples before approval. | ___ |
| 1G | Privileged-account safeguards | **A. No special safeguard**. **B. Prevent removing the final administrator**. **C. Require two-person approval for every admin change**. | **B** for the initial release. | ___ |
| 1H | Emergency access | **A. No impersonation or break-glass access in v1**. **B. Time-limited break-glass access**. **C. Administrator impersonation of users**. | **A**; add later only with a concrete support requirement and full auditing. | ___ |
| 1I | Revocation behavior | **A. Takes effect at next login**. **B. Takes effect when the access token expires**. **C. Takes effect on the next protected request through live assignment checks**. | **C** for role/scope revocation and deactivation. | ___ |

### 2. Specify identity, role, permission, and scope data

- [ ] Identify which identity data remains in Supabase Auth and which authorization data is stored in application tables.
- [ ] Confirm whether the existing `party_roles` table from `01-core-data-model` represents business roles for parties only, application roles for users, or both; do not overload one concept for the other.
- [ ] Design the minimum authorization tables/relations needed for user-role assignments, role-permission assignments, user-party scope, status, timestamps, and revocation metadata.
- [ ] Define unique constraints preventing duplicate assignments and invalid self-references.
- [ ] Define referential actions for user deactivation, role removal, and party deletion without silently deleting audit history.
- [ ] Define indexes for session-time permission resolution and party-scoped queries.
- [ ] Define whether permission changes are evaluated live on every request or cached, and specify cache invalidation/revocation behavior if caching is used.
- [ ] Add a data dictionary to `design.md`; feature specs must reference these tables by name rather than redefining schema inline.

#### Decisions for Task 2

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 2A | Auth profile storage | **A. Store all profile/role data in Supabase Auth metadata**. **B. Keep identity in Auth and authorization/profile data in application tables**. **C. Duplicate full authorization state in both places**. | **B**; Auth supplies identity, while PostgreSQL remains authoritative for authorization. | ___ |
| 2B | Meaning of `party_roles` | **A. Reuse it for user roles**. **B. Keep it exclusively for business classifications of a `party`**. **C. Rename it and replace it with one shared role table**. | **B**; application roles and party business roles are different concepts. | ___ |
| 2C | Authorization schema | **A. Role enum on a user profile**. **B. `user_roles` plus hard-coded role-to-permission mapping in code**. **C. `roles`, `permissions`, `user_roles`, `role_permissions`, and `user_party_scopes` tables**. | **C**, with system roles protected from accidental deletion. | ___ |
| 2D | User profile key | **A. Separate UUID unrelated to Auth**. **B. Application profile primary key equals `auth.users.id`**. **C. Email is the linking key**. | **B**; never use mutable email as identity. | ___ |
| 2E | Assignment history | **A. Hard-delete revoked assignments**. **B. Keep `revoked_at`, `revoked_by`, and reason on assignments**. **C. Copy old assignments into a separate archive table**. | **B**, combined with append-only audit events. | ___ |
| 2F | Audit storage | **A. General application audit table**. **B. RBAC-specific security event table**. **C. External monitoring only**. | **A** if `01-core-data-model` defines a cross-cutting audit table; otherwise **B**. Never rely on **C** alone. | ___ |
| 2G | Permission resolution | **A. Embed permissions in JWT claims until token expiry**. **B. Query current assignments on every protected request**. **C. Redis-cache permissions across requests**. | **B**, with request-local memoization; revisit **C** only after measurement. | ___ |
| 2H | Party-scope representation | **A. `party_id` directly on user profile**. **B. Join table with active/revoked assignment metadata**. **C. Derive scope from email domain**. | **B**. | ___ |

### 3. Design the authorization decision path

- [ ] Define the server-side session resolver and its typed result: authenticated identity, active assignments, effective permissions, and party scope.
- [ ] Define reusable server-side authorization helpers for route handlers, Server Actions, background jobs, and database access.
- [ ] Define the distinction between authentication failure (`unauthenticated`), authorization failure (`forbidden`), and missing/invalid resource (`not found`) without leaking scoped data.
- [ ] Define how authorization context is propagated to Drizzle queries and how all party-scoped queries remain compatible with PostgreSQL RLS.
- [ ] Define protections against client-side-only gating, forged role claims, stale session claims, privilege escalation, and IDOR-style resource access.
- [ ] Define service-role/background-job behavior explicitly; privileged service credentials must not become a bypass for user-scoped actions without an auditable actor and reason.
- [ ] Define authorization behavior for realtime subscriptions, storage objects, email-triggering actions, and any API routes that do not pass through the normal page shell.

#### Decisions for Task 3

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 3A | Enforcement interface | **A. Each feature checks role names directly**. **B. Central `requirePermission(capability, scope)` helper**. **C. Middleware-only route protection**. | **B**; middleware may reject unauthenticated routes but cannot replace resource-level checks. | ___ |
| 3B | Authorization context | **A. Identity only; query roles ad hoc**. **B. Typed context containing identity, active roles, capabilities, and party scope**. **C. Pass role and party from client forms**. | **B**. | ___ |
| 3C | Party-scoped missing resource response | **A. Always return `403 Forbidden`**. **B. Return `404 Not Found` when revealing existence would leak data**. **C. Redirect to dashboard**. | **B**, while true capability failures may return **403**. | ___ |
| 3D | Database access path | **A. Service-role client for all server queries plus application checks**. **B. User-session database client so RLS evaluates the caller**. **C. Direct database connection with no RLS**. | **B** for user actions; reserve service-role access for narrowly defined system jobs. | ___ |
| 3E | Security-definer functions | **A. Use broadly for convenience**. **B. Avoid entirely**. **C. Use only for narrowly scoped operations with fixed `search_path`, explicit checks, and tests**. | **C**. | ___ |
| 3F | Background-job attribution | **A. Record only the service account**. **B. Record original actor plus system executor and reason/correlation ID**. **C. Do not audit automated work**. | **B** whenever a job originates from a user action; system-only jobs record a named system actor and reason. | ___ |
| 3G | Realtime authorization | **A. Filter events in the browser**. **B. Apply database/RLS-backed channel authorization and scoped subscriptions**. **C. Disable realtime everywhere**. | **B** for approved realtime features. | ___ |
| 3H | Storage authorization | **A. Public URLs**. **B. Private buckets with RLS/signed access after server authorization**. **C. Obscure filenames in public buckets**. | **B**. | ___ |

### 4. Design and verify PostgreSQL RLS policies

- [ ] Map every authorization-managed table to its allowed actor, action, and scope combinations.
- [ ] Implement default-deny RLS policies for authenticated access, with explicit policies for each approved scope.
- [ ] Ensure party users can access only records belonging to their authorized party scope and cannot infer other parties through joins, counts, errors, or realtime events.
- [ ] Ensure operational users receive only the approved warehouse/workflow access and cannot gain privileges by changing request parameters.
- [ ] Ensure administrators retain required global oversight while all sensitive mutations remain attributable to an authenticated actor.
- [ ] Define and test insert/update/delete policy behavior separately; do not assume a select policy protects mutations.
- [ ] Define policy behavior for audit records so they are append-only and readable only at the approved scope.
- [ ] Have the `rbac-rls-reviewer` review the design and policies before sign-off.
- [ ] Run real-Postgres integration tests against the complete migration sequence before sign-off, as required by `specs/00-steering/testing.md`.

#### Decisions for Task 4

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 4A | RLS baseline | **A. Enable RLS only on party-facing tables**. **B. Enable RLS on every application table containing protected or scoped data**. **C. Depend on server-only access and omit RLS**. | **B**, default deny. | ___ |
| 4B | Policy organization | **A. One large policy per table**. **B. Separate policies by operation and actor/scope where clarity improves**. **C. Generate policies dynamically at runtime**. | **B**. | ___ |
| 4C | Scope lookup | **A. Read party scope from mutable JWT metadata**. **B. Join `auth.uid()` to active database assignments**. **C. Accept `party_id` from the request**. | **B**. | ___ |
| 4D | Administrator access | **A. Administrators bypass RLS with service-role credentials**. **B. Explicit administrator policies still evaluated under RLS**. **C. Administrators have no direct data access**. | **B** for interactive admin actions. | ___ |
| 4E | Audit mutability | **A. Admins may edit audit records**. **B. Insert-only events with no update/delete policy for ordinary or admin users**. **C. Store audit records only in Sentry**. | **B**. | ___ |
| 4F | Policy helper functions | **A. Repeat all joins in each policy**. **B. Stable SQL helper functions for common checks, reviewed for recursion and privilege safety**. **C. Application helpers only**. | **B** where it materially simplifies policies; simple policies may use **A**. | ___ |
| 4G | Test database | **A. Mocked database only**. **B. Local/ephemeral real PostgreSQL with migrations in order**. **C. Production database**. | **B**, as mandated by `testing.md`. | ___ |

### 5. Implement session and account lifecycle

- [ ] Configure Supabase Auth integration for sign-in, sign-out, session refresh, and protected server requests according to `04-services-and-infrastructure`.
- [ ] Define invitation/onboarding flow, including initial role assignment and prevention of unapproved self-registration.
- [ ] Implement active/inactive account handling and forced session invalidation after deactivation or critical privilege changes.
- [ ] Implement password/account recovery and email behavior using the approved service boundary; do not expose authorization details in recovery responses.
- [ ] Define rate limiting and monitoring hooks for authentication and authorization failures using the project’s approved infrastructure.
- [ ] Add structured security events for sign-in failures, invitation, activation/deactivation, role changes, scope changes, and denied access.

#### Decisions for Task 5

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 5A | Account creation | **A. Public self-registration**. **B. Administrator invitation only**. **C. Email-domain allowlist with self-registration**. | **B** for warehouse and party accounts unless requirements establish public onboarding. | ___ |
| 5B | Initial authorization | **A. Invitation includes active roles immediately**. **B. New users start inactive until an administrator activates assignments**. **C. Every new user defaults to warehouse staff**. | **B** for safest default; invitation may collect intended assignments for later activation. | ___ |
| 5C | Session model | **A. Supabase browser session with server-side validation/refresh**. **B. Custom session cookies independent of Supabase**. **C. Long-lived API keys for users**. | **A**. | ___ |
| 5D | Critical-change revocation | **A. Wait for token expiry**. **B. Live database checks make authorization changes immediate, with session revocation on deactivation**. **C. Ask the user to log out manually**. | **B**. | ___ |
| 5E | Password recovery | **A. Standard Supabase recovery email through the approved email setup**. **B. Administrator sets user passwords**. **C. No recovery support**. | **A**. | ___ |
| 5F | Rate limiting | **A. Per-IP only**. **B. Layered limits by IP and normalized account identifier, with tighter recovery/invite limits**. **C. CAPTCHA only**. | **B**, using the approved Upstash boundary. | ___ |
| 5G | Failed-sign-in messaging | **A. Say whether the email exists**. **B. Use a generic response while logging the precise internal reason**. **C. Show role/account status publicly**. | **B**. | ___ |
| 5H | Security-event destination | **A. Database audit only**. **B. Sentry only**. **C. Durable database audit plus monitoring/alerting for operational signals**. | **C**. | ___ |

### 6. Implement administrative management flows

- [ ] Build the approved admin flow for listing, inviting, activating, deactivating, and reviewing users.
- [ ] Build role assignment and revocation with confirmation, reason capture where required, and visible effective-date/status information.
- [ ] Build party-scope assignment and revocation for party users, with safeguards against accidental cross-party exposure.
- [ ] Prevent an administrator from removing the last active account with the required global administrative capability unless an approved recovery path exists.
- [ ] Add an audit view/filter for authorization changes and security events at the approved administrative scope.
- [ ] Apply `brand-design-system.md` and the UI-shell conventions once `05-ui-shell-and-navigation` is available; this is an office/admin surface, not a floor scan flow.

#### Decisions for Task 6

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 6A | Admin information architecture | **A. One dense user-and-role screen**. **B. User list plus user detail/edit flow and separate role/permission reference**. **C. Command-line administration only**. | **B**. | ___ |
| 6B | Role customization in v1 | **A. Admins can create and edit arbitrary roles**. **B. Admins assign protected system roles but cannot redefine capabilities**. **C. Developers edit roles directly in the database**. | **B** for v1. | ___ |
| 6C | Assignment changes | **A. Save immediately with no confirmation**. **B. Confirmation for privilege grants/revocations, with reason required for sensitive changes**. **C. Require two-person approval for every change**. | **B**. | ___ |
| 6D | Party-scope assignment UI | **A. Free-text party ID**. **B. Searchable party selector showing canonical party code/name and current scope**. **C. Infer from user email**. | **B**. | ___ |
| 6E | Last-administrator handling | **A. Allow removal**. **B. Block it with a clear recovery instruction**. **C. Automatically promote another user**. | **B**. | ___ |
| 6F | Audit visibility | **A. Administrators only**. **B. Administrators plus a read-only auditor capability**. **C. All supervisors**. | **B**, even if the initial auditor capability is assigned only to administrators. | ___ |
| 6G | Deactivation | **A. Hard-delete user profile**. **B. Mark inactive, revoke assignments/sessions, and retain audit history**. **C. Remove only the Auth user**. | **B**. | ___ |

### 7. Integrate authorization with feature boundaries

- [ ] Publish a permission matrix for downstream specs, including the approval queue, receiving, withdrawals, transfers, reporting, party/item administration, and document access.
- [ ] Add authorization checks at every server mutation and protected data read; UI visibility is supplementary only.
- [ ] Define which operations are deliberately unavailable offline. RBAC must not accidentally authorize Tier 2 actions such as approval, pricing, or FIFO allocation through the offline queue.
- [ ] Define authorization for notifications and realtime events so users receive only events within their effective scope.
- [ ] Add contract tests proving downstream features consume the shared authorization interface rather than embedding role-name conditionals.

#### Decisions for Task 7

| ID | Decision | Options | Recommended default | Selected |
|---|---|---|---|---|
| 7A | Downstream integration contract | **A. Check role names in every feature**. **B. Shared capability constants and authorization helpers**. **C. Route visibility only**. | **B**. | ___ |
| 7B | Permission matrix ownership | **A. Keep separate copies in each feature spec**. **B. Maintain the canonical matrix in RBAC design and let feature specs reference capability IDs**. **C. Keep it only in source code**. | **B**. | ___ |
| 7C | UI behavior | **A. Hide unauthorized actions only**. **B. Hide/disable for usability while the server and RLS independently enforce access**. **C. Show every action and rely on errors**. | **B**. | ___ |
| 7D | Offline authorization | **A. Cache full privileges and permit all actions offline**. **B. Allow only explicitly approved Tier 1 operations and re-authorize on sync**. **C. Disable all offline work**. | **B**, subject to spec `03`. | ___ |
| 7E | Approval capability | **A. All supervisors implicitly approve every workflow**. **B. Separate approval capabilities by workflow/resource**. **C. Administrators only**. | **B** so `09-approval-queue` can grant least privilege. | ___ |
| 7F | Notification/realtime scope | **A. Client filters a global stream**. **B. Server/database-scoped subscriptions derived from effective authorization**. **C. Send all events to staff roles**. | **B**. | ___ |
| 7G | Document access | **A. Anyone with a URL can access**. **B. Apply the same resource and party scope as the source record**. **C. Administrator-only access**. | **B**. | ___ |

## Decision record

Before this plan can be approved, copy the selected option letter for every decision ID into the `Selected` column. Any selection that differs from the recommended default must be reflected—with rationale—in `requirements.md` or `design.md`. If a decision is genuinely not applicable, enter `N/A` and explain why in the relevant spec.

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

- [ ] Requirements and design reviewed against current steering decisions
- [ ] Unit, real-Postgres integration, E2E, and applicable manual tests pass
- [ ] `rbac-rls-reviewer` review complete
- [ ] `db-migration-verifier` review complete
- [ ] Product owner approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
