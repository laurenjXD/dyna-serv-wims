# UI Shell & Navigation — Implementation Plan

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## Implementation gate

This document is an implementation plan only. No application code, route structure, shared UI component, authentication integration, or navigation configuration may be written until:

- `requirements.md` defines the approved shell, navigation, responsive, accessibility, and failure-state requirements.
- `design.md` cites foundational dependencies and records the route/layout architecture, session boundary, navigation model, visual design tokens, and data contracts.
- `02-rbac-roles` has an approved capability interface for visibility and authorization decisions.
- `04-services-and-infrastructure` has approved Auth/session and environment boundaries consumed by the shell.
- The tasks below are reconciled against the approved requirements and design.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

Writing or revising this plan and its requirements/design documents is fine before approval. Creating `/app`, `/components`, or other implementation files is not permitted until sign-offs are complete.

## Scope

The shell is the shared application frame around feature screens: authenticated route protection, responsive layout, brand design system treatment, global navigation, page header, session/account controls, the complete global state catalog, and contracts downstream feature specs use to mount their screens.

It enforces approved user-facing UI labels across all screens: **Organization** (replaces Party), **Inventory Model** (replaces Flow Type), **Organization Portal** (replaces Party Portal), **Inspection** (replaces Daily Inspection), and **Delivery Receipt / Acknowledgement Receipt** (replaces Acknowledgement Receipt). Technical backend identifiers (`parties`, `flow_type`) remain unchanged until database schema amendments occur.

## Dependencies and constraints

- `specs/00-steering/design.md` and `specs/00-steering/ui-ux-design-plan.md` are the visual and interaction sources of truth and are Approved. Do not define duplicate colors, typography, spacing, motion, or breakpoint tokens.
- Depends on `01-core-data-model` only for identity/display references explicitly required by the approved design; do not duplicate schema definitions.
- Depends on `02-rbac-roles` capability-checking interface and effective session context.
- Depends on `03-offline-mode-and-client-storage` for read-only online/offline indicator contract.
- Depends on `04-services-and-infrastructure` for Supabase Auth SSR/session handling, environment configuration, error monitoring, security headers, and runtime boundaries.
- Downstream specs `06`–`22` consume shell contracts rather than reimplementing them.

## Open decisions required before approval

| ID | Decision | Recommended default | Selected |
| --- | --- | --- | --- |
| 0A | Route organization | App Router route groups by authenticated area/role, with shared authenticated layout. | **Confirmed: App Router route groups (`(authenticated)`).** Session resolution handled once at layout level. |
| 0B | Unauthenticated entry | Single sign-in/recovery boundary supplied by `04-services-and-infrastructure`. | **Confirmed: Single sign-in boundary from `04`.** Deep links validated and preserved across auth redirect. |
| 0C | Navigation source | Typed central navigation registry containing route, label, icon, surface (`floor`/`office`/`party`), order, and required capability. | **Confirmed: Typed central registry.** Single source of truth using approved terminology (Organization, Inventory Model, Organization Portal, Inspection). |
| 0D | Unauthorized route behavior | Server-side authorization remains authoritative; hide unauthorized nav entries. | **Confirmed: Server-authoritative with hidden-not-disabled nav.** Unauthorized links omitted from presentation entirely. |
| 0E | Floor navigation | Hide navigation during active scan flows; use bottom tab bar between steps. | **Confirmed: Hidden nav during active scan loops, bottom tabs between steps.** Full-width 64px Vibrant Blue CTA in thumb zone. |
| 0F | Session presentation | Display server-resolved current account, email, and Organization scope. | **Confirmed: Server-resolved display only.** No client-supplied identity claims trusted. |
| 0G | Offline indicator | Display connectivity state read-only through `03` contract; hide when contract absent. | **Confirmed: Consume `03` contract read-only.** |
| 0H | Error reporting | Display safe 3-component user-facing error states (What, Why, Next Action) and send Sentry correlation ID. | **Confirmed: Mandatory 3-component error feedback.** |

## Implementation tasks

