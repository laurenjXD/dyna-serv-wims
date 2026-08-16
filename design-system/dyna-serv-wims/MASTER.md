# Design System — Dyna-Serv WIMS

> **How to use:** When building a specific page, check `design-system/dyna-serv-wims/pages/[page-name].md` first.
> If it exists, its rules **override** this file. Otherwise, follow this file exclusively.
> Where this file and `specs/00-steering/ui-ux-design-plan.md` conflict, `ui-ux-design-plan.md` wins — it is the legal source of truth. This file is the actionable build reference.

**Updated:** 2026-08-09
**Canonical spec:** `specs/00-steering/ui-ux-design-plan.md`
**Figma:** `d69UrZUwxyxPbbrruXAjMX`

---

## Two Surfaces, Two Rules

This system runs two parallel surface modes. Every screen is one or the other — never mixed.

| Surface | Who uses it | Lighting condition | Design priority |
|---|---|---|---|
| **Floor** | Warehouse staff, handheld scanner | Dark warehouse, variable, often moving | WCAG AAA, solid dark bg, 64px CTAs, one action per screen |
| **Office** | Supervisors, administrators | Indoor desk, stable | WCAG AA, glassmorphism OK, dense tables, hover states |

---

## Color Tokens

### Brand (locked — do not invent new brand colors)

| Token | Hex | Tailwind class | Usage |
|---|---|---|---|
| `brand-navy` | `#002060` | `bg-brand-navy` / `text-brand-navy` | Sidebar, logo, page headers, floor screen background |
| `brand-royal-blue` | `#2E4094` | `bg-brand-royal-blue` / `text-brand-royal-blue` | Secondary nav, section headings |
| `brand-red` | `#E30613` | `bg-brand-red` / `text-brand-red` | Primary CTA buttons, active nav state — **never for status meaning** |

### Neutrals

| Token | Hex | Tailwind class | Usage |
|---|---|---|---|
| `surface-white` | `#FFFFFF` | `bg-surface-white` | Office content backgrounds, modals, printed docs |
| `surface-light-grey` | `#F2F2F2` | `bg-surface-light-grey` | Office secondary blocks |
| `on-surface` | `#1A1B20` | `text-on-surface` | **Default text on all floor screens.** Near-black, 7:1+ against white |
| `text-grey` | `#555555` | `text-text-grey` | Office body copy only — never on floor screens |
| `outline-variant` | `#C5C6D2` | `border-outline-variant/30` | Card borders and dividers — always at 30% opacity |

### Status (semantic — never substitute brand-red)

| Token | Hex | Tailwind class | Meaning |
|---|---|---|---|
| `status-available` | `#10B981` | `bg-status-available` | Available, passed, approved, fulfilled |
| `status-pending` | `#F59E0B` | `bg-status-pending` | Pending, in-transit, under inspection |
| `status-held` | `#EF4444` | `bg-status-held` | Held, failed, rejected, written off |
| `status-neutral` | `#64748B` | `bg-status-neutral` | Depleted, on-hold, draft, archived |

**Floor rule:** status color is NEVER the only signal. Every status also carries an icon or label — color alone fails in variable warehouse lighting and for colorblind staff.

### Floor Dark Surface Palette (for warehouse dark-mode)

Warehouse floors are often dim, dusty, and fast-moving. Floor screens use a high-contrast dark background to maximize readability at arms' length and under bad lighting.

| Role | Value | Usage |
|---|---|---|
| Floor background | `bg-brand-navy` (`#002060`) | Full-screen background on all floor routes |
| Floor surface card | `bg-white/10` (white at 10% over navy) | Scannable card backgrounds |
| Floor primary text | `text-white` (`#FFFFFF`) | All primary labels and data on floor screens |
| Floor secondary text | `text-white/70` | Supporting context — still ≥ 5.1:1 against navy |
| Floor border | `border-white/20` | Card and input borders on dark bg |
| Floor input bg | `bg-white/15` | Scanner input fields |
| Floor CTA success | `bg-status-available` + `text-brand-navy` | Confirm/Pass buttons — green on navy |
| Floor CTA danger | `bg-status-held` + `text-white` | Reject/Fail buttons |
| Floor CTA primary | `bg-brand-red` + `text-white` | Default primary action |

