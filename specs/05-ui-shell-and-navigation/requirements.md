# UI Shell & Navigation — Requirements

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## 1. Purpose and scope

The UI shell provides the shared application frame around feature screens in the single-warehouse Hyperion 3PL / Dyna-Serv system. It gives authenticated users a consistent route boundary, navigation surface, page context, account controls, feedback states, and responsive behavior adhering strictly to the unified visual design system (`specs/00-steering/design.md` and `specs/00-steering/ui-ux-design-plan.md`).

The shell does not define receiving, picking, inspection, transfers, billing, pricing, reporting, or other feature workflows. Those remain owned by their feature specifications.

### Terminology Alignment
Across all user-facing shell navigation elements, headers, labels, and documentation:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.
- **Inspection** replaces Daily Inspection.
- **Delivery Receipt / Acknowledgement Receipt** replaces Acknowledgement Receipt (until formal document-name decision).

*(Note: `parties` and `flow_type` remain canonical technical keys in backend schemas and codebases until a data-model amendment is approved.)*

## 2. Users and surfaces

The shell supports three presentation surfaces:

- **Floor surface** — warehouse staff operating portrait handheld scanners. Mobile-first at approximately 375–430px portrait, touch-first, high-contrast, scan-ready, using Level 1 Solid White (`#FFFFFF`) surfaces, and optimized for one obvious next action in the bottom-third thumb zone.
- **Office surface** — supervisors, administrators, and office users on larger screens (`md`/`lg` breakpoints). Employs a White or Cream White sidebar with Deep Navy (`#0F172A`) active text, Slate (`#64748B`) inactive text, Vibrant Blue (`#2563EB`) active indicators, wider containers, tables, and hover affordances, while remaining usable on mobile.
- **Organization Portal surface** — external customer and partner users. Uses identical office-tier composition (`AuthenticatedLayout`, `DesktopSidebar`, mobile drawer) with dedicated "your organization" navigation and framing.

A feature declares its surface when registering a route. The shell must not infer floor behavior from a mutable client role string.

## 3. Requirements

### R1. Protected application entry

1. Unauthenticated users attempting to access a protected route SHALL be sent to the approved sign-in boundary.
2. After successful sign-in, the user MAY return to the originally requested internal route when that route is safe and still authorized.
3. External URLs and malformed return paths SHALL be rejected.
4. The shell SHALL resolve authentication on the server through the approved Supabase Auth/session boundary.
5. Client-side route guards MAY improve interaction but SHALL NOT be the only protection for a route or resource.

### R2. Session and account state

1. The shell SHALL provide an account control with safe display information (display name, email, active Organization scope) from the resolved session.
2. The shell SHALL provide sign-out through the approved Auth integration.
3. Expired, revoked, or inactive sessions SHALL not render protected content after the server detects the condition.
4. An authenticated user with no active usable capability SHALL receive the approved safe empty-access state rather than an unbounded application shell.
5. The shell SHALL never accept a client-supplied role, Organization, or capability value as authoritative.

### R3. Navigation registry

1. Navigation entries SHALL be defined through a typed central registry.
2. Each entry SHALL support, at minimum, a stable route identifier, path, label (using approved terminology: Organization, Inventory Model, Organization Portal, Inspection), navigation group, display order, icon/accessible name, surface (`floor`, `office`, `shared`, `party`), and required capability reference from the `02-rbac-roles` catalog.
3. The registry SHALL support entries that are temporarily unavailable because their feature specification is planned or not approved (`featureStatus: "planned"`).
4. Navigation visibility SHALL be derived from server-provided effective capability context for presentation only.
5. The registry SHALL not be treated as an authorization boundary.
6. The shell SHALL support nested routes, dynamic segments, query strings, and trailing slashes without incorrect active-state matches.
7. The active destination SHALL have a non-color signal such as text weight, indicator line, or selected-state semantics.

### R4. Responsive navigation

1. Office screens SHALL provide the approved desktop sidebar using White or Cream White background, Deep Navy (`#0F172A`) active text, Slate (`#64748B`) inactive text, Vibrant Blue (`#2563EB`) active indicator, and real letter-mark logo asset (no diagonal-cut motif).
2. Floor screens SHALL not reserve persistent desktop sidebar space by default.
3. During an active scan-driven floor flow, navigation SHALL be completely hidden and replaced by a feature-owned flow header with only an exit/cancel action. Bottom tabs appear only between scan steps.
4. Floor navigation SHALL remain fully functional in portrait at the 375–430px base breakpoint without horizontal scrolling.
5. Office navigation SHALL remain usable at narrow mobile widths via a collapsible drawer for supervisor/administrator access.

### R5. Layout and page context

