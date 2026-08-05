# UI Shell & Navigation — Design

Status: Draft

## 1. Design intent

The shell is a thin, shared frame that makes feature routes discoverable and safe without owning feature business logic. It has one authenticated route boundary, a typed navigation registry, responsive shell variants, and shared page-state conventions.

The design follows the Approved `specs/00-steering/brand-design-system.md`: floor/mobile is the primary interaction target, office/desktop is an enhancement, and no shell component may introduce its own visual tokens.

## 2. Foundational dependencies

This design depends on:

- `00-steering/brand-design-system.md` for colors, typography, spacing, breakpoints, touch targets, surfaces, motion, and accessibility.
- `02-rbac-roles` for the eventual typed effective-capability/session context. That spec is currently unstable, so this design defines an integration boundary rather than final role names or permissions.
- `03-offline-mode-and-client-storage` for an eventual read-only connectivity-status contract. Offline queue behavior is explicitly outside this design.
- `04-services-and-infrastructure` for Supabase SSR Auth clients, session refresh, validated configuration, Sentry, and runtime/security boundaries.

This feature currently touches no tables from `01-core-data-model`. It must not redefine or query `parties`, `items`, `locations`, lots, transactions, or any other core table merely to render navigation. If account display or party scope later requires a direct database read, the exact table names and authorization path must be added here before approval.

## 3. Route and layout architecture

The target App Router structure is:

```text
app/
  (public)/
    sign-in/
    recovery/
  (authenticated)/
    layout.tsx                 # server session boundary + shared shell
    loading.tsx                # authenticated shell loading state
    error.tsx                  # authenticated shell recovery state
    not-found.tsx              # safe scoped not-found state
    page.tsx                   # approved landing destination
    receiving/                 # feature-owned route, once 07 is approved
    ...
  layout.tsx                   # document metadata, fonts, global providers
```

The exact route names remain subject to the route inventory in `requirements.md` and the feature specs. The shell owns the authenticated layout and shared boundaries; each feature owns its route content and workflow state.

The authenticated layout resolves the server session and passes a typed, minimal shell context to client components that need interaction. It must not pass raw access tokens or trust client-provided role/party/capability values.

Middleware may handle only approved lightweight concerns such as session refresh or coarse public/protected routing. It must not perform Drizzle/TCP database work or replace server-side resource authorization.

## 4. Shell composition

```text
AuthenticatedLayout
├── SessionBoundary (server)
├── ShellProvider (minimal client interaction state only)
├── DesktopSidebar (office enhancement)
├── MobileFloorNavigation (floor/portrait mode)
├── AppHeader
│   ├── Brand/Logo (real letter-mark logo, never an icon-font ligature rendered as text; diagonal-cut motif per brand-design-system.md §7 in office contexts)
│   ├── PageHeader slot
│   ├── ConnectivityIndicator (optional, read-only)
│   └── AccountControl
├── StatusRegion
└── MainContent slot
```

`DesktopSidebar` and `MobileFloorNavigation` are alternate presentations of the same navigation registry. They do not independently encode authorization or maintain separate route lists.

`PageHeader` supplies context and optional feature actions but does not force every page to have a button. A floor feature with a scan-driven next action owns that action in its content area so the shell does not create competing primary actions.

## 5. Navigation registry contract

The design calls for one typed registry consumed by both office and floor navigation. Its conceptual shape is:

```ts
type ShellSurface = "floor" | "office" | "shared";

type NavigationEntry = {
  id: string;
  href: string;
  label: string;
  accessibleLabel?: string;
  group: string;
  order: number;
  surface: ShellSurface;
  icon: string;
  capability?: string;
  featureStatus: "available" | "planned" | "disabled";
};
```

This is a design contract, not an instruction to implement the type before approval. The final capability field and effective-context type must be adopted from `02-rbac-roles` rather than invented here.

Registry rules:

- `id` is stable and is used for analytics/tests; it is not a permission.
- `href` is an internal route and is validated before use in redirects.
- `featureStatus: "planned"` supports documenting future routes without rendering a dead link.
- `surface` determines which navigation presentation may show the entry; it does not grant access.
- `capability` is an optional reference to the shared RBAC capability contract, never a role name.
- The server computes presentation context; the client may render from that context but cannot elevate it.
- Active matching uses normalized path segments and explicit dynamic-segment rules, not naive string prefixes.