### 1. Finalize the shell contract

Testing: Documentation review; no implementation tests.

- [x] Convert shell scope into requirements with acceptance criteria for protected entry, navigation, responsive behavior, session controls, loading/error/not-found states, accessibility, and deep links.
- [x] Inventory all initial routes from the feature map and mark each as floor, office, shared, or party (Organization Portal).
- [x] Enforce approved user-facing UI labels across all contract definitions: Organization, Inventory Model, Organization Portal, Inspection, Delivery Receipt / Acknowledgement Receipt.
- [x] Define route-group/layout tree in `design.md`, specifying layout session boundaries and feature route mounting points.
- [x] Define typed contracts for navigation entries, page headers, breadcrumbs/back behavior, global feedback, account controls, and connectivity status.
- [x] Define capability interface consumed by the shell without embedding role names or duplicating the RBAC matrix.
- [x] Record unresolved choices and update `specs/00-steering/revision-log.md`.

### 2. Establish the visual and responsive foundation

Testing: Unit tests for token/config contracts; Playwright visual assertions at 375px, 430px, 768px, 1280px; manual design-system review.

- [ ] Map approved design-system tokens into `tailwind.config.ts`: Primary (`#2563EB`), Primary Hover (`#1E3A8A`), Secondary (`#7C3AED`), Neutral (`#94A3B8`), Background (`#FFF7ED`), Surface (`#FFFFFF`), Text Primary (`#0F172A`), Text Secondary (`#64748B`), Border (`#E2E8F0`), Success (`#10B981`), Warning (`#F59E0B`), Error (`#EF4444`).
- [x] Load **Etna Sans Serif** (Bold/SemiBold for headings) and **Glacial Indifference** (Bold/Regular for body/UI/nav/buttons/badges). Ensure legacy/monospaced fonts (Epilogue, Inter, JetBrains Mono) are completely retired. (Neither font is on Google Fonts — loaded via `next/font/local` from `app/fonts/` instead of `/google` as originally written here; `app/layout.tsx` updated, `var(--font-inter)` swapped to `var(--font-glacial)` in the 4 recharts components that referenced it, production build verified. Only one Etna weight file was supplied — it currently backs both the 600 and 700 weight requests until a dedicated SemiBold file is provided.)
- [ ] Define solid Level 0 Cream White (`#FFF7ED`) base background and Level 1 Solid White (`#FFFFFF`) surface utilities with subtle shadow `0 1px 2px rgba(15, 23, 42, 0.08)`. Strictly eliminate backdrop blur and glassmorphism across all components.
- [ ] Define shape and corner radius tokens: `radius-sm` (4px), `radius-default` (8px), `radius-md` (12px), `radius-lg` (16px), and `radius-full` (9999px). Primary buttons use standard rounded corners (diagonal cuts strictly prohibited).
- [ ] Define mobile-first responsive rules: floor defaults at 375–430px portrait base breakpoint, `md`/`lg` enhancements for desktop/office layouts.
- [ ] Define touch-target minimums: 64px height full-width floor primary CTA (positioned in bottom-third thumb zone), 56×56px floor default controls, 44×44px office controls.
- [x] Ensure no text below 16px (`body-md` minimum) is rendered on floor screens.
- [ ] Verify 2px visible Vibrant Blue (`#2563EB`) focus ring on all interactive elements, keyboard/scanner-as-keyboard navigation, screen-reader landmarks, and AAA contrast for time-critical floor content.

### 3. Implement authenticated route and layout boundaries

Testing: Unit tests for route classification and redirect helpers; E2E tests for authenticated/unauthenticated/deactivated-session paths.

- [ ] Implement server-side session resolution boundary using `04-services-and-infrastructure` Supabase SSR contract.
- [ ] Protect authenticated route groups before rendering protected content; reject client-only guards as authorization.
- [ ] Define safe behavior for expired sessions, revoked access, inactive accounts, and users with zero active capabilities.
- [ ] Preserve and validate safe post-login return paths for deep links; reject external/open-redirect targets.
- [ ] Ensure middleware is limited to approved lightweight concerns and does not perform TCP/Drizzle database queries.
- [ ] Attach Sentry diagnostic context with correlation ID to shell errors without logging credentials, tokens, or record contents.

