# Brand Identity & Design System — Dyna-Serv
Status: Approved. Single source of truth, alongside Figma file `d69UrZUwxyxPbbrruXAjMX`.

This replaces all prior brand documents. Where anything else conflicts with this doc, this doc wins — log the conflict in `revision-log.md`. No "or" alternates anywhere below.

**Design priority, stated explicitly:** the warehouseman on a mobile scanner is the primary user this system is optimized for, not the supervisor at a desktop. Every decision below defaults to floor/mobile constraints first; desktop/office screens are the secondary case that gets to use the extra space, not the baseline everything else degrades from. This is a reversal from how the original component work was done (desktop layouts built first, mobile bolted on) — see §3 for what that reversal actually means in practice.

---

## 1. Color System

### 1.1 Brand colors
| Token | Hex | Usage |
|---|---|---|
| `brand-navy` | `#002060` | Primary brand color — sidebars, logo, page headers, icon accents. **Reverted 2026-08-11**: the 2026-08-10 indigo experiment (`#3D3BF3`) is superseded; this is the reference navy identity — see `revision-log.md`. |
| `brand-royal-blue` | `#2E4094` | Secondary structural treatment for secondary nav elements and chart series. |
| `brand-red` | `#E30613` | Accent/CTA only. Primary buttons, key highlights. **Reverted 2026-08-11** back to this value (the 2026-08-10 change to `#FF2929` is superseded). **Never used for status/semantic meaning** — see §1.3. |

### 1.1a Accent scale (reverted 2026-08-11)

Backgrounds/icons/active-states only — **never text color** (see the text-color rule at the end of this section). Aliases of the reverted navy/royal-blue values, not a separate indigo scale.

| Token | Hex | Usage |
|---|---|---|
| `accent-indigo-50` | `#F2F2F2` | Lightest tint — icon-badge backgrounds on KPI/dashboard cards, subtle highlight fills. |
| `accent-indigo-300` | `#2E4094` | Mid tone — secondary accents, hover states, chart secondary series. |
| `accent-indigo-600` | `#002060` | Primary accent — sidebar active-nav-item background, icon-badge foreground, primary chart bars. |

**Text-color rule (reaffirmed): headings, labels, and body copy are always `on-surface` or `text-grey` — never `brand-navy`, `brand-red`, `brand-royal-blue`, or any `accent-indigo-*` value.** Those colors are for backgrounds, icons, borders, active-state fills, and chart marks only. This keeps every page's actual reading text black/near-black regardless of how many accent colors a given screen uses elsewhere.

### 1.2 Neutrals
| Token | Hex | Usage |
|---|---|---|
| `text-grey` | `#555555` | Standard body copy — office/desktop contexts only. Floor/mobile screens use `on-surface` (§1.2 below) or pure black instead; see §5's contrast escalation. |
| `surface-white` | `#FFFFFF` | Primary content backgrounds, and any surface that needs full opacity (modals, drawers, printed documents). |
| `surface-light-grey` | `#F2F2F2` | Light neutral canvas for secondary content blocks and subtle section division. **Reverted 2026-08-11** from the lavender `#EBEAFF`. |
| `on-surface` | `#1A1B20` | Default text color where higher contrast than `text-grey` is needed — the default for all floor/mobile screens. |
| `outline-variant` | `#C5C6D2` | Card borders and dividers — always at 30% opacity, never solid. **Reverted 2026-08-11** from the lavender `#9694FF`. |

### 1.3 Status colors (semantic — distinct from brand red)
| Token | Hex | Meaning |
|---|---|---|
| `status-available` | `#10B981` | Available, passed inspection, approved, fulfilled |
| `status-pending` | `#F59E0B` | Pending, in-transit, under inspection |
| `status-held` | `#EF4444` | Held, failed, rejected, written off |
| `status-neutral` | `#64748B` | Depleted, on-hold, draft |

**Why `status-held` and `brand-red` are two different reds, on purpose:** a red *button* means "do this action" (brand red); a red *badge* means "this lot is held" (status red). Conflating them makes a "Confirm" button and a "Held" pill indistinguishable in meaning.