---

## Typography

| Family | Role | Weights | Tailwind font class |
|---|---|---|---|
| **Fira Sans** | Headings, data-display numbers | 700 Bold, 600 SemiBold | `font-heading` |
| **Outfit** | Body copy, table cell content | 400 Regular | `font-body` |
| **Epilogue** | Labels — nav items, badges, table headers, button labels | 600 SemiBold | `font-label` |
| **Roboto Mono** | Codes, IDs, lot numbers, barcodes, numeric columns | 400, 700 | `font-mono` |

### Type Scale

| Class | Size | Line-height | Usage |
|---|---|---|---|
| `text-headline-xl` | 40px | 48px | Page hero titles (office only) |
| `text-headline-lg` | 32px | 40px | Page headers |
| `text-headline-md` | 24px | 32px | Section headers, card titles |
| `text-data-display` | 20px | 24px | KPI numbers, count displays |
| `text-body-lg` | 18px | 28px | Intro text, descriptions |
| `text-body-md` | 16px | 24px | **Floor minimum.** Standard body text |
| `text-body-sm` | 14px | 20px | Office-only. Never on floor screens |
| `text-label` | 14px | 16px | Nav items, badge text, button labels |
| `text-mono-md` | 14px/16px | 1.4× | Codes, IDs, lot numbers |

**Absolute floor rule: no text below 16px (`text-body-md`) on any floor screen.** `text-body-sm` and `text-label` (14px) are office-only.

---

## Spacing

Base unit: **8px**. All spacing is multiples of 8.

| Context | Page padding | Gap | Max-width |
|---|---|---|---|
| Floor / handheld | `px-4` (16px) | `gap-3` (12px) | full width |
| Office / desktop | `px-8` (32px) | `gap-6` (24px) | `max-w-container` (1280px) |

---

## Touch Targets

| Context | Minimum size | Tailwind |
|---|---|---|
| Office buttons | 44×44px | `h-11` |
| Floor default | 56×56px | `h-14` |
| Floor primary CTAs (Confirm, Pass, Fail, Scan) | 64×64px full-width | `h-16 w-full` |

**Floor primary action lives in the bottom third of the viewport, always visible without scroll.** Portrait only. One-handed operation assumed.

---

## Elevation & Surface

### Floor (dark navy surface — no glassmorphism)

```
bg-brand-navy                    ← page background
  └── bg-white/10 rounded-xl     ← content card (solid, no blur)
        └── bg-white/15          ← input fields, nested areas
```

No `backdrop-blur`, no `bg-white/75`, no glassmorphism on floor screens. Glassmorphism degrades unpredictably under variable warehouse lighting.

### Office (glassmorphism — Level 1 / Level 2)

```
bg-surface-light-grey            ← page background
  └── bg-white/75 backdrop-blur-md shadow-elevation-1    ← Level 1 card
        └── bg-white/90 shadow-elevation-2               ← Level 2 modal / focused card
```

---

## Interaction

### Floor interactions

```
active:scale-[0.97]              ← press feedback on all tap targets
motion-safe:transition-transform motion-safe:duration-100
```

No `hover:` variants on floor screens — hover is meaningless on touch devices and scan workflows. Use `active:` and `focus:` only.

```css
/* Scan success flash */
.scan-success { @apply bg-status-available; animation: flash 400ms ease-out; }
.scan-error   { @apply bg-status-held;      animation: flash 400ms ease-out; }
@keyframes flash { 0% { opacity: 1; } 100% { opacity: 0; } }
```

### Office interactions

```
hover:bg-surface-light-grey/50       ← table row hover
hover:text-brand-navy                ← link hover
transition-all duration-150          ← standard transition speed
```

---

## Component Patterns

### Floor Scan Input

