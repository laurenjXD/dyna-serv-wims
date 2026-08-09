# UI Shell & Navigation — Design

Status: Approved
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
| `/` | shared | none | `05-ui-shell-and-navigation` | Launch |
| `/profile` | shared | none | `21-user-profile-and-settings` | Launch |
| `/settings` | office | `users.read` | `21-user-profile-and-settings` | Launch |
| `/receiving` | floor | `receiving.view` | `07-incoming-receiving` | Launch |
| `/receiving/[wrr_id]` | floor | `receiving.view` | `07-incoming-receiving` | Launch |
| `/inventory` | office | `pick_list.read` | `08-outgoing-withdrawal-and-two-stage-commitment` | Launch |
| `/pick-lists/[pickListId]/pick` | floor | `pick_list.execute` | `08-outgoing-withdrawal-and-two-stage-commitment` | Launch |
| `/pick-lists/[pickListId]/dispatch` | floor | `dispatch.execute` | `08-outgoing-withdrawal-and-two-stage-commitment` | Launch |
| `/inspection` | shared | `inspection.perform` | `07-incoming-receiving`, `08-outgoing-withdrawal-and-two-stage-commitment`, `11-transfer-and-inspection` | Launch |
| `/inspection/[inspection_id]` | floor | `inspection.perform` | `07-incoming-receiving`, `08-outgoing-withdrawal-and-two-stage-commitment`, `11-transfer-and-inspection` | Launch |
| `/documents` | office | `documents.read` | `10-pick-list-and-acknowledgement-receipt` | Planned |
| `/approvals` | office | `fifo_override.approve` | `09-approval-queue` | Launch |
| `/sync` | floor | none | `03-offline-mode-and-client-storage` | Planned (when offline feature enabled) |
| `/transfers` | shared | `transfer.view` | `11-transfer-and-inspection` | Launch |
| `/master-data/parties` | office | `parties.read` | `06-party-and-item-enrollment` | Launch |
| `/master-data/items` | office | `items.read` | `06-party-and-item-enrollment` | Launch |
| `/master-data/locations` | office | `locations.read` | `06-party-and-item-enrollment` | Launch |
| `/billing-pricing` | office | `reporting.financial_read` | `12-vmi-billing`, `13-trading-orders-and-pricing` | Planned |
| `/reports` | office | `reporting.read` | `16-reporting-and-analytics` | Planned |
| `/portal` | party | none | `22-parties-portal` | Planned |
| `/portal/inventory` | party | `reporting.read` | `22-parties-portal` | Planned |
| `/portal/orders` | party | `pick_list.read` | `22-parties-portal` | Planned |
| `/portal/documents` | party | `documents.read` | `22-parties-portal` | Planned |
| `/portal/notifications` | party | `notifications.read` | `22-parties-portal` | Planned |
| `/portal/labels` | party | `shipment_labels.generate` | `22-parties-portal` | Planned |

**Fixed 2026-08-09: `/incoming-ledger` and `/outgoing-ledger` merged into their parent office pages; `/pick-lists` restored to `/inventory`.** The Product Owner corrected an earlier build mistake: the Incoming Ledger and Outgoing Ledger had been implemented as standalone top-level routes, but `07`'s and `08`'s own approved route blocks (design.md §3 in each) always specified them as part of `receiving/page.tsx` and `inventory/page.tsx` respectively — the standalone routes were never an approved deviation. Both standalone rows are removed from this table; the Incoming Ledger is now a "Ledger" tab on `/receiving` (`?tab=ledger`), and the Outgoing Ledger is now a "Ledger" tab on `/inventory` (`?tab=ledger`), alongside a "Pick Lists" tab holding the list of committed pick lists (formerly the standalone `/pick-lists` row, which is removed and superseded by this `/inventory` row — the 2026-08-08 note that had temporarily renamed this row to `/pick-lists` is superseded, not re-litigated). `/inventory` today holds only these two tabs; the item-selection/FIFO-allocation/pick-list-generation UI `08`'s design.md §3 originally described for this path is not yet built — see that spec's own 2026-08-09 note. The floor pick/dispatch execution routes (`/pick-lists/[pickListId]/pick`, `/pick-lists/[pickListId]/dispatch`) are unchanged and were not renamed or moved.

