# Implementation Kickoff — Where We Start Building

Status: Active
Last Updated: 2026-08-06

This is the concrete "start here" companion to `gantt-mapping.md`. That file tracks status across every milestone; this one exists to answer one question at a time: *what's the actual next task, and which agent(s) build it.* Use `/implement-feature` (the skill at `.claude/skills/implement-feature/`) to run each task's build → review → verify chain once you start it.

Every task below is already spec-Approved per `gantt-mapping.md` (2026-08-06 snapshot). If any status has changed since, trust `gantt-mapping.md`/`tasks.md` over this doc and update this file to match.

## Phase 0 — Scaffolding (do this first, once)

| Task | Owner | Depends on |
|---|---|---|
| Bootstrap Next.js 15 + Drizzle + Supabase client + Tailwind tokens + repo folder skeleton | `project-scaffolder` | `01-core-data-model`, `02-rbac-roles` approved (they are) |

Nothing else starts until `npm run build` and `npm run typecheck` pass clean on the empty skeleton. This is Gantt 1.1, currently listed **Paused** in `gantt-mapping.md` — it unblocks the moment this phase completes; update that row when done.

## Phase 1 — Milestone 1: Receiving & Core Inventory Transfers

Build in this order — each row depends on the schema/RBAC layer below it existing first, not just being spec-approved:

| Order | Spec | What it builds | Agent chain |
|---|---|---|---|
| 1 | `01-core-data-model` | Core schema: `parties`, `items`, `locations`, `lots`, `inventory_transactions` | `database-builder` → `db-migration-verifier` |
| 2 | `02-rbac-roles`, `21-user-profile-and-settings` | Auth, session-based role resolution, user profile/settings | `database-builder` → `db-migration-verifier` → `backend-builder` → `rbac-rls-reviewer` → `frontend-builder` → `design-system-auditor` |
| 3 | `05-ui-shell-and-navigation` | App shell, nav, role-aware layout (shell contract only — this is the one spec flagged as "approved for consumption, final implementation QA remaining") | `frontend-builder` → `design-system-auditor` |
| 4 | `07-incoming-receiving` | Receiving bay intake, inspection cross-reference, WRR creation, lot creation on confirm | `database-builder` (if new tables) → `db-migration-verifier` → `backend-builder` → `rbac-rls-reviewer` + `offline-sync-reviewer` (receiving scans are Tier 1) → `frontend-builder` (floor-priority screen — mobile-first, 56-64px targets) → `design-system-auditor` |
| 5 | `11-transfer-and-inspection` | Internal transfer requests between locations | same chain as above; check `integration-reviewer` against `07`'s lot/location model once both exist |
| 6 | `09-approval-queue` | Transfer approval/authorization workflow — real recorded decisions, not boolean flips | `backend-builder` → `rbac-rls-reviewer` → `frontend-builder` (office/desktop-first, mobile as working secondary) → `design-system-auditor` |
| 7 | Cross-cutting | Receiving/transfer quantity & location validation (Gantt 1.8 — currently unassigned to a single spec, lives inside `07`/`11`'s own validation logic) | `backend-builder`, checked by `integration-reviewer` once both `07` and `11` are built |
| 8 | `testing.md` process | Unit + integration + e2e coverage for everything above | `test-writer`, then `build-doctor` for a full green sweep |
| 9 | Sign-off gate | Milestone 1 review | Human sign-off — not an agent step |

**Why this order, not spec-approval order:** `07-incoming-receiving` and `09-approval-queue` are both "Ready for Dev," but approval-queue authorizing a *transfer* only makes sense once transfers (`11`) and the underlying lots (`01`, via `07`) exist to be transferred. Building in numeric/approval order instead of dependency order is the most likely way to end up with an agent implementing against tables or states that don't exist yet.

## Phase 2 — Milestone 2: Classification & Inventory Processing (next, not yet started)

Once Milestone 1 is code-complete and its integration/testing rows are green: `17-product-categorization-and-classification` → `18-barcode-integration` → `10-pick-list-and-acknowledgement-receipt` → `08-outgoing-withdrawal-and-two-stage-commitment`, then an `integration-reviewer` pass on the receiving-to-picking seam (Gantt 2.6). Full detail deferred to when Phase 1 closes — don't plan Phase 2 task-by-task yet, since Phase 1 implementation may surface schema gaps that change it.

## Standing rule

Same as `gantt-mapping.md`: when a task here starts, moves, or finishes, update this file and the corresponding `gantt-mapping.md` row together. A kickoff doc that drifts from actual progress is worse than no doc.
