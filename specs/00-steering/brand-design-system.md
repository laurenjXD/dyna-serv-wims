# Brand Identity & Design System — Dyna-Serv
Status: Approved. Single source of truth, alongside Figma file `d69UrZUwxyxPbbrruXAjMX`.

This replaces all prior brand documents. Where anything else conflicts with this doc, this doc wins — log the conflict in `revision-log.md`. No "or" alternates anywhere below.

**Design priority, stated explicitly:** the warehouseman on a mobile scanner is the primary user this system is optimized for, not the supervisor at a desktop. Every decision below defaults to floor/mobile constraints first; desktop/office screens are the secondary case that gets to use the extra space, not the baseline everything else degrades from. This is a reversal from how the original component work was done (desktop layouts built first, mobile bolted on) — see §3 for what that reversal actually means in practice.

---

## 1. Color System

### 1.1 Brand colors — "Steel & Hazard" (adopted 2026-08-12)

**Superseded 2026-08-12**: both the 2026-08-10 indigo experiment and the 2026-08-11 navy/red reversion are retired. This is a from-scratch identity — see `revision-log.md`. The direction: industrial steel structure (the racking, the equipment, the building) carries the interface; a single warehouse-authentic accent — safety orange, the color of hazard tape, forklifts, and high-vis vests — marks the one thing on any screen that actually needs to be pressed. It is never used for status, because status already has its own vocabulary (§1.3) and doubling up would make "press this" and "this is pending" mean the same color.

| Token | Hex | Usage |
|---|---|---|
| `brand-navy` | `#1E293B` | Primary structural color — sidebars, headers, footer bars, primary icon fills. (Token name kept for source continuity; the value is now slate-800, not a navy blue.) |
| `brand-royal-blue` | `#475569` | Secondary structural treatment — secondary nav elements, chart series, subordinate structural fills. (slate-600) |
| `brand-red` | `#9A3412` | **Accent/CTA only.** Primary buttons, the one primary action per screen, key highlights. Burnt safety-orange, not a red — token name kept for source continuity with the RBAC/spec cross-references that predate this palette. **Contrast note**: the first choice for this role was a brighter `#EA580C` (Tailwind orange-600), which reads more like genuine hazard-tape orange — but white button text on it measures only 3.56:1, worse than either prior palette's red ever achieved (old `#E30613`: 4.88:1). This darker value gives white text 7.31:1 (AAA), verified 2026-08-12 — an accessibility improvement over both previous iterations, not just a lateral color swap, and the real reason this token is a "burnt"/rust orange rather than the brighter hazard-orange the name evokes. **Never used for status/semantic meaning** — see §1.3. |

### 1.1a Accent scale

Backgrounds/icons/active-states only — **never text color** (see the text-color rule below). Aliases of the structural slate values, not a separate scale.

| Token | Hex | Usage |
|---|---|---|
| `accent-indigo-50` | `#F1F5F9` | Lightest tint — icon-badge backgrounds on KPI/dashboard cards, subtle highlight fills. (slate-100) |
| `accent-indigo-300` | `#475569` | Mid tone — secondary accents, hover states, chart secondary series. (slate-600) |
| `accent-indigo-600` | `#1E293B` | Primary structural accent — sidebar active-nav-item background, icon-badge foreground, primary chart bars. (slate-800) |

**Text-color rule (reaffirmed): headings, labels, and body copy are always `on-surface` or `text-grey` — never `brand-navy`, `brand-red`, `brand-royal-blue`, or any `accent-indigo-*` value.** Those colors are for backgrounds, icons, borders, active-state fills, and chart marks only. This keeps every page's actual reading text black/near-black regardless of how many accent colors a given screen uses elsewhere.

**Signature pattern — the colored left-accent bar.** The one recurring, deliberate visual device this system uses (see the frontend-design principle of spending boldness in one consistent place, not scattering it): a card or alert that needs to draw the eye carries a 4px solid left border in the color that explains *why* it matters — `border-status-held` for an exception, `border-brand-red` for the one primary action context on a card, `border-status-available` for a completed/passed state. This is not decoration; the color on the edge is the same token driving the icon/badge inside, so the border and the content never disagree. Already used on the receiving floor scan screen's exception cards — this makes it the house pattern, not a one-off.

