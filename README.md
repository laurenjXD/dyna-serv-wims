# Spec-Driven Development Kickoff — Dyna-Serv

Use this document to set up and run spec-driven development for the rest of this project. It is itself the prompt: hand it to whichever agent or session is doing the spec work, in order, one feature at a time.

---

## 0. Ground rules

1. **No implementation code is written until a feature's `tasks.md` is explicitly approved by the product owner.** Requirements → Design → Tasks → (approval) → Code. Never skip ahead.
2. **Source of truth precedence, highest first:**
   1. Explicit decisions made in this kickoff doc and its steering docs (`/specs/00-steering/`)
   2. The merged system design (see §1 below — this itself is subject to the major revisions noted in §2)
   3. Nothing else. If a coding agent's own judgment would fill a gap, it must stop and ask instead of guessing, per the ground rule below.
3. **Every spec doc carries a status header**: `Draft | Under Revision | Approved`. Nothing marked `Approved` is edited in place — a revision creates a new dated section in that doc's changelog and flips status back to `Under Revision` until re-approved.
4. **When a requirement is ambiguous or contradicts an earlier decision, stop and ask — do not silently pick an interpretation.** This project has already had several real merge conflicts (warehouse count, naming, document model) resolved by explicit choice, not inference. Assume more exist.
5. **Each feature spec is self-contained but must explicitly cross-reference the foundational specs it depends on** (e.g., every vertical feature's `design.md` must cite which Core Data Model tables it touches, by name).

---

## 1. Current merged system design (source material)

The base document is the uploaded `system_design.md`, **merged** with prior decisions as follows — these three overrides are final, not open for re-litigation during spec-writing:

| Area | Decision |
|---|---|
| Warehouses | **One** warehouse. No `warehouse_id` anywhere in the schema. |
| Naming | **`parties` / `items` / `locations`** — not `suppliers` / `SKU` / `bins`. |
| Withdrawal documents | **`pick_list` + `acknowledgement_receipt`**, both priced (Trading = final price, VMI = per-release reference only). No `withdrawal_slip`, no `awaiting_pricing` status. |

Everything else in the uploaded doc — the two-stage inventory commitment model, the five-role RBAC matrix, the offline-mode spec, the client storage strategy, the UI shell patterns, and the services/infrastructure layer (caching, jobs, email, realtime, storage, rate limiting, monitoring) — carries forward as-is into the merge, alongside the VMI/Trading dual-flow architecture, the `parties`/`party_transaction_roles` model, and the pricing-everywhere decision from earlier work.

## 2. Current approval and deferral status

Approval applies to all three documents in a feature folder: `requirements.md`, `design.md`, and `tasks.md`. `05-ui-shell-and-navigation`, `07-incoming-receiving`, `18-barcode-integration`, and `22-parties-portal` are Approved across all three documents; implementation work remains subject to their documented runtime/dependency gates. Spec `19-dispatch-scheduling-and-delivery-tracking` is deferred and has a reserved number; it must not be implemented or treated as an active dependency.

- **07-incoming-receiving** — receiving workflow is Approved; runtime workflow tests remain implementation work
- **18-barcode-integration** — barcode contract is Approved; runtime scanner tests remain implementation work
- **22-parties-portal** — portal scope is Approved; downstream runtime work remains dependency-gated

Everything else currently in scope is Approved across all three documents, except Under Revision `05` and deferred `19`.

## 2a. Approval process

Two sign-offs required per `tasks.md` before any code: the product owner (you), plus a second approver to be looped in per-spec. Each `tasks.md` template includes an explicit two-signature block — name/role for the second approver can be filled in when relevant rather than blocking spec-writing now.

## 2b. Catalog status

The 16-spec list in §4 is a **first draft**, not fixed — expect splitting or merging once requirements-writing surfaces a feature that's bigger or smaller than scoped. Folder numbers can be reassigned as this happens; nothing downstream should hardcode "spec 09" as a permanent identifier, only the folder name.

## 2c. Repo shape — single Next.js app (not a monorepo)

Monorepo tooling (Turborepo/pnpm workspaces) earns its cost when there are multiple *independently deployed* apps. Right now this is one deployable on Vercel with internal feature-organized folders under `/app`, `/components`, `/lib`. If a separately-shipped app emerges later (e.g. a standalone party/vendor portal), splitting out is a mechanical refactor at that point, not a reason to add monorepo overhead now.

## 3. Tech stack (Option A — locked)

Next.js 15 (App Router) + Supabase (Postgres, Auth, Realtime, Storage) + Vercel, per the system design's §1.2.1. Every design.md must specify implementation in terms of this stack specifically — no proposing alternate stacks mid-spec.

---

## 4. Folder structure

```
/CLAUDE.md                 # Claude Code project memory - read automatically every session
/AGENTS.md                  # cross-tool mirror of CLAUDE.md's critical rules
/.claude
  /agents                   # spec-writer, db-migration-verifier, rbac-rls-reviewer,
                             # design-system-auditor, offline-sync-reviewer, test-writer
/specs
  /00-steering
    product.md              # business context: VMI vs Trading, who the users are, why this exists
    tech.md                 # Option A stack decisions, cross-cutting architecture principles (§1.1)
    structure.md            # naming conventions, glossary (parties/items/locations), file conventions
    ui-ux-design-plan.md   # colors, typography, motif, mobile-first floor priority, Figma file status
    testing.md               # tooling, test-stage requirements, floor/hardware simulation strategy
    gantt-mapping.md         # traceability: Gantt line items <-> specs, tracking layer above specs
    revision-log.md         # dated log of every merge conflict / major revision, and how it was resolved

  /01-core-data-model
  /02-rbac-roles
  /03-offline-mode-and-client-storage
  /04-services-and-infrastructure
  /05-ui-shell-and-navigation
  /06-party-and-item-enrollment
  /07-incoming-receiving
  /08-outgoing-withdrawal-and-two-stage-commitment
  /09-approval-queue
  /10-pick-list-and-acknowledgement-receipt
  /11-transfer-and-inspection
  /12-vmi-billing
  /13-trading-orders-and-pricing
  /14-notifications-and-alerts
  /15-ai-chatbot
  /16-reporting-and-analytics
  /17-product-categorization-and-classification
  /18-barcode-integration
  /19-dispatch-scheduling-and-delivery-tracking  # reserved; deferred
  /20-documentation-training-and-uat
  /21-user-profile-and-settings
  /22-parties-portal
    requirements.md
    design.md
    tasks.md

/app                         # Next.js 15 App Router — not touched until tasks.md is approved
  /(auth)
  /(dashboard)
  /api
/components
  /ui
  /global
  /[feature-scoped folders, created only once that feature's tasks.md is approved]
/lib
  /supabase
  /offline
  /fifo
  /rbac
/supabase
  /migrations
```

Each active feature spec contains `requirements.md`, `design.md`, and `tasks.md`. Deferred `19` contains only its deferral marker until reactivated. No code folders under `/specs` — that directory is documentation only.

## 5. Doc templates

### `requirements.md` template
```markdown
# [Feature Name] — Requirements
Status: Draft | Under Revision | Approved
Depends on: [list of other spec folders this one assumes are already approved]

## 1. Overview
What this feature is, in 2-3 sentences, and which user role(s) it serves.

## 2. User Stories
Each in EARS-adjacent form:
- WHEN [trigger/condition], THE SYSTEM SHALL [behavior], SO THAT [reason].

## 3. Acceptance Criteria
Numbered, testable, one per line. No implementation detail — behavior only.

## 4. Out of Scope
Explicit list of what this feature does NOT cover (prevents scope creep into adjacent specs).

## 5. Open Questions
Anything the requirements author couldn't resolve alone.
```

### `design.md` template
```markdown
# [Feature Name] — Design
Status: Draft | Under Revision | Approved
Depends on: [spec folders]

## 1. Data Model
Exact tables/columns touched or introduced — cross-reference Core Data Model by name, don't redefine.

## 2. Architecture
Component/route/API structure, in terms of the Option A stack specifically.

## 3. Flows
Sequence of what happens, step by step, including error paths.

## 4. RBAC / Access Control
Which roles can do what here, referencing the RBAC spec.

## 5. Offline Behavior
Tier 1 (safe to queue) or Tier 2 (online-only) — explicit, per action in this feature.

## 6. Error Handling & Edge Cases
```

### `tasks.md` template
```markdown
# [Feature Name] — Tasks
Status: Draft | Under Revision | Approved

- [ ] Task, mapped to specific requirement/design section numbers
- [ ] ...

Each task should be small enough to implement and verify independently.

## Testing (per `00-steering/testing.md` — mark which apply, not every task needs every layer)
- [ ] Unit tests (Vitest) — isolated logic
- [ ] Integration tests against real Postgres — anything touching RLS, SQL functions, or migrations
- [ ] E2E tests (Playwright) — user-facing flows, hardware simulated per testing.md
- [ ] Manual QA — only if explicitly flagged as needed for this feature

## Sign-off (required before any code is considered done)
- [ ] All applicable testing layers above pass
- [ ] Product owner approval — name, date
- [ ] Second approver — name/role, date
```

---

## 6. Execution order

1. Write and get approval on all five **foundational** specs (01–05) before starting any vertical feature — every vertical feature's design.md will need to cite them.
2. Within foundationals, start with **01-core-data-model**, since 02–05 all reference its entities.
3. Vertical features (06–16) can proceed in parallel once foundationals are approved, but **08 (Withdrawal) should precede 09 (Approval) and 10 (Documents)**, since those depend on its two-stage commitment model.

---

## 7. Kickoff decisions — resolved

| Question | Decision |
|---|---|
| Revision-risk areas | RBAC, Offline Mode, VMI Billing, Trading Pricing — see §2 |
| Approval | Two sign-offs per `tasks.md`: product owner + a second approver, looped in per-spec |
| Catalog status | First draft — expect splitting/merging as requirements-writing surfaces real feature boundaries |
| Repo shape | Single Next.js app, not a monorepo — see §2c for the trigger condition that would change this |

**Next step: drafting `01-core-data-model/requirements.md`**, since it's not in the revision-risk list and everything else depends on it.