```tsx
<input
  type="text"
  inputMode="text"          // text for barcode; "numeric" for manual qty entry
  autoComplete="off"
  autoFocus                 // auto-focus on mount — scanner fires keyboard events
  className="w-full h-14 bg-white/15 border border-white/20 rounded-xl
             px-4 text-white text-body-md font-mono
             focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent
             placeholder:text-white/40"
  placeholder="Scan barcode or type manually"
/>
```

### Floor Primary CTA

```tsx
<button className="w-full h-16 bg-brand-red text-white rounded-xl
                   font-label text-body-md uppercase tracking-wide
                   active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100
                   focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy">
  Confirm Receipt
</button>
```

### Floor Status Card

```tsx
<div className="bg-white/10 border border-white/20 rounded-xl p-4">
  <div className="flex items-center justify-between">
    <span className="font-label text-body-md text-white uppercase tracking-wide">LOT NUMBER</span>
    <span className="font-mono text-mono-md text-white/70">WRR-2026-00001</span>
  </div>
  <div className="mt-2 flex items-center gap-3">
    <span className="inline-flex items-center gap-1 rounded-full bg-status-available/20 text-status-available px-3 py-1 font-label text-body-md">
      ✓ Matched
    </span>
  </div>
</div>
```

### Office Status Badge

```tsx
<span className={`inline-flex items-center rounded-full px-2 py-0.5
                 font-label text-label uppercase tracking-[0.05em]
                 ${STATUS_CLASSES[status]}`}>
  {STATUS_LABELS[status]}
</span>
```

### Office Table (dense)