### 1.2 Neutrals
| Token | Hex | Usage |
|---|---|---|
| `text-grey` | `#475569` | Standard body copy — office/desktop contexts only. Floor/mobile screens use `on-surface` (below) or pure black instead; see §5's contrast escalation. (slate-600) |
| `surface-white` | `#FFFFFF` | Primary content backgrounds, and any surface that needs full opacity (modals, drawers, printed documents). |
| `surface-light-grey` | `#F8FAFC` | Light neutral canvas for secondary content blocks and subtle section division — the office dashboard backdrop. (slate-50) |
| `on-surface` | `#0F172A` | Default text color where higher contrast than `text-grey` is needed — the default for all floor/mobile screens. (slate-900) |
| `outline-variant` | `#E2E8F0` | Card borders and dividers — always at 30% opacity, never solid. (slate-200) |

### 1.3 Status colors (semantic — distinct from the brand accent)
| Token | Hex | Meaning | Contrast vs. on-surface text |
|---|---|---|---|
| `status-available` | `#10B981` | Available, passed inspection, approved, fulfilled | 7.04:1 — AAA |
| `status-pending` | `#EAB308` | Pending, in-transit, under inspection — a true yellow, deliberately far from `brand-red`'s orange on the color wheel so the two are never confusable at a glance | 9.31:1 — AAA |
| `status-held` | `#EF4444` | Held, failed, rejected, written off | 4.74:1 — AA. **Known gap, not silently claimed as more than it is**: this is the one status color that does not reach the §1.5 AAA floor for time-critical floor text. Verified 2026-08-12; no color in the red family reaches 7:1 against `on-surface` without reading as pink rather than "held." Until this is revisited, floor screens using this as a solid flash background should pair it with the icon+text redundancy §1.3's floor rule already requires, not rely on the color/text contrast alone. |
| `status-neutral` | `#64748B` | Depleted, on-hold, draft | — (never used as a solid full-screen flash background) |

**Why `status-held` and `brand-red` are visually distinct on purpose:** a *button* using `brand-red` (safety orange) means "do this action"; a *badge* using `status-held` (true red) means "this lot is held." The two aren't even the same hue family here, which makes the old collision risk (an orange CTA next to a red status pill both reading as "important" with no further distinction) structurally impossible rather than just documented against.

**Floor-specific rule:** status color alone is never the only signal on a floor screen — every status also carries an icon or full-screen flash pattern (§9), because color-only differentiation fails outdoors under variable warehouse lighting and for colorblind staff. See §5.

### 1.4 Form validation
Reuses `status-held` (`#DC2626`) for error borders/text — not `brand-red`, since a validation error is a status condition, not a call to action.

### 1.5 Contrast — two tiers, not one
- **Office/desktop screens**: WCAG AA. Body text 4.5:1, large text/UI 3:1.
- **Floor/mobile screens: WCAG AAA where the action is time-critical.** 7:1 for any text driving an immediate physical action (scan result, pass/fail, confirm), 4.5:1 minimum for everything else on that screen. Reasoning in §5.

---

## 2. Typography

**Revised 2026-08-12** — a display face is reintroduced for headings/section titles only; body copy, data tables, and functional labels stay on Inter exactly as before. See `revision-log.md` for rationale. `Fira Sans` / `Outfit` / `Epilogue` / `Roboto Mono` remain retired; do not introduce new usages of them.

| Family | Role | Weights used |
|---|---|---|
| **Space Grotesk** | Headings and section titles only (`headline-*`) — the page's visual personality, used with restraint | Bold (700), SemiBold (600), Medium (500) |
| **Inter** | Everything else: data-display numbers, body copy, functional labels (nav items, badges, table headers, button labels) — differentiated by weight, not by switching families | ExtraBold (800), Bold (700), SemiBold (600), Medium (500), Regular (400) |
| **JetBrains Mono** | Codes, IDs, lot numbers, table numeric columns | Regular (400), Bold (700) |

### Type scale
| Style | Family/Weight | Size | Line height | Tracking |
|---|---|---|---|---|
| headline-xl | Space Grotesk Bold | 40px | 48px | -0.02em |
| headline-lg | Space Grotesk Bold | 32px | 40px | -0.01em |
| headline-md | Space Grotesk SemiBold | 24px | 32px | normal |
| data-display | Space Grotesk SemiBold | 20px | 24px | normal |
| body-lg | Inter Regular | 18px | 28px | normal |
| body-md | Inter Regular | 16px | 24px | normal |
| body-sm | Inter Regular | 14px | 20px | normal |
| label | Inter SemiBold | 14px | 16px | 0.03em |
| mono | JetBrains Mono Regular/Bold | context-dependent, 11-24px | 1.4x size | normal |

