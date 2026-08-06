# AGENTS.md — Dyna-Serv WIMS

**Canonical source is `CLAUDE.md` at this repo's root.** This file exists for agentic tools that read the `AGENTS.md` convention instead of Claude Code's `CLAUDE.md`. If you're Claude Code, read `CLAUDE.md` — it's the maintained version. If you're a different agent, everything below is a mirror; check `CLAUDE.md` and `specs/00-steering/revision-log.md` for anything more recent than what's written here, since this copy can lag.

## The one rule that overrides everything else

No implementation code is written until a feature's `specs/NN-*/tasks.md` has `Status: Approved` with both required sign-offs. Writing spec docs (requirements/design/tasks) is always fine. Writing application code against an unapproved spec is not — stop and say so instead.

## Non-negotiable decisions

- One warehouse, no `warehouse_id`.
- `parties` / `items` / `locations` naming — never `suppliers` / `SKU` / `bins`.
- `pick_list` + `acknowledgement_receipt`, both priced. No `withdrawal_slip`. Trading price on a document is final; VMI price on a document is a per-release reference only.
- Mobile-first, floor-priority design — see `specs/00-steering/brand-design-system.md`.
- Approval applies to `requirements.md`, `design.md`, and `tasks.md` together. `05-ui-shell-and-navigation` is currently Under Revision; Draft specs are `07-incoming-receiving`, `18-barcode-integration`, and `22-parties-portal`; `19-dispatch-scheduling-and-delivery-tracking` is explicitly deferred.

## Where everything actually lives

- Business/tech/design/testing context: `specs/00-steering/`
- Feature specs: `specs/NN-feature-name/{requirements,design,tasks}.md`
- Delivery tracking against the project Gantt: `specs/00-steering/gantt-mapping.md`
- Full decision history: `specs/00-steering/revision-log.md`
