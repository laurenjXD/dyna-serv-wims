chrome is connected# Track A Implementation Plan — For Codex

Status: Active
Prepared: 2026-08-17
Audience: **this document is written for Codex** (or any non-Claude-Code
coding agent) picking up Track A of Milestone 2. It is self-contained on
purpose — read it top to bottom before touching any file.

---

## Read this first

You are not Claude Code. This repo has a set of named subagents under
`.claude/agents/` (`test-writer`, `backend-builder`, `frontend-builder`,
`design-system-auditor`, `integration-reviewer`, `rbac-rls-reviewer`,
`build-doctor`, etc.) that Claude Code can dispatch to automatically. **You
do not have access to that dispatch mechanism.** Every step below that
would normally read "route through `X` subagent" has been rewritten as an
explicit manual procedure instead — do the steps in order yourself, in the
same sequence a human reviewer would, rather than looking for a tool named
`test-writer` or `design-system-auditor` to invoke.

Before starting, read these two files in full — they are the actual source
of truth and this document only extracts the parts relevant to Track A:

1. `AGENTS.md` (repo root) — the one rule that overrides everything else,
   naming conventions, current spec-approval status.
2. `specs/00-steering/multi-agent-work-division.md` — the live two-track
   split, locked-file boundaries, capability vocabulary, git workflow.

**The one rule that overrides everything else:** no implementation code
until a feature's `specs/NN-*/tasks.md` has `Status: Approved` with both
sign-offs. The specs relevant to Track A (`07-incoming-receiving`,
`08-outgoing-withdrawal-and-two-stage-commitment`,
`05-ui-shell-and-navigation`) are already Approved as of this writing —
confirm that's still true in `gantt-mapping.md` before you write any code,
since approval status can change between sessions.

---

## Why Track A specifically

