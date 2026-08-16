# RBAC & Roles — Requirements

Status: Approved
Updated: 2026-08-05

Depends on:

- `specs/00-steering/product.md`
- `specs/00-steering/tech.md`
- `specs/00-steering/structure.md`
- `specs/00-steering/testing.md`
- `specs/01-core-data-model/requirements.md`

## 1. Overview

This feature defines how authenticated people receive and exercise authority in Hyperion 3PL / Dyna-Serv. It covers staff and party-user authentication, system roles, capabilities, party and `flow_type` scope, administrative account management, PostgreSQL Row-Level Security (RLS), and authorization audit events.

Authentication proves identity. Authorization determines what that identity may do and which records it may access. UI visibility is a usability aid only; protected reads and mutations must be enforced on the server and by PostgreSQL RLS.

The system operates one physical warehouse. Authorization must not introduce a `warehouse_id` or simulate tenancy through separate warehouse records.

## 2. Goals

- Provide four protected initial system roles without coupling feature code to role names.
- Resolve effective access from capabilities and explicit scopes using the authenticated Supabase session.
- Enforce least privilege and default deny at both the application and database layers.
- Prevent party users from viewing or inferring another party's data.
- Make account, role, scope, denial, and security-sensitive actions auditable.
- Give administrators safe user and access-management workflows.
- Provide a stable authorization contract for downstream feature specs.

## 3. Actors and system roles

### 3.1 Warehouse staff

Warehouse staff perform approved floor and operational work such as receiving scans, putaway, picking, inspection, and dispatch. Their exact workflow capabilities are granted by the canonical permission matrix and refined by the relevant feature specs.

### 3.2 Supervisors

Supervisors receive oversight and workflow-specific approval capabilities in addition to selected operational capabilities. A supervisor role does not automatically authorize every approval; approvals are separate capabilities per workflow or resource.

### 3.3 Administrators

Administrators manage users, system-role assignments, party scopes, account lifecycle, and authorization audit visibility. Interactive administrator actions remain subject to RLS and auditing; the role does not use service credentials as a blanket bypass.

### 3.4 Party users

Party users receive read or action capabilities only for one or more explicitly assigned `parties`, optionally narrowed by `flow_type`. The v1 party-user grants cover externally applicable VMI and Trading data; they do not expose internal Supplies data. A party user's email address or domain never determines access.

### 3.5 Role behavior

- The initial system roles are `warehouse_staff`, `supervisor`, `administrator`, and `party_user`.
- System roles are fixed and their definitions cannot be edited through the v1 administration UI.
- Features authorize capabilities, not role names.
- A user may hold multiple roles. Active grants combine additively.
- There are no explicit deny grants. Anything not actively granted is denied.
- `party_roles` classifies business entities and is not an application-user role mechanism.

## 4. Functional requirements

### FR-1: Identity and profile linkage

1. The system SHALL use Supabase Auth as the identity and session provider.
2. Each application user profile SHALL use the corresponding immutable Supabase Auth user UUID as its identity key.
3. Email addresses SHALL NOT be used as authorization keys.
4. Authorization data SHALL be stored in application database tables rather than treated as authoritative user-editable Auth metadata.
5. Protected requests SHALL resolve identity from the authenticated server-validated session, never from a client-supplied user ID.

### FR-2: Invitation and activation

1. Public self-registration SHALL be disabled for warehouse and party users.
2. Only an actor with the user-invitation capability SHALL be able to invite an account.
3. An invited user SHALL remain inactive for authorization purposes until an authorized administrator activates the profile.
4. Intended role and scope assignments MAY be recorded before activation, but SHALL grant no access while the profile is inactive.
5. Password setup and recovery SHALL use the approved Supabase Auth email flow.
6. Public authentication responses SHALL not reveal whether an email, role, party scope, or inactive account exists.

### FR-3: Roles and capabilities

1. Roles SHALL grant named capabilities represented by resource, action, and applicable scope type.
2. Capability identifiers SHALL be stable authorization contracts and SHALL NOT be route names or UI labels.
3. System-role capability mappings SHALL be centrally defined and protected from runtime editing in v1.
4. Effective capabilities SHALL be the union of all active role assignments for an active user.
5. Expired, revoked, future-dated, or inactive assignments SHALL contribute no capabilities.
6. Server Actions, route handlers, background jobs acting for a user, and protected server-rendered reads SHALL use the shared authorization contract.
7. For any approval capability, a user who is recorded as the requester of a specific approval target SHALL NOT exercise that approval capability against that same target, regardless of the approval capability they hold. This self-approval prohibition SHALL be enforced by the approval-command server logic and re-applied during sync re-authorization; UI suppression of the approve action is supplementary only.

### FR-4: Party and flow scope

