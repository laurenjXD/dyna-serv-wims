# UI Shell & Navigation — Design

Status: Under Revision
Updated: 2026-08-06

## 1. Design intent

The shell is a thin, shared frame that makes feature routes discoverable and safe without owning feature business logic. It has one authenticated route boundary, a typed navigation registry, responsive shell variants, and shared page-state conventions.

The design follows the Approved `specs/00-steering/brand-design-system.md`: floor/mobile is the primary interaction target, office/desktop is an enhancement, and no shell component may introduce its own visual tokens.

## 2. Foundational dependencies

This design depends on:

- `00-steering/brand-design-system.md` for colors, typography, spacing, breakpoints, touch targets, surfaces, motion, and accessibility.
- `02-rbac-roles` for the approved typed effective-capability/session context. This design consumes the capability interface without defining role names or permissions.
- `03-offline-mode-and-client-storage` for the approved read-only connectivity/synchronization-status contract. Offline queue behavior is explicitly outside this design.
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

### 3.2 Route inventory

The table below lists every authenticated route planned at launch. Each route names the presentation surface, the required capability key from the `02-rbac-roles` stable catalog, the owning feature spec, and whether it ships at launch or is planned for a later delivery. Capability keys use the format `resource.action` exactly as defined in `02` §3.2; no provisional or invented keys appear here.

| Path | Surface | Required capability | Feature spec | Launch status |
| --- | --- | --- | --- | --- |
| `/receiving` | floor | `receiving.view` | `07-incoming-receiving` | Launch |
| `/receiving/[wrr_id]` | floor | `receiving.view` | `07-incoming-receiving` | Launch |
| `/inventory` | office | `inventory.read` | `08-outgoing-withdrawal-and-two-stage-commitment` | Launch |
| `/inventory/pick-list/new` | office | `pick_list.generate` | `08-outgoing-withdrawal-and-two-stage-commitment` | Launch |
| `/inventory/pick-list/[pick_list_id]` | floor | `pick_list.execute` | `08-outgoing-withdrawal-and-two-stage-commitment` | Launch |
| `/inspection` | shared | `inspection.perform` | `07-incoming-receiving`, `08-outgoing-withdrawal-and-two-stage-commitment`, `11-transfer-and-inspection` | Launch |
| `/inspection/[inspection_id]` | floor | `inspection.perform` | `07-incoming-receiving`, `08-outgoing-withdrawal-and-two-stage-commitment`, `11-transfer-and-inspection` | Launch |
| `/dispatch/[pick_list_id]` | floor | `dispatch.execute` | `08-outgoing-withdrawal-and-two-stage-commitment` | Launch |
| `/documents` | office | `documents.read` | `10-pick-list-and-acknowledgement-receipt` | Launch |
| `/approvals` | office | `fifo_override.approve` | `09-approval-queue` | Launch |
| `/sync` | floor | none | `03-offline-mode-and-client-storage` | Launch (when offline feature enabled) |
| `/transfers` | shared | `transfers.read` | `11-transfer-and-inspection` | Launch |
| `/parties` | office | `parties.manage` | `06-party-and-item-enrollment` | Launch |
| `/items` | office | `items.manage` | `06-party-and-item-enrollment` | Launch |
| `/reports` | office | `reporting.read` | `16-reporting-and-analytics` | Planned |
| `/portal` | party | none | `22-parties-portal` | Planned |
| `/portal/inventory` | party | `reporting.read` | `22-parties-portal` | Planned |
| `/portal/orders` | party | `pick_list.read` | `22-parties-portal` | Planned |
| `/portal/documents` | party | `documents.read` | `22-parties-portal` | Planned |
| `/portal/notifications` | party | `notifications.read` | `22-parties-portal` | Planned |
| `/portal/labels` | party | `shipment_labels.generate` | `22-parties-portal` | Planned |

**Added 2026-08-06**, resolving `22-parties-portal`'s open shell-architecture item: these six rows are `22`'s routes, rendered on the `"party"` surface (§5). All are `Planned` rather than `Launch` because `22-parties-portal` itself remains `Draft`. Notes on individual rows, kept out of the table cells to match this table's existing one-bare-key-per-row format:

