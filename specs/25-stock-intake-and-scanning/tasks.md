# Stock Count & Reconciliation — Tasks

Status: Approved
Updated: 2026-10-27

## A. Correction and contracts

- [x] Replace the incorrect inbound Stock Intake definition with physical Stock Count & Reconciliation.
- [x] Keep Receiving as the inbound WRR/CIPL workflow.
- [x] Keep Data Migration as the opening/legacy-stock workflow.
- [x] Define snapshot, count, variance, recount, approval, and atomic posting rules.
- [x] Record role and edge-case resolutions.

## B. Data, RBAC, and server

- [ ] Add cycle-count staging/event tables and RLS policies.
- [ ] Add the approved cycle-count capability catalog and default role grants.
- [ ] Implement create, count, submit, recount, approve, reject, and post commands.
- [ ] Revalidate balance versions, committed quantity, location status, and idempotency during post.
- [ ] Write immutable reconciliation transactions and audit events.

## C. UI

- [ ] Add Stock Count tab to Master Inventory.
- [ ] Build mobile count entry/scanning and desktop review surfaces.
- [ ] Display immutable system snapshot, counted quantity, variance, and exception state.
- [ ] Add supervisor review and post confirmation; no direct system-quantity editing.

## D. Verification

- [ ] Add unit tests for variance and edge-case rules.
- [ ] Add real-Postgres RLS/concurrency/idempotency tests.
- [ ] Add browser tests for mobile counting and desktop approval.
- [ ] Verify Stock View, FIFO/FEFO, Pick Lists, reports, and history after posting.

## Sign-off

- Technical Lead: User / System, 2026-10-27
- Product/Operations Lead: User / System, 2026-10-27
