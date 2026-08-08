# Multi-Agent Work Division — Dyna-Serv WIMS

Status: Active
Effective: 2026-08-07

This document exists because three separate AI agents, run by different people, are about to work on this repo at the same time. Read this in full before touching anything. It assigns tracks, locks the files that would otherwise collide, and sets the git protocol that keeps three parallel workers from destroying each other's work.

None of the three agents share memory or a conversation history with each other. This doc — plus `CLAUDE.md`/`AGENTS.md`, `specs/00-steering/gantt-mapping.md`, `specs/00-steering/implementation-kickoff.md`, and `specs/00-steering/revision-log.md` — is the *entire* shared context between them. If something isn't written down in one of those files, the other two agents cannot know it happened.

## Read first, every agent, every session

1. `CLAUDE.md` (Claude Code agents) or `AGENTS.md` (Codex, or any non-Claude-Code agent) — binding process rules. If the two ever disagree, `CLAUDE.md` is canonical; whoever edits one must mirror the change into the other, same session.
2. This file — which track you own, which files you may never edit directly.
3. `specs/00-steering/gantt-mapping.md` and `implementation-kickoff.md` — current phase/cycle status. Do not start work that doc says is blocked.
4. `specs/00-steering/revision-log.md` — read the last 10 entries before starting, so you don't redo or contradict something another track just decided.

**The one rule that overrides everything else, unchanged from `CLAUDE.md`:** no application code is written against any feature whose `tasks.md` isn't `Status: Approved` with both sign-offs. This applies identically to all three agents. Writing requirements/design/tasks docs is always fine; writing application code against an unapproved spec is not, regardless of which agent or which track.

## The three tracks

Split by dependency chain, not by spec count — specs within a track are tightly coupled to each other; specs across tracks mostly aren't. Each track is one agent's exclusive responsibility for its listed specs' `design.md`/`tasks.md` content and application code. Agents do not edit another track's spec folders. If Track 2 or 3 needs something Track 1 owns, they open a named request (see "Cross-track requests" below) instead of editing it directly.

### Track 1 — Core & Floor Operations
**Owner: this session (Claude Code, direct).**