- `/portal`: `none` because it is a context-resolved landing page — it aggregates several reads (each individually gated by its own capability below) rather than being gated by one capability itself, the same reasoning already applied to `/sync`'s `none` entry above.
- `/portal/inventory`: gated by `reporting.read` for the embedded party analytics; the underlying VMI `lot_location_balances` read itself has no separately catalogued resource key of its own — it is authorized directly by `02` §7.4's RLS pattern, not a second capability check, per `22` design.md §4.
- `/portal/documents`: gated by `documents.read` for pick-list/acknowledgement-receipt access; VMI billing statement access on the same route additionally requires `vmi_statements.read` — two capabilities on one route, the same pattern `/inspection` uses for multi-spec ownership, expressed here as a second required check rather than a second table row since both live under one path.
- `/portal/labels`: `Planned` status is additionally blocked pending `22` R11.11's four dependent specs' approval processes (`02`'s capability approval, `01`/`07`'s schema-amendment process, `07`'s formal flow adoption, `18`'s 1D-decode amendment) — a stronger block than the ordinary `Planned` (= "spec not yet Approved") meaning used elsewhere in this column.
- `vmi_statements.read`, `reporting.read` (`assigned_party` row), and `shipment_labels.generate` are catalog additions in `02` design.md §3.2/§7.4, themselves pending `02`'s own approval/sign-off process — the same "written, not yet verified" distinction already applied elsewhere in this table's capability-key sourcing. §5's canonical resource-key table below has been extended to include all three, marked with the same pending status.

Rules:

- A route with `featureStatus: "planned"` in the navigation registry renders no live link until its owning spec is Approved. The shell supports this without dead routes appearing in production navigation.
- Surface assignments are binding: a floor route cannot adopt office layout behavior without an explicit spec amendment.
- The `/sync` route carries no required capability because it is a connectivity-attention surface, not a data-access gate. Its visibility is controlled by whether the offline feature is enabled at the application level, not by the user's capability set.
- Capability keys will not change once `02-rbac-roles` is Approved; this table must be updated in lockstep with any `02` catalog amendment.

### 3.3 Floor versus office shell behavior and outbound flow model

**Outbound flow — no withdrawal request.** The outbound workflow in this system does not use a withdrawal-request document that later becomes a pick list. An office user selects items directly from Master Inventory (`/inventory`), the system performs FIFO/FEFO allocation, and a committed pick list is generated directly (`/inventory/pick-list/new` → `pick_list.generate`). If the FIFO/FEFO allocation requires a non-standard lot, a FIFO override request is raised and must be approved through `/approvals` before the pick list is generated. The floor user then executes the committed pick list at `/inventory/pick-list/[pick_list_id]` (`pick_list.execute`). There is no intermediate "withdrawal request" state, no route for it, and no navigation entry for it. The shell must never introduce a route or navigation label that implies a withdrawal-request model.

**Surface routing rules:**

| Route | Floor-only | Office-only | Shared | Party |
| --- | --- | --- | --- | --- |
| `/receiving`, `/receiving/[wrr_id]` | ✓ | | | |
| `/inventory`, `/inventory/pick-list/new` | | ✓ | | |
| `/inventory/pick-list/[pick_list_id]` | ✓ | | | |
| `/inspection`, `/inspection/[inspection_id]` | | | ✓ (floor-first layout) | |
| `/dispatch/[pick_list_id]` | ✓ | | | |
| `/documents` | | ✓ | | |
| `/approvals` | | ✓ | | |
| `/sync` | ✓ | | | |
| `/transfers` | | | ✓ (floor-first layout) | |
| `/parties`, `/items` | | ✓ | | |
| `/reports` | | ✓ | | |
| `/portal`, `/portal/inventory`, `/portal/orders`, `/portal/documents`, `/portal/notifications`, `/portal/labels` | | | | ✓ (added 2026-08-06 — office-tier composition per the "party" bullet below, distinct column since `"party"` is its own `ShellSurface` value, not a relabeled `"office"`) |

**Shell adaptation by surface:**

