# AGENTS.md — Dyna-Serv WIMS

**Canonical source is `CLAUDE.md` at this repo's root.** This file exists for agentic tools that read the `AGENTS.md` convention instead of Claude Code's `CLAUDE.md`. If you're Claude Code, read `CLAUDE.md` — it's the maintained version. If you're a different agent, everything below is a mirror; check `CLAUDE.md` and `specs/00-steering/revision-log.md` for anything more recent than what's written here, since this copy can lag.

**If more than one agent is working this repo at once — read `specs/00-steering/multi-agent-work-division.md` before touching anything.** It assigns which specs/files belong to which agent, locks the shared foundational files to a single writer at a time, and sets the git branch/merge protocol. Working outside your assigned track or editing a locked file directly is exactly the failure mode that document exists to prevent.

## The one rule that overrides everything else

No implementation code is written until a feature's `specs/NN-*/tasks.md` has `Status: Approved` with both required sign-offs. Writing spec docs (requirements/design/tasks) is always fine. Writing application code against an unapproved spec is not — stop and say so instead.

## Non-negotiable decisions

- One warehouse, no `warehouse_id`.
- `parties` / `items` / `locations` naming — never `suppliers` / `SKU` / `bins`.
- `pick_list` + `acknowledgement_receipt`, both priced. No `withdrawal_slip`. Trading price on a document is final; VMI price on a document is a per-release reference only.
- Mobile-first, floor-priority design — see `specs/00-steering/brand-design-system.md`.
- Approval applies to `requirements.md`, `design.md`, and `tasks.md` together. `01-core-data-model`, `02-rbac-roles`, `11-transfer-and-inspection`, and `16-reporting-and-analytics` are Approved after the 2026-08-06 Master Inventory/inspection amendment; Product Owner decisions resolved the Daily Inspection initiation surface (Master Inventory dashboard), financial access (`reporting.financial_read` for Supervisor and Administrator), and `lot_history_export` operating contract (daily refresh, three-year retention, generation/serving owned by `16`, canonical model owned by `01`). `05-ui-shell-and-navigation`, `07-incoming-receiving`, and `08-outgoing-withdrawal-and-two-stage-commitment` remain Approved after documentation review. Other previously approved specs remain unchanged. The cross-cutting `audit_log` and shared list-interaction amendment is verified at the design level, with audit-log retention resolved at three years. Broader business/provider-log retention remains the named `04 §23.8` decision. `19-dispatch-scheduling-and-delivery-tracking` is explicitly deferred.

## Where everything actually lives

- Business/tech/design/testing context: `specs/00-steering/`
- Feature specs: `specs/NN-feature-name/{requirements,design,tasks}.md`
- Delivery tracking against the project Gantt: `specs/00-steering/gantt-mapping.md`
- Full decision history: `specs/00-steering/revision-log.md`
