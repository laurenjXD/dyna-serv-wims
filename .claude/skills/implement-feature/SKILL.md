---
name: implement-feature
description: Use whenever starting or resuming implementation of a specific feature spec (e.g. "implement 07-incoming-receiving", "build the receiving module", "let's start coding the RBAC spec"). Walks the test-driven, RED → GREEN → REFACTOR → VERIFY agent handoff chain for this repo, one tasks.md checklist item at a time, instead of improvising it per feature.
---

# Implement Feature (TDD)

This repo runs Spec-Driven Development (`CLAUDE.md`'s one rule): no application code until `specs/NN-*/tasks.md` is `Status: Approved` with both sign-offs. Every spec is approved now, so implementation is the actual next phase — and it runs test-driven: **a failing test exists before any implementation code is written, for every checklist item, every time.** This skill is the repeatable cycle for that, using this project's actual subagents instead of improvising per feature.

## Step 0 — Gate check (always, no exceptions)

1. Read `specs/NN-<feature>/tasks.md`. Confirm `Status: Approved` and both sign-offs are filled in.
2. Cross-check `specs/00-steering/gantt-mapping.md` and `specs/00-steering/implementation-kickoff.md` for build order — don't implement a feature whose dependencies aren't built yet, even if its own spec is approved.
3. If not approved: stop. Say so. Do not proceed, even for "just scaffolding" or "just the UI."

## Step 1 — Read the spec chain

`requirements.md` → `design.md` → `tasks.md`, in that order. `tasks.md`'s **Implementation Tasks** checklist and **Testing Requirements** section are the actual unit of work below — each unchecked box is one RED→GREEN cycle, not the whole feature at once. Also read whichever of these `design.md` cites by name: `specs/00-steering/tech.md`, `01-core-data-model`'s schema, `specs/00-steering/revision-log.md`.

## Step 2 — The cycle, per checklist item (or small group of related items)

**RED — `test-writer` writes a failing test first, always.**
Pick the next unchecked box in `tasks.md`. Find the `requirements.md` acceptance criterion(s) it implements. `test-writer` writes the test — Vitest unit test for schema/logic, real-Postgres integration test for RLS/SQL functions, or Playwright e2e for a user-facing flow, per `specs/00-steering/testing.md`'s two-stage strategy — *before* the implementation exists, and confirms it actually fails (not "would fail" — run it, see it fail, for the right reason: missing code, not a typo in the test). Cite the acceptance criterion number in the test name/description.

**GREEN — the owning builder agent writes the minimum code to pass.**
- Schema/migration item → `database-builder`
- API route / Server Action / business logic item → `backend-builder`
- Page/component item → `frontend-builder`
- Chatbot tool item → `ai-agent-builder`

The builder's job is narrowly to make the already-written failing test(s) pass — not to write its own tests, not to implement ahead of what the current checklist item needs. Run the test again; confirm it's green. If it's green for the wrong reason (test too weak), that's a finding to send back to `test-writer`, not something to silently accept.

**REFACTOR — clean up with the tests as the safety net.**
Once green, simplify/tighten the implementation if needed (remove duplication, fix naming) with the passing test suite as the guard against regression. Don't refactor and add new behavior in the same step.

**VERIFY — the specialized reviewer(s) for what this checklist item actually touches.**
- Touches schema/RLS/SQL function → `db-migration-verifier` (real Postgres, not mocked — this is a hard requirement per `testing.md`, not optional)
- Touches party/role-scoped data → `rbac-rls-reviewer`
- Could be reachable from an offline-queued action → `offline-sync-reviewer`
- Touches UI → `design-system-auditor`
- Connects to another already-built feature's data/state → `integration-reviewer`

Do not check the box in `tasks.md` until RED, GREEN, and the applicable VERIFY pass have all happened for it. A checked box with no test behind it is a false status, worse than an honestly-unchecked one.

## Step 3 — Build health sweep

After a batch of checklist items (not necessarily every single one — use judgment, but at least once per work session and always before a milestone review): run `build-doctor` for typecheck/lint/full test run/build, all green.

## Step 4 — Update tracking

Update `specs/00-steering/gantt-mapping.md` and `implementation-kickoff.md`'s Implementation Status for the row(s) this work covers. A stale row is a bug, per that file's own standing rule.

## Notes

- **Never let a builder agent write its own tests for the checklist item it's implementing.** That inverts TDD into "write code, then write a test that agrees with whatever the code does" — which certifies nothing. `test-writer` and the builder agents are different agents specifically so this can't happen by accident.
- Skip layers that don't apply (a pure schema task has no Playwright layer) — but don't skip a layer because it's inconvenient, only because `tasks.md`'s own Testing Requirements section says it doesn't apply.
- If a reviewer agent reports a finding, route it back to the owning builder, then re-run RED (if the finding reveals a missing test case) or just GREEN+VERIFY again — don't mark the item done with an open finding.
- For build order across features, see `specs/00-steering/implementation-kickoff.md`.