**Fixed 2026-08-07: `/parties`, `/items`, and `/locations` route-gate correction.** These three rows previously required `parties.manage` / `items.manage` / `locations.manage` to reach the route at all. Per `02-rbac-roles`, the `.read` capability for each of these three resources is held broadly by `warehouse_staff`, `supervisor`, and `administrator`, while `.manage` is administrator-only (locations) or otherwise narrower than `.read` — so gating the route itself by `.manage` would have blocked every role RBAC intends to have read access from ever reaching the page. Corrected to gate all three routes by the `.read` capability instead; create/edit/deactivate actions inside each page remain gated by the corresponding `.manage` capability at the action level, per §8's Shared table, row-action, and filter/search contract (capability/row-state action gating — an action a session's capability doesn't cover is omitted, not disabled-and-visible). This is the same pattern already governing every other list screen in this design; `/parties` and `/items` had carried the same over-tight gate since before this session, and `/locations` inherited it on creation — both are fixed together here rather than leaving `/locations` consistent with a bug.

**Added 2026-08-07, general operational landing page (`/`):** the product owner requested a general "overview of everything" screen acting as the default post-login destination for every authenticated user, not gated to office/supervisor roles. This screen was already drawn in `mockup.md` §1 (floor shell — default route) and §3 (office shell — dashboard/review route) but was never formalized into this route table until now.

For floor users, `/` renders a greeting, a "TODAY" task-count summary card (receiving/picking/inspection counts), a Quick Actions list, and one full-width open-work-queue call to action, per `mockup.md` §1. For office users, `/` renders per-queue summary cards (Receiving/Picking/Inspection, each with open and today counts), a Recent Activity feed, and — **added 2026-08-07, office-surface only** — a `<ActivityHeatmap>` card imported from `16-reporting-and-analytics` (design.md §4.3), gated by `reporting.read` at the widget level and rendered only for sessions holding that capability; a session lacking it (including every floor-shell session, per `16` §2.4) does not see this card but still receives the rest of the office content. Floor-shell rendering is unaffected by this addition and carries no analytics widget. This is per `mockup.md` §3 as extended by the note above. All figures are read-only aggregations sourced from `07-incoming-receiving` (receiving counts), `08-outgoing-withdrawal-and-two-stage-commitment`/pick lists (picking counts), `11-transfer-and-inspection` (inspection/transfer counts), `09-approval-queue` (open approval/FIFO-override counts where surfaced), and, for the office-only heatmap widget, `16-reporting-and-analytics`'s `inventory_transactions`-derived aggregation — each already gated by that source spec's own capability for the underlying data. This route defines no new route-level data-access gate of its own; it only aggregates, and the one embedded widget with its own capability requirement is gated at the widget level as described above. Capability: `none`, for the same reason already established for `/sync` and `/portal` above. Surface: `shared`, rendering per the floor vs. office shell exactly as `/inspection` and `/transfers` already do in this table; `"party"` sessions (§3.3) receive the office presentation, consistent with how `"party"` already reuses office shell composition elsewhere in this design — including the `<ActivityHeatmap>` widget where the `"party"` session holds `reporting.read`.

- `/` (office-surface rendering only): additionally embeds `16-reporting-and-analytics`'s `<ActivityHeatmap>` (design.md §4.3), gated by `reporting.read` at the widget level, not a second route-table row or a route-level gate — matching how `/portal/inventory`'s bullet above documents a widget-level `reporting.read` gate on an otherwise `none`-gated aggregation route.

**Route collision found and resolved**: `16-reporting-and-analytics/requirements.md` FR-1.1 previously claimed `/dashboard` as "the default landing route," which was never reflected in this table and would have collided with this general landing page had both been built at the same path. Resolved (see `specs/00-steering/revision-log.md`, 2026-08-07 entry): the general landing page owns `/`; `16`'s `reporting.read`-gated analytics dashboard (KPI cards, 52-week activity heatmap, Quick Access panel, financial/margin metrics) moves to `/reports`, the row this table already reserved for it. `/` and `/reports` are two distinct screens with two distinct audiences — `/` has no `reporting.read` gate and shows operational queue counts, never KPIs or financial data; floor staff, who never hold `reporting.read` (per `16` §2.4), still receive `/` as their default route.

