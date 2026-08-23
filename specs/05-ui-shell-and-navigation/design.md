# UI Shell & Navigation — Design

Status: Approved
Updated: 2026-08-23 (Sidebar interaction and visual-hierarchy amendment)

## 1. Design intent

The shell is a thin, shared frame that makes feature routes discoverable and safe without owning feature business logic. It provides one authenticated route boundary, a typed navigation registry, responsive shell variants, and shared page-state conventions.

The design strictly follows the unified visual design system (`specs/00-steering/design.md` and `specs/00-steering/ui-ux-design-plan.md`): floor/mobile is the primary interaction target (375–430px portrait handheld scanner), office/desktop is an enhancement, and no shell component may introduce custom visual tokens or unapproved hex values.

### Terminology Rules
The shell enforces approved user-facing UI labels across all navigation elements, headers, page titles, and state copy:
- **Organization** (replaces Party)
- **Inventory Model** (replaces Flow Type)
- **Organization Portal** (replaces Party Portal)
- **Inspection** (replaces Daily Inspection)
- **Delivery Receipt / Acknowledgement Receipt** (replaces Acknowledgement Receipt until formal document decision)

*(Canonical database schema identifiers `parties` and `flow_type` remain technical terms in code/API contracts until a data-model amendment is approved.)*

## 2. Foundational dependencies

This design depends on:

- `specs/00-steering/design.md` and `specs/00-steering/ui-ux-design-plan.md` for colors, typography, spacing, breakpoints, touch targets, surfaces, motion, accessibility, and component patterns.
- `02-rbac-roles` for the approved typed effective-capability/session context. This design consumes the capability interface without defining role names or permissions.
- `03-offline-mode-and-client-storage` for the approved read-only connectivity/synchronization-status contract.
- `04-services-and-infrastructure` for Supabase SSR Auth clients, session refresh, validated configuration, Sentry, and runtime/security boundaries.

This feature touches no tables from `01-core-data-model`. It must not redefine or query `parties`, `items`, `locations`, lots, or transactions merely to render navigation.

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
    error.tsx                  # authenticated shell recovery state (3-component feedback)
    not-found.tsx              # safe scoped not-found state
    page.tsx                   # general operational landing page (/)
    receiving/                 # feature-owned route (07)
    inventory/                 # feature-owned route (08, 11)
    outgoing/                  # feature-owned route (08)
    master-data/               # feature-owned route (06)
      parties/                 # Organization management
      items/                   # Items management (Inventory Model first)
      locations/               # Locations management (Bulk generator)
    billing-pricing/           # feature-owned route (12, 13)
    reports/                   # feature-owned route (16)
    documents/                 # feature-owned route (10)
    portal/                    # feature-owned route (22 - Organization Portal)
  layout.tsx                   # document metadata, fonts (DM Sans + Glacial Indifference), providers