1. A user MAY be assigned to one or more `parties` through explicit scope assignments.
2. Each party assignment MAY apply to all flow types for that party or be narrowed to one `flow_type`.
3. A flow-specific assignment SHALL NOT grant access to another flow for the same party.
4. Client-supplied `party_id` and `flow_type` values MAY identify a requested resource but SHALL NOT establish authorization.
5. Party access SHALL be checked against the current active database assignments and the actual party/flow relationship of the requested record.
6. Party users SHALL NOT infer other parties' records through identifiers, joins, counts, search results, filters, errors, realtime events, or storage URLs.

### FR-5: Authorization resolution and revocation

1. The system SHALL load the active profile, role assignments, capabilities, and party scopes from PostgreSQL on every protected request.
2. Resolution MAY be memoized within one request but SHALL NOT use a cross-request permission cache in v1.
3. JWT role or permission metadata SHALL NOT be the authoritative authorization source.
4. Role revocation, party-scope revocation, or user deactivation SHALL take effect on the next protected request.
5. User deactivation SHALL also trigger session revocation through the approved Auth administration path.
6. The system SHALL distinguish unauthenticated, forbidden, and unavailable/not-found outcomes without disclosing protected record existence.
7. Party-scoped resources outside the caller's scope SHALL normally appear not found.

### FR-6: Application and database enforcement

1. Protected application operations SHALL call a shared capability-and-scope authorization interface.
2. Middleware or navigation guards MAY reject unauthenticated access but SHALL NOT replace resource-level authorization.
3. PostgreSQL RLS SHALL be enabled with default-deny behavior on every application table containing protected or scoped data.
4. RLS scope checks SHALL resolve active assignments from `auth.uid()` and database records.
5. Interactive user requests SHALL execute with the user session so RLS evaluates the caller.
6. Service-role credentials SHALL be limited to explicit system operations and SHALL NOT be used as a general replacement for user RLS.
7. Select, insert, update, and delete permissions SHALL be evaluated independently.
8. Security-definer database functions, when necessary, SHALL have a fixed `search_path`, minimum privileges, explicit authorization checks, and real-Postgres tests.

### FR-7: Administrative user management

1. Authorized administrators SHALL be able to list and review user profiles, statuses, roles, party scopes, and relevant security history.
2. Authorized administrators SHALL be able to invite, activate, deactivate, grant, and revoke access.
3. Role and scope changes SHALL require confirmation.
4. Sensitive grants and revocations SHALL require a reason recorded in the security audit.
5. Party scope SHALL be selected from canonical `parties` by code and name, never entered as an unverified free-text ID.
6. The system SHALL prevent deactivation or revocation that would leave no active user with the required global administrator capability.
7. The system SHALL NOT automatically promote another account.
8. Deactivation SHALL preserve the user profile, assignment history, and audit records.
9. v1 SHALL NOT support user impersonation, custom-role editing, delegation, or break-glass access.

### FR-8: Security events and auditability

1. The system SHALL maintain durable, append-only RBAC security events in PostgreSQL.
2. Security events SHALL cover invitations, activation/deactivation, role grants/revocations, party-scope grants/revocations, denied sensitive actions, authentication failures where safely attributable, and session/security administration.
3. Each event SHALL record event type, timestamp, actor when known, target, reason where required, and a correlation or request identifier where available.
4. User-originated background work SHALL preserve both the original actor and system executor.
5. System-only jobs SHALL record a named system executor and reason.
6. Ordinary users and administrators SHALL NOT update or delete security events.
7. Audit visibility SHALL use a dedicated read capability that may be granted independently; administrators receive it by default.
8. Sensitive tokens, passwords, full session data, service credentials, and unnecessary personal data SHALL NOT be stored in event details.
9. Operational monitoring MAY receive selected security signals through Sentry, but Sentry SHALL NOT replace the durable database record.

### FR-9: Realtime, files, notifications, and documents

1. Realtime subscriptions SHALL be scoped on the server/database side to the caller's effective authorization.
2. The browser SHALL NOT receive a global event stream and filter unauthorized events locally.
3. Protected files SHALL use private Supabase Storage buckets and authorized signed or session-bound access.
4. Possession of a file URL SHALL NOT independently authorize access.
5. Documents SHALL inherit the resource, party, and flow scope of their source record.
6. Notifications SHALL be generated and delivered only to users whose current effective scope permits the referenced information.

### FR-10: Offline authorization

1. Only operations explicitly classified as Tier 1 by the approved offline specification MAY be queued offline.
2. Approval, pricing, FIFO allocation/override, role management, and other Tier 2 actions SHALL NOT be authorized solely from cached client state.
3. Every queued operation SHALL be re-authenticated and re-authorized against current server state during sync.
4. Revoked or deactivated users' queued operations SHALL be rejected safely and logged according to the approved offline design.

### FR-11: Rate limiting and security responses