## 6. Responsive behavior

### Floor/mobile base

- Base styles target 375–430px portrait.
- The shell uses 16px page padding and solid surfaces.
- Persistent desktop navigation is hidden or replaced during active scan flows.
- Primary shell controls meet 64px floor-primary and 56px floor-default touch targets.
- No shell text is below 16px.
- Scanner input readiness belongs to the feature flow; shell decoration must not block it.

### Office enhancement

- `md`/`lg` may introduce sidebar, wider content, multi-column page framing, and office hover affordances.
- The office container follows the approved 1280px maximum width, 32px page margin, and 24px gutter.
- The sidebar uses the approved `brand-navy` background, `brand-red` active-item background, white/70%-opacity inactive labels, Epilogue **SemiBold** 14px labels (never Regular weight), and the real letter-mark logo — never an icon-font ligature rendered as text.
- Narrow office view remains operable; it must not assume a desktop-only viewport.

## 7. Authentication and authorization boundary

The shell consumes a server-resolved context conceptually shaped as:

```ts
type ShellSessionContext = {
  authenticated: true;
  userId: string;
  displayName?: string;
  email?: string;
  capabilities: ReadonlySet<string>;
  status: "active";
};
```

The final fields and capability representation are owned by `02-rbac-roles` and `04-services-and-infrastructure`. This design intentionally does not define user, role, party-scope, or authorization tables.

The enforcement sequence is:

1. Resolve/refresh the Auth session on the server.
2. Resolve current effective access through the approved RBAC boundary.
3. Reject unauthenticated or inactive sessions before protected content renders.
4. Render navigation filtered for usability from the resolved capabilities.
5. Enforce route/resource authorization again at the server action, route handler, or data boundary.

Navigation omission is not security. The shell must never accept `role`, `party_id`, or capability values from query parameters, form fields, or browser storage as authority.

## 8. Shared state boundaries

| State | Owner | Shell responsibility |
|---|---|---|
| Authenticated session | Auth/infrastructure + RBAC | Resolve, protect, display safe identity, sign out |
| Capability authorization | RBAC + server data boundary | Consume typed context; never redefine policy |
| Online/offline signal | Offline spec | Display optional informational status only |
| Feature workflow state | Feature spec | Provide content and workflow-specific feedback |
| Global route loading/error/not-found | Shell/App Router | Provide safe recovery and stable landmarks |
| Scan success/error flash | Floor feature | Avoid duplicate global feedback unless explicitly shared |
| Design tokens | Brand design system | Consume approved tokens only |

## 9. Accessibility and failure design

- Use semantic `nav`, `header`, `main`, and status landmarks.
- Provide an accessible name for icon-only controls and a text-equivalent active state.
- Keep focus visible and restore focus after mobile navigation/drawer changes where applicable.
- Do not rely on hover for any floor action.
- Use safe generic error copy while attaching non-sensitive correlation context to monitoring.
- Use not-found behavior where revealing resource existence could leak scoped data; use the approved forbidden state where a capability failure can be stated safely.
- Respect `prefers-reduced-motion`; animation is never required to understand shell state.

## 10. Integration with downstream specs

Feature specs `06`–`20` should reference this design for:

- route registration and shell surface selection;
- page title/context/back behavior;
- capability references;
- shell loading/error boundaries;
- floor navigation suppression during active scan flows;
- global status and connectivity regions.

They should not copy the sidebar, bottom navigation, Auth guard, global tokens, or shell-level authorization logic.

## 11. Design verification before approval

- [ ] Reconcile the route inventory with the approved feature specs and the Gantt mapping.
- [ ] Replace provisional RBAC references with the approved capability/session contract.
- [ ] Confirm the Auth/session integration against `04-services-and-infrastructure`.
- [ ] Confirm offline indicator semantics against `03-offline-mode-and-client-storage`.
- [ ] Have `design-system-auditor` review floor/office behavior, tokens, contrast, typography, touch targets, and motion.
- [ ] Confirm no `01-core-data-model` table is touched; if that changes, name the tables and update the design dependencies.
- [ ] Reconcile this design with the final `tasks.md` before changing the feature status to `Approved`.