```tsx
<div className="overflow-hidden rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1">
  <div className="overflow-x-auto">
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
          <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
            Column Header
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-outline-variant/30">
        <tr className="hover:bg-surface-light-grey/50">
          <td className="px-4 py-3 font-body text-body-md text-on-surface">Value</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

---

## Contrast Requirements

| Surface | Text role | Minimum ratio | Standard |
|---|---|---|---|
| Floor — primary text (critical action) | White on brand-navy | **≥ 7:1** | WCAG AAA |
| Floor — secondary text | white/70 on brand-navy | ≥ 5.1:1 | WCAG AA+ |
| Floor — status on dark bg | status-available/pending/held on navy | ≥ 4.5:1 | WCAG AA |
| Office — body text | text-grey on white | 5.3:1 | WCAG AA |
| Office — on-surface on white | on-surface on white | 14.7:1 | WCAG AAA |

---

## Icon Rules

- **Icon library:** Lucide React only. No mixing sets.
- **Floor icons:** `size={24}` minimum (24×24px rendered), `strokeWidth={2}`
- **Office icons:** `size={16}` or `size={20}` in tables/badges; `size={24}` in headers
- **Never use emoji as icons.**
- **Every icon-only button needs `aria-label`.**

---

## Motion Rules

```
Allowed:         active:scale-[0.97], transition-opacity, transition-colors (150-300ms)
Floor-only:      scan-feedback full-screen flash (400ms, then gone)
Office-only:     hover transforms, backdrop-blur, elevation shadows
Never:           layout-shifting transforms (scale on hover that pushes content)
Reduced-motion:  motion-safe: prefix on all transitions
```

---

## Accessibility Checklist (pre-delivery)

- [ ] All interactive elements have visible focus rings (`focus:ring-2 focus:ring-brand-navy` or `focus:ring-white` on dark)
- [ ] No color-only status signals — always paired with icon or text label
- [ ] Floor text: nothing below 16px
- [ ] Touch targets: floor CTAs 64×64px (`h-16`), office 44×44px (`h-11`)
- [ ] Scanner input: `autoFocus` + `inputMode` set correctly
- [ ] `motion-safe:` prefix on all transitions
- [ ] `aria-label` on all icon-only buttons
- [ ] Contrast checked against the table above
- [ ] No horizontal scroll at 375px (floor) or 1280px (office)
- [ ] Tablet fallback tested at 768px for floor screens viewed on larger devices

---

## Navigation Design

### Architecture

Two alternate presentations of the same registry — never both at once:

| Tier | Presentation | Renders when |
|---|---|---|
| `floor` | Fixed bottom tab bar | Session is `warehouse_staff` |
| `office` / `party` | Left sidebar, 240px, sticky | Session is `supervisor` / `administrator` / `party_user` |

### Floor Tab Bar

```
┌─────────────────────────────────────────────┐
│ [Receiving] [Inventory] [Outgoing] [Profile] │  ← h-16 (64px), bg-brand-navy
│   [icon]      [icon]      [icon]    [icon]   │  ← 24px Lucide icon
│   Receive    Inventory   Outgoing   Profile  │  ← text-body-md (16px min), text-white/70
└─────────────────────────────────────────────┘  ← active: text-brand-red + icon fill
```

**Rules:**

- Max 5 items — floor users need to tap, not scan a nav list
- Each item: icon (24px) + label (16px, `text-body-md`) stacked vertically
- Active state: `text-brand-red`, icon uses `fill-brand-red` where fillable
- Tap target: `min-h-16` (64px) — gloved-hand floor standard
- `aria-current="page"` on active link — never use only color to signal active
- `aria-label="Primary navigation"` on `<nav>`
- No hover states — `active:opacity-75` for press feedback

### Office Sidebar

```
┌─────────────────────────┐
│ ┌─────────────────────┐ │
│ │  DYNA-SERV     [DS] │ │  ← brand logo area, h-16, brand-navy
│ └─────────────────────┘ │
│                         │
│  OVERVIEW               │  ← section header: text-white/40, text-label, uppercase
│  [icon] Dashboard       │  ← link: icon(16px) + label, text-white/70
│                         │
│  RECEIVING              │
│  [icon] Receiving       │  ← active: bg-brand-red, text-white, rounded
│                         │
│  OUTBOUND               │
│  [icon] Inventory       │
│  [icon] Outgoing        │
│                         │
│  MASTER DATA            │
│  [icon] Enrollment      │
│  [icon] Transfers       │
└─────────────────────────┘
```

**Rules:**

- Icon (16px Lucide) left of label, `gap-3` spacing
- Active: `bg-brand-red text-white rounded-md` — `aria-current="page"`
- Inactive: `text-white/70 hover:bg-brand-royal-blue/40 hover:text-white`
- Section headers: `text-white/40`, non-interactive, `aria-hidden="true"`
- `role="navigation"` + `aria-label="Primary navigation"`
- Keyboard: full Tab focus through all links, `focus-visible:ring-2 focus-visible:ring-white`
- Skip link: `<a href="#main-content" className="sr-only focus:not-sr-only ...">Skip to content</a>` at the very top of layout

### Icon Map (Lucide — must be consistent)

| Route | Icon name | Lucide import |
|---|---|---|
| `/` | `LayoutDashboard` | Overview/Home |
| `/receiving` | `PackageCheck` | Receiving |
| `/inventory` | `Layers` | Master Inventory |
| `/outgoing` | `PackageMinus` | Outgoing |
| `/enrollment` | `Users` | Enrollment / Master Data |
| `/transfers` | `ArrowLeftRight` | Transfers |
| `/approvals` | `CheckSquare` | Approvals |
| `/documents` | `FileText` | Documents |
| `/reports` | `BarChart2` | Reports |
| `/billing-pricing` | `Receipt` | Billing |
| `/sync` | `RefreshCw` | Sync |
| `/profile` | `UserCircle` | Profile |
| `/settings` | `Settings` | Settings |
| `/portal` | `Globe` | Party Portal |

### Accessibility Requirements (non-negotiable)

- [ ] Skip-to-content link renders before `<nav>`, visible on focus
- [ ] `<nav aria-label="Primary navigation">` — one nav landmark
- [ ] Every link has `aria-current="page"` when active
- [ ] Active state signalled by both color AND `aria-current` (never color alone)
- [ ] All links keyboard-focusable with visible ring (`focus-visible:ring-2`)
- [ ] Floor tab icons: `aria-hidden="true"` on `<svg>` (label provides the name)
- [ ] Office links: icon `aria-hidden="true"`, text node provides the accessible name
- [ ] Mobile floor bar: `role="tablist"` pattern NOT used (these are links, not tabs)
- [ ] No `pointer-events-none` or `tabIndex={-1}` on visible nav items

---

## Page Inventory (what exists / what needs building)

### Built and live

| Route | Surface | Status |
|---|---|---|
| `/` | shared | Live |
| `/receiving` | shared | Live — 3 tabs: Receive, WRRs, Incoming Ledger |
| `/inventory` | office | Live — 3 tabs: Stock View, Pick Lists, Daily Inspection |
| `/outgoing` | floor | Live — 2 tabs: Active Picks, Outgoing Ledger |
| `/enrollment` | office | Live — 3 tabs: Parties, Items, Locations |
| `/master-data/parties` | office | Live |
| `/master-data/items` | office | Live |
| `/master-data/locations` | office | Live |
| `/transfers` | shared | Registry only, page = planned |
| `/approvals` | office | Live (registry) |
| `/pick-lists/[id]/pick` | floor | Live |
| `/pick-lists/[id]/dispatch` | floor | Live |
| `/profile` | shared | Live (registry) |
| `/settings` | office | Live (registry) |

### Needs building

| Route | Surface | Priority | Spec |
|---|---|---|---|
| `/receiving/new` | office | **High** — WRR create form | 07 |
| `/receiving/[wrrId]` | office | **High** — WRR detail/review | 07 |
| `/receiving/[wrrId]/receive` | **floor** | **Highest** — active scan flow | 07 |
| `/receiving/[wrrId]/inspection` | floor | High | 07 |
| `/receiving/[wrrId]/print` | print | Medium | 07 |
| `/master-data/parties/[id]` | office | Medium | 06 |
| `/master-data/items/[id]` | office | Medium | 06 |
| `/master-data/locations/[id]` | office | Medium | 06 |
| `/transfers/new` | shared | Medium | 11 |
| `/transfers/[id]` | shared | Medium | 11 |
| `/approvals/[id]` | office | Medium | 09 |
| `/documents` | office | Low | 10 |
| `/reports` | office | Low | 16 |
| `/billing-pricing` | office | Low | 12/13 |
| `/sync` | shared | Low | 03 |

---

## Floor Screen Layout Template

Every floor screen follows this exact structure. No exceptions.

```
┌─────────────────────────────────────┐  ← bg-brand-navy, full screen
│  ← Back    [Screen Title]    [...]  │  ← top bar, h-14, bg-brand-navy
├─────────────────────────────────────┤
│                                     │
│    [Scan input — full width]        │  ← h-14, bg-white/15, font-mono
│                                     │
│    [Current item card]              │  ← bg-white/10, rounded-xl
│      LOT: WRR-2026-001             │
│      Expected:  24  Scanned: 18    │
│      Status: ● In Progress         │
│                                     │
│    [Line list — scrollable]         │  ← remaining space
│      ✓ Item A   24/24  MATCHED     │
│      ○ Item B   18/24  PENDING     │
│      ✗ Item C    0/6   EXCEPTION   │
│                                     │
├─────────────────────────────────────┤
│  [Primary CTA — h-16, full width]  │  ← bottom third, always visible
│         CONFIRM RECEIPT             │
└─────────────────────────────────────┘
```

---

## Office Screen Layout Template

```
┌──────────────────────────────────────────────────────────┐
│  [Shell sidebar — brand-navy, 240px]   [Page content]    │
│    Dyna-Serv logo                       ┌──────────────┐ │
│    ───────────                          │ Page header  │ │
│    Overview                             │ h1 + desc    │ │
│    Receiving  ←active                   ├──────────────┤ │
│    Outbound                             │ Tab switcher │ │
│    ...                                  ├──────────────┤ │
│                                         │ Tab content  │ │
│                                         │ Glass card   │ │
│                                         │ Dense table  │ │
│                                         └──────────────┘ │
└──────────────────────────────────────────────────────────┘
```