1. Authentication, invitation, and recovery endpoints SHALL use layered rate limits based on IP address and normalized account identifier where available.
2. Invitation and recovery operations SHALL use stricter limits than ordinary authenticated reads.
3. Denied and failed authentication responses SHALL use generic public messages where detail could enable account or scope enumeration.
4. Precise internal failure reasons MAY be recorded in protected monitoring or audit data after redaction.

## 5. Initial capability families

The exact downstream matrix is completed as each dependent feature is approved. At minimum, the RBAC feature SHALL define stable capability families for:

- User lifecycle: read, invite, activate, deactivate.
- Access assignments: read, grant, revoke.
- Party scope: read, grant, revoke.
- Security audit: read.
- Receiving and inspection: view and workflow-specific actions.
- Inventory and locations: view and workflow-specific actions.
- Picking, dispatch, and transfers: view, execute, and workflow-specific actions.
- Approval: a separate capability for each approval workflow/resource.
- Party/item administration: view and manage.
- Documents, reports, notifications, and files: view or manage at effective scope.

The RBAC design owns canonical capability identifiers. The operational capability catalog — covering `receiving`, `inspection`, `inventory`, `locations`, `pick_list`, `fifo_override`, `dispatch`, `transfers`, `documents`, `reporting`, `parties`, `items`, `forex_rates`, and `notifications` — is enumerated in `design.md` §3.2 with stable resource keys, action vocabularies, scope kinds, and default role assignments. Downstream specs reference those identifiers and may propose additions within established resource keys; they do not create role-name checks and do not rename resource identifiers.

## 6. Non-functional requirements

### Security

- Authorization SHALL fail closed when session, assignment, scope, or resource ownership cannot be resolved.
- Administrative mutations SHALL be transactional where partial completion could create unintended access.
- Privileged credentials SHALL remain server-only.
- The implementation SHALL be reviewed by the `rbac-rls-reviewer` before sign-off.

### Performance

- Permission resolution SHALL use indexed active-assignment lookups.
- Repeated checks within one server request SHOULD reuse a request-local authorization context.
- Cross-request caching SHALL not be introduced without a measured need and an approved invalidation design.

### Accessibility and usability

- Administrative screens SHALL follow `ui-ux-design-plan.md` and remain usable on mobile, while targeting office/desktop workflows.
- Access changes SHALL clearly show the user, role, party, optional flow scope, and resulting status before confirmation.
- Keyboard navigation, visible focus, accessible labels, and non-color-only status cues SHALL be supported.

### Audit retention

- Deactivation and revocation SHALL retain historical attribution.
- Final retention duration and export requirements are governed by infrastructure/compliance decisions and must be set before production launch.

## 7. Acceptance criteria

1. A protected request with no valid Supabase session is denied.
2. A valid but inactive user receives no protected access.
3. A user receives the additive union of active role capabilities and no ungranted capabilities.
4. Feature code can authorize a capability without checking a system-role name.
5. Changing a client-supplied user, role, party, or flow identifier does not expand access.
6. A party user assigned to Party A cannot read, mutate, count, search, subscribe to, or download Party B data.
7. A party user scoped to Party A's `vmi` flow cannot access Party A's `trading` records unless separately assigned and cannot access internal `supplies` records without a future approved capability and scope rule.
8. Role, scope, and account revocation take effect on the next protected request.
9. Interactive administrator actions remain protected by RLS and create security events.
10. The final active global administrator cannot be deactivated or stripped of required administrator capability.
11. RBAC security events cannot be updated or deleted by ordinary or administrator sessions.
12. Protected storage objects and realtime events obey the same party/resource scope as their source records.
13. Offline operations are re-authorized during sync; Tier 2 actions are never accepted from cached client authorization alone.
14. Real-Postgres integration tests prove RLS separately for select, insert, update, and delete paths.
15. Direct URL, API, join, aggregate, and identifier-manipulation tests do not bypass authorization.
16. A supervisor holding `fifo_override.approve` cannot approve an override request they originally submitted; the server rejects the attempt even when the UI approval button is bypassed via direct API call.

## 8. Out of scope

- Public self-service registration.
- Custom role creation or capability editing in v1.
- User impersonation, delegation, or break-glass access.
- Approval workflow state machines; this spec only defines their capability boundary.
- Offline queue and conflict-resolution mechanics, owned by `03-offline-mode-and-client-storage`.
- Workflow-specific receiving, withdrawal, transfer, pricing, billing, and reporting business rules.
- A second warehouse or any `warehouse_id`-based scope.

## 9. Remaining specification dependencies

These are not unresolved RBAC model choices, but the final capability matrix cannot be completed until the referenced specs define their operations:

- `03-offline-mode-and-client-storage`: exact Tier 1 queueable operations and rejected-sync UX.
- `04-services-and-infrastructure`: Auth administration boundary, email templates, rate-limit values, retention, and monitoring alerts.
- `05-ui-shell-and-navigation`: protected route groups and navigation behavior.
- `07` through `19`: workflow-specific view, execute, approve, document, report, notification, and file capabilities.
