# UI Shell & Navigation — Review Mockup

Status: Draft — design artifact only

This mockup translates the approved brand system and the current UI Shell & Navigation design into reviewable screen compositions. It is not application code and does not change the implementation gate: `tasks.md` remains `Status: Draft`.

## Visual direction

- **Primary surface:** floor/mobile, portrait, 375–430px wide, 16px page padding.
- **Office enhancement:** 1024px+, 32px page margin, 24px gutter, max-width 1280px.
- **Primary brand:** `brand-navy` `#002060`; active navigation and primary structural emphasis.
- **Action accent:** `brand-red` `#E30613`; actions only, never semantic status.
- **Floor text:** `on-surface` `#1A1B20`; minimum 16px, AAA for time-critical actions.
- **Floor surfaces:** opaque white cards with Level 2 elevation; no blur or glassmorphism.
- **Typography:** Fira Sans for headings/data, Outfit for body, Epilogue for labels/actions, Roboto Mono for codes and quantities.
- **Shape:** 8px default radius; diagonal-cut motif is reserved for office primary actions and must not reduce floor tap targets.

## 1. Floor shell — default route

Target viewport: **390 × 844px portrait**

```text
┌──────────────────────────────────────┐
│  [D]  Dyna-Serv              ◉  ☺    │  72px app header / solid navy
│      WIMS                         56  │  logo + connectivity + account
├──────────────────────────────────────┤
│                                      │
│  GOOD MORNING, MARCO                 │  Epilogue label, 16px
│  Warehouse overview                  │  Fira Sans headline-md
│                                      │
│  ┌────────────────────────────────┐  │
│  │  TODAY                          │  │
│  │  24 receiving tasks             │  │  Fira Sans data-display
│  │  8 picking tasks                │  │
│  │  3 inspections waiting          │  │
│  └────────────────────────────────┘  │  opaque white / Level 2
│                                      │
│  QUICK ACTIONS                       │
│  ┌────────────────────────────────┐  │
│  │  ◎  Receive incoming stock     │  │  64px minimum row
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  ◇  Start a pick list          │  │  64px minimum row
│  └────────────────────────────────┘  │
│                                      │
│                                      │
│  ┌────────────────────────────────┐  │
│  │         OPEN WORK QUEUE        │  │  one obvious next action
│  └────────────────────────────────┘  │  full-width brand-red CTA
│                                      │
├──────────────────────────────────────┤
│   Home       Work       Alerts   More │  72px bottom tab bar
└──────────────────────────────────────┘
```

Notes:

- The bottom navigation is the floor presentation of the shared registry; it is not a second route list.
- The floor shell does not render a persistent sidebar.
- The feature area owns scan-ready workflow actions. The shell must not add a competing primary action.
- Icons require accessible text equivalents; icon shape and active semantics supplement, not replace, labels.

## 2. Floor shell — active scan flow

Target viewport: **390 × 844px portrait**

```text
┌──────────────────────────────────────┐
│  ‹  Receive stock             2 / 6  │  back + progress, 72px header
├──────────────────────────────────────┤
│                                      │
│  SCAN LOCATION                       │  Epilogue label, 16px
│                                      │
│       ┌──────────────────────┐       │
│       │                      │       │
│       │     ▣  SCAN NOW     │       │  scan-first input affordance
│       │                      │       │  solid white / navy outline
│       └──────────────────────┘       │
│                                      │
│  Point the scanner at the location   │  Outfit body-md, on-surface
│  label.                               │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  LOCATION                       │  │
│  │  A-01-03-02                     │  │  Roboto Mono, 24px
│  │  Ready for receiving             │  │  status icon + text
│  └────────────────────────────────┘  │
│                                      │
│  Enter manually                      │  secondary recovery action
│                                      │
│  ┌────────────────────────────────┐  │
│  │          CONFIRM LOCATION      │  │  64px+ full-width CTA
│  └────────────────────────────────┘  │  brand-red, solid corners
└──────────────────────────────────────┘
```

Active scan behavior:

- Hide the bottom navigation during the active scan step so the next physical action dominates.
- Scanner input is focused and ready before decorative content loads.
- Successful scan: brief full-screen `status-available` flash plus “Location confirmed” text/icon.
- Failed scan: brief full-screen `status-held` flash plus corrective text/icon; never communicate failure by color alone.
- Primary action uses immediate press feedback (`active`, near-instant); no hover behavior.