1. Authenticated feature routes SHALL render inside a shared shell layout unless the approved design explicitly declares a standalone surface.
2. The shell layout SHALL enforce solid surfaces: Level 0 Cream White (`#FFF7ED`) base application background and Level 1 Solid White (`#FFFFFF`) cards/modals/panels with subtle shadow `0 1px 2px rgba(15, 23, 42, 0.08)`. Glassmorphism and backdrop blur are strictly prohibited.
3. Shapes SHALL strictly use defined corner radii: `radius-sm` (4px), `radius-default` (8px), `radius-md` (12px), `radius-lg` (16px), and `radius-full` (9999px). Primary buttons use standard rounded corners.
4. The shell SHALL provide a page-header contract supporting title, optional context, optional breadcrumb/back action, and optional feature-owned primary action.
5. The shell SHALL preserve the feature's content hierarchy and SHALL not impose a second competing primary action.
6. Feature specifications SHALL be able to declare floor or office treatment without duplicating global shell markup.
7. The shell SHALL provide stable landmarks for header, navigation, main content, and status/feedback regions.

### R6. Loading, error, and not-found states

1. Protected routes SHALL provide a loading skeleton that preserves layout geometry without exposing stale protected content or delaying scanner input.
2. Route and shell errors SHALL provide a safe, recoverable user-facing state with an explicit 3-component structure:
   - **What happened**: Plain-language error title (e.g., "Invalid Item Scanned", "Connection Lost", "Location Full").
   - **Why it failed**: Brief context or data mismatch details (e.g., "Barcode 12345 does not match active Pick List").
   - **Next Action / Solution**: Unmistakable recovery path (e.g., "Rescan correct item", "Tap to request FIFO override", "Select different putaway location").
3. Unknown or unauthorized routes SHALL use approved not-found/forbidden behavior and SHALL not disclose protected resource existence.
4. Error messages SHALL not expose secrets, access tokens, SQL, stack traces, provider topology, or protected record data. Diagnostic context with a correlation ID SHALL be sent to Sentry.
5. Shell errors SHALL distinguish initial session checking, route loading, retrying, timeout, retry-exhausted, not-found, forbidden, and unexpected-error states.
6. Error recovery SHALL distinguish retryable failures from failures requiring sign-in, an online connection, administrator assistance, or navigation away.

### R7. Floor interaction and accessibility

1. Floor styles SHALL be mobile-first, target 375–430px portrait viewports, and eliminate hover dependencies.
2. Floor primary actions SHALL use Vibrant Blue (`#2563EB`), White text, Glacial Indifference Bold typography, minimum 64px height, and full-width placement in the bottom-third thumb zone.
3. Floor default controls SHALL use at least 56×56px touch targets; office controls SHALL use at least 44×44px touch targets.
4. Floor screens SHALL use no text below 16px (`body-md` minimum) and SHALL meet contrast requirements, including WCAG AAA contrast for time-critical floor content.
5. Typography SHALL strictly follow font family roles: **Etna Sans Serif** (Bold/SemiBold) for primary headings and displays; **Glacial Indifference** (Bold/Regular) for body, UI controls, navigation, labels, badges, and buttons. Legacy/monospaced fonts (Epilogue, Inter, JetBrains Mono) are retired.
6. Every interactive element SHALL expose a 2px visible Vibrant Blue focus ring (`#2563EB`).
7. Status, active, error, and connectivity states SHALL NOT rely on color alone; iconography and clear wording are required.
8. Reduced-motion preferences (`prefers-reduced-motion`) SHALL be respected; no essential shell state may depend on animation.

### R8. Connectivity presentation

1. If the approved offline contract (`03-offline-mode-and-client-storage`) supplies connectivity state, the shell MAY display an informational online/offline indicator.
2. The indicator SHALL distinguish connectivity (`online`, `offline`, `checking`) from synchronization (`idle`, `syncing`, `attention`) and SHALL not claim that data is synchronized without authoritative evidence.
3. The shell SHALL not queue actions, approve work, assign FIFO stock, or make pricing/billing decisions because a user is offline.
4. Unavailable, corrupted, quota-exceeded, or cleared browser storage SHALL be displayed as an explicit storage attention state.
5. An online-required action SHALL provide a clear explanation and recovery path without pretending that the action was queued or completed.

### R9. Downstream feature contract

1. A feature SHALL be able to register its route metadata, shell surface, page metadata, and required capability references through the documented shell contract.
2. Features SHALL own their workflow-specific loading, empty, confirmation, scan-result, and validation states unless explicitly designated shell-global.
3. Features SHALL not define duplicate global navigation, global design tokens, or client-only authorization gates.
4. The shell contract SHALL remain usable by feature specs `06` through `22` (excluding deferred `19`) without requiring feature-specific role-name conditionals.
5. The shell contract SHALL define ownership for global states versus feature-owned states so that features can provide domain recovery states without duplicating global shell behavior.

### R10. Shared list interaction contract

1. Every feature-owned table or list SHALL use the shared row-action, filter, and search contract.
2. Row actions SHALL be derived from effective capabilities and current business state; unauthorized actions SHALL be omitted rather than rendered disabled.
3. The standard filter bar SHALL support exact `16-reporting-and-analytics` fields: date range (`from`, `to`), Organization, Inventory Model, and item/entity. Cross-entity search SHALL preserve RLS boundaries.
4. Filtered and searched results SHALL be produced by authorized server queries; client-side filtering SHALL NOT replace canonical server access predicates.
5. Shared item lists SHALL display `supplier_item_code` for `vmi` and `dsgc_item_number` for `trading` or `supplies`; `dsgc part number` is strictly prohibited.