```

The authenticated layout resolves the server session and passes a typed, minimal shell context to client components. It must not pass raw access tokens or trust client-provided role/Organization/capability values.

Middleware is restricted to lightweight session refresh or coarse public/protected routing; it does not execute TCP/Drizzle database queries or replace server resource authorization.

### 3.2 Route inventory

The table below lists every authenticated route planned at launch. Each route names the presentation surface, the required capability key from `02-rbac-roles`, the owning feature spec, and launch status.

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
| `/inspection` | shared | `inspection.perform` | `07-incoming-receiving`, `08`, `11-transfer-and-inspection` | Launch |
| `/inspection/[inspection_id]` | floor | `inspection.perform` | `07-incoming-receiving`, `08`, `11-transfer-and-inspection` | Launch |
| `/outgoing` | office | `dispatch.read` | `08-outgoing-withdrawal-and-two-stage-commitment` | Launch |
| `/documents` | office | `documents.read` | `10-pick-list-and-acknowledgement-receipt` | Planned |
| `/approvals` | office | `fifo_override.approve` | `09-approval-queue` | Launch |
| `/sync` | floor | none | `03-offline-mode-and-client-storage` | Planned (when offline enabled) |
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

#### Route Alignment & Sub-tab Structure
- **`/receiving`**: Features 4 operational tabs: *Work Queue* (open WRRs), *Receive* (mobile scan interface), *WRRs* (staged WRRs & item barcode print/reprint), and *Incoming Ledger* (confirmed receiving history).
- **`/inventory`**: Features 3 tabs: *Stock View* (searchable by item, Organization, Inventory Model, category, subcategory, lot, location, status, date; expandable item → lot → location view; lot history/aging, Excel export), *Pick Lists* (FIFO/FEFO allocation preview, selected lots/locations, override requests), and *Inspection* (aging candidates, queue, supervisor resolution).
- **`/outgoing`**: Office-first page featuring *Outgoing Ledger* (read-only dispatch history) and *Logistics* (delivery/PEZA references, document uploads, manual updates, Add Charges).
- **`/master-data/parties` (Organizations)**: Form fields for Organization name/code, role, registered country, shipping origin, contacts, addresses, registration/billing details.
- **`/master-data/items`**: Form hierarchy starts with **Inventory Model** dropdown → Category (dropdown) → Subcategory (dropdown) → Item identity/code.
- **`/master-data/locations`**: Includes bulk location generator, naming configuration, preview, duplicate/error report, capacity, occupancy, and rejects-location fields.
- **`/billing-pricing`**: VMI Billing (daily VMI accrual, daily CBM calculations, SOAs) and Trading Pricing (Cost of Goods = Buy Cost, Selling Price = Customer Price, Gross Margin = Selling Price − Cost of Goods, Margin % = Gross Margin ÷ Selling Price).
- **`/reports`**: Excel exports for authorized tables, weekly transaction/CBM line graphs, monthly KPI trends.
- **`/documents`**: Central archive for WRRs, Pick Lists, DR/AR, SOAs, Logistics/PEZA documents.
- **`/portal` (Organization Portal)**: Dedicated external portal featuring Organization Home and Pre-arrival Label Form (item selection, quantity, supplier lot number, barcode generation).

### 3.3 Floor versus office shell behavior and outbound flow model

**Outbound flow — no withdrawal request.** The system does not use a withdrawal-request document. An office user selects items directly from Master Inventory, the system computes FIFO/FEFO allocations, and a committed pick list is generated directly (`pick_list.generate`). Non-standard allocations trigger a FIFO override request resolved via `/approvals`. The floor user executes the pick list at `/pick-lists/[pickListId]/pick` (`pick_list.execute`) and dispatches it at `/pick-lists/[pickListId]/dispatch` (`dispatch.execute`).

**Surface routing rules:**

| Route | Floor-only | Office-only | Shared | Party (Organization) |
| --- | --- | --- | --- | --- |
| `/` | | | ✓ (floor presentation for floor; office presentation for office & Organization Portal) | |
| `/receiving`, `/receiving/[wrr_id]` | ✓ | | | |
| `/inventory` | | ✓ | | |
| `/pick-lists/[pickListId]/pick`, `/pick-lists/[pickListId]/dispatch` | ✓ | | | |
| `/inspection`, `/inspection/[inspection_id]` | | | ✓ (floor-first layout) | |
| `/outgoing` | | ✓ | | |
| `/documents` | | ✓ | | |
| `/approvals` | | ✓ | | |
| `/sync` | ✓ | | | |
| `/transfers` | | | ✓ (floor-first layout) | |
| `/master-data/parties`, `/master-data/items`, `/master-data/locations` | | ✓ | | |
| `/reports` | | ✓ | | |
| `/billing-pricing` | | ✓ | | |
| `/portal`, `/portal/*` | | | | ✓ (dedicated Organization Portal surface) |

**Shell adaptation by surface:**

- **Floor routes**: Single-column layout targeting 375–430px portrait. Persistent sidebar is omitted. During active scan flows, navigation is completely hidden and replaced by a feature-owned flow header. Bottom tabs appear only between scan steps. Floor primary CTA is Vibrant Blue (`#2563EB`), full-width, minimum 64px height, positioned in the bottom third thumb zone.
- **Office routes**: Desktop sidebar rendered on `md`/`lg` viewports. Sidebar features a Solid White background, Deep Navy (`#0F172A`) active text, Slate (`#64748B`) inactive text, Vibrant Blue (`#2563EB`) active rail and icon tile, Glacial Indifference Bold labels, 44px minimum rows, restrained hover motion/shadow, clear group dividers, and the real letter-mark logo asset. A bounded signed-in identity summary anchors the bottom. The desktop sidebar is viewport-fixed and uses no independent vertical scroll region. It collapses to a left-side mobile drawer on narrow viewports using the same active/hover semantics.
- **Shared routes**: Default to floor-first layout and touch targets. Enhance to desktop sidebar only on `lg` viewports where explicitly specified.
- **Organization Portal routes (`"party"`)**: Consume office-tier composition (`AuthenticatedLayout`, `DesktopSidebar`, mobile drawer) with dedicated Organization Portal navigation entries and explicit "your organization" framing.

### 3.4 Application state catalog

The shell owns the global application state catalog. All error states MUST follow the mandatory 3-component structure: **What happened**, **Why it failed**, and **Next Action / Solution**.

| State | Trigger / condition | Shell behavior | Key constraints |
| --- | --- | --- | --- |
| **Session checking** | Initial request resolving session | Render minimal skeleton shell; never render protected content optimistically | Must not flash protected content or claim session active before server resolution |
| **Revoked session** | Server detects expired/revoked session | Immediately redirect to sign-in boundary; clear server-side tokens | No protected UI rendered after revocation |
| **Deep link** | Inbound link while unauthenticated | Preserve path in server-validated parameter; return only after auth check | Destination re-authorized on arrival; reject open redirects |
| **Sign-out transition** | User requests sign-out | Disable duplicate activation; clear client state on success | Failed sign-out must show retry without claiming completion |
| **Loading** | Resolving route, session, or capabilities | Render skeleton preserving expected layout geometry | Skeletons contain no real data; scanner readiness not delayed |
| **Retrying** | Transient request retry in progress | Preserve landmarks, show non-blocking retry status | Retries bounded; user can cancel or navigate away |
| **Timeout / retry exhausted** | Time budget exceeded or retries failed | Display 3-component error with Retry / Home / Sign out actions | Must not spin indefinitely or convert timeout to success |
| **Error** | Unhandled exception in shell or route | Render 3-component error surface (What, Why, Next Action); log Sentry correlation ID | No stack traces, SQL, access tokens, or record data exposed; works without JS |
| **Not found** | Route/resource does not exist | Render safe 3-component not-found surface with Home action | Must not reveal existence of protected resource to unauthorized users |
| **Forbidden** | Known route/resource unauthorized | Render safe 3-component forbidden surface with support link | Server authorization authoritative; nav omission is not security |
| **Empty** | User with zero active capabilities | Render safe landing confirming identity, stating no access configured | Full navigation chrome not rendered with locked links |
| **Stale** | Capability revoked mid-session | Display explicit indicator in status region; re-resolve on next navigation | Client cannot assume cached capabilities remain valid |
| **Connectivity** | Supplied by `03` offline contract | Display `online`, `offline`, or `checking`; hide if contract absent | Informational only; does not grant offline authorization |
| **Synchronization** | Supplied by `03` offline contract | Display `idle`, `syncing`, or `attention` | Never display "synced" as synonym for online |
| **Storage attention** | Browser storage corrupted/full | Display explicit persistence warning and recovery path | Never claim offline work saved when storage unavailable |
| **Online required** | Tier 2 action attempted offline | Display 3-component online-required explanation; preserve local state | Action not queued or committed offline |
| **Navigation transition** | Route change or drawer toggle | Update focus intentionally, close transient drawer | Active route driven by server-authorized location |

## 4. Shell composition

```text
AuthenticatedLayout
├── SessionBoundary (server)
├── ShellProvider (minimal client state)
├── DesktopSidebar (office / organization portal enhancement)
│   ├── Brand Logo (real letter-mark logo, DM Sans heading style, no diagonal cut)
│   ├── NavigationItems (Glacial Indifference Bold 14px, Deep Navy active, Slate inactive)
│   └── OrganizationScopeIndicator (Organization Portal surface)
├── MobileFloorNavigation (floor mode: bottom tabs between steps; hidden during active scan loops)
├── AppHeader
│   ├── PageHeader slot
│   ├── ConnectivityIndicator (optional, read-only: online/offline/checking)
│   └── AccountControl (displayName, email, Organization scope, Sign Out)
├── StatusRegion (storage / synchronization attention alerts)
└── MainContent slot (Level 0 Cool Blue-Gray #F3F6FC background, Level 1 Solid White #FFFFFF cards)
```

## 5. Navigation registry contract

The typed central navigation registry shape is:

```ts
type ShellSurface = "floor" | "office" | "shared" | "party";

type NavigationEntry = {
  id: string;
  href: string;
  label: string;                  # Approved terms: Organization, Inventory Model, Organization Portal, Inspection
  accessibleLabel?: string;
  group: string;
  order: number;
  surface: ShellSurface;
  icon: string;
  capability?: string;
  featureStatus: "available" | "planned" | "disabled";
};
```

Canonical capability resource keys from `02-rbac-roles`:

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
| `reporting` | `read`, `export`, `financial_read` |
| `parties` | `read`, `manage` |
| `items` | `read`, `manage` |
| `forex_rates` | `read`, `manage` |
| `notifications` | `read` |
| `vmi_statements` | `read` |
| `shipment_labels` | `generate` |
| `users` | `read`, `manage` |

Entries with missing capabilities are hidden from navigation presentation (not greyed out).

## 6. Visual Design System & Brand Identity Integration

### 6.1 Color System

| Color Role | Color Name | Hex Code | Recommended Usage |
| --- | --- | --- | --- |
| **Primary** | 🔵 Vibrant Blue | `#2563EB` | Primary buttons, links, active controls, focus rings |
| **Primary Hover** | 🔵 Deep Blue | `#1E3A8A` | Button hover and pressed states |
| **Secondary** | 🟣 Violet | `#7C3AED` | Secondary accents, selected highlights |
| **Neutral** | ◻️ Cool Gray | `#94A3B8` | Disabled states, secondary icons |
| **Background** | Cool Blue-Gray | `#F3F6FC` | Main application background (Level 0) |
| **Surface** | ⬜ Solid White | `#FFFFFF` | Cards, tables, modals, sidebar (Level 1) |
| **Text Primary** | 🌑 Deep Navy | `#0F172A` | Headings, labels, body text, active nav text |
| **Text Secondary** | 🩶 Slate | `#64748B` | Subtitles, helper text, inactive nav text |
| **Border** | ◽ Light Blue-Gray | `#E2E8F0` | Card, input, and table borders |
| **Success** | 🟢 Emerald | `#10B981` | Received, available, approved, completed |
| **Warning** | 🟠 Amber | `#F59E0B` | Low stock, partial, pending attention |
| **Error** | 🔴 Red | `#EF4444` | Failed, rejected, out of stock, destructive actions |

**Text-Color Rule**: Headings, body copy, and labels use Text Primary (`#0F172A`) or Text Secondary (`#64748B`), NEVER Primary or Secondary brand colors. Brand colors are strictly reserved for backgrounds, icons, borders, active-state fills, and chart marks.

### 6.2 Typography System

Only two type families establish the entire application hierarchy:

| Family Role | Font Family | Weights | Usage |
| --- | --- | --- | --- |
| **Primary Heading** | DM Sans | 700 (Bold), 600 (SemiBold) | Page titles, hero displays, large KPI numbers |
| **Secondary UI & Body** | Glacial Indifference | 700 (Bold), 400 (Regular) | Body copy, navigation, labels, badges, buttons, table headers, data entry |

#### Type Scale
- `headline-xl`: DM Sans Bold, 40px (line-height 48px)
- `headline-lg`: DM Sans Bold, 32px (line-height 40px)
- `headline-md`: DM Sans SemiBold, 24px (line-height 32px)
- `data-display`: DM Sans SemiBold, 20px (line-height 24px)
- `body-lg`: Glacial Indifference Regular, 18px (line-height 28px)
- `body-md`: Glacial Indifference Regular, 16px (line-height 24px)
- `body-sm`: Glacial Indifference Regular, 14px (line-height 20px - Office only)
- `label`: Glacial Indifference Bold, 14px (line-height 16px - Office only)

*Floor screens NEVER use text below 16px (`body-md` minimum). Legacy and monospaced fonts (Epilogue, Inter, JetBrains Mono) are completely retired.*

### 6.3 Shape and Radii Tokens
- `radius-sm` (4px): Small pills, tags
- `radius-default` (8px): Standard cards, buttons, inputs
- `radius-md` (12px): Larger cards and modals
- `radius-lg` (16px): Hero cards, feature panels
- `radius-full` (9999px): Status badges, avatar circles

*Primary buttons use standard rounded corners. The retired diagonal-cut motif must NOT be reintroduced.*

### 6.4 Surfaces and Elevation
Glassmorphism and backdrop blur are completely retired across the application.
- **Level 0 Background**: Cool Blue-Gray (`#F3F6FC`), shadow `none` — Base application container.
- **Level 1 Surface**: Solid White (`#FFFFFF`), shadow `0 1px 2px rgba(15, 23, 42, 0.08)` — Cards, modals, panels, sidebar.

## 7. Authentication and authorization boundary

The shell consumes a server-resolved context shaped as:

```ts
type ShellSessionContext = {
  authenticated: true;
  userId: string;
  displayName?: string;
  email?: string;
  organizationScope?: string;
  capabilities: ReadonlySet<string>;
  status: "active";
};
```

Server enforcement sequence:
1. Resolve/refresh Auth session on the server.
2. Resolve effective capability context through `02-rbac-roles` boundary.
3. Reject unauthenticated/inactive sessions before rendering protected markup.
4. Render navigation filtered for usability.
5. Re-check capabilities at server actions, route handlers, and database RLS predicates.

## 8. Shared table, row-action, and filter/search contract

All feature tables consume this shared contract:

- **Row Actions**: Vocabulary: `view`, `edit`, `deactivate`. Unauthorized actions are omitted (not disabled). Primary action is explicit and reachable without hover. Minimum touch targets: 56×56px floor, 44×44px office.
- **Shared Filter Bar**: Standard fields: Date range (`from`, `to`), Organization, Inventory Model, and item/entity search.
- **Flow-Based Item Code Display**: `vmi` → `supplier_item_code`; `trading`/`supplies` → `dsgc_item_number`. The forbidden label `dsgc part number` is prohibited.

## 9. Shared state boundaries

| State | Owner | Shell Responsibility |
| --- | --- | --- |
| Authenticated Session | Auth / Infrastructure + RBAC | Resolve, protect, display safe identity, sign out |
| Capability Authorization | RBAC + Server Data Boundary | Consume typed context; filter navigation presentation |
| Connectivity Signal | Offline Spec (`03`) | Display optional read-only status (`online`/`offline`/`checking`) |
| Feature Workflow State | Feature Spec | Provide screen content and workflow feedback |
| Global Shell State | Shell / App Router | Provide 3-component loading/error/not-found recovery |
| Design Tokens | Brand Design System | Enforce exact visual design system tokens |

## 10. Accessibility and failure design

- Use semantic landmarks (`nav`, `header`, `main`).
- Visible 2px Vibrant Blue (`#2563EB`) focus ring on all interactive elements.
- Never communicate status by color alone.
- Error states explicitly display 3 components (What happened, Why it failed, Next Action / Solution).
- Respect `prefers-reduced-motion`.

## 11. Integration with downstream specs

Feature specs `06`–`22` consume this shell design for:
- Route registration and shell surface selection (`floor`, `office`, `shared`, `party`);
- Approved terminology (Organization, Inventory Model, Organization Portal, Inspection);
- Page title, header, and back actions;
- Navigation hiding during active floor scan flows;
- Standard visual design tokens and 3-component error feedback.

## 12. Design verification before approval

- [x] Reconcile route inventory with approved feature specs and Gantt mapping.
- [x] Integrate unified visual design system (DM Sans + Glacial Indifference, Vibrant Blue `#2563EB`, Solid White surfaces, 3-component error feedback).
- [x] Enforce approved terminology (Organization, Inventory Model, Organization Portal, Inspection).
- [x] Ground RBAC capability context in approved `02-rbac-roles` catalog.
- [x] Confirm Auth session integration against `04-services-and-infrastructure`.
- [x] Confirm offline indicator semantics against `03-offline-mode-and-client-storage`.
- [x] Reconcile this design with `requirements.md` and `tasks.md`.
