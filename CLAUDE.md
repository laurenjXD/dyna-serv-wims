# CLAUDE.md — Dyna-Serv WIMS

This file is read automatically by Claude Code at the start of every session in this repo. It is the entry point — everything else is reached from here, not duplicated here.

## What this project is

A hybrid warehouse inventory system: VMI (vendor-owned stock, CBM-based billing), Trading/3PL (warehouse-owned stock, buy/sell margin), and Supplies (internal warehouse use) running in parallel out of one physical warehouse. Full context: `specs/00-steering/product.md`.

## The one rule that overrides everything else

**No implementation code is written until a feature's `specs/NN-*/tasks.md` has `Status: Approved` with both sign-offs filled in.** This is not a suggestion. If you (Claude Code, or a subagent) are asked to write code for a feature whose `tasks.md` isn't `Approved`, stop and say so instead of proceeding. Writing requirements/design/tasks docs is always fine. Writing application code against an unapproved spec is not.

**Current status** (updated 2026-08-06): Approval applies to all three feature documents. `01`, `02`, `03`, `04`, `06`, and `08`–`17`, `20`, and `21` have `requirements.md`, `design.md`, and `tasks.md` marked `Approved` with both sign-offs recorded. `05` is `Under Revision` while its expanded global-state and accessibility contract is re-verified. `07`, `18`, and `22` remain Draft and are not implementation-ready. `19-dispatch-scheduling-and-delivery-tracking` is explicitly deferred; its number is reserved because other specs reference it as the future owner of delivery scheduling/tracking. Check `specs/00-steering/gantt-mapping.md` for the live status of every spec against the delivery timeline.

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
- **Deferred or Draft areas:** incoming receiving (`07`), barcode integration (`18`), and parties portal (`22`) remain Draft; dispatch scheduling/delivery tracking (`19`) is deferred. Do not build against any of these until all three documents are Approved.

## Working in this repo

- New feature work always starts by reading that feature's `specs/NN-*/requirements.md` → `design.md` → `tasks.md`, in that order. If any of the three doesn't exist yet or isn't `Approved`, that's the actual next task — not the code.
- Every `design.md` must cite which foundational specs (01-05) it depends on, and which tables from `01-core-data-model` it touches, by name — never redefine schema inline in a feature spec.
- Migration files go in `supabase/migrations/`, numbered sequentially, one concern per file — see `structure.md`.

## Subagents (`.claude/agents/`)

Use these for their specific jobs instead of doing everything in the main thread:

| Agent | Use for |
|---|---|
| `spec-writer` | Drafting/revising requirements.md, design.md, tasks.md. No Bash access — docs only, never writes code. |
| `db-migration-verifier` | Before signing off any DB-touching tasks.md. Runs real Postgres, not mocked tests — this exact pattern already caught two real bugs earlier in this project. |
| `rbac-rls-reviewer` | Reviewing anything touching party/role-scoped data. Flags application-layer-only access control that isn't actually enforced by RLS. Read-only. |
| `design-system-auditor` | Reviewing new UI work against `brand-design-system.md`. Read-only. |
| `offline-sync-reviewer` | Reviewing offline-queue code. Catches Tier 2 actions (approval, pricing, FIFO allocation) accidentally wired into the Tier 1 offline queue. Read-only. |
| `test-writer` | Writing actual test code per `testing.md`'s strategy once a tasks.md's testing requirements are known. |

Note the pattern: verification/review agents are read-only on purpose (`Read, Grep, Glob` only) — they flag, they don't silently fix, because several of these judgment calls (which font is "correct," which RLS policy is "right") need a human or the main thread to decide, not a subagent acting unsupervised.

## Cross-tool compatibility

`AGENTS.md` at the repo root mirrors the critical parts of this file for any non-Claude-Code agent that reads that convention instead. If you ever edit one, edit both — `AGENTS.md` states this explicitly and points back here as canonical.
