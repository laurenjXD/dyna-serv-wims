# Stock Count & Reconciliation — Requirements

Status: Approved
Updated: 2026-10-27

## 1. Purpose

Stock Count & Reconciliation verifies physical warehouse stock against the system's current inventory and records approved variances. It covers cycle counts, scheduled stocktakes, recounts, shortages, surpluses, unmatched stock, and count adjustments.

It is not inbound Receiving and not Data Migration. Receiving handles arriving WRR/CIPL shipments. Data Migration handles opening/legacy stock imports.

## 2. Workflow

`create count → snapshot system stock → count/scan physical stock → review variance → recount or explain → supervisor approval → post reconciliation → audit/history`

1. A count session is scoped to one or more active locations and captures a system snapshot before counting starts.
2. Count lines are based on canonical `lot_location_balances`, item, lot, location, and committed quantity data.
3. A counter enters or scans the physical quantity. The system calculates `variance = physical_qty - system_qty`.
4. Zero is a valid physical count and must not be confused with an uncounted line.
5. Unmatched physical stock may be recorded as an exception, but it cannot be posted without item, lot, location, owner, and Inventory Model resolution.
6. A recount may replace an unsubmitted count while retaining the prior value and actor history.
7. A supervisor reviews every non-zero variance and approves or rejects the session. The counter cannot approve their own session.
8. Posting updates the canonical location balance and writes an immutable `inventory_reconciliation` transaction. Direct quantity edits are prohibited.

## 3. UI and placement

1. The feature is a `Stock Count` tab inside Master Inventory, alongside Stock View, Pick Lists, and Inspection.
2. The page is office-and-floor responsive: supervisors can create/review sessions on desktop; warehouse staff can count with large mobile controls.
3. Locations are selected manually/searchably. A destination/location QR is not required.
4. The page must not contain migration upload controls, WRR/CIPL fields, inbound receiving controls, or duplicate stock-owner selectors.

## 4. Quantity and adjustment rules

1. System quantity is the available quantity at the snapshot location/lot; committed quantity remains protected.
2. A negative variance cannot reduce a balance below its committed quantity.
3. A positive variance requires an existing resolved item/lot/location context and an explanation.
4. Count quantities are integer base units and must be compatible with the enrolled UOM/SPQ policy; partial cartons may be counted only when the item packaging policy allows piece-level counts.
5. Posting is idempotent. A retry cannot create a second adjustment.
6. The count snapshot is not a new inventory ledger and does not change stock until approved posting.

## 5. Roles and edge cases

1. Warehouse Staff may view assigned count work and record counts.
2. Supervisors may review, request recount, approve, reject, and post; self-approval is prohibited.
3. Administrators have oversight and controlled recovery access.
4. Party Users cannot perform warehouse counts.
5. Location becomes inactive after snapshot: posting blocks and requires reassignment/recount.
6. Stock moves after snapshot: posting rechecks the current balance/version and blocks stale lines for recount.
7. Physical quantity is less than committed quantity: posting blocks and requires reservation/dispatch resolution.
8. Duplicate scan: idempotently ignored and shown to the counter.
9. Unmatched scan: held as an exception; never auto-created as stock.
10. Damaged/quarantined stock: remains in the appropriate status/location and is not silently made available.
11. Session abandoned: remains resumable or may be cancelled with an audit reason; no stock mutation occurs.

## 6. Acceptance criteria

- A count compares a server snapshot with a physical count and clearly displays the variance.
- Zero counts, shortages, surpluses, recounts, stale snapshots, and committed reservations have visible resolutions.
- Only approved posting changes canonical inventory.
- Every adjustment records the session, reason, actor, before/after quantity, and immutable transaction.
- Stock View, FIFO/FEFO, Pick Lists, reports, and history read the resulting canonical balance.
- Migration and Receiving remain separate and are not duplicated.

## Sign-off

- Technical Lead: User / System, 2026-10-27
- Product/Operations Lead: User / System, 2026-10-27