**Added 2026-08-07 (later same day), office-only `<ActivityHeatmap>` widget on `/`:** the product owner requested `/` also surface a data-analytics glance for office users. Rather than fork or reimplement, `/`'s office-surface rendering now embeds `16-reporting-and-analytics`'s existing `<ActivityHeatmap>` component as-is (design.md §4.3, 52-column × 7-row calendar grid of `inventory_transactions` volume, filterable by flow type VMI/Trading/Supplies/All). `16`'s own requirements.md AC-9 already establishes this component is designed to be imported by feature areas outside spec `16`, naming the Master Inventory view as an example — this is that same reusability contract exercised a second time, not a new precedent. The widget is gated by `reporting.read` **at the widget level only**: `/` itself remains capability `none` in the route table above (an aggregation route, same reasoning as `/sync` and `/portal`), and a session without `reporting.read` simply does not render this card while still receiving the rest of `/`'s office content (per-queue summary cards, Recent Activity feed). This preserves `16` §2.4's rule that floor staff never hold `reporting.read` and are never shown reporting-derived analytics: the widget is scoped to the office-surface branch of `/` only, and the floor-surface rendering (task-count card, Quick Actions, work-queue CTA) is unchanged and never includes it. This narrows, rather than reopens, the immediately preceding "Route collision" resolution above — `/` still shows no KPI cards and no financial/margin metrics, and the heatmap widget is the one explicitly-approved exception, not a reversal of the collision fix. See the corresponding requirements.md R11.6 and the dated revision-log entry.

**Added 2026-08-06**, resolving `22-parties-portal`'s open shell-architecture item: these six rows are `22`'s routes, rendered on the `"party"` surface (§5). All are `Planned` rather than `Launch` because `22`'s runtime integration is not yet scheduled. Notes on individual rows, kept out of the table cells to match this table's existing one-bare-key-per-row format:

- `/portal`: `none` because it is a context-resolved landing page — it aggregates several reads (each individually gated by its own capability below) rather than being gated by one capability itself, the same reasoning already applied to `/sync`'s `none` entry above.
- `/portal/inventory`: gated by `reporting.read` for the embedded party analytics; the underlying VMI `lot_location_balances` read itself has no separately catalogued resource key of its own — it is authorized directly by `02` §7.4's RLS pattern, not a second capability check, per `22` design.md §4.
- `/portal/documents`: gated by `documents.read` for pick-list/acknowledgement-receipt access; VMI billing statement access on the same route additionally requires `vmi_statements.read` — two capabilities on one route, the same pattern `/inspection` uses for multi-spec ownership, expressed here as a second required check rather than a second table row since both live under one path.
- `/portal/labels`: `Planned` status remains dependent on `22` R11.11's runtime integration across the approved `02`, `01`/`07`, and `18` contracts; it is not a new spec-approval blocker.
- `vmi_statements.read`, `reporting.read` (`assigned_party` row), and `shipment_labels.generate` are approved catalog entries in `02` design.md §3.2/§7.4. §5's canonical resource-key table includes all three.

Rules:

- A route with `featureStatus: "planned"` in the navigation registry renders no live link until its owning spec is Approved. The shell supports this without dead routes appearing in production navigation.
- Surface assignments are binding: a floor route cannot adopt office layout behavior without an explicit spec amendment.
- The `/sync` route carries no required capability because it is a connectivity-attention surface, not a data-access gate. Its visibility is controlled by whether the offline feature is enabled at the application level, not by the user's capability set.
- Capability keys will not change once `02-rbac-roles` is Approved; this table must be updated in lockstep with any `02` catalog amendment.

### 3.3 Floor versus office shell behavior and outbound flow model

