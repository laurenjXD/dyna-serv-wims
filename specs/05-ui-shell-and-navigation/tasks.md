# UI Shell & Navigation — Implementation Plan

Status: Draft

## Implementation gate

This document is an implementation plan only. No application code, route structure, shared UI component, authentication integration, or navigation configuration may be written until:

- `requirements.md` defines the approved shell, navigation, responsive, accessibility, and failure-state requirements.
- `design.md` cites the foundational dependencies and records the route/layout architecture, session boundary, navigation model, and data contracts.
- `02-rbac-roles` has a stable capability interface for visibility and authorization decisions; this feature must not hard-code the currently flagged role model.
- `04-services-and-infrastructure` has approved the Auth/session and environment boundaries consumed by the shell.
- The tasks below are reconciled against the approved requirements and design.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

Writing or revising this plan and its requirements/design documents is allowed before approval. Creating `/app`, `/components`, or other implementation files is not.

## Scope

The shell is the shared application frame around feature screens: authenticated route protection, responsive layout, brand treatment, global navigation, page header, session/account controls, loading/error/not-found states, and the contracts that downstream feature specs use to mount their screens.

It does not define feature workflows, database tables, business permissions, offline queue behavior, billing, or pricing. Feature specs own their screen content and workflow rules; this spec owns the surrounding frame and navigation contract.

## Dependencies and constraints

- `specs/00-steering/brand-design-system.md` is the visual source of truth and is Approved. Do not define duplicate colors, typography, spacing, motion, or breakpoint tokens here.
- Depends on `01-core-data-model` only for any identity/display references explicitly required by the approved design; do not duplicate its tables or schema definitions.
- Depends on `02-rbac-roles` for the capability-checking interface and effective session context. Since RBAC is flagged for revision, route visibility and active-navigation decisions remain provisional until that contract is approved.
- Depends on `03-offline-mode-and-client-storage` only for the approved online/offline indicator contract; the shell must not enqueue workflow actions or make Tier 2 decisions.
- Depends on `04-services-and-infrastructure` for Supabase Auth SSR/session handling, environment configuration, error monitoring, security headers, and runtime boundaries.
- Downstream specs `06`–`20` consume the shell's route, layout, navigation-item, page-header, feedback, and authorization interfaces rather than reimplementing them.
- Use canonical terms `parties`, `items`, and `locations`; do not introduce `suppliers`, `SKU`, or `bins` as entity or route names.
- There is one warehouse; no `warehouse_id` is added to route parameters, navigation state, or shell APIs.
- Floor-first screens target 375–430px portrait viewports. Office/supervisor screens may enhance at `md`/`lg`, but must remain usable on mobile.

## Open decisions required before approval

These decisions must be resolved in `requirements.md`/`design.md`; the recommended defaults are planning guidance, not approved behavior.

| ID | Decision | Recommended default |
|---|---|---|
| 0A | Route organization | App Router route groups by authenticated area/role, with shared authenticated layout and feature-owned child layouts only where needed. |
| 0B | Unauthenticated entry | A single sign-in/recovery boundary supplied by `04-services-and-infrastructure`; protected routes redirect without leaking the requested resource. |
| 0C | Navigation source | Typed central navigation registry containing route, label, icon, surface (`floor`/`office`), order, and required capability; feature specs reference entries rather than editing the shell ad hoc. |
| 0D | Unauthorized route behavior | Server-side authorization remains authoritative; return the approved forbidden/not-found experience, with client visibility only as usability support. |
| 0E | Floor navigation | Hide or collapse persistent navigation during active scan flows; use a bottom tab bar or feature-owned flow navigation when the approved floor design calls for it. |
| 0F | Session presentation | Show the resolved current account and safe status information from the server session; never trust client-supplied role or party values. |
| 0G | Offline indicator | Display connectivity state only through the shared offline contract; do not expose a misleading “synced” state without authoritative status. |
| 0H | Error reporting | Show safe user-facing error states and send diagnostic context through the approved Sentry boundary without secrets, tokens, or protected record contents. |