**Why a second family only for headings:** a page built entirely from one weight-varying family (the 2026-08-09 decision) is legible but has no personality of its own — every screen reads like every other enterprise dashboard. Space Grotesk's geometric, slightly technical character gives section titles and page headers real presence without touching anything legibility-critical: body copy, dense tables, and floor screens (where the 16px minimum below is the load-bearing rule, not typeface choice) stay on Inter exactly as before. This is the one typographic risk this system takes, confined to headings only so it can never compromise a floor worker's ability to read a scan result at a glance.

**Floor-specific minimum:** no text below 16px (`body-md`) anywhere on a floor screen, even for secondary labels — `body-sm` (14px) is office-only. Small text that's easy to read on a desk-height monitor is not easy to read on a handheld scanner in motion.

---

## 3. Device & Interaction Priority — the actual reversal

**Every floor-role screen (Receiving, Picking, Inspection, and any withdrawal step a warehouseman touches) is designed mobile-first: base styles target a ~375-430px handheld scanner viewport, then progressively enhance for larger screens if that screen is ever viewed on one.** Office/supervisor screens (Approval Queue on a desk monitor, Analytics, Settings) are designed desktop-first but must remain usable down to mobile — a supervisor checking the queue from their phone is a real, secondary case, not an edge case to ignore.

This means the existing 3-panel desktop layout built for Outgoing/Withdrawal earlier (search | cart | summary, side by side) is **not** the floor-appropriate pattern where a warehouseman is the one operating it — that layout assumes desktop width. Any floor-touched step of that flow needs a single-column, one-task-per-screen mobile version; the 3-panel view can remain for office staff building a request at a desk. Flag this explicitly when withdrawal specs are drafted rather than reusing the existing layout unexamined.

### Breakpoints (mobile-first — base styles are unprefixed/smallest)
| Breakpoint | Width | Applies to |
|---|---|---|
| base (no prefix) | 0-639px | Default. Every floor screen must be fully functional here with zero enhancement. |
| `sm` | 640px+ | Larger handhelds/small tablets |
| `md` | 768px+ | Tablets, first point where multi-column layouts become appropriate |
| `lg` | 1024px+ | Desktop — office/supervisor screens' primary target |
| `xl` | 1280px+ | Wide desktop, matches container max-width (§4) |

### Touch targets — floor minimums exceed generic mobile accessibility standards
| Context | Minimum size | Why |
|---|---|---|
| Office/desktop buttons | 44x44px | Standard accessibility baseline |
| Floor/mobile default | 56x56px | Baseline mobile isn't enough on its own once gloves are in play |
| Floor primary actions (Confirm, Pass/Fail, Scan-adjacent) | 64x64px minimum, full-width where possible | Matches gloved-hand accuracy, not bare-finger accuracy — this was already the `lg` button size, now stated as the floor *default*, not an option |

### Thumb-zone layout
Primary action for any floor screen sits in the **bottom third of the viewport**, full-width, always visible without scrolling. Secondary/destructive actions (Override, Cancel) sit above it, smaller. This assumes one-handed operation — the other hand is usually holding the item or the truck.

### One primary action per floor screen
A floor screen shows exactly one obvious next action at a time (Confirm, Pass/Fail, Scan Next). Multi-step forms, tabs, and side-by-side panels are office patterns — they slow down a scan-driven workflow and increase mis-taps under time pressure. If a flow genuinely needs multiple decisions, sequence them as separate full screens, not one dense screen.

### Input priority: scan > tap > type
In that order. Every floor interaction should default to the fastest, lowest-error input available: barcode scan first, single tap second, manual keyboard entry only as a last-resort fallback (already true for the "reprint existing / standalone enroll" recovery paths — this principle should now be checked against every floor flow, not just receiving).

### Orientation
Portrait is the primary, supported orientation for all floor screens — most rugged handheld scanners are used portrait, one-handed. Landscape is not a design target; don't build layouts that assume it.

---

## 4. Spacing & Layout

- Base unit: **8px**, multiples of 8 throughout.
- Floor screens: page padding 16px (not the 32px office default — screen real estate is scarcer and more valuable on a handheld).
- Office page margin: `2rem` (32px). Gutter: `1.5rem` (24px). Container max-width: `1280px`.

## 5. Shape

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 4px | Small pills, tags |
| `radius-default` | 8px | Standard cards, buttons, inputs |
| `radius-md` | 12px | Larger cards, modals |
| `radius-lg` | 16px | Hero cards, feature panels |
| `radius-full` | 9999px | Status badges, avatar circles |

---

## 6. Elevation & Surfaces