- Finish **Phase 2** of `02-rbac-roles` (currently mid-flight): cycle 2.4 (default-deny RLS policies, including the six previously-unmapped tables), then cycle 2.5 (admin invitation/role UI, once `05`'s actual frontend exists to build it in).
- Then **Phase 3 onward**: `07-incoming-receiving` → `11-transfer-and-inspection` → `08-outgoing-withdrawal-and-two-stage-commitment` → `10-pick-list-and-acknowledgement-receipt`, in that order — this is the floor-operations chain and it is sequential by nature (receiving creates lots, transfer/inspection changes lot state, withdrawal consumes lots, pick-list/AR is the resulting document). Do not let another agent take one spec out of this chain; the coupling is real, not just filing convenience.
- **This track is also the sole writer of the shared/locked files** listed below, for as long as Phase 1/2 activity is ongoing. Two separate announcements to post in `revision-log.md`, not one: (1) when cycle 2.3's guard passes its `rbac-rls-reviewer` pass, post that the calling contract is stable — this unlocks Tier 2 for Tracks 2/3 (write/unit-test code) per "What can start now vs. what waits" below, well before Phase 2 fully closes; (2) when Phase 2 is fully closed (cycle 2.4/2.5 done, `gantt-mapping.md` row 1.3 says `Implemented`), post core-stable — this is what narrows the shared-file lock itself (see below), not what gates Tracks 2/3's coding start.

### Track 2 — Office & Master Data
**Owner: the other Claude Code agent, run by the second collaborator.**

- `06-party-and-item-enrollment` → `09-approval-queue` → `14-notifications-and-alerts` → `17-product-categorization-and-classification` → `18-barcode-integration`.
- `06` already has extensive same-day spec work (location enrollment, Contact Party email action, location/party transaction ledgers, the `/parties`/`/items`/`/locations` route-gate fix) — read `specs/00-steering/revision-log.md`'s 2026-08-07 entries for `06` before touching it, so you don't redo or contradict that reasoning.
- `06`'s application code depends on `02-rbac-roles`'s `requirePermission`/session-resolver logic (`lib/rbac/`). **This is unlocked as of 2026-08-07** — `rbac-rls-reviewer` passed the guard contract, Track 1 posted the guard-contract-stable announcement, and `lib/rbac/index.ts` now re-exports both `session` and `guard`. Write and unit-test `06`'s application code against `requirePermission()` now; just don't claim a real-Postgres-verified pass on any `06` route touching a table without its RLS policy yet (check `02-rbac-roles/design.md` §7.4's per-table list) — that part still waits on cycle 2.4.

### Track 3 — Analytics, Billing & External-Facing
**Owner: Codex, run by the third collaborator.**

- `16-reporting-and-analytics` → `12-vmi-billing` → `13-trading-orders-and-pricing` → `22-parties-portal` → `15-ai-chatbot` (last — its tool registry reads from most other specs, so it benefits from those being stable first).
- **Codex-specific**: read `AGENTS.md`, not `CLAUDE.md`, as your primary process doc — they say the same thing, `AGENTS.md` just doesn't assume Claude Code's skill/subagent infrastructure. If you don't have an equivalent of Claude Code's specialized review subagents (`rbac-rls-reviewer`, `design-system-auditor`, etc.), do the equivalent review pass yourself, read-only against the spec files, before making changes — the same pattern already used in this repo's `codex task.md` precedent ("For each persona named below, adopt its stated scope as a checklist and run that pass yourself, read-only against the spec files first").
- `16` already has same-day spec work (the `/reports` route rename resolving a collision with `05`'s new landing page, the `<ActivityHeatmap>` reuse on `/`, the `get_analytics_summary` chatbot tool) — read the relevant 2026-08-07 `revision-log.md` entries before touching it.

## Full implementation phase plan — all three tracks

`specs/00-steering/implementation-kickoff.md` was written for one sequential implementer and only details Phases 0–3 (Track 1's own chain, through `07`). With three tracks running in parallel, Tracks 2 and 3 need their own phase sequence too, and all three need to see how their phases depend on each other — that's what this section is for.

**Deliberately phase-level, not cycle-level, for Track 2/3's later phases.** `implementation-kickoff.md` itself defers Phase 3's cycle-by-cycle detail until Phase 2 closes, "since implementing them may surface schema gaps that change it" — the same caution applies here, more so, since Tracks 2/3 haven't started yet. Write the RED→GREEN→VERIFY cycle breakdown for your own phase immediately before you start it, not now — the earlier phases below (Track 1's) are already at that detail because they're already in flight or done; the later ones aren't, on purpose.

### Track 1 — Core & Floor Operations (detailed cycle plan: `implementation-kickoff.md`)

| Phase | Spec | Status as of 2026-08-07 |
|---|---|---|
| 0 | Scaffolding | Done |
| 1 | `01-core-data-model` | Done, real-Postgres verified (4 passes) |
| 2 | `02-rbac-roles` | Cycles 2.1–2.3 done, verified, and `rbac-rls-reviewer`-passed — guard-contract-stable announcement posted 2026-08-07, Tier 2 unlock live for Tracks 2/3; 2.4 (RLS policies) and 2.5 (admin UI, blocked on `05` frontend) remain |
| 3 | `07-incoming-receiving` | Not started — full cycle plan to be written when Phase 2 closes |
| 4 | `11-transfer-and-inspection` | Not started |
| 5 | `08-outgoing-withdrawal-and-two-stage-commitment` | Not started |
| 6 | `10-pick-list-and-acknowledgement-receipt` | Not started |

Phases 3–6 are sequential and each depends on the one before it (receiving creates lots → transfer/inspection changes lot state → withdrawal consumes lots → pick-list/AR is the resulting document) — do not parallelize within Track 1 itself.

### Track 2 — Office & Master Data

| Phase | Spec | What it builds | Depends on |
|---|---|---|---|
| A | `06-party-and-item-enrollment` | `parties`/`items`/`locations` CRUD, search, lifecycle; location enrollment; Contact Party email action; location/party transaction ledgers (all already fully spec'd 2026-08-07 — this phase is implementation against an already-detailed design, not fresh design work) | Track 1 Phase 2 (needs `lib/rbac`'s `requirePermission` to gate every mutation) |
| B | `09-approval-queue` | FIFO-override approval workflow, self-approval prohibition enforcement (per `02` §3.4 — this is where that rule actually lives, not in the RBAC guard itself) | Phase A (approval actor is a `user_profile`); Track 1 Phase 5 (`08`) for what triggers an override request |
| C | `14-notifications-and-alerts` | Reorder/low-stock alerts, delivery via `04`'s existing Resend/Realtime infrastructure | Phase A/B for what it notifies about; `01`'s `lot_inventory_totals` (done) for low-stock detection |
| D | `17-product-categorization-and-classification` | Category/subcategory hierarchy, flow validation | Phase A (`item_categories` already exists in `01`; this phase is the management UI/rules layer on top) |
| E | `18-barcode-integration` | Barcode/QR generation and scan-matching | Phase A/D (needs items and categories settled); Track 1 Phase 3 (`07`) for the receiving-scan integration point |

### Track 3 — Analytics, Billing & External-Facing

| Phase | Spec | What it builds | Depends on |
|---|---|---|---|
| I | `16-reporting-and-analytics` | `/reports` dashboard, KPI cards, `<ActivityHeatmap>`, Master Inventory analytics views | Track 1 Phase 1 (the four derived read models — `master_inventory_tracking`, `lot_history_export`, `location_transaction_ledger`, `party_transaction_ledger` — are already implemented and verified, so this phase starts from a real foundation, not a spec-only one) |
| II | `12-vmi-billing` | Period-average VMI CBM billing calculation | Phase I (reads the same read models); Track 1 Phase 1 (`lots.owner_party_id`, `flow_type` partitioning — done) |
| III | `13-trading-orders-and-pricing` | Trading buy/sell pricing, order pricing logic | Phase I/II; Track 2 Phase A (`items.buying_price`/`selling_price` already exist in `01`, but the order/pricing workflow itself is `13`'s, not `06`'s) |
| IV | `22-parties-portal` | External party-facing read views (`/portal/*`) | Phase I/II/III (the portal surfaces VMI analytics, billing statements, and Trading order status — needs all three settled first); Track 1 Phase 2 (party-scoped RLS) |
| V | `15-ai-chatbot` | Three-persona assistant, 8-tool registry (7 operational + `get_analytics_summary`) | Nearly everything above — this is deliberately last. Its tool registry already reads from `01`, `16`; adding tools for `12`/`13`/`22` data is a later, separate registry amendment once those phases exist, not part of this phase |

### Cross-track dependency map

**Updated 2026-08-07 — this is no longer a single hard blocker.** `rbac-rls-reviewer` has passed the `requirePermission`/session-resolver guard contract (cycles 2.2/2.3); Track 1 posted the guard-contract-stable announcement in `revision-log.md`. Per the Tier 2 unlock in "What can start now vs. what waits" below, **Tracks 2 and 3 may write and unit-test application code now** — they do not need to wait for cycle 2.4 (RLS policies) or 2.5 (admin UI) to close. The remaining constraint is per-table, not global: neither track can claim a **real-Postgres-verified** pass for a route touching a table that doesn't have its RLS policy yet (Tier 3). Beyond that:

- Track 2 Phase B (`09`) soft-depends on Track 1 Phase 5 (`08`) for its trigger condition, but can be built and tested against a stubbed trigger in the meantime — don't block Phase B entirely on Phase 5 finishing.
- Track 3 Phase II (`12`) and III (`13`) soft-depend on Track 2 Phase A (`06`) for party data being manageable through a real UI, but the underlying `parties`/`items` tables are already real and verified (Track 1 Phase 1) — Track 3 can build against the tables directly without waiting on Track 2's UI.
- Track 3 Phase IV (`22`) is the one genuine multi-track convergence point — it needs Phase I/II/III (its own track) **and** Track 1 Phase 2's party-scoped RLS **and**, practically, Track 2's `06` being far enough along that party records exist to portal-surface. Don't start `22` until the other four are at least in their own VERIFY step.

### Mapping to `gantt-mapping.md`'s Milestones

This phase plan is a *how* underneath the *when* `gantt-mapping.md` already tracks. Milestone 1 (Receiving & Core Inventory Transfers) is entirely Track 1's Phases 0–5. Milestone 2 (Classification & Inventory Processing) is Track 1 Phase 6 plus Track 2 Phases D/E. Milestone 3 (Inventory Control & Analytics) is Track 3 Phases I–III plus Track 2 Phase C. Milestone 4 (Final Handover & Deployment) is Track 3 Phases IV–V plus the cross-cutting docs/training/deployment specs (`20`, `04`), which don't belong to any one track and should be picked up by whichever track finishes its own chain first.

## Additional scope folded in (2026-08-07) — read this after your track assignment above, changes nothing already assigned

Five specs were found unassigned to any track after the original three-track split: `05-ui-shell-and-navigation` (an actual build, not just the locked spec — no shell code exists yet beyond Phase 0's bare `app/layout.tsx`), `03-offline-mode-and-client-storage`, `04-services-and-infrastructure`, `20-documentation-training-and-uat`, and `21-user-profile-and-settings`. `19-dispatch-scheduling-and-delivery-tracking` stays deferred — that one's deliberate, not a gap.

**This section only adds new phases. It does not change, rename, reorder, or reopen anything in "The three tracks" or "Full implementation phase plan" above.** If your track already has spec/design work done on `06`, `16`, or anywhere else per those sections, that work stands as-is — nothing here asks you to revisit, redo, or touch it. Read this as new phases appended to the end of your track's existing list, not a revision of what's already there.

### Track 1 — two new phases, both before the rest of your existing chain

- **New Phase 2.5a — `05-ui-shell-and-navigation`, actual implementation.** Insert this immediately after Phase 2 closes and before Phase 3 (`07`). Every track's feature UI — including your own Phase 3's `07` receiving screens — needs the shell (auth-boundary redirect, navigation registry, page-header contract, floor/office responsive layout, the `/` landing page and route table already fully spec'd) to exist as real code first. Do not touch `06`, `16`, or any other track's files while doing this — this phase is `app/`, `components/global`, `components/ui`, and `05`'s own spec folder only.
- **Fold `03-offline-mode-and-client-storage` into your existing Phases 3 and 5** (`07` and `08`), not as a separate phase — it's the Tier 1 offline queue for exactly those two features' floor scan flows, and building either one properly requires deciding its offline behavior at the same time, not bolting it on after.

### Track 2 — one new phase, added at the end of your existing list

- **New Phase F — `21-user-profile-and-settings`**, after your existing Phase E (`18`). Self-contained (password change, notification preferences); doesn't touch anything from Phases A–E. Build it without revisiting `06`/`09`/`14`/`17`/`18`'s already-completed work.

### Track 3 — one new phase, added at the end of your existing list, gated on all three tracks

- **New Phase VI — final convergence: `04-services-and-infrastructure` (deployment pipeline, background jobs, webhook handlers beyond the Phase-0 env-var scaffolding), `20-documentation-training-and-uat` (user docs, admin training, UAT), and the cross-cutting integration-testing/deployment gates `gantt-mapping.md` lists but no single spec owns** (e.g. "Cross-module inventory integration testing," "Final inventory system integration," production deployment itself). Assigned to Track 3 specifically because your existing chain (`16`→`12`→`13`→`22`→`15`) naturally finishes last — this is not "whichever track gets there first," it's yours, so it doesn't fall through the cracks.
  - **Hard gate, don't start early**: this phase needs Track 1's and Track 2's chains (including their new Phase 2.5a/Phase F additions above) merged and stable on `main`, not just your own Phase V done. Check `gantt-mapping.md` for all three tracks' status before starting, the same way `22`'s convergence point already required checking multiple phases.

### Revised Milestone mapping (supersedes the note in "Mapping to `gantt-mapping.md`'s Milestones" above about `20`/`04` being unassigned)

Milestone 1 now includes Track 1's new Phase 2.5a. Milestone 4's "cross-cutting docs/training/deployment specs (`20`, `04`)" line above is superseded by this section: they're Track 3's Phase VI now, not an open question.

## Shared/locked files — single-writer rule

These files are touched by almost every track sooner or later, which is exactly why uncoordinated concurrent edits to them will silently overwrite each other. **Only Track 1 edits these while Phase 1/2 core work is active.** Tracks 2 and 3 needing a change here must use the cross-track request protocol below, not edit directly:

- `specs/00-steering/*` (all of it — `product.md`, `tech.md`, `structure.md`, `brand-design-system.md`, `gantt-mapping.md`, `implementation-kickoff.md`, `revision-log.md`, this file)
- `specs/01-core-data-model/*`
- `specs/02-rbac-roles/*`
- `specs/05-ui-shell-and-navigation/*`
- `lib/db/schema/*`, `lib/rbac/*`, `supabase/migrations/*`
- `.claude/agents/*`, `AGENTS.md`, `CLAUDE.md`

**Once Track 1 announces core-stable in `revision-log.md`** (see Track 1's note above), this list shrinks to just `specs/00-steering/*`, `.claude/agents/*`, `AGENTS.md`, `CLAUDE.md` — the three of you may all still need `01`/`02`/`05` occasionally for a downstream feature's dependency, but at that point it's a smaller, less-active surface and a normal PR-review conflict check is enough instead of a hard single-writer lock.

### Cross-track request protocol

If your track needs a change to a locked file: write the exact change you need (file, section, what and why) as a new dated entry under a `## Pending cross-track requests` heading at the bottom of this file, tag it with your track number, and continue with everything else your track doesn't need that change for. Track 1 picks these up, makes the change, and marks the entry `Resolved` with a one-line pointer to where it landed (usually a `revision-log.md` entry). Do not edit the locked file yourself even for "just one line" — that's exactly the failure mode this section exists to prevent.

## What can start now vs. what waits

Three tiers, not one blanket wait — the earlier draft of this doc made Tracks 2/3 wait for a single "core-stable" announcement before writing any code at all. That's more conservative than it needs to be: `01`'s schema is done and real-Postgres verified, and `02`'s calling contract (`requirePermission()`/`lib/rbac/session.ts`) is already stable — cycle 2.4's RLS policies enforce underneath that same function call, they don't change its API shape. Waiting for the literal full close of Phase 2 before touching any code wastes real parallel time for no safety benefit, since the part that would actually break Track 2/3's code (the guard's calling contract) isn't what's still moving.

**Tier 1 — start immediately, all three tracks, no coordination needed:** requirements.md/design.md/tasks.md drafting or revision within your own track's spec folders. Pure documentation, doesn't touch shared files, always fine per the project's core rule.

**Tier 2 — start as soon as Track 1's cycle 2.3 (`requirePermission`/`lib/rbac/guard.ts`) has passed its `rbac-rls-reviewer` pass** (does not require cycle 2.4's RLS policies or cycle 2.5's admin UI to be done): write and unit-test your own application code — routes, server actions, components — calling `requirePermission()` against the current, stable `01`/`02` schema and guard contract. This is most of the actual coding work for Tracks 2/3, and it can start well before Track 1's chain fully closes. Track 1 posts the "guard reviewed, cycle 2.3 closed" note in `revision-log.md` the same way it will post "core-stable" — watch for that, not for the full Phase 2 close.

**Tier 3 — waits on the real-Postgres RLS policy for your specific tables** (cycle 2.4, per-table, not all-or-nothing): the **live-Postgres verification pass** (`db-migration-verifier` + `rbac-rls-reviewer`) for any route/feature your track built against a table that doesn't have its RLS policy yet. You can write and unit-test the code in Tier 2; you cannot call it *verified* until the specific table(s) it touches have real RLS policies to verify against. Check `02-rbac-roles/design.md` §7.4's per-table policy list against your feature's tables before claiming a verification pass — don't assume "RBAC is done" covers a table it doesn't actually list yet.

**Tier 3 UNLOCKED, 2026-08-08.** Cycle 2.4 (`supabase/migrations/0008_rls_policies.sql`) is implemented and fully verified — two independent rounds of `db-migration-verifier` + `rbac-rls-reviewer` (both required for this cycle), the first finding three real bugs (an inactive-profile access gap, a `parties`-visibility bug denying flow-scoped party users their own counterparty's record, and a cross-party role-enumeration vulnerability), all fixed and re-verified clean on round 2. RLS policies now exist for every table in the schema per `02` §7.3/§7.4, covering all of `06`'s tables (`parties`, `party_roles`, `item_categories`, `locations`, `items`) and everything `16`/`12`/`13`/`22` will need from `01`'s core tables. **Not covered, correctly** — `wrr_advance_notices`, `vmi_billing_statement`, `vmi_credit_notes` (none of these tables exist in the schema yet; their RLS lands whenever those specs' own migrations do). This is SELECT-only by design — INSERT/UPDATE/DELETE policies belong to whichever feature migration (`07`/`08`/`11`) owns writing to each table, not this cycle. Delivery/cherry-pick details below.

**Never starts without a product-owner call, any track:** anything the product owner explicitly deferred — the WRR email/PDF-parsing automation idea and any AI-generated-content feature not already in an approved spec. If you think you've found a good reason to build one of these now anyway, that reasoning belongs in a flagged question to the product owner, not in a spec change.

## Git workflow

Remote is `https://github.com/laurenjXD/dyna-serv-wims.git` (`origin`). Every command below assumes you're already in the repo root with that remote configured.

### 0. Before anyone creates a track branch — check what already exists

This repo already has branches from before this doc existed: `documentation`, `agents-nd-skills`, `party-portal`, and `jenjen-branch` (run `git branch -a` to see the current list — it may have grown since this was written). **Do not assume the three track branches are the only thing out there.** In particular, `party-portal` may already contain work relevant to Track 3's Phase IV (`22-parties-portal`) — before Track 3 starts that phase, check `git log party-portal` and diff it against `main` to see whether it's stale scratch work, something to merge first, or something to ignore. If unsure, ask the product owner rather than silently overwriting or ignoring it.

### 1. One-time setup, each collaborator

```bash
git clone https://github.com/laurenjXD/dyna-serv-wims.git
cd dyna-serv-wims
git fetch origin
# Track 1 uses track-1-core-floor-ops, Track 2 uses track-2-office-data, Track 3 uses track-3-analytics-billing.
# Only create the branch for YOUR track:
git checkout -b track-2-office-data origin/main   # example for Track 2; substitute your own track name/number
git push -u origin track-2-office-data
```

If your track's branch already exists on `origin` (someone else already ran this), just check it out instead of creating it:
```bash
git checkout -b track-2-office-data origin/track-2-office-data
```

### 2. Every work session, in this order

```bash
git checkout track-2-office-data      # your track's branch — never work on main directly
git fetch origin
git rebase origin/main                # pull main's latest changes in BEFORE you start, not after
```
If the rebase reports conflicts here, resolve them now, before writing any new code for this session — see "Handling rebase conflicts" below. Only start making changes once this rebase is clean.

### 3. Making changes

Work normally within your track's assigned spec folders and code paths. Do not touch the shared/locked files listed above except through the cross-track request protocol. Run your project's test suite (`npm run build`, `npx tsc --noEmit`, `npx vitest run`) before considering any unit of work finished, same as this session did throughout.

### 4. Before asking your human collaborator to commit

Run `git status` and `git diff` yourself and actually read every changed file — not just the ones you meant to touch. This is not optional: this session found three separate cases of an agent making an edit it never mentioned in its own summary (a stray schema field, a stray edit to an unrelated agent-definition file, and one invented feature silently added to a core steering doc that had never been discussed). Report to your human collaborator exactly what changed, file by file, before they decide whether to commit.

### 5. Committing — human-gated, every time

**No agent runs `git commit` without its human collaborator explicitly asking for that specific commit.** This is `CLAUDE.md`'s existing git safety rule, restated here because it was violated three times in the session that produced this doc. The agent prepares the change and shows the diff; the human decides if and when it becomes a commit.

```bash
git add <specific files>              # never `git add -A`/`git add .` blindly — name the files you reviewed in step 4
git commit -m "$(cat <<'EOF'
<track-N> <spec-number>: <what changed and why, one or two sentences>

Co-Authored-By: <the agent name>
EOF
)"
```
Commit message convention: prefix with your track (`track-2`) and the spec number the change belongs to (`06`), so `git log --oneline` across all three tracks stays readable once branches start merging. Example: `track-2 06: add location enrollment CRUD routes gated by locations.manage`.

### 6. Pushing

```bash
git push origin track-2-office-data
```
If the push is rejected because `origin/track-2-office-data` moved (someone else, or you from another machine, pushed to it), `git fetch origin` and `git rebase origin/track-2-office-data` before retrying — never `git push --force` to a track branch without your human collaborator's explicit go-ahead, same rule as any other destructive git operation.

### 7. Opening a PR

Use the GitHub web UI, or the `gh` CLI if your environment has it installed (`gh pr create --base main --head track-2-office-data --title "..." --body "..."`). Either way, the PR description should name: which spec(s) this covers, which cycle/phase per this doc's phase-plan tables, and confirmation that build/typecheck/tests are clean. Do not merge your own PR — that's the product owner's call, per the merge order below.

### 8. Merge order into `main` — one track at a time, never simultaneous

Track 1 merges first (smallest, most foundational, least likely to conflict with anything downstream), then Track 2, then Track 3. After each merge:
```bash
git checkout main
git pull origin main
npm run build && npx tsc --noEmit && npx vitest run
```
All three must be clean before the next track's PR is merged. If a merge breaks something, that's fixed on `main` (or reverted) before the next track's merge proceeds — don't stack a second merge on top of a broken `main` hoping it sorts itself out.

After merging, every track still working should immediately rebase (step 2) before continuing — don't let a track branch drift for days against a `main` that's already moved past it.

### Handling rebase conflicts

A conflict during `git rebase origin/main` almost always means either (a) you touched a shared/locked file you shouldn't have (check the list above — if so, that's the real bug to fix, not the conflict), or (b) two tracks' otherwise-independent changes happened to land near each other in a file you do legitimately share (rare, given the track split, but possible in `package.json`/`package-lock.json` if two tracks both added dependencies). Resolve conflicts by re-reading both versions' intent, not by blindly taking "ours" or "theirs" — a mis-resolved conflict in `lib/db/schema` or a migration file is exactly the kind of silent corruption this session already had to catch and recover from once. When resolved:
```bash
git add <resolved files>
git rebase --continue
```
If a rebase goes badly wrong, `git rebase --abort` gets you back to before you started it — safe to use, not destructive to anything already pushed.

### Emergency / rollback

- Uncommitted work you want to discard: `git status` first (always, before any discard), then `git restore <file>` for a specific file or `git checkout -- .` for everything — never `git reset --hard` without checking `git status` first and confirming with your human collaborator, since it silently discards uncommitted work with no prompt.
- A bad commit already pushed to your own track branch (not yet merged to `main`): revert it (`git revert <sha>`) rather than rewriting history with `git reset`/force-push, unless your human collaborator explicitly wants history rewritten.
- Never force-push to `main`, under any circumstance, for any reason, on any track.

## Status reporting

Each track posts a dated entry to `specs/00-steering/revision-log.md` for every non-trivial decision, same as the existing convention — this is the only way the other two tracks find out what happened. When a track's spec returns to fully `Approved`/complete, update that track's row in `gantt-mapping.md` in the same commit as the revision-log entry, not later.

## Pending cross-track requests

*(Track 2 or 3: add dated requests here when you need a locked-file change. Track 1: mark resolved with a pointer when done.)*

**Track 3, 2026-08-07/08 — requested `daily_transaction_counts` materialized view + analytics indexes (`16` design.md §7.1/§7.3) and the RLS-enforcing query transaction wrapper (`02` design.md §6.3), before Track 3 could proceed.**

(Matches Track 3's own request note, written independently on their branch: they needed these to move `lib/analytics/queries/heatmap.ts` off its direct-ledger fallback and to run `16`'s query functions inside a real RLS boundary before mounting protected `/reports` routes — same request, described from both sides.)

**RESOLVED.** Delivered via expedited cherry-pick (not the full Track 1→main merge order, since Track 3 was actively blocked) — commit `5cdab55dd0661964e942e6377851b341e91d51bb` on `origin/track-1-core-floor-ops`, containing exactly:
- `supabase/migrations/0006_daily_transaction_counts.sql` — the materialized view + unique index on `(activity_date, flow_type, movement_type)`. Real-Postgres verified, including a held-open-transaction proof that `REFRESH ... CONCURRENTLY` genuinely doesn't block reads.
- `supabase/migrations/0007_analytics_indexes.sql` — all 8 indexes from `16`'s §7.1 table, confirmed non-duplicative of `0002`'s existing indexes, `EXPLAIN`-verified planner adoption.
- `lib/db/rls-transaction.ts` (+ its unit and integration tests) — the `withRlsTransaction`/`buildRlsClaimStatements` wrapper. `rbac-rls-reviewer` caught a real bug before this shipped (claim-setting wasn't awaited before the callback ran — an unverified ordering assumption with a genuine unhandled-rejection path); fixed and re-verified before this commit.

**Track 3 action**: `git fetch origin` then `git cherry-pick 5cdab55dd0661964e942e6377851b341e91d51bb` onto `track-3-analytics-billing`. This commit contains only these 8 files — nothing else from Track 1's in-progress work (the `05` shell components are still under review) is included, so the cherry-pick should apply clean.
**One thing for Track 3 to know before using the RLS wrapper**: `rbac-rls-reviewer`'s review flagged that the wrapper's `role`-switch-to-`authenticated` mechanism is correct per design, but has not yet been verified against a live Postgres/connection-pooler (the 3 integration tests exist and are correct but currently skip cleanly — no `DATABASE_URL` available in this environment). This is `02` design.md §6.3's own explicit pre-approval gate, not a new gap. Don't treat this wrapper as fully production-verified until that integration pass actually runs against real Postgres once one is available.

**Follow-up, 2026-08-08 — two real gaps found in the first delivery, both fixed:**

1. **Missing `vitest.setup.ts`.** Track 3's `vitest.config.mts` (delivered in `5cdab55`, and correctly so — it's the full committed file, not a diff) already contains `setupFiles: ["./vitest.setup.ts"]` from earlier, separate Track 1 work that Track 3 never received. That reference was live but the file it pointed to wasn't delivered, blocking Track 3's entire unit-test run before any test could even load. Root cause: this file was miscategorized as "shell-specific" and excluded from the first delivery; it's actually project-wide test infrastructure that the already-delivered config depends on.
2. **No reusable runtime `RlsPool` adapter existed** — `lib/db/rls-transaction.ts`'s wrapper only had an abstract `RlsPool`/`RlsConnection` interface (correctly DI-testable, but not something Track 3 could plug into real query code without building their own Postgres-wire adapter, which would mean reimplementing Track 1's own locked-file domain).

**Fixing the second gap surfaced a real, previously-unverified bug**: the integration test this wrapper shipped with had *never actually been run* against real Postgres (its own header comment said so explicitly — "Until Docker Postgres is available... this file cannot itself be run"). Running it for the first time (Docker, disposable Postgres 16) found two genuine problems, both now fixed and re-verified, 3/3 passing:
- The test's queries were built via `sql\`...\`` on the *outer*, non-transactional postgres.js client and then handed to the transaction's `.execute()` — but a postgres.js tagged-template call executes immediately against whichever client tagged it, so those queries were never actually running inside the transaction at all. Fixed by standardizing `execute()` on the `{ sql, params }` shape everywhere (already used for claim statements) instead of tagged templates.
- A bare disposable Postgres container has no `authenticated`/`anon` roles and no privileges granted to them (Supabase normally bootstraps both) — `set_config('role', 'authenticated', true)` failed outright, and once the role existed, every query still failed with `permission denied` until the test's own scratch table got an explicit `GRANT SELECT, INSERT ... TO authenticated`, matching §7.1's default-deny baseline (any real table will need the equivalent grant in its own migration, not just an RLS policy).

**Delivered**: `lib/db/rls-pool.ts` (new — the real adapter, promoted out of the integration test's own local proof-of-concept, now the one implementation both the test and real application code share) plus the corrected integration test and `vitest.setup.ts`. Commit `3de96780695f168ee3b6b31e3b2cd3027c11c10c` on `origin/track-1-core-floor-ops`, pushed on top of the prior `5cdab55` delivery.

**Track 3 action**: `git fetch origin` then, on top of wherever the `5cdab55` cherry-pick already landed on `track-3-analytics-billing`, `git cherry-pick 3de96780695f168ee3b6b31e3b2cd3027c11c10c`. Then run `npm install` (this commit doesn't add new `package.json` dependencies itself, but `vitest.setup.ts` needs `jsdom`/`@testing-library/*` already present in `package.json` from the first delivery — worth confirming `node_modules` actually has them installed, not just declared) before running `npm test` again.
