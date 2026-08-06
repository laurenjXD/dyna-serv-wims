SYSTEM CONTEXT
Repo: dyna-serv-wims. Read CLAUDE.md first — binding process doc. Hard rule: no 
application code against any spec whose tasks.md isn't Status: Approved. This task 
is documentation-only. Some specs touched below (01, 02, 04, 09, 16) are already 
Approved — reopening an Approved spec to add a cross-cutting concern is an 
established pattern here (see revision-log.md's 05-ui-shell-and-navigation entry: 
Approved-track spec reopened to Under Revision for an expanded contract, not 
treated as a violation). Follow that precedent: mark only the documents you 
actually change as Under Revision, leave the rest of each spec's Approved status 
alone, and re-approve via the same auto-sign-off pattern once review passes clean.

Read first: specs/00-steering/product.md, tech.md, structure.md, 
brand-design-system.md, testing.md, gantt-mapping.md, revision-log.md (full file).

Persona note: .claude/agents/*.md defines review personas for Claude Code's 
subagent dispatch, which you don't have. For each persona named below, open its 
.md file, adopt its stated scope as a checklist, and run that pass yourself, 
read-only against the spec files first (list findings before fixing).

GOAL — add a cross-cutting Audit Trail, Filtering, and Table-Actions contract:

1. AUDIT LOG SCHEMA (touches 01-core-data-model, Approved → reopen design.md only)
   - Define a concrete `audit_log` table (not just referenced in prose): actor 
     (user id + role), action, entity_type, entity_id, before/after or diff 
     payload, correlation_id (matching 04's §15.3 propagation contract exactly), 
     timestamp. Cite 04-services-and-infrastructure's correlation-ID design by 
     name as the source of truth for that field.
   - Distinguish this from `inventory_transactions`: audit_log is generic 
     across all entities (party/item/location edits, approval decisions, RBAC 
     grant changes), inventory_transactions stays the domain-specific stock 
     ledger. Don't merge them.
   - Run persona db-migration-verifier against the new table (real Postgres).
   - Run persona rbac-rls-reviewer: who can read audit_log (likely supervisor/
     administrator only, RLS-scoped) — define the read capability explicitly 
     in 02-rbac-roles's capability catalog (reopen 02's design.md §3.2/§7.4 the 
     same way), don't leave it implicit.
   - State retention policy: cite 04's existing Storage retention/deletion job 
     pattern (§10.4) as precedent rather than inventing a new mechanism.

2. TABLE/ROW-ACTION CONTRACT (05-ui-shell-and-navigation, Under Revision already 
   — extend the same revision pass, don't reopen separately)
   - Generalize the existing ad hoc patterns (01's "View History" modal button, 
     09's request-detail-and-history page) into one documented table component 
     contract: every list/table view gets a consistent row-level action affordance 
     (view / edit / deactivate, gated per-row by the caller's capability — no 
     action rendered the user can't actually perform, not just disabled).
   - Apply brand-design-system.md §3 mobile-first rules: action buttons meet 
     the touch-target minimum, single primary action per row, no hover-only 
     affordances on floor/handheld views.
   - Run persona design-system-auditor against this addition specifically.

3. FILTER/SEARCH CONTRACT (new shared pattern, referenced from each list-bearing 
   spec rather than redefined per spec)
   - Write the shared filter contract once, in 05's design.md (it already owns 
     shell-level UI conventions): standard filter bar shape (date range, party, 
     flow type, item/entity — matching 16's FR-8.1 exactly, don't invent a 
     second vocabulary), and a global cross-entity search affordance.
   - Reopen 06-party-and-item-enrollment, 11-transfer-and-inspection, 
     13-trading-orders-and-pricing, 14-notifications-and-alerts (whichever are 
     Approved, note precedent from item 1 above) to add one line each citing 
     05's filter contract by name for their list views — do not restate the 
     contract's shape in each spec.
   - Every filter must be RLS-backed, matching 16's NFR-7 precedent (scoped 
     result set is canonical, filtering is never a supplemental client-side-only 
     boundary) — verify this per spec with rbac-rls-reviewer.

RULES
- Docs only, no application code or real migrations.
- Exact glossary terms from structure.md — no synonyms.
- Any open question you can't resolve from steering docs or revision-log.md: 
  record as a named blocker in the spec (22's R11 "flag it BLOCKED" pattern), 
  don't invent a resolution.
- Log every non-trivial decision to specs/00-steering/revision-log.md, dated, 
  matching existing entry style.
- On each spec returning to Approved, update gantt-mapping.md's row and 
  CLAUDE.md's "Current status" line; mirror any CLAUDE.md edit into AGENTS.md.

OUTPUT
Per spec touched: what was open, what changed, which persona passes ran and 
their findings, final Status. Flag explicitly anything needing a product-owner 
call instead of guessing.