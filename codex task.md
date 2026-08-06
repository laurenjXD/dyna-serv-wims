SYSTEM CONTEXT
You are working in the dyna-serv-wims repo. Read CLAUDE.md at the repo root first — 
it is the binding process doc. The hard rule: no application code is written against 
any spec whose tasks.md is not Status: Approved (all three of requirements.md/design.md/
tasks.md Approved, both sign-offs filled). This task is documentation-only: you are 
revising specs toward Approved, not implementing them.

Also read, in order, before touching anything:
  specs/00-steering/product.md
  specs/00-steering/tech.md
  specs/00-steering/structure.md
  specs/00-steering/brand-design-system.md
  specs/00-steering/testing.md
  specs/00-steering/gantt-mapping.md
  specs/00-steering/revision-log.md   (read the full file — it has the exact open 
                                        items for every spec below, don't re-derive them)

This repo defines review personas as Claude Code subagents in .claude/agents/*.md. 
You don't have subagent dispatch, so for each persona below: open its .md file, adopt 
its stated scope and constraints as a checklist, and run that pass yourself, read-only 
against the spec files (do not silently fix what it flags — list findings, then apply 
fixes as a separate deliberate edit pass, same as the real agent's read-only contract).

GOAL
Bring these four specs to Status: Approved on all three documents each, in this order 
(most-blocked-dependency-free first):

1. 22-parties-portal (Draft, most complete)
   - Full documents already exist; the open item per revision-log.md's 
     "wrr_advance_notices/shipment_labels.generate — first-pass review" entry is: 
     re-verification was never completed after the 9-gap remediation.
   - Run persona rbac-rls-reviewer (.claude/agents/rbac-rls-reviewer.md) against 
     01-core-data-model/design.md §6, 02-rbac-roles/design.md §3.2/§7.4, and 
     22-parties-portal's requirements.md R11 / design.md §7c. Confirm the prior 9 
     fixes actually hold; report any regressions.
   - Run persona db-migration-verifier (.claude/agents/db-migration-verifier.md) 
     against any schema implied by wrr_advance_notices (real Postgres, not mocked).
   - If both pass clean, flip requirements.md/design.md/tasks.md Status to Approved 
     per the standing auto-sign-off arrangement (see revision-log.md's `01` entry 
     for the precedent — fill "User / System, auto-sign-off per standing 
     instruction" on the second-approver line).

2. 05-ui-shell-and-navigation (Under Revision)
   - State catalog expansion and one design-token fix (active-nav brand-red vs 
     structural brand-navy) are already done. Open: "Implementation/browser QA and 
     the formal design-system reviewer sign-off remain open" (revision-log.md, 
     05 entry).
   - Run persona design-system-auditor (.claude/agents/design-system-auditor.md) 
     against requirements.md/design.md/tasks.md and the review mockup, checking 
     typography, color, breakpoints, touch targets, motion, and focus rules per 
     brand-design-system.md §3.
   - Confirm the state catalog (forbidden/not-found, session checking, sign-out, 
     retry/timeout exhaustion, storage-attention, online-required, sync-vs-online 
     distinction, nav focus/transition) is fully reflected in tasks.md's acceptance 
     criteria, not just requirements/design.
   - On clean pass, flip Status to Approved (same auto-sign-off pattern as above).

3. 18-barcode-integration (Draft)
   - Known blocker: FR-2.1/FR-2.2 currently state 2D-only, 1D "deprecated"/
     out-of-scope. This directly contradicts 22's R11, which committed v1 
     pre-labeling to 1D linear (Code 128) specifically because 1D can't hold 
     the JSON payloads FR-2.2 assumed — but R11's payload is a thin flat 
     identifier (`WAN:<uuid>`), so that stated exclusion reason doesn't apply 
     to this case. Amend the scanning component to decode 1D/linear barcodes 
     for the inbound pre-label path specifically, without reopening the 2D-first 
     decision for the rest of the spec.
   - Draft/complete requirements.md → design.md → tasks.md in that order (use 
     persona spec-writer's scope/conventions, .claude/agents/spec-writer.md, as 
     the drafting standard — docs only).
   - design.md must cite 01 (schema), 02 (capability catalog), and 22 (the 
     shipment_labels.generate consumer) by name.
   - Run rbac-rls-reviewer persona once shipment_labels.generate's scan-side 
     access pattern is drafted.
   - Flip to Approved once all three documents are complete and reviewed clean.

4. 07-incoming-receiving (Draft)
   - Read specs/07-incoming-receiving/input-notes.md first — it has the original 
     CIPL/WRR raw capture and the pending_arrival / wrr_advance_notices 
     implications already surfaced in revision-log.md.
   - §5.5/R1a (advance-notice intake, tied to 22's R11) already has content per 
     the "05/07 new additions reviewed" log entry — verify it's consistent with 
     22's finalized version, don't redraft it independently.
   - Complete requirements.md → design.md → tasks.md (spec-writer persona/scope).
   - design.md must cite 01 by name for wrr_advance_notices/pending_arrival 
     schema, and 22 by name for the advance-notice producer side.
   - This spec touches schema and party-scoped access: run both 
     db-migration-verifier and rbac-rls-reviewer personas before Approved.

RULES WHILE DOING THIS
- Never write application code, migrations meant to run, or component code — 
  specs only.
- Every open question you can't resolve from existing steering docs or the 
  revision log: record it as a named blocker in the spec (see 22's R11 
  "flag it BLOCKED, don't invent it" pattern) rather than inventing a resolution.
- Use exact glossary terms from structure.md (party/item/location/lot/flow_type/
  pick_list/acknowledgement_receipt/wrr/cipl/...) — no synonyms.
- Log every non-trivial decision or fix to specs/00-steering/revision-log.md, 
  dated, in the same style as existing entries (what changed, why, what's still 
  open).
- After each spec reaches Approved, update gantt-mapping.md's row for it and 
  CLAUDE.md's "Current status" line — don't leave steering docs stale (this repo 
  has been burned by that exact bug before).
- If AGENTS.md needs a matching edit for anything you change in CLAUDE.md, edit 
  both — AGENTS.md states this explicitly.

OUTPUT
For each of the four specs, report: what was open, what you changed, which 
persona passes you ran and their findings, and final Status. Stop and flag 
explicitly (don't guess) if a persona pass finds something you can't resolve 
without a product-owner decision.