**Floor-specific rule:** status color alone is never the only signal on a floor screen — every status also carries an icon or full-screen flash pattern (§9), because color-only differentiation fails outdoors under variable warehouse lighting and for colorblind staff. See §5.

### 1.4 Form validation
Reuses `brand-red` for error borders/text — not a third red.

### 1.5 Contrast — two tiers, not one
- **Office/desktop screens**: WCAG AA. Body text 4.5:1, large text/UI 3:1.
- **Floor/mobile screens: WCAG AAA where the action is time-critical.** 7:1 for any text driving an immediate physical action (scan result, pass/fail, confirm), 4.5:1 minimum for everything else on that screen. Reasoning in §5.

---

## 2. Typography

**Revised 2026-08-09** — consolidated from four families to two, moving to a modern dashboard-style type system. See `revision-log.md` for rationale. `Fira Sans` / `Outfit` / `Epilogue` / `Roboto Mono` are retired; do not introduce new usages of them.

| Family | Role | Weights used |
|---|---|---|
| **Inter** | Everything except mono content: headings, data-display numbers, body copy, functional labels (nav items, badges, table headers, button labels) — differentiated by weight, not by switching families | ExtraBold (800), Bold (700), SemiBold (600), Medium (500), Regular (400) |
| **JetBrains Mono** | Codes, IDs, lot numbers, table numeric columns | Regular (400), Bold (700) |

### Type scale
| Style | Family/Weight | Size | Line height | Tracking |
|---|---|---|---|---|
| headline-xl | Inter ExtraBold | 40px | 48px | -0.02em |
| headline-lg | Inter Bold | 32px | 40px | -0.01em |
| headline-md | Inter SemiBold | 24px | 32px | normal |
| data-display | Inter SemiBold | 20px | 24px | normal |
| body-lg | Inter Regular | 18px | 28px | normal |
| body-md | Inter Regular | 16px | 24px | normal |
| body-sm | Inter Regular | 14px | 20px | normal |
| label | Inter SemiBold | 14px | 16px | 0.03em |
| mono | JetBrains Mono Regular/Bold | context-dependent, 11-24px | 1.4x size | normal |

**Why one family instead of four:** Inter's weight range (400-800) is wide enough to carry heading/body/label roles on its own without visually competing typefaces, and it stays extremely legible at small sizes — relevant since floor screens enforce a 16px minimum (below). Fewer families also means fewer next/font subsets to load and less risk of the kind of file-wide font-substitution drift already caught once in this project by `design-system-auditor`.

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

- All tokens defined in `tailwind.config.ts` — components consume Tailwind classes, never inline hex values. **Narrow exception, added 2026-08-09**: SVG-based charting libraries (e.g. recharts) take raw prop values (`fill`, `stroke`, `tick.fill`, tooltip `contentStyle`), not Tailwind classes, so a chart component may pass hex literals directly — but only values that are an exact, traceable match to an already-documented token in §1 (e.g. `#002060` for `brand-navy`, `#E30613` for `brand-red`). No chart may introduce a hex value that isn't already named in §1. This is the only sanctioned inline-hex path in the codebase.
- Mobile-first Tailwind usage is structural, not optional: base (unprefixed) classes are the floor/mobile styles; `md:`/`lg:` prefixes layer on office/desktop enhancements. Writing desktop styles unprefixed and mobile as an override is backwards and not permitted per §3.
- Fonts loaded via `next/font/google`, scoped to weights actually used (§2).
- Floor-screen components should be built and tested first at the 375px breakpoint, not designed at desktop width and shrunk down — matches §3's actual priority, not just its stated intent.
- For generated PDFs (pick lists, acknowledgement receipts), this doc's values are the source of truth to hand-copy from.

---

## 13. Governance

This document and the Figma file are the only two sources of truth. Any new value must be added here — logged in `revision-log.md` — before shipping. A component built with an undocumented value is the bug, not the documentation gap.
