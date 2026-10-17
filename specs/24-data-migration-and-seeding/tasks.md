# One-Time Data Migration and Simulation Seeding - Tasks

Status: Approved

No migration schema, importer, route, server action, or application code may be
implemented until `requirements.md`, `design.md`, and this file are Approved
with both sign-offs. This feature is intentionally a one-time migration and
simulation-seeding capability, not a live legacy synchronization service.

## Confirmed Initial Decisions

- [x] Organization is UBoT Incorporated Limited.
- [x] Inventory model is VMI/vendor-owned inventory.
- [x] Opening date is `2026-10-09`.
- [x] `Location Matrix` is authoritative for opening inventory.
- [x] `Inventory` is reconciliation-only; `CODES` supplies item enrollment.
- [x] `RCV` is a temporary receiving/holding location.
- [x] Incomplete or unmatched records go to a review queue before commit.
- [x] `Rates` is included for billing simulation.
- [x] Historical movement and billing ledgers are reference-only initially.
- [x] End-customers remain linked to stock where applicable and are excluded
      from billing.
- [x] Initial migration uses current-state opening stock rather than a full
      historical replay.

## Sign-off

- Technical Lead: User / System, 2026-10-17
- Product/Operations Lead: User / System, 2026-10-17

## Task Group A - Contract and fixture

- [x] Confirm the canonical opening-balance date for the supplied workbook.
- [x] Confirm the organization and inventory model represented by the workbook.
- [x] Confirm `Location Matrix` as the UBoT opening-stock authority and
      `Inventory` as its reconciliation source.
- [ ] Preserve the supplied workbook as a versioned, test-only fixture without
      modifying the original file.
- [x] Record decisions for unknown owners, missing lot fields, `RCV` location
      semantics, and item-code scientific notation.

## Task Group B - Staging and batch model

- [ ] Define and review migration batch, source file, source row, match, and
      exception tables against `01`, `02`, and `04`.
- [ ] Define batch states, import-phase boundaries, idempotency keys, and
      rollback behavior.
- [ ] Define source-file retention, audit references, and administrator access.
- [ ] Have `db-migration-verifier` review the staging and canonical-write plan.
- [ ] Have `rbac-rls-reviewer` review upload, review, approve, commit, and
      override access.

## Task Group C - UBoT adapter

- [ ] Implement `ubot-vmi-v1` workbook discovery and sheet/header detection.
- [ ] Implement source mappings for `Customers`, `CODES`, `Racking ID`,
      `RACKING`, `Location Matrix`, `Inventory`, and `Rates`.
- [ ] Mark `IN`, `OUT`, `Transactions`, `SOA Details`, `CBM Ledger`, and
      `Storage Ledger` as reference or separately approved historical sources.
- [ ] Preserve raw item codes and reject unsafe scientific-notation conversion.
- [ ] Normalize source dates, numeric quantities, whitespace, and blank values.

## Task Group D - Validation and reconciliation

- [ ] Implement required-field, reference-match, duplicate, quantity, box, CBM,
      location, and date validation.
- [ ] Implement an actionable exception/review queue with source coordinates.
- [ ] Implement the dry-run preview and reconciliation report.
- [ ] Verify totals by item, lot, location, owner party, and inventory model.
- [ ] Block commit on unresolved blocking exceptions unless an authorized
      override is recorded.

## Task Group E - Canonical commit

- [ ] Implement master-data commit in dependency order: parties, items,
      locations, lots, and opening balances.
- [ ] Implement the approved opening-balance event/transaction boundary without
      inventing receiving, withdrawal, or carton records.
- [ ] Implement optional rates/contracts only after confirming the owning `12` or
      `13` contract model.
- [ ] Ensure the commit is idempotent and atomic per approved phase.
- [ ] Link every canonical result to its migration batch and source row.

## Task Group F - Verification and simulation handoff

- [ ] Run fixture dry-run tests against the supplied workbook.
- [ ] Run malformed-workbook tests covering missing sheets, duplicate rows,
      invalid codes, unmatched references, and quantity discrepancies.
- [ ] Run real-Postgres tests for constraints, rollback, idempotency, and total
      reconciliation.
- [ ] Run Playwright coverage for upload, preview, review, approval, commit, and
      post-import inventory verification.
- [ ] Verify that subsequent simulated receiving, transfer, inspection,
      withdrawal, pick-list, acknowledgement, and billing workflows use normal
      WIMS commands rather than the migration staging data.
- [ ] Produce a migration runbook for future organization workbooks.

## Completion criteria

- [ ] The supplied workbook seeds a clean simulation database through the
      `ubot-vmi-v1` profile.
- [ ] The committed opening inventory reconciles to the approved workbook
      snapshot.
- [ ] A repeated import cannot duplicate canonical stock.
- [ ] Blocking errors are visible and explain how they must be resolved.
- [ ] Required reviewer and verifier checks pass.