### 4. Implement the navigation system

Testing: Unit tests for registry filtering, ordering, active-route matching, and capability handling; E2E tests for navigation and deep links.

- [ ] Implement typed central navigation registry using approved terminology (Organization, Inventory Model, Organization Portal, Inspection).
- [ ] Implement desktop sidebar using White or Cream White background, Deep Navy (`#0F172A`) active text, Slate (`#64748B`) inactive text, Vibrant Blue (`#2563EB`) active indicator line, Glacial Indifference Bold 14px labels, and real letter-mark logo asset (no diagonal cut). (Logo piece done 2026-08-16 — `public/logo.svg` wired into both `ShellChrome.tsx` mobile header and `ShellNavigation.tsx` sidebar, confirmed no diagonal-cut motif. Known follow-up, not blocking: the file is a 1.8MB base64-raster-in-SVG, not true vector — a real vector export is pending from the user. Box stays unchecked: "active indicator line" was flagged earlier this session as a full pill background rather than a distinct line, still unverified/unresolved.)
- [ ] Implement Organization Portal (`"party"`) surface navigation with dedicated Organization Portal entries and explicit "your organization" framing.
- [x] Implement mobile/floor navigation: bottom tab bar between steps, completely hidden navigation during active scan loops.
- [ ] Resolve visible entries from server-provided capability context; hide unauthorized entries rather than greying them out.
- [ ] Implement active-route matching for nested routes, query strings, trailing slashes, and dynamic segments.

### 5. Implement shared shell controls and feedback states

Testing: Unit tests for state/formatting helpers; E2E tests for keyboard and touch interactions; manual accessibility review.