- **Floor routes** use the mobile-first single-column layout at 375–430px. The persistent desktop sidebar is not rendered. During an active scan flow (e.g. a WRR scan loop, a pick-list scan loop), the navigation is fully hidden and replaced by a feature-owned flow header with only an exit/cancel affordance. Bottom tab navigation appears only when the user is between scan steps, not during an active scan. Floor primary actions are 64px minimum height, full-width, positioned in the bottom third of the viewport per `brand-design-system.md` §3.
- **Office routes** use the sidebar on `md`/`lg` breakpoints. The sidebar shows `brand-navy` background, `brand-red` active item, Epilogue SemiBold 14px labels. At narrow mobile widths the sidebar collapses to a hamburger/drawer; the route must remain fully operable without the persistent sidebar.
- **Shared routes** use floor-first layout and touch targets as the default. They may use the sidebar enhancement on `lg` viewports only if the feature spec explicitly declares it. When in doubt, a shared route uses floor defaults — it is always safer to over-target the floor user than to assume office context.
- **Navigation hidden during scan flows:** when a floor feature activates a scan flow, it sets a shell flag that hides the bottom tab bar and replaces it with a minimal flow-control strip. The flag is owned by the feature's route layout, not by individual components, so navigation cannot accidentally reappear mid-scan.
- **`"party"` routes (added 2026-08-06):** use the identical shell composition as `"office"` routes — same `AuthenticatedLayout` tree (§4), same `DesktopSidebar`/mobile-drawer behavior, same office-tier contrast/touch-target rules (per `22-parties-portal` requirements.md R9, this is explicitly not a floor/scan surface). No new shell component is introduced for `"party"`; only the `NavigationEntry` set resolved for a `party_user` session differs, per the existing capability-filtering rule above.

### 3.4 Application state catalog

The shell owns the following complete global state inventory. Feature-specific
states remain owned by the feature and are mounted inside the shell's stable
landmarks. Every global state has a text signal, accessible status semantics,
and a safe recovery path where applicable.