### R11. General operational landing page (`/`)

1. WHEN an authenticated user completes sign-in with no pending authorized deep link, THE SYSTEM SHALL route the user to `/` as the default landing page.
2. WHEN `/` renders, THE SYSTEM SHALL present the floor summary presentation for floor sessions and office summary presentation for office or Organization Portal sessions.
3. WHEN `/` renders, THE SYSTEM SHALL aggregate read-only summary counts (Receiving, Picking, Transfer, Inspection), Quick Actions, Open Work Queue, Approval monitoring badge with Pending Approval count, Weekly transaction line graph (outgoing qty, sales, CBM), and Monthly outgoing KPI summary.
4. THE SYSTEM SHALL NOT require a capability to view `/`; it is a context-resolved aggregation route.
5. THE SYSTEM SHALL keep `/` distinct from `/reports` (`16-reporting-and-analytics`): `/` SHALL NOT be gated by `reporting.read` and SHALL NOT display financial/margin KPI cards.
6. WHEN `/` renders for an office or Organization Portal session, THE SYSTEM SHALL additionally display a `<ActivityHeatmap>` widget imported from `16-reporting-and-analytics`, gated by `reporting.read` at the widget level. Floor-shell sessions SHALL NEVER render this widget.

### R12. Visual Design System & Brand Identity Compliance

1. All shell surfaces, layouts, components, and downstream screens SHALL strictly consume approved design tokens from `specs/00-steering/design.md` and `ui-ux-design-plan.md`.
2. Color roles SHALL strictly enforce: Primary Vibrant Blue (`#2563EB`), Primary Hover Deep Blue (`#1E3A8A`), Secondary Violet (`#7C3AED`), Neutral Cool Gray (`#94A3B8`), Background Cream White (`#FFF7ED`), Surface Solid White (`#FFFFFF`), Text Primary Deep Navy (`#0F172A`), Text Secondary Slate (`#64748B`), Border Light Blue-Gray (`#E2E8F0`), Success Emerald (`#10B981`), Warning Amber (`#F59E0B`), and Error Red (`#EF4444`).
3. Text copy (headings, body, labels) SHALL use Text Primary (`#0F172A`) or Text Secondary (`#64748B`), NEVER Primary or Secondary brand colors.
4. Design tokens SHALL be defined in `tailwind.config.ts`. No arbitrary or undocumented hex colors are permitted in markup.

## 4. Acceptance criteria

- [ ] A protected deep link redirects safely to sign-in when unauthenticated and returns only when valid and authorized.
- [ ] Typed navigation registry filters presentation entries from effective capabilities while server authorization remains independent.
- [ ] Nested routes show the correct active destination without false matches.
- [ ] Desktop sidebar, narrow office drawer, and floor navigation are usable at 1280px, 768px, 430px, and 375px representative widths.
- [ ] Sidebar uses White/Cream White background, Deep Navy text, Slate inactive text, Vibrant Blue active indicator, and real letter-mark logo asset.
- [ ] Floor shell controls satisfy touch-target (64px primary CTA, 56px default), contrast (AAA time-critical), font-size (16px minimum), focus (2px Vibrant Blue ring), portrait orientation, and no-hover rules.
- [ ] Layout strictly enforces Level 0 Cream White (`#FFF7ED`) base background and Level 1 Solid White (`#FFFFFF`) surfaces. Backdrop blur and glassmorphism are absent.
- [ ] All typography uses Etna Sans Serif (Headings) and Glacial Indifference (Body/UI/Nav/Badges/Buttons). Legacy fonts (Epilogue, Inter, JetBrains Mono) are absent.
- [ ] Error states explicitly display the 3-component structure (What happened, Why it failed, Next Action / Solution).
- [ ] Expired/revoked/inactive sessions cannot continue viewing protected content.
- [ ] Loading, error, not-found, forbidden, sign-out, storage attention, and connectivity states are safe and recoverable.
- [ ] Shared list screens enforce Organization and Inventory Model terminology, capability action omission, exact shared filters, cross-entity search, and RLS-preserving queries.
- [ ] `/` renders the correct per-surface summary for floor, office, and Organization Portal sessions, requires no capability, and embeds the `<ActivityHeatmap>` widget for office sessions holding `reporting.read`.

## 5. Dependencies and exclusions

- Visual and interaction requirements are governed by `specs/00-steering/design.md` and `specs/00-steering/ui-ux-design-plan.md`.
- Auth/session and runtime requirements depend on `04-services-and-infrastructure`.
- Capability and effective-access requirements depend on the approved interface from `02-rbac-roles`.
- Connectivity presentation depends on `03-offline-mode-and-client-storage`.
- General operational landing page (`/`) depends on read-only summary data from `07-incoming-receiving`, `08-outgoing-withdrawal-and-two-stage-commitment`, `11-transfer-and-inspection`, `09-approval-queue`, and `16-reporting-and-analytics` (`<ActivityHeatmap>`).
