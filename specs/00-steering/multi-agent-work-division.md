# Work Division — Dyna-Serv WIMS

Status: Active
Effective: 2026-08-16
Supersedes: the 2026-08-09 two-track document (Core Inventory & Infrastructure / Notifications-Billing-Pricing) — that split's backend goals (lot creation, FIFO engine, AR display, reporting dashboard, RLS/JWT session) are now confirmed **Implemented**, and the shell (`05`) is now built through `specs/05-ui-shell-and-navigation/tasks.md`'s Approved checklist. This document re-splits what's left: `specs/00-steering/ui-implementation-plan.md`'s P1–P12 page-by-page priorities.

Two active tracks. One human collaborator per track. Read this before touching anything.

---

## Before every session

1. `CLAUDE.md` — binding process rules and the one rule that overrides everything (no code without `Status: Approved`).
2. This file — which track you own, what you may not touch.
3. `specs/00-steering/ui-implementation-plan.md` — the page-by-page priority list this split is built from. Mark a priority's status here (or in that file's own tracking) as it moves.
4. `specs/00-steering/revision-log.md` — last 10 entries minimum. Do not redo or contradict a settled decision.
5. `specs/00-steering/gantt-mapping.md` — current implementation status per Gantt row. Do not start a blocked item.

---

## Current state (confirmed 2026-08-16)