| State | Trigger / condition | Shell behavior | Key constraints |
| --- | --- | --- | --- |
| **Session checking** | Initial request or navigation is resolving whether a session exists | Render a minimal non-sensitive boundary or loading shell; never render protected content optimistically | Must not flash protected content or claim the user is signed in before server resolution |
| **Revoked session** | Server detects expired, revoked, or deactivated session on any protected request | Immediately redirect to the sign-in boundary; no protected content is rendered after the server detects revocation; session tokens cleared from server-side storage; client receives only the redirect response | The shell must not render a single byte of protected content after revocation; a brief flash of protected UI while the redirect fires is a failure; server must invalidate before the client can observe the session as active |
| **Deep link** | User follows an inbound link to a protected route while unauthenticated or while their session has lapsed | Preserve the destination path in a server-validated, signed or server-session-stored parameter across the auth redirect; after successful sign-in, return to the preserved destination only if it is an internal route and the user currently holds the required capability; reject external URLs, open-redirect patterns, and routes to which the re-authenticated user lacks access | Deep-link preservation is a usability feature, not a security feature; the destination must be re-authorized on arrival, not trusted because it was set before sign-in |
| **Sign-out transition** | User requests sign-out, Auth confirms it, or the Auth operation fails | Disable duplicate submission while pending; on success clear protected client state and return to sign-in; on failure show safe retry copy without claiming sign-out completed | A failed sign-out must not silently erase the server session or claim completion |
| **Loading** | Authenticated route is resolving session, capabilities, or initial data | Render a skeleton that preserves the expected layout geometry (sidebar width, header height, page region shapes); do not show stale cached content as if it were current; do not delay floor scanner readiness with full-screen blocking spinners | Loading skeletons are layout placeholders only; they must not contain real data from a previous render; the shell loading state (for the layout itself) is distinct from a feature's data-loading state — features own the latter |
| **Retrying** | A transient shell or route request is being retried | Preserve stable landmarks, show non-blocking retry status, and prevent duplicate retries | Retry count and delay are bounded; the user can cancel or leave |
| **Timeout / retry exhausted** | A request exceeds its time budget or bounded retries fail | Show whether retry or navigation is available; provide Retry, Back/Home, or Sign out as appropriate | Do not spin indefinitely or convert timeout into empty/success |
| **Error** | Unhandled exception in the authenticated shell layout or a route boundary | Render a safe recovery surface with one of: retry the current route, return to the home landing, or sign out; no stack traces, SQL, access tokens, connection strings, provider hostnames, or protected record data may appear in the user-facing error; send redacted diagnostic context with a correlation ID to the approved Sentry boundary | Error surfaces must work without JavaScript (the shell error page is a server component); the recovery action must be meaningful — "something went wrong" with no action is not recoverable |
| **Not found** | Route/resource does not exist, or existence must not be disclosed | Render safe not-found copy with Back/Home; do not expose identifiers or lookup details | Must remain distinct from forbidden internally even when public copy is similar |
| **Forbidden** | A known route/resource is unavailable to the authenticated user and disclosure is safe | Render safe forbidden copy with Back/Home or support path; do not offer a client-side bypass | Server authorization remains authoritative; nav omission is not sufficient |
| **Empty** | Authenticated user whose server-resolved capability set is empty — no accessible route or capability is available | Render a safe landing that confirms their identity, states that no access is currently configured for their account, and provides a support contact or administrator contact path; do not render the full navigation shell with every item disabled or hidden | An empty-capability user must not see the navigation chrome populated with locked items; the shell's empty-access state is distinct from a feature's empty-data state (e.g. no pick lists yet) |
| **Stale** | Cached navigation context, session claims, or capability data may not reflect current server state — e.g. after a capability has been revoked between page loads but before the next server-resolved request | Display an explicit indicator in the shell status region that the displayed navigation may not reflect current access; do not silently show stale navigation as if it were current; prompt the user to reload or wait for the next server request to refresh capability context | Stale state is detected only by the server — the client cannot reliably know its own staleness; when in doubt, the shell must re-resolve on the next navigation rather than trusting a client-side capability cache beyond the current server request |
| **Connectivity** | The approved `03` contract supplies connectivity status | Display `online`, `offline`, or `checking`; hide the indicator when the contract is absent/uninitialized rather than assuming online | Connectivity is not synchronization and does not change route/action authorization |
| **Synchronization** | The approved `03` contract supplies sync status | Display `idle`, `syncing`, or `attention`; link attention to the owning feature's queue/review surface where applicable | Never display “synced” as a synonym for online or idle; shell does not replay, resolve, or clear queue entries |
| **Storage attention** | Browser storage is unavailable, corrupted, quota-exceeded, or cleared | Show an explicit persistence warning and the owning feature's recovery path; disable only actions that require unavailable persistence | Never claim offline work was saved or queued; do not silently discard local work |
| **Online required** | User attempts a Tier 2 action while offline or authoritative connectivity is not confirmed | Show an actionable online-required message and preserve safe local context without queuing the action | Must not imply authorization, commitment, dispatch, pricing, or completion |
| **Navigation transition** | User changes route, opens/closes mobile navigation, or capability context refreshes | Mark transition/accessibility status, preserve focus intentionally, and prevent duplicate activation; close transient navigation after successful route change | Active destination comes from the server-authorized route; capability changes are re-resolved, not inferred client-side |

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
type ShellSurface = "floor" | "office" | "shared" | "party";

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

