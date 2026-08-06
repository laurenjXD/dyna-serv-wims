# UI Shell & Navigation — Requirements

Status: Approved
Updated: 2026-08-06

## 1. Purpose and scope

The UI shell provides the shared application frame around feature screens in the single-warehouse Hyperion 3PL / Dyna-Serv system. It gives authenticated users a consistent route boundary, navigation surface, page context, account controls, feedback states, and responsive behavior.

The shell does not define receiving, picking, inspection, transfers, billing, pricing, reporting, or other feature workflows. Those remain owned by their feature specifications.

## 2. Users and surfaces

The shell supports two presentation surfaces:

- **Floor surface** — warehouse staff operating portrait handheld scanners. It is mobile-first at approximately 375–430px, touch-first, high-contrast, scan-ready, and optimized for one obvious next action.
- **Office surface** — supervisors, administrators, and other users working primarily on larger screens. It may use a sidebar, wider containers, tables, and hover affordances, while remaining usable on mobile.

A feature declares its surface when registering a route. The shell must not infer floor behavior from a mutable client role string.

## 3. Requirements

### R1. Protected application entry

1. Unauthenticated users attempting to access a protected route SHALL be sent to the approved sign-in boundary.
2. After successful sign-in, the user MAY return to the originally requested internal route when that route is safe and still authorized.
3. External URLs and malformed return paths SHALL be rejected.
4. The shell SHALL resolve authentication on the server through the approved Supabase Auth/session boundary.
5. Client-side route guards MAY improve interaction but SHALL NOT be the only protection for a route or resource.

### R2. Session and account state

1. The shell SHALL provide an account control with safe display information from the resolved session.
2. The shell SHALL provide sign-out through the approved Auth integration.
3. Expired, revoked, or inactive sessions SHALL not render protected content after the server detects the condition.
4. An authenticated user with no active usable capability SHALL receive the approved safe empty-access state rather than an unbounded application shell.
5. The shell SHALL never accept a client-supplied role, party, or capability value as authoritative.

### R3. Navigation registry

1. Navigation entries SHALL be defined through a typed central registry.
2. Each entry SHALL support, at minimum, a stable route identifier, path, label, navigation group, display order, icon/accessible name, surface, and required capability reference once the RBAC contract is approved.
3. The registry SHALL support entries that are temporarily unavailable because their feature specification is not approved.
4. Navigation visibility SHALL be derived from server-provided effective capability context for presentation only.
5. The registry SHALL not be treated as an authorization boundary.
6. The shell SHALL support nested routes, dynamic segments, query strings, and trailing slashes without incorrect active-state matches.
7. The active destination SHALL have a non-color signal such as text, icon treatment, indicator, or selected-state semantics.

### R4. Responsive navigation

1. Office screens SHALL provide the approved desktop sidebar or equivalent navigation surface using the brand-design-system treatment.
2. Floor screens SHALL not reserve persistent desktop sidebar space by default.
3. During an active scan-driven floor flow, navigation SHALL be hidden, collapsed, or replaced by the approved flow-specific mobile navigation pattern.
4. Floor navigation SHALL remain usable in portrait at the base breakpoint without horizontal scrolling.
5. Office navigation SHALL remain usable at narrow mobile widths for secondary supervisor/administrator access.

### R5. Layout and page context

1. Authenticated feature routes SHALL render inside a shared shell layout unless the approved design explicitly declares a standalone surface.
2. The shell SHALL provide a page-header contract supporting title, optional context, optional breadcrumb/back action, and optional feature-owned primary action.
3. The shell SHALL preserve the feature's content hierarchy and SHALL not impose a second competing primary action.
4. Feature specifications SHALL be able to declare floor or office treatment without duplicating global shell markup.
5. The shell SHALL provide stable landmarks for header, navigation, main content, and status/feedback regions.

### R6. Loading, error, and not-found states

1. Protected routes SHALL provide a loading state that does not expose stale protected content as current.
2. Route and shell errors SHALL provide a safe, recoverable user-facing state with an appropriate retry, back, or home action.
3. Unknown or unauthorized routes SHALL use the approved not-found/forbidden behavior and SHALL not disclose protected resource existence.
4. Error messages SHALL not expose secrets, access tokens, SQL, stack traces, provider topology, or protected record data.
5. Shell errors SHALL be connected to the approved monitoring boundary with safe diagnostic context.
6. The shell SHALL distinguish initial session checking, route loading, retrying, timeout, retry-exhausted, not-found, forbidden, and unexpected-error states; each SHALL provide an appropriate safe recovery action or redirect.
7. A not-found response SHALL not reveal whether a protected resource exists when the caller lacks authorization; a forbidden response MAY be used only where the route/resource existence is safe to disclose.
8. Error recovery SHALL distinguish retryable failures from failures requiring sign-in, an online connection, administrator assistance, or navigation away.

### R7. Floor interaction and accessibility