## Implementation tasks

### 1. Finalize the shell contract

Testing: Documentation review; no implementation tests.

- [ ] Convert the shell scope into requirements with acceptance criteria for protected entry, navigation, responsive behavior, session controls, loading/error/not-found states, accessibility, and deep links.
- [ ] Inventory all initial routes from the current feature map and mark each as floor, office, or shared; identify routes that must remain placeholders until their feature spec is approved.
- [ ] Define the route-group/layout tree in `design.md`, including which layout owns Auth/session checks and which feature owns page content.
- [ ] Define typed contracts for navigation entries, page headers, breadcrumbs/back behavior, global feedback, account controls, and connectivity status.
- [ ] Define the capability interface consumed by the shell without embedding role names or duplicating the RBAC permission matrix.
- [ ] Define whether feature routes render a shell-level loading/error boundary, a feature boundary, or both.
- [ ] Record unresolved choices and their owners; update `specs/00-steering/revision-log.md` for any cross-feature decision that changes a steering rule.

### 2. Establish the visual and responsive foundation

Testing: Unit tests for token/config contracts; Playwright visual/layout assertions at representative viewports; manual design-system review.

- [ ] Map the approved design-system tokens into the application's Tailwind configuration once the project setup permits implementation.
- [ ] Load only the approved font families and weights through `next/font/google`.
- [ ] Define shared page-width, padding, gutter, focus-ring, and surface utilities using the approved tokens; do not add undocumented hex values or spacing values.
- [ ] Define mobile-first responsive rules: floor defaults at base, `md`/`lg` enhancements for tablets and office layouts, and no desktop-first override pattern.
- [ ] Define solid, high-contrast floor surfaces with no backdrop blur; reserve translucent/blurred Level 1 surfaces for office contexts as specified by the design system.
- [ ] Define press feedback and reduced-motion behavior for shell controls; do not use hover as the floor interaction model.
- [ ] Verify keyboard focus, scanner-as-keyboard navigation, screen-reader names, landmark structure, and contrast at the shell level.

### 3. Implement authenticated route and layout boundaries

Testing: Unit tests for route classification and redirect helpers; E2E tests for authenticated/unauthenticated/deactivated-session paths.

- [ ] Implement the approved server-side session resolution boundary using the `04-services-and-infrastructure` Supabase SSR contract.
- [ ] Protect authenticated route groups before rendering protected content; avoid client-only route guards.
- [ ] Define safe behavior for expired sessions, revoked access, inactive accounts, and authenticated users with no usable capability.
- [ ] Preserve and validate safe post-login return paths for deep links; reject external/open-redirect targets.
- [ ] Keep server-only Auth/configuration modules out of client bundles.
- [ ] Ensure middleware is limited to approved lightweight concerns and does not perform unsupported database/Drizzle work.
- [ ] Add shell-level correlation/error context through the approved monitoring boundary without logging credentials, tokens, or protected data.

### 4. Implement the navigation system

Testing: Unit tests for registry filtering, ordering, active-route matching, and capability handling; E2E tests for navigation and deep links.

- [ ] Implement the typed central navigation registry after the capability contract is approved.
- [ ] Support navigation groups/sections and a single active destination without relying on color alone.
- [ ] Resolve visible entries from the server-provided authorization context; treat the registry as presentation metadata, not authorization.
- [ ] Implement active-route matching that handles nested feature routes, query strings, trailing slashes, and dynamic segments without false matches.
- [ ] Implement desktop sidebar behavior using the approved brand-navy/brand-red treatment and real logo asset contract.
- [ ] Implement the mobile/floor navigation mode: bottom tab bar or hidden navigation during an active scan flow, as selected in the design.
- [ ] Define behavior when a user lands directly on a route that is not in the current navigation surface but is otherwise authorized.
- [ ] Define and test navigation behavior when a capability is revoked while the shell is open.

### 5. Implement shared shell controls and feedback states

Testing: Unit tests for state/formatting helpers; E2E tests for keyboard and touch interactions; manual accessibility review.

