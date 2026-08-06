---
name: implement-feature
description: Use whenever starting or resuming implementation of a specific feature spec (e.g. "implement 07-incoming-receiving", "build the receiving module", "let's start coding the RBAC spec"). Walks the approval gate check and the correct builder → reviewer → verifier agent handoff chain for this repo, in order, instead of improvising it per feature.
---

# Implement Feature

This repo runs Spec-Driven Development (`CLAUDE.md`'s one rule): no application code until `specs/NN-*/tasks.md` is `Status: Approved` with both sign-offs. This skill is the repeatable sequence for taking one already-approved feature from "nothing built" to "ready for milestone sign-off," using this project's actual subagents in the right order rather than reinventing the sequence each time.

## Step 0 — Gate check (always, no exceptions)

1. Read `specs/NN-<feature>/tasks.md`. Confirm `Status: Approved` and both sign-offs are filled in.
2. Cross-check `specs/00-steering/gantt-mapping.md` for that spec's row — if it disagrees with the tasks.md status, trust `tasks.md` but flag the mismatch so `gantt-mapping.md` gets corrected (it says stale rows are a bug, not cosmetic).
3. If not approved: stop. Say so. Do not proceed to any step below, even for "just scaffolding" or "just the UI."

## Step 1 — Read the spec chain

`requirements.md` → `design.md` → `tasks.md`, in that order, for the target feature. Also read whichever of these `design.md` cites by name:
- `specs/00-steering/tech.md` (cross-cutting principles)
- `specs/01-core-data-model` (schema — never invent a table/column it doesn't have)
- `specs/00-steering/revision-log.md` (confirm RBAC/offline/VMI-billing/Trading-pricing decisions this feature depends on are actually settled, not still open)

## Step 2 — Database layer (if the feature touches schema)

1. `database-builder` writes the migration(s) in `supabase/migrations/`, following `structure.md` naming (`NNNN_description.sql`, sequential).
2. `db-migration-verifier` runs it against real Postgres — never treat a migration as done because it "reads correctly." This is a hard requirement, not a nice-to-have; this exact pattern caught two real bugs earlier in this project.
3. Do not proceed to Step 3 until the migration verifies clean.

## Step 3 — Backend layer

1. `backend-builder` implements API routes/Server Actions/business logic against the verified schema.
2. Hand off to `rbac-rls-reviewer` if the endpoint touches party- or role-scoped data.
3. Hand off to `offline-sync-reviewer` if anything here could plausibly be reachable from an offline-queued (Tier 1) action.

## Step 4 — Frontend layer

1. `frontend-builder` implements the UI against the now-working backend.
2. Hand off to `design-system-auditor` before considering any component done — no self-certifying brand consistency.
3. Remember the floor/office split from `brand-design-system.md`: floor screens are mobile-first with touch targets and press feedback, office screens are desktop-first with mobile as a working secondary case. Don't build one component and call it both.

## Step 5 — Cross-feature seam check (if this feature connects to another already-built one)

If this feature hands data to, or receives data from, another implemented feature (receiving → picking, approval queue → withdrawal, inventory_transactions → VMI billing, etc.), run `integration-reviewer` on the seam specifically — not just each side's own reviewer. This is the gap that per-feature review misses by design.

## Step 6 — Tests

`test-writer` writes Vitest unit tests, real-Postgres integration tests (or hands the deeper pass back to `db-migration-verifier`), and Playwright e2e tests per `specs/00-steering/testing.md`. Every test should cite the `requirements.md` acceptance criterion it protects. Run them — report actual pass/fail, never assumed pass.

## Step 7 — Build health sweep

Before calling the feature done, run `build-doctor`: typecheck, lint, unit tests, build, all green. This catches mechanical breakage (type errors, broken imports, dependency drift) that the specialized reviewers above don't check and aren't supposed to.

## Step 8 — Update tracking

Update `specs/00-steering/gantt-mapping.md`'s Implementation Status column for the row(s) this feature covers, from "Ready for Dev" to reflect actual state (e.g., "In Progress," "Implemented — pending Milestone review"). Per that file's own standing rule, a stale row is a bug.

## Notes

- Skip steps that don't apply (e.g., a pure UI-polish task may skip Steps 2–3) — but don't skip a step because it's inconvenient, only because the feature genuinely doesn't touch that layer.
- If any reviewer agent (rbac-rls-reviewer, offline-sync-reviewer, design-system-auditor, integration-reviewer) reports a finding, route it back to the owning builder agent and re-run that reviewer after the fix — don't mark the feature done with an open finding.
- For which feature to pick up next, check `specs/00-steering/gantt-mapping.md` (or the repo's implementation kickoff doc, if one exists) for milestone ordering — don't implement out of dependency order (e.g., don't start `08-outgoing-withdrawal` before `01`/`02`/`07` are actually built, even though all three are spec-approved).