# CLAUDE.md — Dyna-Serv WIMS

This file is read automatically by Claude Code at the start of every session in this repo. It is the entry point — everything else is reached from here, not duplicated here.

## What this project is

A hybrid warehouse inventory system: VMI (vendor-owned stock, CBM-based billing), Trading/3PL (warehouse-owned stock, buy/sell margin), and Supplies (internal warehouse use) running in parallel out of one physical warehouse. Full context: `specs/00-steering/product.md`.

## The one rule that overrides everything else

**No implementation code is written until a feature's `specs/NN-*/tasks.md` has `Status: Approved` with both sign-offs filled in.** This is not a suggestion. If you (Claude Code, or a subagent) are asked to write code for a feature whose `tasks.md` isn't `Approved`, stop and say so instead of proceeding. Writing requirements/design/tasks docs is always fine. Writing application code against an unapproved spec is not.

**Current status** (updated 2026-08-06): Approval applies to all three feature documents. `01`–`18`, `20`, `21`, and `22` have `requirements.md`, `design.md`, and `tasks.md` marked `Approved` with both sign-offs recorded. The cross-cutting `audit_log` and shared list-interaction amendment is verified at the design level; audit-log retention is resolved at three years, while broader business/provider-log retention remains the named `04 §23.8` decision. `19-dispatch-scheduling-and-delivery-tracking` is explicitly deferred; its number is reserved because other specs reference it as the future owner of delivery scheduling/tracking. Check `specs/00-steering/gantt-mapping.md` for the live status of every spec against the delivery timeline.

## Read these before writing anything

| Doc | What it governs |
|---|---|
| `specs/00-steering/product.md` | Business context, who the users are |
| `specs/00-steering/tech.md` | Stack (Next.js 15 + Supabase + Vercel, locked as Option A), cross-cutting architecture principles |
| `specs/00-steering/structure.md` | Naming (parties/items/locations, never suppliers/SKU/bins), repo layout |
| `specs/00-steering/brand-design-system.md` | Colors, typography, mobile-first floor-priority rules — **read before any UI code**, no exceptions |
| `specs/00-steering/testing.md` | Vitest + Playwright, two-stage DB testing, floor/hardware simulation strategy |
| `specs/00-steering/gantt-mapping.md` | What's actually approved vs. in-progress vs. not started, mapped to the delivery timeline |
| `specs/00-steering/revision-log.md` | Every merge conflict and major decision, dated — check here before assuming something is settled |

## Non-negotiable decisions (do not re-litigate these)

- **One warehouse.** No `warehouse_id` anywhere.
- **`parties` / `items` / `locations`** — not `suppliers` / `SKU` / `bins`.
- **`pick_list` + `acknowledgement_receipt`**, both priced. No `withdrawal_slip`, no `awaiting_pricing` status. Trading's price on a document is final; VMI's is a per-release reference only — the real VMI bill is always the period average, never a single document's total.
- **Mobile-first, floor-priority.** The warehouseman on a handheld scanner is the primary user. Office/desktop screens are the secondary case. See `brand-design-system.md` §3 for what this means concretely (touch targets, no glassmorphism on floor screens, hover vs. press, single-primary-action-per-screen).
- **Deferred or Draft areas:** parties portal (`22`) is Approved for its documented contract, with downstream runtime work gated by its named dependencies; barcode integration (`18`) is Approved for its documented contract, with runtime scanner tests remaining implementation work; dispatch scheduling/delivery tracking (`19`) is deferred.

## Working in this repo

- New feature work always starts by reading that feature's `specs/NN-*/requirements.md` → `design.md` → `tasks.md`, in that order. If any of the three doesn't exist yet or isn't `Approved`, that's the actual next task — not the code.
- Every `design.md` must cite which foundational specs (01-05) it depends on, and which tables from `01-core-data-model` it touches, by name — never redefine schema inline in a feature spec.
- Migration files go in `supabase/migrations/`, numbered sequentially, one concern per file — see `structure.md`.

## Subagents (`.claude/agents/`)

Use these for their specific jobs instead of doing everything in the main thread:

| Agent | Use for |
|---|---|
| `spec-writer` | Drafting/revising requirements.md, design.md, tasks.md. No Bash access — docs only, never writes code. |
| `project-scaffolder` | One-time only, at the start of implementation: bootstraps the Next.js + Supabase + Drizzle + Tailwind skeleton per `tech.md`/`structure.md`. Not for feature code. |
| `database-builder` | Writing Supabase/Postgres migration files (tables, RLS policies, SQL functions) for an approved feature spec. Never self-verifies — always hands off to `db-migration-verifier`. |
| `db-migration-verifier` | Before signing off any DB-touching tasks.md. Runs real Postgres, not mocked tests — this exact pattern already caught two real bugs earlier in this project. |
| `backend-builder` | Implementing Next.js API routes, Server Actions, and business logic (FIFO/FEFO, pricing, approval workflow) against an approved, already-verified schema. |
| `frontend-builder` | Implementing Next.js pages/components against a working backend. Always hands off to `design-system-auditor` before considering a component done. |
| `rbac-rls-reviewer` | Reviewing anything touching party/role-scoped data. Flags application-layer-only access control that isn't actually enforced by RLS. Read-only. |
| `design-system-auditor` | Reviewing new UI work against `brand-design-system.md`. Read-only. |
| `offline-sync-reviewer` | Reviewing offline-queue code. Catches Tier 2 actions (approval, pricing, FIFO allocation) accidentally wired into the Tier 1 offline queue. Read-only. |
| `integration-reviewer` | Reviewing the seam between two already-built features (e.g. receiving → picking, approval queue → withdrawal) — checks shared tables/state/assumptions match on both sides. Read-only. |
| `test-writer` | Writing actual test code per `testing.md`'s strategy once a tasks.md's testing requirements are known. |
| `build-doctor` | After a batch of changes, or before marking implementation complete: runs typecheck/lint/unit tests/build and fixes mechanical failures. Not a business-logic or design reviewer. |
| `ai-agent-builder` | Implementing the in-app AI chatbot (`15-ai-chatbot`) — the three-persona assistant backed by scoped tool calls. |
| `documentation-writer` | User-facing docs, admin/training material, API reference, code comments — once a feature is implemented and approved. |

Note the pattern: verification/review agents are read-only on purpose (`Read, Grep, Glob` only) — they flag, they don't silently fix, because several of these judgment calls (which font is "correct," which RLS policy is "right") need a human or the main thread to decide, not a subagent acting unsupervised.

For the full build → review → verify sequence per feature, use the `/implement-feature` skill (`.claude/skills/implement-feature/`) rather than improvising the agent order each time. For what to build first, see `specs/00-steering/implementation-kickoff.md`.

## Cross-tool compatibility

`AGENTS.md` at the repo root mirrors the critical parts of this file for any non-Claude-Code agent that reads that convention instead. If you ever edit one, edit both — `AGENTS.md` states this explicitly and points back here as canonical.
