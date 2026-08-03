# Revision Log — Hyperion 3PL / Dyna-Serv

Every merge conflict and major revision, dated, with the resolution. This is the audit trail for "why does the spec say X" when X isn't obvious from the doc alone.

## Resolved

**Warehouse count** — uploaded system_design.md specified two warehouses; prior work had settled on one. **Resolved: one warehouse.** No `warehouse_id` anywhere in the schema.

**Naming: parties/items/locations vs suppliers/SKU/bins** — uploaded doc reverted to supplier/SKU/bin terminology. **Resolved: parties/items/locations stands.** See `structure.md` glossary.

**Document model** — uploaded doc specified `pick_list` + `withdrawal_slip` (unpriced, `awaiting_pricing` lifecycle). **Resolved: `pick_list` + `acknowledgement_receipt`, both priced**, no scan-back of the signed copy, no `withdrawal_slip`.

**Supplies partition added** — internal warehouse supplies are received and stored using standard inventory flows. **Resolved: added `'supplies'` as a third `flow_type` partition.** VMI, Trading, and Supplies data remain strictly partitioned so billing, customer reporting, and internal usage never mix.

**Database ORM selection** — specified Drizzle ORM for type-safe database queries and schema definitions on top of Supabase PostgreSQL. **Resolved: Drizzle ORM adopted for DB access.** Works alongside Supabase Auth, Storage, and Realtime while Supabase RLS handles database row-level security.

**Services additions: Resend, Upstash, & Sentry** — specified services for email, rate limiting, and error tracking. **Resolved: Resend for transactional & auth emails, Upstash Redis for rate limiting, and Sentry for client/server error monitoring.**

**Glossary & terminology alignment** — standardized terms for receiving (`wrr`, `cipl`, `receiving_bay`), ledger (`inventory_transaction`, `movement_type`), units & measurement (`uom`, `spq`, `volume_cbm`), and auditing (`cycle_count`, `inventory_reconciliation`). **Resolved: added to `structure.md` Glossary.**

## Flagged, not yet resolved

The following are confirmed as **expected to change significantly** — specs touching them stay `Draft`:

- **RBAC / role model** (spec 02)
- **Offline mode / sync approach** (spec 03)
- **VMI billing model** (spec 12)
- **Trading pricing model** (spec 13)

No specifics recorded yet on *what* will change about each — to be filled in as those specs are actually drafted and the revision surfaces.

## Input captured, not yet formalized

**CIPL/WRR pre-receiving workflow** — full raw capture at `07-incoming-receiving/input-notes.md`. Reveals real schema implications that `01-core-data-model` must account for before it's drafted: a `pending_arrival` status on `stock_entries` (receiving-side staging, distinct from the withdrawal-side two-stage commitment), a possible third document type (WRR) alongside `pick_list`/`acknowledgement_receipt`, and open questions about whether CIPL data needs structured representation or stays an attached reference document. **Read this before starting 01.**

## Gantt chart reconciliation

Three decisions made when reconciling the project Gantt chart against this spec structure:

1. **Already-in-progress setup/schema work (Gantt tasks 1-2, at 50%/20% complete) is paused.** It resumes once `01-core-data-model` is drafted and approved — this directly enforces the "no code before approved tasks.md" ground rule against real work that had started outside the process. `01` is now the critical path for everything, including resuming already-started work, not just for new specs.
2. **`tasks.md` stays feature-level.** The Gantt is a separate tracking layer above the specs, not a rewrite of task granularity inside them. See `gantt-mapping.md` for the join between the two.
3. **Missing Gantt scope added as new specs**: `17-product-categorization-and-classification`, `18-packing`, `19-dispatch-scheduling-and-delivery-tracking`, `20-documentation-training-and-uat`. Added now, ahead of when Milestone 2 needs them, rather than discovered mid-milestone.

**Named schedule risk, not yet resolved**: Milestone 1's "Transfer approval workflow" depends on RBAC (`02-rbac-roles`), which is flagged for major revision. See `gantt-mapping.md`'s Milestone 1 table for the full trace.

## Claude Code alignment

Added `CLAUDE.md` (root — the file Claude Code reads automatically), `AGENTS.md` (cross-tool mirror, points back to `CLAUDE.md` as canonical), and six subagents in `.claude/agents/`: `spec-writer` (docs only, no Bash access), `db-migration-verifier` (codifies the real-Postgres testing pattern), `rbac-rls-reviewer`, `design-system-auditor`, `offline-sync-reviewer` (all three read-only), and `test-writer`. Each review/reviewer agent is deliberately read-only — flags issues rather than silently fixing them, since several of the judgment calls involved (which font is correct, which RLS policy is right) need a human decision.

**Explicit limitation, not glossed over**: subagent tool restrictions in Claude Code are per-tool (Read/Write/Bash/etc.), not per-file-path. The `spec-writer` agent's lack of Bash access is a real technical restriction; its instruction to only write inside `specs/` is a followed convention, not a hard technical boundary. Same class of limitation as the "no code before approved tasks.md" rule itself — enforced by an agent choosing to follow it, not by the tooling refusing otherwise.