## 3. Office shell — dashboard / review route

Target viewport: **1280 × 800px**

```text
┌──────────────┬────────────────────────────────────────────────────────────┐
│              │  Dyna-Serv WIMS                         ● Online   Marco ▾  │
│   [D]        ├────────────────────────────────────────────────────────────┤
│  Dyna-Serv   │  Dashboard                                                   │
│    WIMS      │  Warehouse overview                         [Open work queue]│
│              │                                                              │
│  WORKSPACE   │  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐  │
│  ▸ Dashboard │  │ RECEIVING      │ │ PICKING        │ │ INSPECTION     │  │
│    Receiving │  │ 24 open        │ │ 8 open         │ │ 3 waiting      │  │
│    Picking   │  │ 12 today       │ │ 6 due today    │ │ 1 held         │  │
│              │  └────────────────┘ └────────────────┘ └────────────────┘  │
│  OPERATIONS  │                                                              │
│    Transfers │  Recent activity                                             │
│    Approval  │  ┌───────────────────────────────────────────────────────┐  │
│              │  │ TIME       ACTIVITY                         STATUS      │  │
│  INSIGHTS    │  │ 09:42      Pick list PL-1042 released       APPROVED    │  │
│    Reports   │  │ 09:31      Receiving RCV-0281 checked       PENDING     │  │
│              │  │ 09:04      Inspection INS-0077 recorded     HELD        │  │
│  SYSTEM      │  └───────────────────────────────────────────────────────┘  │
│    Settings  │                                                              │
│              │  [brand-navy sidebar]                         max 1280px     │
│  ─────────── │                                                              │
│  ◉ Marco     │                                                              │
│  Sign out    │                                                              │
└──────────────┴────────────────────────────────────────────────────────────┘
```

Office treatment:

- Sidebar is `brand-navy` with white/70% inactive labels and `brand-red` active item.
- Sidebar labels use Epilogue SemiBold 14px; body/table content uses Outfit; codes use Roboto Mono.
- Cards may use the approved office Level 1 translucent surface treatment; modals/drawers remain opaque Level 2.
- The primary page action is placed in the page header only when the mounted feature declares one.
- Status badges pair semantic color with text/icon: `APPROVED` uses `status-available`, `PENDING` uses `status-pending`, and `HELD` uses `status-held`.

## 4. Responsive transition

```text
375–430px                  768px                         1024px+
┌──────────────┐           ┌──────────────────────┐      ┌──────┬──────────┐
│ app header   │           │ compact header      │      │side  │ content  │
│ one column   │  ─────▶   │ one/two columns     │ ───▶ │bar   │ 1280 max │
│ bottom tabs  │           │ compact nav         │      │      │          │
└──────────────┘           └──────────────────────┘      └──────┴──────────┘
 floor default              tablet enhancement            office enhancement
```

The base layout remains complete and usable; larger widths add space and office navigation rather than being required for the workflow.

## 5. Shared state specimens

| State | Composition | Signal rules |
|---|---|---|
| Loading | Preserve header/landmarks; show solid placeholder blocks | Never show stale protected data as current; scanner readiness is not blocked |
| Offline | Header indicator: `Offline` with connectivity icon | Informational only; never imply sync or authorize restricted actions |
| Error | Solid white recovery card: “We couldn’t load this page.” + Retry / Back | No stack traces, tokens, SQL, or protected record data |
| Not found / forbidden | Same safe recovery pattern with Home / Back | Do not disclose whether a scoped record exists |
| Empty access | Centered safe message + Sign out | Do not render an unbounded shell |
| Active route | Text, icon, and selected-state semantics | Never rely on color alone |

## Review checklist

- [ ] 375px and 430px portrait compositions remain fully operable with no horizontal scrolling.
- [ ] Floor primary actions are full-width and at least 64px high; floor controls are at least 56px.
- [ ] No floor text is below 16px; time-critical text meets AAA contrast.
- [ ] Floor surfaces are solid and unblurred; office translucency is limited to approved Level 1 surfaces.
- [ ] Brand red is used for actions, not semantic status.
- [ ] Active, success, failure, and connectivity states include text/icon signals in addition to color.
- [ ] The shell has one registry, one session boundary, and no client-authoritative role/capability state.
- [ ] This artifact remains documentation-only until shell tasks are approved and signed off.
