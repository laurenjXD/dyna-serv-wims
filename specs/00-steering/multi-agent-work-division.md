# Work Division — Dyna-Serv WIMS

Status: Active
Effective: 2026-08-09
Supersedes: the three-track sprint amendment document from 2026-08-07/08 (now archived in revision-log.md).

Two active tracks. One human collaborator per track. Read this before touching anything.

---

## Before every session

1. `CLAUDE.md` — binding process rules and the one rule that overrides everything (no code without `Status: Approved`).
2. This file — which track you own, what you may not touch.
3. `specs/00-steering/revision-log.md` — last 10 entries minimum. Do not redo or contradict a settled decision.
4. `specs/00-steering/gantt-mapping.md` — current implementation status per Gantt row. Do not start a blocked item.

---

## Two tracks

### Track 3 — Core Inventory & Infrastructure

**Branch:** `track-3-validation-and-m2`
**Human:** Andj

**Owns:**

- All navigation/shell UX restructuring (receiving tabs, enrollment page, outgoing page, inventory tabs)
- Spec 07 — lot creation gap: wire `commitWrr` to create `lots`, `lot_location_balances`, `inventory_transactions`
- Spec 08 — FIFO/FEFO engine: stock selection logic in the `/inventory` Stock View
- Spec 10 — AR display after dispatch (show AR number + Print on success screen)
- Spec 16 — Reporting & Analytics dashboard (KPI cards, heatmap, analytics)
- Spec 04 — Infrastructure: RLS enforcement, JWT session in Drizzle client
- Spec 22 — Party portal (after spec 04 RLS is stable)
- Spec 15 — AI chatbot (last — depends on all other specs being stable)

**Locked files (do not edit without Track 2 agreement):**

- `specs/00-steering/*` — single writer
- `lib/rbac/*`, `lib/db/schema/*`, `supabase/migrations/*`
- `CLAUDE.md`, `AGENTS.md`

**Sprint order:**

| Phase | Tasks | Status |
|---|---|---|
| **Now** | N1–N5: navigation tabs (receiving, inventory, outgoing, enrollment, registry) | In progress |
| **Next** | C1: lot creation in commitWrr | Pending |
| | C2: FIFO/FEFO engine on Stock View | Pending |
| | C3: AR display after dispatch | Pending |
| | C4: wire MobileQRScanner into receive + execute flows | Pending |
| **After** | B1: Spec 16 reporting dashboard | Pending |
| | A2: Spec 04 RLS + Drizzle JWT session | Pending |
| **Last** | A1: Spec 22 party portal | Pending |
| | A3: Spec 15 AI chatbot | Pending |

---

### Track 2 — Notifications, Billing & Pricing

**Branch:** `main` (directly) or a feature branch merged to main
**Human:** Lauren / second collaborator

**Owns:**

- Spec 14 — Notifications & alerts (reorder-level, low-stock, WRR arrival)
- Spec 12 — VMI billing (nightly CRON, `vmi_cbm_ledger` daily amounts, statement generation)
- Spec 13 — Trading pricing (`trading_price_snapshots`, margin ledger, `/billing-pricing` Trading tab)

**Locked files (do not edit without Track 3 agreement):**

- `specs/00-steering/*`
- `lib/rbac/*`, `lib/db/schema/*`, `supabase/migrations/*`
- `CLAUDE.md`, `AGENTS.md`

**Sprint order:**

| Phase | Tasks | Status |
|---|---|---|
| **Now** | C5: Spec 14 notifications — DB schema, alert engine, email/in-app triggers | Pending |
| **Next** | B2: Spec 12 VMI billing — CRON job, CBM ledger, statement generation | Pending |
| | B3: Spec 13 Trading pricing — price snapshots, margin ledger, billing-pricing page | Pending |

---

## Blocked — no code until PO decisions are recorded

| Spec | What's blocked | What's needed |
|---|---|---|
| **17 — Product Categorization** | All implementation | 8 Section 1 PO decisions: Machines subcategories, Supplies taxonomy, multi-flow join table, hard vs. warning rules, governance roles, name uniqueness scope. Must be recorded in `revision-log.md` before any code. |
| **10 — PDF pipeline** | PDF generation, Storage, signed URLs | Inline vs. Edge/job decision, orphan-artifact reconciliation, Storage bucket ownership |
| **19 — Dispatch scheduling** | All implementation | Reserved/deferred by PO. Number reserved because other specs reference it. |

---

## Shared file protocol

### Files either track may read but only Track 3 may write

`specs/00-steering/*`, `lib/rbac/*`, `lib/db/schema/*`, `supabase/migrations/*`, `CLAUDE.md`, `AGENTS.md`, `.claude/agents/*`

### Cross-track schema changes

If Track 2 needs a new migration or schema change, open a named request in `revision-log.md` under "Pending cross-track requests". Track 3 writes the migration and announces completion in the same log entry.

### Git workflow

```sh
Before starting any session:
  git fetch origin
  git rebase origin/main          # if on a feature branch
  git log origin/main --oneline -5  # check for new main commits

Before committing:
  git status                      # no surprise files
  npx tsc --noEmit && npx vitest run && npm run build
  git add <specific files>        # never git add -A blindly

Merging to main:
  PR from feature branch → main
  Build must be green before merge
  No force-push to main, ever
```

### Commit message convention

```
feat(spec-nn): short description of what and why
fix(spec-nn): short description
test(spec-nn): short description
```

---

## Capability vocabulary (locked — do not invent new capability strings)

All capability strings used in `requirePermission()` calls and RLS policies must exist in `specs/02-rbac-roles/design.md §3.2`. Adding a new capability requires a spec amendment to `02` and a corresponding migration. Both tracks are bound by this.

Current confirmed capability strings relevant to in-progress work:

- `pick_list.generate`, `pick_list.read`, `pick_list.execute`
- `receiving.view`, `receiving.confirm`, `receiving.create`
- `transfer.view`, `transfer.execute`, `transfer.approve`
- `inspection.perform`, `inspection.resolve`
- `parties.read`, `parties.manage`
- `items.read`, `items.manage`
- `locations.read`, `locations.manage`
- `documents.read`
- `reporting.read`, `reporting.financial_read`
- `fifo_override.approve`
- `users.read`
