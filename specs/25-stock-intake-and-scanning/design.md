# Stock Count & Reconciliation — Design

Status: Approved
Updated: 2026-10-27

## 1. Ownership

Stock Count & Reconciliation is initiated from Master Inventory/Stock View. It uses the canonical `lot_location_balances` read model and posts through the existing inventory transaction contract. It does not reuse Data Migration or Receiving tables.

Inspection remains responsible for quality/aging/damage dispositions. A count variance is a quantity-control issue; if the counter finds damage, the line may be routed to the existing Inspection workflow before reconciliation is posted.

## 2. Persistence model

Add feature-owned staging/audit tables:

- `cycle_count_sessions`: count number, scope, status, snapshot timestamp, actors, version, and final reason.
- `cycle_count_lines`: session, item, lot, location, system quantity snapshot, counted quantity, variance, current balance version, and line status.
- `cycle_count_events`: append-only count/recount/scan/exception evidence with actor, raw value, quantity, and timestamp.

These are not a second stock ledger. Only approved posting updates `lot_location_balances` and inserts `inventory_transactions` with `movement_type = 'inventory_reconciliation'`.

## 3. Server commands

1. `createCycleCount` snapshots selected canonical stock rows.
2. `recordCycleCount` records a counted base-unit quantity or accepted scan evidence.
3. `submitCycleCount` validates that every required line is counted and freezes the session.
4. `requestCycleCountRecount` reopens only the affected lines with an audit event.
5. `approveCycleCount` requires supervisor approval and rejects self-approval.
6. `postCycleCount` re-reads and locks each balance, verifies the version and committed quantity, applies the variance atomically, and inserts one idempotent reconciliation transaction per non-zero line.
7. `rejectCycleCount` returns the session for correction without changing inventory.

All mutations use the authenticated RLS transaction wrapper, capability checks, optimistic versions, and an idempotency key.

## 4. UI

The Stock Count tab contains:

- current count sessions and statuses;
- a `Start Count` action with searchable location scope;
- system quantity, physical quantity input/scan, variance, committed quantity, and exception state;
- recount and explanation controls;
- supervisor review with before/after preview;
- a final `Post Reconciliation` action that is disabled until all validations pass.

The page must never show an editable system quantity field. It is a snapshot supplied by the server.

## 5. Authorization

The feature requires explicit RBAC capabilities `cycle_count.view`, `cycle_count.create`, `cycle_count.count`, `cycle_count.review`, and `cycle_count.post`. Warehouse Staff receive view/create/count; Supervisor receives view/review/post; Administrator receives oversight/recovery; Party User receives none. The RBAC catalog and RLS policies must be added in the same approved feature migration.

## 6. Verification

Unit tests cover variance math, zero counts, duplicate scans, committed quantities, and stale versions. Real-Postgres tests cover RLS, role boundaries, self-approval, concurrent posting, rollback, idempotency, and canonical balance/transaction results. Browser tests cover mobile counting, desktop review, recount, rejection, and post confirmation.

## Sign-off

- Technical Lead: User / System, 2026-10-27
- Product/Operations Lead: User / System, 2026-10-27