- [ ] Implement page header contract for title, context, optional breadcrumb/back action, and optional feature-owned primary action.
- [x] Implement account controls with safe display (displayName, email, Organization scope) and Sign Out action.
- [ ] Implement shell loading skeletons preserving layout geometry without delaying scanner input.
- [x] Implement mandatory 3-component error feedback structure (**What happened**, **Why it failed**, **Next Action / Solution**) for all shell error, not-found, forbidden, and timeout boundaries.
- [ ] Implement distinct forbidden, timeout, retrying, session-checking, sign-out transition, storage attention, and online-required states.
- [x] Implement read-only connectivity indicator (`online`, `offline`, `checking`) and synchronization status (`idle`, `syncing`, `attention`) via `03` contract. (Connectivity half implemented now — `lib/shell/use-connectivity.ts` + desktop/mobile indicators. Synchronization half deliberately deferred: `lib/offline/index.ts` is still a placeholder with no real Tier 1 queue, and R8.2 forbids claiming sync state without authoritative evidence — will complete once `03-offline-mode-and-client-storage`'s queue exists.)
- [ ] Ensure all controls satisfy 64px floor primary CTA, 56px floor default, and 44px office touch-target requirements.

### 6. Publish downstream integration guidance

Testing: Type-check/build contract; E2E smoke coverage for representative floor and office routes.

- [x] Document how feature specs register routes, select surfaces (`floor`, `office`, `shared`, `party`), supply metadata, and declare required capabilities.
- [x] Document floor navigation suppression during active scan flows.
- [x] Document boundary between shell-owned states and feature-owned states.
- [ ] Add representative integration examples for one floor route (`/receiving`) and one office route (`/inventory`).
- [ ] Publish and exercise **Shared Table-Action and Filter/Search Contract**: capability/row-state action omission, Organization and Inventory Model filters, cross-entity search, and flow-based item code display (`supplier_item_code` for VMI, `dsgc_item_number` for Trading/Supplies).

### 7. Implement the general operational landing page (`/`)

Testing: Unit and E2E tests for `/` rendering under floor, office, and Organization Portal sessions.

- [x] Register `/` as default post-login destination, capability `none`, surface `shared`. (Confirmed already satisfied: `lib/shell/registry.ts`'s `root` entry.)
- [x] Implement floor summary presentation: greeting, "TODAY" task-count summary card (Receiving, Picking, Inspection counts), Quick Actions list, one full-width open-work-queue CTA. (Implemented as a richer 4-card Shift Overview — Open WRRs/Active Picks/Pending Transfers/Open Inspections — superseding the simpler 3-count shape; confirmed decision, see revision-log.)
- [x] Implement office & Organization Portal presentation: per-queue summary cards (Receiving, Picking, Inspection, open/today counts), Recent Activity feed, Approval monitoring badge with Pending Approval count, Weekly transaction line graph (outgoing qty, sales, CBM), and Monthly outgoing KPI summary. (Weekly graph ships with quantity + CBM series only — "sales" deliberately deferred until `12`/`13` billing/pricing backend exists; confirmed decision.)
- [x] Implement office-surface-only `<ActivityHeatmap>` widget imported from `16-reporting-and-analytics`, gated by `reporting.read` at widget level; omit entirely for floor sessions and sessions lacking `reporting.read`. (Confirmed already satisfied: `HomeDashboardHeatmapSection`, gated by `hasReportingAccess`.)
- [x] Verify `/` never displays financial/margin KPI cards (reserved for `/reports`). (Fixed this session: Low Stock Items card was gated on the wrong capability, `reporting.financial_read` instead of `reporting.read` — corrected and design-system-auditor verified PASS.)

## Testing matrix

### Unit tests (Vitest)
- [ ] Route classification and safe return-path validation.
- [ ] Navigation registry filtering, active matching, and capability-based visibility.
- [ ] Page-header, account control, and 3-component error state formatting.
- [ ] Responsive/surface metadata driving floor vs office vs party treatment.

### Integration tests
- [ ] Verify shell consumes Supabase session boundary and fails closed for missing/expired/revoked sessions.
- [ ] Verify server capability context drives presentation while server authorization remains independent.

### E2E tests (Playwright)
- [ ] Unauthenticated user redirected to sign-in and returned safely to allowed deep link.
- [ ] Authenticated users see only navigation entries permitted by effective capabilities.
- [ ] Desktop sidebar, narrow office drawer, and floor navigation render correctly at 375px, 430px, 768px, and 1280px.
- [ ] Sidebar uses White/Cream White background, Deep Navy text, Slate inactive text, Vibrant Blue active indicator line, and real letter-mark logo asset.
- [ ] Floor navigation meets touch-target (64px CTA, 56px default), contrast (AAA time-critical), font-size (16px minimum), focus (2px Vibrant Blue ring), portrait, and no-hover requirements.
- [ ] Error states explicitly display 3-component structure (What happened, Why it failed, Next Action / Solution).
- [ ] `/` renders correct per-surface summary for floor, office, and Organization Portal sessions, embedding `<ActivityHeatmap>` only for office sessions holding `reporting.read`.

### Manual QA
- [ ] Run design-system audit against `specs/00-steering/design.md` and `ui-ux-design-plan.md`.
- [ ] Verify real logo asset, Etna Sans Serif and Glacial Indifference font rendering, focus rings, touch targets, and contrast on desktop and mobile browsers.

## Sign-off

- [x] Requirements, design, and tasks complete and internally consistent after visual design system alignment.
- [x] Documentation-level verification passes.
- [x] `rbac-rls-reviewer` confirms shell does not substitute client visibility for authorization.
- [x] `design-system-auditor` confirms floor/office rules, typography (Etna Sans Serif + Glacial Indifference), tokens (`#2563EB`, `#FFF7ED`, `#FFFFFF`, `#0F172A`, `#64748B`), touch targets, solid surfaces, 3-component error feedback, and motion compliance.
- [x] Product owner approval — Name: User / System Date: 2026-08-14
- [x] Second approver approval — Name/Role: User / System (auto-sign-off per standing instruction) Date: 2026-08-14
