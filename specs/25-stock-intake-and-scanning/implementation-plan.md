# Stock Count & Reconciliation — Implementation Plan

Status: Approved
Date: 2026-10-27

The previous inbound Stock Intake implementation is removed. The corrected feature will be implemented under Master Inventory as Stock Count & Reconciliation.

The first implementation slice is the controlled count session and approval path. It will snapshot canonical inventory, collect physical counts, show variance, support recounts, and post only approved differences as immutable `inventory_reconciliation` transactions. Receiving and Data Migration remain untouched and separate.

Implementation order:

1. Add approved cycle-count schema, RLS, capability seeds, and audit/idempotency constraints.
2. Add server commands with snapshot/version/committed-quantity validation and atomic posting.
3. Add Master Inventory Stock Count tab and mobile/desktop count/review UI.
4. Add unit, real-Postgres, and browser tests for shortage, surplus, zero, stale, duplicate, recount, rejection, concurrency, and retry cases.
5. Verify downstream Stock View, FIFO/FEFO, Pick Lists, reporting, and history use the adjusted canonical balance.

## Sign-off

- Technical Lead: User / System, 2026-10-27
- Product/Operations Lead: User / System, 2026-10-27