1. Floor styles SHALL be mobile-first and fully functional at the base breakpoint.
2. Floor controls SHALL use at least 56×56px touch targets; floor primary actions SHALL use at least 64px height and be full-width where practical.
3. Office controls SHALL use at least 44×44px touch targets.
4. Floor screens SHALL use no text below 16px and SHALL meet the design-system contrast requirements, including AAA contrast for time-critical actions.
5. Every interactive element SHALL expose a visible keyboard focus state.
6. Status, active, error, and connectivity states SHALL not rely on color alone.
7. Floor controls SHALL use immediate press feedback rather than hover-dependent behavior.
8. Reduced-motion preferences SHALL be respected; no essential shell state may depend on animation.
9. Shell content SHALL remain operable with keyboard/scanner-as-keyboard input and a screen reader.

### R8. Connectivity presentation

1. If the approved offline contract supplies connectivity state, the shell MAY display an informational online/offline indicator.
2. The indicator SHALL distinguish connectivity from synchronization and SHALL not claim that data is synchronized without authoritative evidence.
3. The shell SHALL not queue actions, approve work, assign FIFO stock, or make pricing/billing decisions because a user is offline.
4. When supplied by `03`, the shell SHALL represent `online`, `offline`, and `checking` connectivity separately from `idle`, `syncing`, and `attention` synchronization states.
5. The shell SHALL represent unavailable, corrupted, quota-exceeded, or cleared browser storage as an explicit attention state and SHALL never imply that offline work is safely persisted in those conditions.
6. An online-required action SHALL provide a clear explanation and recovery path without pretending that the action was queued or completed.

### R9. Downstream feature contract

1. A feature SHALL be able to register its route metadata, shell surface, page metadata, and required capability references through the documented shell contract.
2. Features SHALL own their workflow-specific loading, empty, confirmation, scan-result, and validation states unless explicitly designated shell-global.
3. Features SHALL not define duplicate global navigation, global design tokens, or client-only authorization gates.
4. The shell contract SHALL remain usable by feature specs `06` through `22` (excluding deferred `19`) without requiring feature-specific role-name conditionals.
5. The shell contract SHALL define ownership for global states versus feature-owned states so that features can provide empty-data, validation, confirmation, scan-result, conflict, and domain-specific recovery states without duplicating global shell behavior.

### R10. Shared list interaction contract

1. Every feature-owned table or list SHALL use the shared row-action, filter, and search contract defined in `design.md` §8.
2. Row actions SHALL be derived from the caller's effective capability and the row's current state; unauthorized actions SHALL be omitted rather than rendered as disabled-only controls.
3. The standard filter bar SHALL support the exact `16-reporting-and-analytics` FR-8.1 vocabulary: date range, party, flow type, and item/entity. A global cross-entity search control SHALL preserve the same authorization boundary.
4. Filtered and searched results SHALL be produced by an authorized server query and remain subject to PostgreSQL RLS; client-side filtering SHALL not broaden or substitute for the canonical access predicate.
5. Shared item lists, Master Inventory tables, analytics views, and exports SHALL display `supplier_item_code` for `vmi` and `dsgc_item_number` for `trading` or `supplies`; `dsgc part number` SHALL not be used.

## 4. Acceptance criteria

- [ ] A protected deep link redirects safely to sign-in when unauthenticated and returns only when the destination remains valid and authorized.
- [ ] A typed navigation registry can filter presentation entries from effective capabilities while server authorization remains independent.
- [ ] Nested routes show the correct active destination without false matches.
- [ ] Desktop sidebar, narrow office layout, and floor navigation are usable at 1280px, 768px, 430px, and 375px representative widths.
- [ ] Floor shell controls satisfy touch-target, contrast, font-size, focus, portrait, and no-hover rules.
- [ ] Expired/revoked/inactive sessions cannot continue viewing protected content.
- [ ] Loading, error, not-found, sign-out, and connectivity states are safe and recoverable.
- [ ] Initial session checking, retry/timeout, forbidden, storage-attention, online-required, synchronization-attention, and sign-out transition states are safe and recoverable.
- [ ] A representative floor feature and office feature can mount through the shared shell contract without duplicating shell behavior.
- [ ] Unit, integration, E2E, and manual checks required by `tasks.md` pass or are explicitly marked not applicable.
- [ ] Representative list screens prove capability/row-state action gating, touch-target behavior, exact shared filters, cross-entity search, and RLS-preserving server queries.

## 5. Dependencies and exclusions

- Visual requirements are governed by `specs/00-steering/brand-design-system.md`.
- Auth/session and runtime requirements depend on `04-services-and-infrastructure`.
- Capability and effective-access requirements depend on the approved interface from `02-rbac-roles`; this spec does not redefine the RBAC model.
- Connectivity presentation depends on `03-offline-mode-and-client-storage`; this spec does not define offline synchronization.
- This spec touches no `01-core-data-model` tables. If the approved design later requires direct profile/party data reads, those table dependencies must be named explicitly in `design.md` before approval.