- [ ] Implement the page header contract for title, context, optional breadcrumb/back action, and one primary action where the feature owns one.
- [ ] Implement account/session controls with safe identity display, sign-out, and approved recovery/settings links.
- [ ] Implement shell-level loading states that preserve layout stability and do not delay floor scanner readiness.
- [ ] Implement safe `error` and `not-found` boundaries with recovery actions appropriate to the route context.
- [ ] Implement global success/error/scan-feedback presentation only where it does not duplicate feature-owned floor flash behavior.
- [ ] Implement the shared connectivity indicator only after the offline contract is approved; it must be informational and must not make offline Tier 2 actions appear available.
- [ ] Ensure all controls meet the approved 44px office and 56px/64px floor touch-target requirements.

### 6. Publish downstream integration guidance

Testing: Type-check/build contract; E2E smoke coverage for representative floor and office routes.

- [ ] Document how a feature registers a route, chooses its shell surface, supplies page metadata, and declares required capabilities.
- [ ] Document how feature layouts opt into floor mode and how active scan flows suppress or replace persistent navigation.
- [ ] Document the boundary between shell-owned and feature-owned loading, error, empty, confirmation, and scan-result states.
- [ ] Add representative integration examples for one floor route and one office route without implementing those feature workflows.
- [ ] Add a contract check preventing feature code from defining duplicate global nav, shell tokens, or client-only authorization gates.
- [ ] Update `specs/00-steering/gantt-mapping.md` after this spec's status changes; the receiving UI row should reference the approved shell contract rather than implying that the shell itself implements receiving.

## Testing matrix

### Unit tests (Vitest)

- [ ] Route classification and safe return-path validation.
- [ ] Navigation registry schema, ordering, grouping, active matching, and capability-based visibility.
- [ ] Page-header and shell-state contracts.
- [ ] Responsive/surface metadata that controls floor versus office treatment.

### Integration tests

- [ ] Verify the shell consumes the approved Supabase session boundary and fails closed for missing, expired, revoked, and inactive sessions.
- [ ] Verify server-provided capability context drives presentation while protected route/resource authorization remains server-side.
- [ ] If the shell directly touches RLS-protected data, run the required real-Postgres integration tests through the complete migration chain; otherwise record DB integration as not applicable.

### E2E tests (Playwright)

- [ ] Unauthenticated user is redirected to sign-in and returned safely to an allowed deep link.
- [ ] Authenticated users see only the navigation entries allowed by their effective capabilities.
- [ ] Direct navigation to an authorized nested route works; unauthorized or unknown routes show the approved safe state.
- [ ] Desktop sidebar and mobile/floor navigation render at 375px, 430px, 768px, and 1280px representative widths.
- [ ] Floor navigation meets touch-target, portrait, focus, contrast, and no-hover interaction requirements.
- [ ] Office navigation remains usable on a narrow viewport and retains keyboard navigation.
- [ ] Session expiry/revocation removes access without exposing protected content.
- [ ] Loading, error, not-found, sign-out, and connectivity states are recoverable and do not leak sensitive details.
- [ ] Respect `prefers-reduced-motion` and verify no shell interaction depends on animation.

### Manual QA

- [ ] Run the design-system audit against `brand-design-system.md`.
- [ ] Verify the real logo asset, font rendering, focus visibility, touch behavior, and contrast on representative desktop and mobile browsers.
- [ ] Physical warehouse hardware QA is deferred to the project-wide pre-launch pass unless this feature introduces hardware-specific behavior beyond simulated scanner keyboard input.

## Sign-off

- [ ] Requirements and design are complete and internally consistent.
- [ ] All applicable testing layers above pass, with non-applicable layers explicitly justified.
- [ ] `rbac-rls-reviewer` confirms the shell does not substitute client-side visibility for authorization.
- [ ] `design-system-auditor` confirms floor/office rules, typography, tokens, touch targets, contrast, and motion are followed.
- [ ] Product owner approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