**Outbound flow — no withdrawal request.** The outbound workflow in this system does not use a withdrawal-request document that later becomes a pick list. An office user selects items directly from Master Inventory, the system performs FIFO/FEFO allocation, and a committed pick list is generated directly (`pick_list.generate`, via the outbound withdrawal action — see `08`'s design.md for the exact route once the generation UI is built; not yet implemented, per the Planned status above). If the FIFO/FEFO allocation requires a non-standard lot, a FIFO override request is raised and must be approved through `/approvals` before the pick list is generated. The floor user then executes the committed pick list at `/pick-lists/[pickListId]/pick` (`pick_list.execute`), and dispatches it at `/pick-lists/[pickListId]/dispatch` (`dispatch.execute`). There is no intermediate "withdrawal request" *state* or document, and no navigation entry implying one. **Amendment (2026-08-08, superseded in part 2026-08-09)**: this paragraph and the route table above were corrected to match the routes actually built (`/pick-lists/[pickListId]/pick`, `/pick-lists/[pickListId]/dispatch` for the floor execution/dispatch steps) — `08`'s implementation used the `pick-lists` path for those two floor routes and, separately, had adopted an unapproved `withdrawal.*` capability vocabulary in application code (fixed the same day, application-code-only, to use this table's already-approved `pick_list.*`/`dispatch.*` names — see revision-log.md). **2026-08-09**: the office-side list of committed pick lists, which the 2026-08-08 note above had temporarily renamed to a standalone `/pick-lists` route, is restored to `/inventory` per `08`'s originally-approved route block — it is now a "Pick Lists" tab on `inventory/page.tsx`, alongside a "Ledger" tab (the former standalone `/outgoing-ledger`). Only the two floor execution/dispatch routes remain at the `/pick-lists/[pickListId]/...` path; the office list view does not live there anymore. The rule itself is unchanged: the shell must never introduce a route or navigation label that implies a withdrawal-*request* model (a document that precedes and is later converted into a pick list) — neither `/inventory` (an office hub naming the operational list of already-committed pick lists plus their ledger) nor `/pick-lists/[pickListId]/...` (the floor execution routes) violates this, since no such precursor document or state exists anywhere in the system.

**Surface routing rules:**

| Route | Floor-only | Office-only | Shared | Party |
| --- | --- | --- | --- | --- |
| `/` | | | ✓ (added 2026-08-07 — general landing page, floor-first for floor sessions, office-tier for office and `"party"` sessions) | |
| `/receiving`, `/receiving/[wrr_id]` | ✓ | | | |
| `/inventory` | | ✓ | | |
| `/pick-lists/[pickListId]/pick`, `/pick-lists/[pickListId]/dispatch` | ✓ | | | |
| `/inspection`, `/inspection/[inspection_id]` | | | ✓ (floor-first layout) | |
| `/documents` | | ✓ | | |
| `/approvals` | | ✓ | | |
| `/sync` | ✓ | | | |
| `/transfers` | | | ✓ (floor-first layout) | |
| `/master-data/parties`, `/master-data/items`, `/master-data/locations` | | ✓ | | |
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
| `vmi_statements` | `read` (approved catalog entry added 2026-08-06 in `02` design.md §3.2/§7.4; used by `/portal/documents`) |
| `shipment_labels` | `generate` (approved catalog entry added 2026-08-06 in `02` design.md §3.2/§7.4/§7.4a; used by `/portal/labels`) |

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

## 8. Shared table, row-action, and filter/search contract

All feature-owned tables and lists consume this contract by name: **Shared Table-Action and Filter/Search Contract**.

### 8.1 Row actions

- The row action set is computed from the server-resolved effective capabilities plus the row's current business state. The standard action vocabulary is `view`, `edit`, and `deactivate`; a feature may narrow it or add a named domain action only when its own approved spec defines the capability and state transition.
- Unauthorized or inapplicable actions are omitted from the rendered affordance. A disabled-only button is not an authorization mechanism and is not the default contract.
- Each row has one primary action at most. On office surfaces, secondary actions may live in a labelled menu; on floor surfaces, the primary action is an explicit, reachable control and never depends on hover, right-click, or a pointer-only gesture.
- Floor row actions use the brand minimum 56×56px touch target; a floor primary action uses the 64px/full-width treatment where practical. Office row controls use at least 44×44px. Icon-only controls have an accessible name and visible focus state.
- The server action/data boundary rechecks capability, row state, and RLS. The client action list is presentation only.

### 8.2 Shared filter and search bar

- The standard filter bar exposes date range (`from`, `to`), party, flow type, and item/entity filters, matching `16-reporting-and-analytics` FR-8.1 exactly. Feature specs may define defaults and permitted values but must not rename or silently remove these shared fields when the surface supports them.
- A global cross-entity search accepts a query plus an optional entity type and returns only entities the current session may read. It must use the same server authorization/RLS path as the corresponding list query; a client-side merge of separately visible and hidden records is prohibited.
- Filter and search parameters are validated server-side, debounced for usability, represented in the URL when the route is shareable, and provide loading, empty, invalid, retry, and unauthorized/no-disclosure states through the feature's list-state contract.
- Filters are constraints on an already authorized query, not a replacement for RLS. Export and bulk actions re-run capability and row-state checks against the canonical filtered result set.
- Flow-based item-code display is shared: `vmi` → `supplier_item_code`; `trading`/`supplies` → `dsgc_item_number`. Alternate codes may be filter fields only; the prohibited synonym `dsgc part number` is never the displayed label.

## 9. Shared state boundaries

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

## 10. Accessibility and failure design

- Use semantic `nav`, `header`, `main`, and status landmarks.
- Provide an accessible name for icon-only controls and a text-equivalent active state.
- Keep focus visible, move focus to an opened drawer/dialog heading when appropriate, and restore focus to the invoking control after closure.
- Use polite status announcements for ordinary transitions and assertive alerts only for blocking or safety-critical failures; never announce protected record contents globally.
- Do not rely on hover for any floor action.
- Use safe generic error copy while attaching non-sensitive correlation context to monitoring.
- Use not-found behavior where revealing resource existence could leak scoped data; use the approved forbidden state where a capability failure can be stated safely.
- Respect `prefers-reduced-motion`; animation is never required to understand shell state.

## 11. Integration with downstream specs

Feature specs `06`–`22` should reference this design for (excluding deferred `19`):

- route registration and shell surface selection;
- page title/context/back behavior;
- capability references;
- shell loading/error boundaries;
- floor navigation suppression during active scan flows;
- global status and connectivity regions.

They should not copy the sidebar, bottom navigation, Auth guard, global tokens, or shell-level authorization logic.

## 12. Design verification before approval

- [ ] Reconcile the route inventory with the approved feature specs and the Gantt mapping. **Partially addressed 2026-08-06**: `22-parties-portal`'s six routes and the `"party"` `ShellSurface` value are now added (§3.2, §5); the remaining work is reconciling every other feature spec's route inventory and scheduling runtime integration.
- [x] Replace provisional RBAC references with the approved capability/session contract. **Resolved 2026-08-06**: `02-rbac-roles` reached `Status: Approved` on 2026-08-05 — §7's `ShellSessionContext` is no longer a forward-looking placeholder; it is grounded in `02`'s actual approved model (`02` §1's effective-grants summary, §3.3's `effective grants = union(active role assignments -> active role capability grants)`, and §6's session resolver). `capabilities: ReadonlySet<string>` correctly represents `02`'s resolved effective-capability set; `userId`/`status` correctly represent `02`'s `user_profiles`/`current_user_is_active()` model. §7's wording updated to state this directly rather than "conceptually shaped."
- [x] Confirm the Auth/session integration against `04-services-and-infrastructure`. **Resolved 2026-08-06** — §7 consumes the approved server-resolved session/capability context, and `04` §8/§9/§15.3.1 defines the protected request and offline-sync boundary.
- [x] Confirm offline indicator semantics against `03-offline-mode-and-client-storage`. **Resolved 2026-08-06** — §9 consumes `03`'s approved `OfflineStatus` contract and keeps connectivity separate from synchronization and storage attention.
- [x] Have `design-system-auditor` review floor/office behavior, tokens, contrast, typography, touch targets, and motion. **Resolved** — the base audit ran 2026-08-05; the `"party"` `ShellSurface`/route-table addition was separately re-checked 2026-08-06 in the item below.
- [x] Confirm no `01-core-data-model` table is touched; if that changes, name the tables and update the design dependencies. **Confirmed still accurate** — the `22-parties-portal` party-surface addition is route/navigation metadata only; it adds no query against any `01` table to this shell design.
- [x] Reconcile this design with the final `tasks.md` before changing the feature status to `Approved`. **Resolved 2026-08-06**: the new §8 contract is mapped to the added `tasks.md` integration task and remains implementation-gated there.
- [x] **Added 2026-08-06, resolved 2026-08-06**: `design-system-auditor` re-checked the new `"party"` `ShellSurface` value (§5) and the six `22-parties-portal` route-table rows (§3.2). Result: 2 of 4 items PASS (the surface's touch-target/contrast inheritance claim; no locally-redefined tokens), 2 real gaps found and fixed directly: (1) §3.2's capability-column cells had drifted from the table's one-bare-key-per-row convention with embedded prose/citations — reworded to bare keys with explanatory notes moved below the table, matching the existing format; (2) §3.3's "Surface routing rules" table was not extended for the six new routes or a `Party` column — added. Also closed a related gap the audit surfaced: `vmi_statements`/`shipment_labels` were used as capability keys in §3.2 but absent from §5's canonical resource-key table — added both as approved `02` catalog entries.
- [x] **Added 2026-08-06, resolved 2026-08-06**: `design-system-auditor` reviewed §8's shared row-action contract. Floor actions retain the approved 56×56px/64px targets, no action depends on hover, office controls retain the 44×44px minimum, focus and accessible names are required, and no new color, typography, icon, or token drift was introduced. The contract is compatible with the floor-first brand rules and does not use circular/hover-only affordances.