Track A (Receiving + Master Inventory/Pick List) is the heavier of the two
tracks this sprint. Track B (Outgoing + Master Data) has no new pages and
no floor-scan-loop validation gate. Track A has both: a brand-new page
(`pick-lists/page.tsx`) and the hardest floor-validation gate in the app
(Receiving's scan loop at 375px/430px).

## A discrepancy to resolve before you start (Step 0)

`multi-agent-work-division.md`'s punch-list table (row 3, "Master Inventory
and Pick List") claims `lib/shell/registry.ts` is "fully restructured to
the **6-group** target." The "Sidebar structure — confirmed target"
section further down the same document describes a **5-group** target
(`MAIN`, `REPORTS`, `MASTER DATA`, `SYSTEM`, `ACCOUNT`) as the thing still
to implement, with an explicit to-do list ("Remove the `Transfers &
Inspection` group... Reassign every remaining entry's `group` field...").

These two claims conflict. Do not assume either one — check the actual
code.

---

## Step 0 — Resolve the group-count discrepancy

1. Open `lib/shell/registry.ts` and count the actual distinct values in
   `NavGroup` / `NAV_GROUP_ORDER`.
2. Compare against the 5-group target laid out in
   `multi-agent-work-division.md`'s "Sidebar structure" section (`MAIN`,
   `REPORTS`, `MASTER DATA`, `SYSTEM`, `ACCOUNT`).
3. If the registry still has more than 5 groups (e.g. `Transfers &
   Inspection` still present as its own group, or `Overview`/`Receiving /
   Incoming`/`Outgoing / Withdrawal`/`Approvals` not yet folded into
   `MAIN`), treat the 5-group restructure as an **open task**, not
   finished work. Do the restructure per the exact instructions in that
   section:
   - Remove the `transfers` and `inspection` `RouteRegistryEntry` rows
     entirely (their pages already redirect).
   - Remove the `Transfers & Inspection` group from `NavGroup` /
     `NAV_GROUP_ORDER`.
   - Reassign every remaining entry's `group` field into one of the 5
     target groups.
   - Grep `components/global/ShellNavigation.tsx` and its tests for any
     `data-testid` derived from an old group name (e.g.
     `nav-group-transfers-inspection`) and update them.
4. Log what you found and what you did in
   `specs/00-steering/revision-log.md` (new dated entry) before moving to
   Step 1 — this corrects the record for whoever reads
   `multi-agent-work-division.md` next.

---

## Step 1 — Pick Lists index route (do this first — smallest, unblocks confidence)

Target: `app/(authenticated)/pick-lists/page.tsx` does not exist yet.
`listPickLists` (query) and the FIFO/FEFO allocation engine
(`lib/withdrawal/allocation.ts`) already exist and work — **do not rebuild
either of these**, only wire an index UI to them.

Manual procedure (replaces the `test-writer → backend-builder/
frontend-builder → design-system-auditor → integration-reviewer` chain):

1. **RED** — Write a failing test first, before any implementation code.
   Cover: the index route renders a list of pick lists from
   `listPickLists`, respects `pick_list.read` capability gating, and
   (mobile) uses the floor card-list pattern / (desktop) the Mega-Card
   pattern. Put it wherever this repo's existing page tests live
   (check `app/(authenticated)/receiving/` or `outgoing/` for the sibling
   test convention and mirror it). Run it and confirm it fails for the
   right reason (missing route, not a typo).
2. **GREEN** — Implement `app/(authenticated)/pick-lists/page.tsx`.
   Read `per page specs.md` for the exact expected layout/fields for this
   page before writing UI. Wire to `listPickLists` and the existing
   allocation engine read paths only.
3. **Design-system self-audit** — before calling this done, manually check
   the new page against `specs/00-steering/brand-design-system.md`:
   touch targets, no glassmorphism on floor screens, hover vs. press
   states, single-primary-action-per-screen, floor 16px text minimum.
4. **Integration check (Pick Lists ↔ Outgoing seam)** — this is the
   riskiest part of this step. Manually trace: a pick list created via
   this new index route must hand off cleanly into the already-built
   dispatch flow in `app/(authenticated)/outgoing/**`. Confirm the shared
   data shape (pick list status transitions, item/lot references) matches
   what `lib/actions/withdrawals.ts` expects on the Outgoing side. Do not
   modify `lib/actions/withdrawals.ts` — it's Track B's locked file
   (read-only for you).
5. **VERIFY** — run the full check before committing:
   `npx tsc --noEmit && npx vitest run --exclude "**/*.integration.test.ts" && npm run build`

Locked files for this step: `app/(authenticated)/pick-lists/**`,
`lib/db/queries/*`, `lib/actions/receiving.ts`. Do not touch
`lib/withdrawal/*` beyond read-only calls into the existing allocation
engine.

---

## Step 2 — Receiving visual polish + floor validation

Target: `app/(authenticated)/receiving/page.tsx`. Backend is already real
and wired (`lib/receiving/*`, `lib/actions/receiving.ts`) — this step is
UI-only.

1. Apply the Mega-Card (office) / floor card-list (mobile) visual
   patterns from `ui-ux-design-plan.md §5` and `per page specs.md §4`
   consistently across the page.
2. Confirm the item-barcode generation/reprint UI is present and correct.
3. Manual design-system self-audit against `brand-design-system.md`, same
   checklist as Step 1.3.
4. **Floor validation — the hardest gate this sprint.** Actually render
   the Receiving page at 375px and 430px portrait viewport widths (not an
   approximation — use real viewport dimensions, e.g. via Playwright's
   device emulation or your own browser devtools if you have visual
   access) and walk the full scan loop end to end. Confirm no
   horizontal scroll, no clipped touch targets, no overlapping elements
   at either width.
5. Run the full verify command from Step 1.5 before committing.

Locked files: `app/(authenticated)/receiving/**`, `lib/receiving/*`.

---

## Step 3 — Stock View expandable rows + Excel export

Target: `app/(authenticated)/inventory/**` (Master Inventory's Stock View
tab).

1. **RED** — failing test for: expandable item→lot→location drill-down
   rendering, and an Excel export action producing a downloadable file
   with the expected columns.
2. **GREEN** — implement the expand/collapse UI and the export server
   action.
3. Design-system self-audit (same checklist).
4. Verify command from Step 1.5.

---

## Step 4 — Pre-handoff sweep

Before you consider Track A done and hand off to whoever runs Milestone 2
review (Track B's second half per `multi-agent-work-division.md`):

1. Run: `npx tsc --noEmit && npx vitest run --exclude "**/*.integration.test.ts" && npm run build` — all three must be green.
2. Confirm no leftover `TODO` markers in any file you touched.
3. Confirm `ShellNavigation.tsx` and its tests have no stale references to
   pre-restructure group names (this closes the loop from Step 0).
4. Commit in small, green-tested increments directly to `main` per the
   sprint's git workflow (see below) — do not batch everything into one
   last-minute commit.

---

## Locked files (yours to write; everything else is read-only or off-limits)

`app/(authenticated)/receiving/**`,
`app/(authenticated)/pick-lists/**`,
`app/(authenticated)/inventory/**`,
`app/(authenticated)/transfers/**` (redirect only, already done),
`app/(authenticated)/inspection/**` (redirect only, already done),
`lib/receiving/*`,
`lib/withdrawal/*` (**read-mostly** — the allocation engine already works,
don't rebuild it),
`lib/db/queries/receiving.ts`, `lib/db/queries/withdrawals.ts`,
`lib/db/queries/transfers.ts`,
`lib/actions/receiving.ts`,
`lib/shell/registry.ts` (you own the full rewrite this sprint per Step 0 —
this file is normally in the shared-file protocol, single-writer-at-a-time,
but it's carved out to Track A for this sprint specifically).

Do **not** touch: `app/(authenticated)/outgoing/**`,
`app/(authenticated)/master-data/**`, `lib/actions/items.ts`,
`lib/actions/locations.ts`, `lib/actions/withdrawals.ts` — these belong to
Track B. Note the near-identical filename: Track A owns
`lib/db/queries/withdrawals.ts`, Track B owns `lib/actions/withdrawals.ts`
— these are different files, do not confuse them.

`components/global/*` and the rest of `lib/shell/*` beyond `registry.ts`
are in the general shared-file protocol (single writer at a time) — check
`git log` / current diffs before editing anything there, since another
agent may already have in-progress changes.

---

## Git workflow (from `multi-agent-work-division.md`, repeated here for self-containment)

```sh
Before starting any session:
  git fetch origin
  git rebase origin/main          # if on a feature branch
  git log origin/main --oneline -5

Before committing:
  git status
  npx tsc --noEmit && npx vitest run --exclude "**/*.integration.test.ts" && npm run build
  git add <specific files>        # never git add -A blindly
```

Commit message convention:
```
feat(spec-nn): short description of what and why
fix(spec-nn): short description
test(spec-nn): short description
```

Given the 3-day window (Milestone 2 due Wednesday 2026-08-19), prefer
committing directly to `main` in small, green-tested increments over a
long-lived feature branch needing a last-minute merge. If you're about to
touch a file also listed under Track B or the shared-file protocol,
coordinate via `revision-log.md` first rather than assuming you have
exclusive access.

## Capability vocabulary (locked — do not invent new strings)

Relevant to Track A: `pick_list.generate`, `pick_list.read`,
`pick_list.execute`, `receiving.view`, `receiving.confirm`,
`receiving.create`, `fifo_override.approve`. Full catalog is in
`multi-agent-work-division.md`'s "Capability vocabulary" section — check
it before assuming a new capability is needed.
