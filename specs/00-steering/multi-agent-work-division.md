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
- **This track is also the sole writer of the shared/locked files** listed below, for as long as Phase 1/2 activity is ongoing. Once Phase 2 is fully closed (cycle 2.4/2.5 done, `gantt-mapping.md` row 1.3 says `Implemented`), Track 1 should post a note in `revision-log.md` announcing the core is stable, at which point Tracks 2 and 3 may begin their own application-code work (they can do spec-level/documentation work on their tracks earlier — see "What can start now vs. later" below).

### Track 2 — Office & Master Data
**Owner: the other Claude Code agent, run by the second collaborator.**

- `06-party-and-item-enrollment` → `09-approval-queue` → `14-notifications-and-alerts` → `17-product-categorization-and-classification` → `18-barcode-integration`.
- `06` already has extensive same-day spec work (location enrollment, Contact Party email action, location/party transaction ledgers, the `/parties`/`/items`/`/locations` route-gate fix) — read `specs/00-steering/revision-log.md`'s 2026-08-07 entries for `06` before touching it, so you don't redo or contradict that reasoning.
- `06`'s application code depends on `02-rbac-roles`'s `requirePermission`/session-resolver logic (`lib/rbac/`) actually existing — that's Track 1's output. Check `gantt-mapping.md` row 1.3 before writing `06` application code; if Phase 2 isn't closed yet, do `06`'s spec/design refinement and wait on code.

### Track 3 — Analytics, Billing & External-Facing
**Owner: Codex, run by the third collaborator.**

- `16-reporting-and-analytics` → `12-vmi-billing` → `13-trading-orders-and-pricing` → `22-parties-portal` → `15-ai-chatbot` (last — its tool registry reads from most other specs, so it benefits from those being stable first).
- **Codex-specific**: read `AGENTS.md`, not `CLAUDE.md`, as your primary process doc — they say the same thing, `AGENTS.md` just doesn't assume Claude Code's skill/subagent infrastructure. If you don't have an equivalent of Claude Code's specialized review subagents (`rbac-rls-reviewer`, `design-system-auditor`, etc.), do the equivalent review pass yourself, read-only against the spec files, before making changes — the same pattern already used in this repo's `codex task.md` precedent ("For each persona named below, adopt its stated scope as a checklist and run that pass yourself, read-only against the spec files first").
- `16` already has same-day spec work (the `/reports` route rename resolving a collision with `05`'s new landing page, the `<ActivityHeatmap>` reuse on `/`, the `get_analytics_summary` chatbot tool) — read the relevant 2026-08-07 `revision-log.md` entries before touching it.

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

**Can start immediately, all three tracks, no coordination needed:** requirements.md/design.md/tasks.md drafting or revision within your own track's spec folders. This is pure documentation, doesn't touch shared files, and is always fine per the project's core rule.

**Waits on Track 1 announcing core-stable:** any application code (schema, RLS policies, session/guard logic, routes) for Tracks 2 and 3, since it depends on `01`'s schema and `02`'s auth logic being in their final form. Writing code against a moving foundation means redoing it when the foundation shifts — check `gantt-mapping.md` before starting, not just at kickoff.

**Never starts without a product-owner call, any track:** anything the product owner explicitly deferred — the WRR email/PDF-parsing automation idea and any AI-generated-content feature not already in an approved spec. If you think you've found a good reason to build one of these now anyway, that reasoning belongs in a flagged question to the product owner, not in a spec change.

## Git workflow

- One branch per track: `track-1-core-floor-ops`, `track-2-office-data`, `track-3-analytics-billing`. Never commit directly to `main`.
- **No agent commits without its human collaborator explicitly asking for that specific commit.** This is `CLAUDE.md`'s existing git safety rule, restated here because it was violated three times in the session that produced this doc — an agent should never decide on its own that a batch of work is "done enough to commit."
- Rebase your track branch onto `main` at the start of every session, before making changes — not after, so you find out about upstream changes before you've built on stale files.
- Merge order into `main`: Track 1's core/floor-ops changes merge first (smallest, most foundational, least likely to conflict with anything), then Track 2, then Track 3 — always one at a time, never simultaneous merges of two track branches, even if a bot says they're conflict-free. Confirm `npm run build`, `npx tsc --noEmit`, and the full Vitest suite are clean on `main` after every merge before the next one starts.
- Before opening a PR: run `git diff` yourself and read every file your track's agent touched. This session found three separate cases of an agent making an edit it never mentioned in its own summary — a stray field, a stray edit to an unrelated agent-definition file, and one invented feature added to a core steering doc that nobody had ever discussed. Catch these before they reach a PR, not after.

## Status reporting

Each track posts a dated entry to `specs/00-steering/revision-log.md` for every non-trivial decision, same as the existing convention — this is the only way the other two tracks find out what happened. When a track's spec returns to fully `Approved`/complete, update that track's row in `gantt-mapping.md` in the same commit as the revision-log entry, not later.

## Pending cross-track requests

*(Track 2 or 3: add dated requests here when you need a locked-file change. Track 1: mark resolved with a pointer when done.)*
