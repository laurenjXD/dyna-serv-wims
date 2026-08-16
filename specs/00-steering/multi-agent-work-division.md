# Work Division — Dyna-Serv WIMS

Status: Active
Effective: 2026-08-16
Supersedes: the 2026-08-09 two-track document, and this document's own first 2026-08-16 draft (which split remaining work by `ui-implementation-plan.md`'s P1–P12 order with no deadline pressure). **That ordering is now secondary to a hard delivery date** — see below.

Two active tracks. One human collaborator per track. Read this before touching anything.

---

## ⚠ URGENT: Milestone 2 is due Wednesday 2026-08-19

Today is Sunday 2026-08-16. **Three days.** Everything in this document is
now organized around shipping Milestone 2, not the longer P1–P12 sequence.
The Gantt chart's Milestone 2 line items:

1. Global UI Shell & Navigation (Frontend)
2. Receiving Interface (`receiving/page.tsx`) (Frontend)
3. Master Inventory and Pick List (Frontend)
4. Outgoing Interface (`outgoing/page.tsx`) (Frontend)
5. Master Data Item/Location UI (Frontend)
6. Milestone 2 inventory processing review and launch

**The good news, confirmed by an audit earlier this session**: Milestone
1's entire backend list (repo/env setup, core data model, RBAC/RLS,
receiving server actions, master inventory backend, master data server
actions, pick-list allocation engine, outgoing/withdrawal server actions)
is **already implemented and real** — Drizzle schema, migrations, RLS
policies, and query/action layers all exist and are wired to live Supabase.
Milestone 1 item 9 (unit testing for core workflows) also has real
coverage already (`lib/withdrawal/__tests__`, `lib/receiving/__tests__`,
`lib/approval/__tests__`, etc.). **Milestone 2 is a frontend-polish-plus-
one-real-gap problem, not a from-scratch build.** That's what makes
Wednesday realistic.

### Milestone 2 punch list — exactly what's left, confirmed against real code today (2026-08-16)