**`"party"` surface (added 2026-08-06, resolving `22-parties-portal`'s open shell-architecture question)**: `party_user` sessions (`22-parties-portal`) render through the same shell composition as `"office"` sessions — the identical `AuthenticatedLayout` tree (§4: `DesktopSidebar`, `AppHeader`, `AccountControl`, `StatusRegion`) — filtered by this section's existing capability-based `NavigationEntry` mechanism to only the entries a `party_user`'s granted capabilities resolve to. `"party"` is kept distinct from `"office"` (internal office users), even though both render identical shell components, solely so floor/office-specific styling rules that would be meaningless or misleading in a party session (e.g. any future office-only operational chrome) can be explicitly excluded from `"party"` without conflating the two audiences. This reuses `05`'s existing components entirely unchanged — no new shell codebase, no separately-maintained party-facing layout to drift from the brand system — and the existing "hidden, not disabled" capability-filtering rule (§5 below) is sufficient on its own to hide every internal-only nav group from a `party_user` session; no new mechanism beyond this one `ShellSurface` value was needed.

This is a design contract, not an instruction to implement the type before approval. The final capability field and effective-context type must be adopted from `02-rbac-roles` rather than invented here.

The `capability` field uses stable resource keys from the `02-rbac-roles` §3.2 operational catalog in the format `resource.action`. The following resource keys are canonical and must not be renamed or replaced with provisional strings:

| Resource key | Permitted actions in this field |
| --- | --- |
| `receiving` | `view`, `scan`, `confirm` |
| `inspection` | `perform`, `resolve` |
| `inventory` | `read`, `manage` |
| `locations` | `read`, `manage` |
| `pick_list` | `generate`, `execute`, `read` |
| `fifo_override` | `request`, `approve` |
| `dispatch` | `read`, `execute` |
| `transfers` | `read`, `request`, `execute` |
| `documents` | `read`, `generate`, `download` |
| `reporting` | `read`, `export` |
| `parties` | `read`, `manage` |
| `items` | `read`, `manage` |
| `forex_rates` | `read`, `manage` |
| `notifications` | `read` |
| `vmi_statements` | `read` (**pending**, added 2026-08-06 — written in `02` design.md §3.2/§7.4, not yet through `02`'s own approval/sign-off process; used by `/portal/documents`) |
| `shipment_labels` | `generate` (**pending**, added 2026-08-06 — written in `02` design.md §3.2/§7.4/§7.4a, not yet through `02`'s own approval/sign-off process; used by `/portal/labels`) |

A `NavigationEntry` with no `capability` field is unconditionally visible to all authenticated users (used only for the `/sync` route and any future shell-global utilities). An entry whose capability the user does not hold is hidden from navigation presentation — it is not disabled or greyed; hiding avoids surfacing routes the user cannot use while preserving the fact that the route exists for authorized users.

Registry rules:

- `id` is stable and is used for analytics/tests; it is not a permission.
- `href` is an internal route and is validated before use in redirects.
- `featureStatus: "planned"` supports documenting future routes without rendering a dead link.
- `surface` determines which navigation presentation may show the entry; it does not grant access.
- `capability` references exactly one `resource.action` pair from the `02` catalog above, never a role name.
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

The shell consumes a server-resolved context shaped as:

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

**Grounded in `02-rbac-roles`'s approved model (2026-08-06)**: this is no longer a forward-looking placeholder — `capabilities` is `02`'s resolved effective-capability set (`02` §1, §3.3: `effective grants = union(active role assignments -> active role capability grants)`), and `userId`/`status` correspond to `02`'s `user_profiles` row and `current_user_is_active()` check. The exact server-side resolution mechanics (session resolver, request-local memoization, party-scope propagation for a `party_user` session) remain owned by `02` and `04-services-and-infrastructure`; this shell design still intentionally defines no user, role, party-scope, or authorization table of its own — it only consumes the typed result.

The enforcement sequence is:

1. Resolve/refresh the Auth session on the server.
2. Resolve current effective access through the approved RBAC boundary.
3. Reject unauthenticated or inactive sessions before protected content renders.
4. Render navigation filtered for usability from the resolved capabilities.
5. Enforce route/resource authorization again at the server action, route handler, or data boundary.

Navigation omission is not security. The shell must never accept `role`, `party_id`, or capability values from query parameters, form fields, or browser storage as authority.

## 8. Shared state boundaries

| State | Owner | Shell responsibility |
| --- | --- | --- |
| Authenticated session | Auth/infrastructure + RBAC | Resolve, protect, display safe identity, sign out |
| Capability authorization | RBAC + server data boundary | Consume typed context; never redefine policy |
| Online/offline signal | Offline spec | Display optional informational status only |
| Feature workflow state | Feature spec | Provide content and workflow-specific feedback |
| Global route loading/error/not-found | Shell/App Router | Provide safe recovery and stable landmarks |
| Session checking, redirect, forbidden, sign-out transition | Shell/App Router + Auth | Provide safe boundary, redirect, focus, and recovery behavior |
| Connectivity/synchronization/storage attention | Offline spec | Supply typed state; shell presents it read-only |
| Scan success/error flash | Floor feature | Avoid duplicate global feedback unless explicitly shared |
| Design tokens | Brand design system | Consume approved tokens only |

## 9. Accessibility and failure design

- Use semantic `nav`, `header`, `main`, and status landmarks.
- Provide an accessible name for icon-only controls and a text-equivalent active state.
- Keep focus visible, move focus to an opened drawer/dialog heading when appropriate, and restore focus to the invoking control after closure.
- Use polite status announcements for ordinary transitions and assertive alerts only for blocking or safety-critical failures; never announce protected record contents globally.
- Do not rely on hover for any floor action.
- Use safe generic error copy while attaching non-sensitive correlation context to monitoring.
- Use not-found behavior where revealing resource existence could leak scoped data; use the approved forbidden state where a capability failure can be stated safely.
- Respect `prefers-reduced-motion`; animation is never required to understand shell state.

## 10. Integration with downstream specs

Feature specs `06`–`22` should reference this design for (excluding deferred `19`):

- route registration and shell surface selection;
- page title/context/back behavior;
- capability references;
- shell loading/error boundaries;
- floor navigation suppression during active scan flows;
- global status and connectivity regions.

They should not copy the sidebar, bottom navigation, Auth guard, global tokens, or shell-level authorization logic.

## 11. Design verification before approval

- [ ] Reconcile the route inventory with the approved feature specs and the Gantt mapping. **Partially addressed 2026-08-06**: `22-parties-portal`'s six routes and the `"party"` `ShellSurface` value are now added (§3.2, §5) — the remaining work for this checklist item is reconciling every *other* feature spec's route inventory, and re-confirming `22`'s rows once `22` itself progresses past `Draft`.
- [x] Replace provisional RBAC references with the approved capability/session contract. **Resolved 2026-08-06**: `02-rbac-roles` reached `Status: Approved` on 2026-08-05 — §7's `ShellSessionContext` is no longer a forward-looking placeholder; it is grounded in `02`'s actual approved model (`02` §1's effective-grants summary, §3.3's `effective grants = union(active role assignments -> active role capability grants)`, and §6's session resolver). `capabilities: ReadonlySet<string>` correctly represents `02`'s resolved effective-capability set; `userId`/`status` correctly represent `02`'s `user_profiles`/`current_user_is_active()` model. §7's wording updated to state this directly rather than "conceptually shaped."
- [ ] Confirm the Auth/session integration against `04-services-and-infrastructure`. **Still open** — `04` remains `Draft`, unreviewed this session.
- [ ] Confirm offline indicator semantics against `03-offline-mode-and-client-storage`. **Still open** — `03` remains `Draft`, unreviewed this session.
- [x] Have `design-system-auditor` review floor/office behavior, tokens, contrast, typography, touch targets, and motion. **Resolved** — already run 2026-08-05 per `revision-log.md`'s "`04`–`21` sweep and `05` design-system audit" entry: no drift found, two precision gaps fixed (Epilogue SemiBold weight, real-logo-not-ligature rule). This checkbox was stale (audit complete, box never checked) — corrected here. **Note**: that audit predates this session's `"party"` `ShellSurface`/route-table addition; those specific additions have not themselves been independently audited (see below).
- [x] Confirm no `01-core-data-model` table is touched; if that changes, name the tables and update the design dependencies. **Confirmed still accurate** — the `22-parties-portal` party-surface addition is route/navigation metadata only; it adds no query against any `01` table to this shell design.
- [ ] Reconcile this design with the final `tasks.md` before changing the feature status to `Approved`.
- [x] **Added 2026-08-06, resolved 2026-08-06**: `design-system-auditor` re-checked the new `"party"` `ShellSurface` value (§5) and the six new `22-parties-portal` route-table rows (§3.2) — not covered by the 2026-08-05 audit above, since neither existed yet. Result: 2 of 4 items PASS (the surface's touch-target/contrast inheritance claim; no locally-redefined tokens), 2 real gaps found and fixed directly: (1) §3.2's capability-column cells had drifted from the table's one-bare-key-per-row convention with embedded prose/citations — reworded to bare keys with explanatory notes moved below the table, matching the existing format; (2) §3.3's "Surface routing rules" table was not extended for the six new routes or a `Party` column — added. Also closed a related gap the audit surfaced: `vmi_statements`/`shipment_labels` were used as capability keys in §3.2 but absent from §5's canonical resource-key table — added both, marked pending `02`'s own approval per the same "written, not verified" convention used throughout this document.