- `P0` (shared shell) is **done**: floating header/sidebar/mobile tabs audited, floor 16px text fixed, mandatory 3-component error states implemented, Sign Out + email + Organization scope added to a consolidated account popup, floor nav hides during the 5 confirmed scan-loop routes, connectivity indicator (desktop + mobile, amber-not-red for offline) wired, real Etna/Glacial fonts loaded via `next/font/local`. **One open item**: the header still shows a "DS" text placeholder — real logo SVG is supplied but not yet wired in (do this first, it's small, before either track starts — see "Immediate next step" below).
- `P1` (notifications table + navbar bell) is **done** (2026-08-16, MVP slice — see `revision-log.md`'s "`14` — P1 MVP slice scoped" entry). `components/global/ShellChrome.tsx`/`ShellNavigation.tsx` were the shared-shell files this touched, as expected — they are **frozen again now** except for P12 (the chathead, still last).
- `P2` (Dashboard `/`) is **done**: Quick Actions, Recent Activity feed (genuinely-recent, not the stale work-queue rows), Weekly trend graph (quantity + CBM only — sales deferred to P11), Monthly outgoing KPI, and the Low Stock Items capability-gate fix (`reporting.financial_read` → `reporting.read`) all shipped and verified.
- `P3`–`P12` are **not started**. This is what the two tracks below split.

---

## Immediate next step (solo, before either track starts)

1. **Wire the real logo asset** into `components/global/ShellChrome.tsx` and `ShellNavigation.tsx`, replacing the "DS" text placeholder. **Still pending as of this document's writing** — the only remaining item before the two tracks below can start.

P1 (notifications table + navbar bell) is **done** — see "Current state" above. It was correctly done solo/first specifically because `ShellChrome.tsx`/`ShellNavigation.tsx` were the shared files nearly every P0 fix touched this session; that reasoning held (P1 touched both files again, as expected). Once the logo lands, those two files go back to **frozen** for both tracks below except for whatever isolated addition each priority's own row calls for — the only other expected touch is P12 (the chathead launcher, last, single mount point).

---

## Two tracks (start after P1 is merged)

### Track A — Floor & Core Inventory Loop

**Branch:** `track-a-floor-inventory` (rebase from `main` after P1 merges)
**Covers the physical warehouse happy path**: Receiving → Inventory/Pick Lists → Pick & Dispatch → Outgoing → Master-Data (the data those flows consume).

| Priority | What | DB | Backend | Frontend |
|---|---|---|---|---|
| **P3 — Receiving** | Work Queue / Receive / WRRs / Incoming Ledger | None new (`0012`, `0020`–`0022`, `0025` already cover WRR disposition/putaway/unit scans) | Already real — `lib/receiving/*`, `lib/actions/receiving.ts` | Apply the P0 Mega-Card (office) and floor card-list (mobile) patterns; verify item-barcode generation/reprint against `ui-ux-design-plan.md` §4.2. **Highest floor-priority page — validate the scan flow at 375px/430px before calling this done.** |
| **P4 — Inventory** | Stock View / Pick Lists / Inspection | None new — `pick_lists` schema already exists | Stock View + Inspection already real. Pick Lists: `listPickLists` query exists, unused by a top-level route | Stock View: expandable item→lot→location, lot history/aging, Excel export (`lib/analytics/queries/export.ts` already has the path). **Build the missing `app/(authenticated)/pick-lists/page.tsx` index route** — FIFO/FEFO allocation preview backend already exists (`lib/withdrawal/allocation.ts`). Inspection: confirm queue view matches §4.3. |
| **P5 — Pick and Dispatch** | Scan flow | None new | Already real end-to-end (`08`, `10`) | Already wired (`pick-lists/[id]/pick`, `/dispatch`) — apply the P0 scan-flow shell, validate mismatch/override/final-dispatch states at 375px/430px. **Second floor-priority page after Receiving — this is a `isScanLoopRoute()`-covered route already (nav already hides correctly here from P0's work), just confirm the page content itself matches the pattern.** |
| **P6 — Outgoing** | Ledger / Logistics | Check whether `Add Charges` (charge reason, amount, evidence) has a backing table — if not, a small migration is needed here (next free number after whatever P1 used) | Ledger real. Logistics (delivery/PEZA refs, manual status, Add Charges) — extend `lib/db/queries/withdrawals.ts`/`lib/actions/withdrawals.ts` if charges aren't modeled | Ledger real; build/finish the Logistics tab per §4.5. |
| **P7 — Master-Data** | Organizations / Items / Locations | None new | Already real | Apply Inventory-Model → Category → Subcategory field order to the Items form per §4.6; bulk location generator UI for Locations. |

**Locked files (Track A writes, Track B reads-only unless coordinated):**
- `app/(authenticated)/receiving/**`, `app/(authenticated)/pick-lists/**`, `app/(authenticated)/outgoing/**`, `app/(authenticated)/master-data/**`
- `lib/receiving/*`, `lib/withdrawal/*`, `lib/db/queries/receiving.ts`, `lib/db/queries/withdrawals.ts`, `lib/actions/receiving.ts`, `lib/actions/withdrawals.ts`, `lib/actions/items.ts`, `lib/actions/locations.ts`, `lib/actions/parties.ts`
- Any new migration Track A adds for P6's Add Charges table (announce the exact number in `revision-log.md` before writing it, so it doesn't collide with a Track B migration landing the same day)

**Sequencing within Track A:** P3 → P5 (Receiving before Pick/Dispatch, since P5 is the natural next floor step and both need the same 375/430px validation pass — do them back to back while the scan-shell context is fresh) → P4 (Pick Lists index route is small, do it once P5 confirms the allocation-preview backend contract) → P6 → P7 (office-only, no floor-validation gate, lowest urgency).

---

### Track B — Office, Admin & New Backend

**Branch:** `track-b-office-billing` (rebase from `main` after P1 merges)
**Covers everything that's office-first, plus the two priorities with zero existing backend.**

| Priority | What | DB | Backend | Frontend |
|---|---|---|---|---|
| **P8 — Approvals, Transfers, Reports & Documents** | Four already-mostly-real pages | None new for Approvals/Transfers. Documents needs `generated_documents` coverage confirmed for AR generation | Approvals + Transfers already real. Reports already real (`getInventoryKpis`, volume trends, heatmap). Documents: acknowledgement-receipt generation still needs wiring | Approvals/Transfers: confirm badge/count and queue views match design doc. Reports: Excel export coverage per §4.8. Documents: finish the AR-generation TODO in `documents/page.tsx`; archive search/filter/preview/print/reprint. |
| **P9 — Organization Portal** | Home / Orders / Inventory / Labels / Documents | `party_visible_items` view already specified in `specs/02-rbac-roles/design.md §7.4` (a default-owner, non-`security_invoker` view — read that section before building, it explains exactly why a `security_invoker` view would silently return zero rows here) — confirm whether it's actually migrated yet or still spec-only | Home/Orders/Inventory already real via `lib/portal/resolve-party-scope.ts`. Labels needs the `party_visible_items` query. Documents needs signed-URL generation against Supabase Storage | Home/Orders/Inventory already wired. Labels: Pre-arrival Label Form (item selection, quantity, optional supplier lot number, barcode generation, submission status). Documents: wire the download button to the signed URL. **No separate Notifications tab — portal pages use the same P1 navbar bell as everywhere else.** |
| **P10 — Settings + Profile/Team** | General / Security placeholders | Config table (FIFO override policy, defaults) for General; security-events/MFA table for Security | Profile/Team already real. General/Security need actions built against the new tables | Profile/Team already wired. General/Security: replace the current placeholder pages once backend lands. |
| **P11 — Billing and Pricing** | VMI tab / Trading tab — **the largest single backend gap in the whole plan** | `vmi_cbm_ledger` (contract dates, daily Beginning/Inbound/Outbound/Ending/Chargeable CBM, fixed charges) for VMI. Pricing/margin schema (Cost of Goods, Selling Price, Gross Margin, Margin %) for Trading — likely extends `pick_list_items` rather than a new top-level table, confirm in `13`'s design.md before migrating | Full new query/action layer for both tabs — none exists today | Replace the current 100%-mock `billing-pricing/page.tsx` with a real VMI tab (accrual + Timeline + printable/emailable SOA) and Trading tab (pricing rules per §4.7). **Treat as its own multi-cycle build via `/implement-feature` against `12` then `13` — don't try to do this in one pass.** |

**Locked files (Track B writes, Track A reads-only unless coordinated):**
- `app/(authenticated)/approvals/**`, `app/(authenticated)/transfers/**`, `app/(authenticated)/reports/**`, `app/(authenticated)/documents/**`, `app/(authenticated)/portal/**`, `app/(authenticated)/settings/**`, `app/(authenticated)/billing-pricing/**`
- `lib/approval/*`, `lib/transfer/*`, `lib/portal/*`, `lib/user-settings/*`, `lib/actions/approvals.ts`, `lib/actions/transfers.ts`
- New `lib/billing/*` (VMI + Trading, to be created)
- New migrations for P9's `party_visible_items` view (if not already migrated), P10's config/security tables, and P11's VMI/pricing schema — announce each exact migration number in `revision-log.md` before writing it

**Sequencing within Track B:** P8 (fastest, mostly-real, builds confidence and closes the AR-generation gap other tracks may end up depending on for printed documents) → P9 (medium — one view, one storage integration) → P11 (the big one — start it early since it's genuinely multi-session, don't leave it for last where it becomes a deadline crunch) → P10 (smallest, do last, lowest urgency — the settings pages are currently honest placeholders, not broken).

---

## P12 — AI Chathead (last, by design, not a track assignment)

Neither track owns this at the start. **P12 does not begin until every row in both tracks' tables above is done and merged to `main`** — this is a deliberate ordering choice from `ui-implementation-plan.md`, not a technical dependency. Once both tracks report done, whichever collaborator is free first picks it up solo (same shared-shell-file reasoning as P1 — it's a single mount point in `ShellChrome.tsx`, not something to split).

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

The last two (`components/global/*`, `lib/shell/*`) are new additions to this list versus the prior version of this document — they were single-writer-implicitly before because only one person was doing shell work; now that P1 and P12 are the only two touch points left on those files, treat them as fully locked outside those two priorities.

### Cross-track schema changes

If a track needs a new migration or schema change, open a named request in `revision-log.md` under "Pending cross-track requests" **before writing the migration file**, stating the intended migration number. This avoids both tracks picking the same next-available number (`0026` is free as of this document's writing — confirm the actual next number with `ls supabase/migrations` before assuming, since P1's migration will likely claim `0026` first).

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

### Commit message convention

```
feat(spec-nn): short description of what and why
fix(spec-nn): short description
test(spec-nn): short description
```

### Per-priority execution reminder

Every priority in both tables above is still a full spec-driven, TDD cycle — this document only assigns *who* builds *what*, not a shortcut around *how*. Use `/implement-feature` against the owning spec's already-`Approved` `tasks.md`, and route DB-touching work through `database-builder` → `db-migration-verifier`, UI work through `frontend-builder` → `design-system-auditor`, and cross-feature seams (e.g. P5 handing off into P6, P11 reading data P3/P4 produce) through `integration-reviewer` before calling either side "done."

---

## Capability vocabulary (locked — do not invent new capability strings)

All capability strings used in `requirePermission()` calls and RLS policies must exist in `specs/02-rbac-roles/design.md §3.2`. Adding a new capability requires a spec amendment to `02` and a corresponding migration. Both tracks are bound by this.

Currently confirmed strings relevant to the work in this document:

- `pick_list.generate`, `pick_list.read`, `pick_list.execute`
- `receiving.view`, `receiving.confirm`, `receiving.create`
- `transfer.view`, `transfer.execute`, `transfer.approve`
- `inspection.perform`, `inspection.resolve`
- `parties.read`, `parties.manage`
- `items.read`, `items.manage`
- `locations.read`, `locations.manage`
- `documents.read`
- `reporting.read`, `reporting.financial_read`
- `fifo_override.approve`
- `users.read`

**Already resolved, corrected from this document's first draft**: `notifications.read` (`global` + `assigned_party`), `notifications.manage_preferences`, `notifications.manage_rules`, and `notifications.read_diagnostics` all already existed in `specs/02-rbac-roles/design.md §3.2` before P1 started — no new amendment was actually needed for P1. Lesson for the tracks below: check §3.2 before assuming a capability needs a fresh amendment.

**Not yet in the catalog — needed by this document's remaining work, must be added via `02` amendment before use:**

- Billing/pricing read/write capabilities for P11 (`billing.vmi_read`, `billing.vmi_write`, `billing.trading_read`, `billing.trading_write`, or however `13`'s design.md ultimately names them) — Track B owns this amendment when P11 starts.
- Settings/security capabilities for P10 (e.g. `settings.manage`, `security_events.read`) — Track B owns this amendment when P10 starts.

Log each addition in `revision-log.md` at the point it's actually needed — don't pre-add speculative capability strings before the priority that needs them starts.