**Revised 2026-08-09 — glassmorphism retired app-wide, not just on floor.** Office cards previously used `bg-white/75` + `backdrop-blur-md`. That's replaced with solid cards on a light `surface-light-grey` page background, matching the flat, modern-dashboard direction (see `revision-log.md`). Glass/blur surfaces are no longer used anywhere in the product — the floor-only restriction below is now redundant with the office rule but is kept for its own documented reasoning (contrast, performance).

| Level | Surface | Shadow | Used for |
|---|---|---|---|
| 0 | Page background — `surface-light-grey` (office), `surface-white` (floor, per §8 contrast) | none | Base page |
| 1 | Solid `surface-white`, `border` `outline-variant/30` | `0 1px 2px rgba(61,59,243,0.08)` | Cards, panels — office and floor alike |
| 2 | Solid `surface-white` | `0 4px 16px rgba(61,59,243,0.12)` | Modals, drawers, dropdowns |

**Floor-specific note (retained): no glassmorphism (translucent/blurred surfaces) on floor screens.** Backdrop blur reduces effective contrast exactly where AAA contrast is required (§1.5), and costs real rendering performance on the mid-tier rugged Android hardware floor devices actually run (§8). Floor cards use solid `surface-white` at full opacity, Level 2 treatment, even though that's nominally the "modal" level elsewhere — floor screens don't get a Level 1 option.

---

## 7. The Diagonal-Cut Motif — retired

**Retired 2026-08-09.** The diagonal-cut clip-path (previously applied to primary CTA buttons) is removed app-wide as part of the modern-dashboard restyle (`revision-log.md`) — it read as an angular, brochure-era accent that fought the flat, rectangular card language the rest of the restyle adopted. Primary buttons use plain `rounded` corners now, same as every other button variant in §9. `.btn-diagonal-cut` no longer exists in `app/globals.css`; do not reintroduce it or the `clip-path` polygon it used.

---

## 8. Performance Budget (floor devices)

Floor devices are rugged mid-tier Android hardware (Zebra/Honeywell-class scanners or generic industrial tablets), not flagship phones — design and build assuming weaker GPU/CPU, not desktop-adjacent power:

- No backdrop-blur on floor screens (§6)
- Animations on floor screens: opacity/color transitions only, no scale/transform-heavy effects beyond the existing press-feedback (§9) — transform animations are the most GPU-costly and least necessary here
- Floor screen initial content must be interactive (scanner input focused and ready) before any decorative asset finishes loading — scanning should never wait on images
- Full-screen flash feedback (§9) is a solid color fill, not a gradient or blurred overlay — cheapest possible render for the highest-frequency visual event in the whole app

---

## 9. Component Guidance

**Buttons**
- Primary: `brand-red`, `rounded` corners (see §7 — diagonal-cut retired), white text, Inter SemiBold label
- Office size: 44px default height. **Floor size: 64px minimum height, full-width, is the default — not an opt-in "lg" variant.**
- Secondary: `brand-navy` solid
- Outline: 2px `outline-variant` border, transparent background — office only; floor screens avoid outline-only buttons since they're harder to spot at speed
- Destructive: `status-held` solid

**Touch/press feedback (floor) vs. hover (office) — these are not interchangeable.** Touchscreens don't have a meaningful hover state; a hover-triggered effect on tap can double-fire or feel laggy. Floor buttons get an immediate `active:` press state (scale to 0.97, no transition delay) instead of any `hover:` effect. Office/desktop components keep hover (§10).

