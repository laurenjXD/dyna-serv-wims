# Implementation Kickoff — Day 1, End to End, Test-Driven

Status: Active
Last Updated: 2026-08-07

Every spec is Approved. Implementation starts now, test-driven: for every `tasks.md` checklist item, `test-writer` writes and confirms a failing test before any builder agent writes implementation code — see the `implement-feature` skill (`.claude/skills/implement-feature/`) for the full RED → GREEN → REFACTOR → VERIFY cycle mechanics. This doc is the concrete schedule: what gets built first, in what order, by which agent, against which test.

Do not skip ahead in this list. Later rows depend on earlier rows' tables/enums actually existing, not just being spec-approved.

## Phase 0 — Scaffolding (before anything else, once)

**Done 2026-08-07.**

| Step | Agent | Task |
|---|---|---|
| 0.1 | `project-scaffolder` | ✅ Bootstrap Next.js 15 + Drizzle + Supabase clients + Tailwind tokens (real brand values, not placeholders) + `structure.md` folder skeleton. Confirm `npm run build` and `npm run typecheck` pass on the empty skeleton. |
| 0.2 | `build-doctor` | ✅ First green-build confirmation on the skeleton before Phase 1 starts. Typecheck, lint, and build all pass clean; no mechanical issues found. |

Phase 1 (`01-core-data-model`'s real Drizzle schema) is clear to begin.

No RED/GREEN cycle here — there's no acceptance criterion to test yet, just infrastructure the rest of the day depends on.

## Phase 1 — `01-core-data-model` (the critical path — everything else reads this schema)

Work `tasks.md`'s Implementation Task 1 (Drizzle schema) as a sequence of small RED→GREEN→VERIFY cycles, not one giant PR. Suggested slice order, each slice = one cycle:

| Cycle | What | RED (`test-writer`) | GREEN (`database-builder`) | VERIFY |
|---|---|---|---|---|
| 1.1 | Enums (`lib/db/schema/enums.ts`): `partyRoleEnum`, `flowTypeEnum`, `locationTypeEnum`, `lotStatusEnum`, `wrrStatusEnum`, `movementTypeEnum`, `pickListStatusEnum`, `conformanceStatusEnum`, `nonConformanceReasonEnum` | Vitest: importing each enum yields the exact expected value sets (Req 2.1) | Define the enums | — (pure TS, covered by 1.9's compile check) |
| 1.2 | `parties` + `party_roles` (`lib/db/schema/parties.ts`) | Vitest schema shape test (Req 2.1, Design 1.2) | Implement table | — |
| 1.3 | `item_categories` + `items` (`lib/db/schema/items.ts`) — `dsgc_item_number`, `customer_item_code`, `spq`, box dimensions, `volume_cbm` | Vitest: `spq > 0`, `volume_cbm > 0` constraints (Req 2.2) | Implement table + CHECK constraints | — |
| 1.4 | `locations` — `Rack+Level-Position` label, `max_cbm_capacity` | Vitest: label format, capacity validation (Req 2.3) | Implement table | — |
| 1.5 | `lots` — WRR-sourced `lot_number`, `wrr_item_id`, `flow_type`, `peza_number`, `commercial_invoice_no`, `ip_number`, `unit_cost`, dates, `status` | Vitest: `flow_type` partition constraint test (Req 2.5/6) | Implement table — remember `lots.item_id` stays `NOT NULL` (only `wrr_items.item_id` is nullable, per the 2026-08-05 verification fix) | — |
| 1.6 | `lot_location_balances` + `lot_inventory_totals` view | Vitest: non-negative / committed-within-remaining constraint tests (Req 13) | Implement, with `qty_available = qty_remaining - qty_committed` as derived-only | — |
| 1.7 | `inventory_commitments` + `inventory_commitment_lines` | Vitest: `commitmentStatusEnum` lifecycle transition tests (`active`→`inspection_pending`→`executed`/`released`/`expired`/`cancelled`) (Req 14) | Implement, uniqueness + concurrency constraints | — |
| 1.8 | `wrr_documents` + `wrr_items` + `wrr_inspection_logs` | Vitest: `wrr_items.item_id` nullable, `wrr_documents.peza_number` present (Req 2.4/9) | Implement | — |
| 1.9 | `forex_rates`, `inventory_transactions`, `pick_lists` + `pick_list_items` (priced-snapshot fields) | Vitest for each (Req 2.7, 2.6, 15) | Implement | — |
| 1.10 | `lib/db/schema/index.ts` + `lib/db/types.ts` re-exports | Vitest: every table/type importable from the barrel file | Implement | `tsc --noEmit` must compile clean — three files have previously shipped with missing imports (`flowTypeEnum`, `parties`, `wrrItems`, `conformanceStatusEnum`, `nonConformanceReasonEnum`), check this specifically |
| 1.11 | Migration generation | — (no new test; this step operationalizes 1.1–1.10) | `database-builder` runs `npx drizzle-kit generate` → `0001_core_data_model.sql`, adds FKs/indexes/scoped uniqueness/non-negative checks | `db-migration-verifier` runs the **real generated file** against real Postgres — this is the first time it's verifying literal SQL instead of hand-translated DDL; re-confirm all six previously-fixed bugs stay fixed |

**Done 2026-08-07.** 1.1–1.11 all green and verified; Implementation Task 1 and 2 checked off in `01-core-data-model/tasks.md`, unit-test checkbox flipped, `gantt-mapping.md` row 1.2 updated. The four derived read-model views (`master_inventory_tracking`, `lot_history_export`, `location_transaction_ledger`, `party_transaction_ledger`) and `lib/db/types.ts`, originally deferred out of the RED step, were implemented as an immediate follow-up (`0003_derived_read_models.sql`) and independently real-Postgres verified the same day — nothing was left as a silent gap.

Phase 2 (`02-rbac-roles`) is clear to begin.

## Phase 2 — `02-rbac-roles` (depends on Phase 1's `parties`/`party_roles`)

`tasks.md` Tasks 1–4 are already decided (see its Decision Record) — this is now pure implementation, still test-first:

| Cycle | What | RED (`test-writer`) | GREEN (`backend-builder` unless noted) | VERIFY |
|---|---|---|---|---|
| 2.1 | Authorization tables: `roles`, `permissions`, `user_roles`, `role_permissions`, `user_party_scopes`, `rbac_security_events` | Vitest schema tests + migration | `database-builder` | `db-migration-verifier` |
| 2.2 | Session resolver + typed authorization context (identity, roles, capabilities, party scope) | Vitest: forged/stale/missing/malformed claim handling | `backend-builder` | — |
| 2.3 | `requirePermission(capability, scope)` central helper | Vitest: allowed/unauthenticated/forbidden/not-found outcomes | `backend-builder` | — |
| 2.4 | Default-deny RLS policies per table from `design.md §7.4`, including the six previously-unmapped tables (`parties`, `party_roles`, `item_categories`, `lot_location_balances`, `inventory_commitments`, `inventory_commitment_lines`) | Real-Postgres integration tests: allowed-role and disallowed-role cases per table | `database-builder` | `db-migration-verifier` **and** `rbac-rls-reviewer` — both required before this cycle closes |
| 2.5 | Admin invitation/activation, role assignment/revocation flows | Playwright e2e (admin flows) | `backend-builder` + `frontend-builder` (office/desktop-first UI, per `05-ui-shell-and-navigation` once available) | `rbac-rls-reviewer`, `design-system-auditor` |

Party-scope revocation must take effect on the **next request** (decision `1I=C`), not next login — write that as an explicit test case, it's the one most likely to get silently implemented as "next login" by default.

When Phase 2's core (2.1–2.4) is green and verified: `02-rbac-roles` moves from Ready-for-Dev to In Progress/Implemented in `gantt-mapping.md`.

## Phase 3 — First floor feature: `07-incoming-receiving` (depends on Phase 1 + Phase 2)

Once schema and auth are real: `database-builder` (any remaining receiving-specific tables) → `backend-builder` (WRR intake, inspection cross-reference, lot creation on confirm) → `rbac-rls-reviewer` + `offline-sync-reviewer` (receiving scans are Tier 1) → `frontend-builder` (mobile-first, 64px primary actions, portrait-only) → `design-system-auditor`. Full detail deferred to when Phase 2 closes — don't front-load Phase 3 planning while Phase 1/2 are still open, since implementing them may surface schema gaps that change it.

## Standing rule

Same as `gantt-mapping.md`: when a cycle starts, moves, or finishes, update this file and the corresponding `gantt-mapping.md` row together. A kickoff doc that drifts from actual progress is worse than no doc. Checked boxes in any `tasks.md` must correspond to an actual RED→GREEN→VERIFY cycle that happened — not to work that "should be fine."