| Gantt item | Status right now | What's actually left |
|---|---|---|
| **1. Global UI Shell & Navigation** | **Done**, including the logo (2026-08-16). Full P0 shell work shipped — floating header/sidebar/mobile tabs, floor 16px text, mandatory 3-component error states, account popup (Sign Out/email/Organization scope), scan-loop nav hiding, connectivity indicator, real Etna/Glacial fonts, notification bell (P1), real logo wired into both the mobile header and desktop sidebar. | Nothing blocking. **Known follow-up, not urgent**: `public/logo.svg` is a 1.8MB base64-raster-in-SVG, not true vector geometry — a real vector export is pending from whoever owns the brand asset; swap the file when it's ready, no code change needed. |
| **2. Receiving Interface** | Backend real (`lib/receiving/*`, `lib/actions/receiving.ts`); page already wired to live data, no `TODO` markers found. | Apply the Mega-Card (office) / floor card-list (mobile) visual patterns from `ui-ux-design-plan.md` §5 and `per page specs.md` §4 consistently; confirm item-barcode generation/reprint UI; **validate the Receive scan loop at 375px/430px portrait** — this is the design doc's hardest gate and the highest-floor-priority page in the whole app. |
| **3. Master Inventory and Pick List** | Stock View real; Inspection real. **Pick Lists has a real gap**: `listPickLists` query and the FIFO/FEFO allocation engine (`lib/withdrawal/allocation.ts`) both already exist, but there is **no `app/(authenticated)/pick-lists/page.tsx` index route** — confirmed via directory listing, only `[pickListId]/pick` and `[pickListId]/dispatch` exist. | **Build the missing Pick Lists index route** — this is the one genuine "build something new" item in all of Milestone 2, everything else is wiring/polish. Also: Stock View's expandable item→lot→location + Excel export, Inspection queue view vs. `per page specs.md` §5. |
| **4. Outgoing Interface** | Active Picks + Outgoing Ledger tabs both real and wired (`lib/actions/withdrawals.ts`), confirmed no `TODO` markers. | Apply Mega-Card pattern polish. **Decision needed, not yet made**: the Logistics tab (delivery/PEZA refs, "Add Charges") described in `ui-ux-design-plan.md` §4.5 and `per page specs.md` §7 does not exist at all right now — confirmed zero references to it or "Add Charges" anywhere in the codebase. The Gantt line item just says "Outgoing Interface," which Active Picks + Ledger substantively satisfies — **recommend treating Logistics/Add Charges as out of Wednesday's scope and picking it up in Phase 2**, but this is a scope call for whoever's running the Wednesday review, not something to silently drop. |
| **5. Master Data Item/Location UI** | Organizations/Items/Locations all real, no `TODO` markers. | Apply the exact field order from `per page specs.md` §8: Inventory Model → Category → Subcategory → Item Code → UOM → CBM/Pallet Info → Barcode → Perishability. Button copy: deactivation buttons must say "Deactivate," never "Delete" (per that same doc). Confirm bulk location generator (naming convention, capacity, duplicate/error reporting). |
| **6. Milestone 2 review and launch** | N/A | Final cross-page QA: `npx tsc --noEmit && npx vitest run --exclude "**/*.integration.test.ts" && npm run build` all green; Mega-Card/floor-card consistency sweep across all 4 pages; 375px/430px floor validation on Receiving and Pick&Dispatch specifically; spot-check the financial-KPI-gate pattern (already fixed on Dashboard this session, confirm it wasn't needed elsewhere in these 4 pages). |

### The two tracks, reassigned for the 3-day sprint

Same page-based split as before (it already lines up well with the punch
list above) — just resequenced so the *only* thing either track works on
until Wednesday is what's in the table above. **Everything from the old
Track A/B tables (P8–P11: Approvals/Transfers/Reports/Documents,
Organization Portal, Settings, Billing and Pricing) moves to "Phase 2 —
after Milestone 2 ships" below. Do not start Phase 2 work before Wednesday
even if a track finishes early — use the extra time on the review/launch
item, floor validation, or helping the other track.**

**Track A — Receiving + Master Inventory/Pick List**
- Punch-list items 2 and 3 from the table above.
- **This is the track with the one real "build" item** (Pick Lists index
  route) and the harder floor-validation gate (Receiving's scan loop at
  375/430px). Start the Pick Lists index route first — it's small and
  unblocks confidence early — then move to Receiving's visual polish and
  floor validation, since that's the more time-consuming, detail-sensitive
  piece.
- Locked files: `app/(authenticated)/receiving/**`, `app/(authenticated)/pick-lists/**`, `lib/receiving/*`, `lib/withdrawal/*` (read-mostly — allocation engine already works, don't rebuild it), `lib/db/queries/receiving.ts`, `lib/db/queries/withdrawals.ts`, `lib/actions/receiving.ts`.

**Track B — Outgoing + Master Data**
- Punch-list items 4 and 5 from the table above.
- Lighter lift than Track A (no new routes, no floor-scan-loop validation
  gate — Outgoing's Active Picks tab is the only floor-adjacent piece and
  it's already built; both pages are primarily office-context polish).
  **Once done, this track should pick up item 6 (Milestone 2 review and
  launch) as its second half** — running the full build/test/QA sweep
  across both tracks' work, and doing the 375/430px validation pass on
  Track A's Receiving/Pick-and-Dispatch pages as a second set of eyes,
  since floor-width validation benefits from someone who didn't write the
  code checking it.
- Locked files: `app/(authenticated)/outgoing/**`, `app/(authenticated)/master-data/**`, `lib/actions/items.ts`, `lib/actions/locations.ts`, `lib/actions/withdrawals.ts` (read-mostly).
- Make the Logistics-tab scope call explicit in `revision-log.md` (in scope for Wednesday, or deferred to Phase 2) before starting item 4, so it's a recorded decision, not a silent omission either way.

The logo asset swap is done — nothing shared/pending there anymore.

---

## Phase 2 — after Milestone 2 ships (do not start before Wednesday)

This is the original P1–P12 program from `ui-implementation-plan.md`,
picked back up once Milestone 2 is reviewed and launched. P0–P2 are already
done (see below); Phase 2 resumes at P8.

- `P0` (shared shell), `P1` (notifications MVP), `P2` (Dashboard) — **done**, shipped 2026-08-16.
- `P3`–`P7` — **this is Milestone 2's punch list above**, not separate work — once Milestone 2 ships, these priorities are done too by construction.
- `P8` — Approvals, Transfers, Reports & Documents
- `P9` — Organization Portal
- `P10` — Settings + Profile/Team
- `P11` — Billing and Pricing (the largest remaining backend gap in the whole plan — `vmi_cbm_ledger`, Trading pricing/margin schema, both from scratch)
- `P12` — AI Chathead (still last, still gated on P8–P11 all being done — see `ui-implementation-plan.md` for why)

When Phase 2 starts, re-form the tracks along the lines of the previous
draft of this document (Track A continuing floor/inventory-adjacent work
into P8's Transfers, Track B taking the two net-new-backend priorities P9
and P11) — but don't lock that in now; re-assess actual remaining capacity
and momentum once Milestone 2 is actually shipped, rather than planning
Phase 2's exact split three days in advance of finishing Milestone 2.

---

## Blocked — no code until PO decisions are recorded

| Spec | What's blocked | What's needed |
|---|---|---|
| **17 — Product Categorization CRUD** | A dedicated category-management admin surface (create/edit/delete/reparent) | Not in the original `ui-ux-design-plan.md` §4 Page & Role Map — confirm with the Product Owner whether this is actually needed before building it, and log the decision in `revision-log.md` per that doc's §18 rule against inventing pages outside the map. |
| **19 — Dispatch scheduling** | All implementation | Reserved/deferred by PO. Number reserved because other specs reference it. |

---

## Shared file protocol

### Files either track may read but only one writer at a time may touch

`specs/00-steering/*`, `lib/rbac/*`, `lib/db/schema/*`, `supabase/migrations/*`, `CLAUDE.md`, `AGENTS.md`, `.claude/agents/*`, `components/global/*`, `lib/shell/*`

The last two (`components/global/*`, `lib/shell/*`) should not need any
edits at all before Wednesday except the logo swap — nothing else in the
Milestone 2 punch list touches shell chrome.

### Cross-track schema changes

If a track needs a new migration or schema change, open a named request in `revision-log.md` under "Pending cross-track requests" **before writing the migration file**, stating the intended migration number. Next free number as of this writing: `0027` (`0026` was claimed by P1's notifications table).

### Git workflow

```sh
Before starting any session:
  git fetch origin
  git rebase origin/main          # if on a feature branch
  git log origin/main --oneline -5  # check for new main commits

Before committing:
  git status                      # no surprise files
  npx tsc --noEmit && npx vitest run --exclude "**/*.integration.test.ts" && npm run build
  git add <specific files>        # never git add -A blindly

Merging to main:
  PR from feature branch → main
  Build must be green before merge
  No force-push to main, ever
```

Given the 3-day window, prefer committing directly to `main` in small,
green-tested increments over long-lived feature branches that need a
last-minute merge — coordinate in `revision-log.md` if both tracks are
about to touch overlapping test/build state on the same day.

### Commit message convention

```
feat(spec-nn): short description of what and why
fix(spec-nn): short description
test(spec-nn): short description
```

### Per-priority execution reminder

Even under deadline pressure, this is still a full spec-driven, TDD
process — that's what got Milestone 1's backend and P0–P2 done reliably.
Don't skip RED→GREEN→VERIFY to save time; the fastest way to blow the
Wednesday deadline is a UI change that silently breaks an already-real
backend contract. Route UI work through `frontend-builder` →
`design-system-auditor`, route the one real new build (Pick Lists index
route) through `test-writer` → `backend-builder`/`frontend-builder` →
`design-system-auditor` since it touches both layers, and use
`integration-reviewer` for the Pick Lists ↔ Outgoing seam specifically
(a pick list created via the new index route needs to hand off cleanly
into the already-built dispatch flow).

---

## Capability vocabulary (locked — do not invent new capability strings)

All capability strings used in `requirePermission()` calls and RLS policies must exist in `specs/02-rbac-roles/design.md §3.2`. Adding a new capability requires a spec amendment to `02` and a corresponding migration. Both tracks are bound by this. **Check §3.2 before assuming a capability needs a fresh amendment** — `notifications.*`'s capabilities turned out to already exist when P1 needed them; the same may be true for whatever Milestone 2's punch list ends up needing.

Currently confirmed strings relevant to Milestone 2's punch list:

- `pick_list.generate`, `pick_list.read`, `pick_list.execute`
- `receiving.view`, `receiving.confirm`, `receiving.create`
- `parties.read`, `parties.manage`
- `items.read`, `items.manage`
- `locations.read`, `locations.manage`
- `fifo_override.approve`

Full catalog reference (also relevant to Phase 2's later priorities):

- `transfer.view`, `transfer.execute`, `transfer.approve`
- `inspection.perform`, `inspection.resolve`
- `documents.read`
- `reporting.read`, `reporting.financial_read`
- `users.read`
- `notifications.read` (`global` + `assigned_party`), `notifications.manage_preferences`, `notifications.manage_rules`, `notifications.read_diagnostics`

**Not yet in the catalog — needed by Phase 2 work, must be added via `02` amendment before use:**

- Billing/pricing read/write capabilities for P11 (`billing.vmi_read`, `billing.vmi_write`, `billing.trading_read`, `billing.trading_write`, or however `13`'s design.md ultimately names them).
- Settings/security capabilities for P10 (e.g. `settings.manage`, `security_events.read`).

Log each addition in `revision-log.md` at the point it's actually needed — don't pre-add speculative capability strings before the priority that needs them starts.