**Sidebar**: `brand-navy` background, white/70% opacity inactive labels, `accent-indigo-600` active-item background (updated 2026-08-10 — office sidebar's active state is indigo, not `brand-red`, so it reads as a distinct navigation signal from CTA-red buttons elsewhere on the page), Inter SemiBold 14px labels, real letter-mark logo (never an icon-font ligature rendered as text). **On floor screens, the sidebar collapses to a bottom tab bar or is hidden entirely during an active scan flow** — a persistent side rail is desktop real estate floor screens don't have to spare. Floor tab bar's active state stays `brand-red` (unchanged) — this indigo/red split is office-sidebar-only.

**Cards**: Office: Level 1 elevation. Floor: Level 2, solid, per §6.

**Status badges/pills**: `radius-full`, Inter SemiBold uppercase, colored per §1.3 — paired with an icon on floor screens, never color alone (§1.3, §5).

**Tables**: Inter SemiBold uppercase headers, Inter Regular body, JetBrains Mono for ID/code/quantity columns. **Floor screens avoid dense tables entirely** — the Incoming Stock Ledger pattern (a full data table) is an office/review pattern, not something a warehouseman scans against in real time; floor equivalents should be card-based lists, one item per row, not a multi-column table requiring horizontal scanning.

**Forms**: Inter Regular, `brand-navy` focus ring. Floor screens minimize form fields per §3's input-priority rule — every field that could instead be a scan or a single tap should be.

**Dashboard / KPI cards** *(added 2026-08-09, updated 2026-08-10)*: Office screens that summarize data (Analytics/Reporting §16, dashboard landing views, Approval Queue overview) use a light `surface-light-grey` page background with `surface-white` KPI tiles at Level 1 elevation, `radius-md`, laid out in a responsive grid (`md:grid-cols-2 lg:grid-cols-3`+). Each tile: `label` (Inter SemiBold, uppercase, `text-grey`) above a `headline-lg`/`headline-xl` figure in Inter ExtraBold **in `on-surface`, never a brand color** (§1.1a's text-color rule), with a small leading icon in an `accent-indigo-50` badge (`accent-indigo-600` icon color) and an optional trend indicator using `status-available`/`status-held` (never bare red/green — pair with an ↑/↓ glyph, same color-not-alone rule as §1.3). `brand-red` remains the one CTA-red accent used sparingly for the single most important figure or chart series per view; `accent-indigo-600` is the default chart/icon accent everywhere else. Chart cards (line/bar) follow the same tile treatment; chart colors pull from the existing brand/status/accent-indigo palette only — no new hex values introduced for data visualization (§13).

**Floor adaptation of the dashboard pattern**: floor screens never render a multi-tile KPI grid — that's an office-density pattern and violates §3's one-primary-action rule. Where a floor screen needs a single at-a-glance figure (e.g., "Items scanned today"), it gets one large `headline-xl` stat at the top of the existing card-list layout, not a grid, and it is never itself the primary tap target.

---

## 10. Motion

- **Office**: hover scale to 1.02, 150-200ms transitions.
- **Floor**: no hover. `active:` press feedback only (scale to 0.97, near-instant). Full-screen color flash for scan success/error is functional feedback, not decoration, and is the single highest-priority animation in the app — it must never be delayed or skipped for performance reasons; everything else can be.
- Respect `prefers-reduced-motion` everywhere: disable scale/transition effects, keep instant state changes and the flash feedback (flash duration shortens, but the signal itself stays — it's information, not flourish).

---

## 11. Accessibility

- Touch targets: 44px office minimum, **56px floor default, 64px floor primary actions** (§3).
- Contrast: AA office, **AAA for time-critical floor text** (§1.5).
- Visible focus ring on every interactive element: 2px solid `brand-navy`, never removed — matters even on touch-primary devices, since a paired keyboard/scanner-as-keyboard can still tab-navigate.
- Status is never color-only: every status pill and scan-result state pairs color with an icon and/or the full-screen flash pattern (§1.3, §9).
- No text below 16px on floor screens (§2).
- `prefers-reduced-motion` respected everywhere (§10).

---

## 12. Implementation (Next.js + Tailwind — Option A stack)

- All tokens defined in `tailwind.config.ts` — components consume Tailwind classes, never inline hex values. **Narrow exception, added 2026-08-09**: SVG-based charting libraries (e.g. recharts) take raw prop values (`fill`, `stroke`, `tick.fill`, tooltip `contentStyle`), not Tailwind classes, so a chart component may pass hex literals directly — but only values that are an exact, traceable match to an already-documented token in §1 (e.g. `#1E293B` for `brand-navy`, `#9A3412` for `brand-red`). No chart may introduce a hex value that isn't already named in §1. This is the only sanctioned inline-hex path in the codebase.
- Mobile-first Tailwind usage is structural, not optional: base (unprefixed) classes are the floor/mobile styles; `md:`/`lg:` prefixes layer on office/desktop enhancements. Writing desktop styles unprefixed and mobile as an override is backwards and not permitted per §3.
- Fonts loaded via `next/font/google`, scoped to weights actually used (§2).
- Floor-screen components should be built and tested first at the 375px breakpoint, not designed at desktop width and shrunk down — matches §3's actual priority, not just its stated intent.
- For generated PDFs (pick lists, acknowledgement receipts), this doc's values are the source of truth to hand-copy from.

---

## 13. Governance

This document and the Figma file are the only two sources of truth. Any new value must be added here — logged in `revision-log.md` — before shipping. A component built with an undocumented value is the bug, not the documentation gap.
