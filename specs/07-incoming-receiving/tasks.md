# Incoming Receiving — Implementation Plan

Status: Draft

## Implementation gate

No receiving route, WRR form, scan queue, inspection mutation, receipt commit, migration, or ledger query may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent.
- `01-core-data-model` is approved with final WRR, line, inspection, lot, location, and transaction structures.
- `02-rbac-roles` approves the receiving capability/scope/RLS/audit contract.
- `03-offline-mode-and-client-storage` approves the exact Tier 1 scan command; all other receiving mutations remain online-only.
- `04-services-and-infrastructure` approves Auth, Storage, server transaction, idempotency, email, and monitoring boundaries.
- `05-ui-shell-and-navigation` approves the floor/office shell integration.
- `06-party-and-item-enrollment` confirms unknown-item recovery.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Scope and non-negotiable boundaries

- Staging is not active inventory. No available lots or receiving ledger transaction before confirmed receipt commit.
- The inbound ledger is a view of immutable `inventory_transactions`, not a duplicate table.
- Unknown item recovery uses `06`; it is not a hidden receiving-side enrollment implementation.
- Inbound WRR inspection is distinct from transfer inspection in `11`.
- No party/item/category/location master-data ownership is duplicated here.
- No outbound picking, approval queue, acknowledgement receipt, VMI billing, or Trading price finalization is implemented here.
- No `warehouse_id`, `stock_levels`, `SKU`, `bins`, or alternate receipt ledger is introduced.

## Implementation tasks

### 1. Resolve the inbound domain contract

Testing: Documentation/schema review; no implementation tests.

- [ ] Reconcile the raw CIPL/WRR input notes with approved `01-core-data-model` requirements/design.
- [ ] Finalize the WRR status lifecycle and legal transitions, including cancellation and post-start correction behavior.
- [ ] Finalize whether CIPL remains an attached reference plus manually encoded `wrr_items`, or whether structured CIPL parsing is required.
- [ ] Finalize expected-line fields, scan/reconciliation storage, inspection-log fields, discrepancy states, and lot inheritance rules.
- [ ] Define the exact receipt commit invariant: what must be complete before confirmation and what can remain pending for putaway.
- [ ] Define whether non-conformant quantities can be committed to a non-available state or must remain outside the committed receipt.
- [ ] Define party/flow and item activation rules at staging, scanning, and commit time.
- [ ] Record cross-cutting decisions in `specs/00-steering/revision-log.md`.

### 2. Define authorization, audit, and infrastructure contracts

Testing: Authorization contract tests; real-Postgres integration before sign-off.

- [ ] Add receiving capability identifiers to the canonical RBAC catalog and get `02` approval; use capabilities, not role names.
- [ ] Define global operational versus party/flow-scoped access for WRRs, scans, inspections, lots, and incoming ledger rows.
- [ ] Define server-side authorization and RLS behavior for every read/mutation, including attachment access.
- [ ] Define audit events for staging, edits, print, start, scan exceptions, conformance, non-conformance, cancellation, confirmation, and resolution.
- [ ] Define server command idempotency keys, concurrency/locking, transaction boundaries, and safe retry behavior with `04`.
- [ ] Define private Storage paths/signed access for CIPL and inspection evidence.
- [ ] Have `rbac-rls-reviewer` review the access matrix and `db-migration-verifier` plan the real-Postgres checks.

### 3. Implement pre-receiving WRR staging

Testing: Unit validation; Playwright office flows; real-Postgres integration for constraints/RLS.

- [ ] Build WRR create/edit form for CIPL reference, attachment, party, flow, regulatory references, and expected lines.
- [ ] Resolve party/item/category references from authorized server queries; reject stale/inactive/unauthorized references.
- [ ] Validate quantities, UOM, packaging/CBM references, WRR `lot_number`, and required line fields on client and server.
- [ ] Persist staged WRRs and lines without creating lots or receiving ledger transactions.
- [ ] Implement staged-list/detail/search/filter views with capability/scope-safe results.
- [ ] Implement version/stale-edit protection and prevent silent expected-line changes after receiving starts.
- [ ] Generate the approved printable WRR from the server record, including stable reference and physical check-off fields.
- [ ] Test that printing and reopening never imply receipt confirmation.

### 4. Implement floor scan and reconciliation

Testing: Unit matcher tests; Playwright simulated scanner/real IndexedDB; integration tests for server validation.

- [ ] Build the floor receiving route at 375px first using card/list presentation, scanner-ready input, full-width primary action, and solid high-contrast surfaces.
- [ ] Implement start-receiving transition with authorization, current-state validation, and idempotency.
- [ ] Implement barcode-to-item-to-WRR-line matching and accepted/remaining quantity state.
- [ ] Reject wrong WRR, wrong item, unknown item, duplicate, over-quantity, invalid UOM, and unresolved lot-context scans visibly and recoverably.
- [ ] Provide controlled manual-entry recovery using the same server validation path.
- [ ] Route unknown items to online `06` enrollment or explicit exception; require revalidation after enrollment.
- [ ] Define and implement the approved Tier 1 scan command policy with `03`; do not queue confirmation or enrollment.
- [ ] Preserve local scan state honestly through connectivity loss without marking receipt confirmed.

### 5. Implement inbound inspection and discrepancy handling

Testing: Unit state/validation tests; Playwright conformance/non-conformance flows; real-Postgres integration for inspection constraints/RLS.

- [ ] Build inspection/conformance screen tied to WRR and line context.
- [ ] Implement conformance and non-conformance result validation, actor attribution, reason, remarks, evidence, and action fields.
- [ ] Prevent non-conformant stock from becoming available without the approved resolution.
- [ ] Implement private CIPL/evidence attachment flow through the approved Storage boundary.
- [ ] Implement safe exception/attention states and notification/outbox handoff through `04` where required.
- [ ] Ensure inbound inspection states do not reuse or mutate transfer-inspection state from `11`.

### 6. Implement receipt confirmation and putaway handoff

Testing: Unit commit validation; real-Postgres transaction/idempotency/RLS integration; Playwright confirmation/retry flows.

- [ ] Implement one authoritative confirm-receipt server command.
- [ ] Recheck WRR state, scan totals, conformance, active references, flow partition, lot metadata, and required prerequisites inside the transaction.
- [ ] Create approved lots/available state and immutable receiving transactions atomically.
- [ ] Transition WRR to confirmed exactly once and return the authoritative result for duplicate retries.
- [ ] Ensure failed commits roll back completely and remain recoverable.
- [ ] Integrate putaway recommendation/handoff using approved locations/capacity interfaces without duplicating location logic.
- [ ] Record completed putaway through the owning inventory transaction boundary.

### 7. Implement incoming ledger and review

Testing: Unit query/filter tests; real-Postgres RLS/query-plan integration; Playwright review/filter/detail flows.

- [ ] Implement a read-only Incoming Ledger query over `inventory_transactions` for receiving/putaway movements.
- [ ] Add date, party, flow, item/code, WRR/CIPL, and authorized status filters.
- [ ] Display item-first columns and authorized WRR/lot/party/user/location/conformance context.
- [ ] Add safe detail view/modal without exposing out-of-scope records.
- [ ] Verify corrections are represented by new transactions, never updates/deletes.

### 8. Integration, review, and documentation

Testing: Full applicable matrix below.

- [ ] Mount all routes through `05` and document office/floor shell contracts.
- [ ] Document the interface used by `06` for unknown-item recovery and by future putaway/inspection features.
- [ ] Add a negative test proving CIPL staging, item enrollment, confirmation, and putaway confirmation cannot enter the offline queue.
- [ ] Run `offline-sync-reviewer`, `rbac-rls-reviewer`, `db-migration-verifier`, and `design-system-auditor` before sign-off.
- [ ] Update `specs/00-steering/gantt-mapping.md` when this spec changes status.

## Testing matrix

### Unit tests (Vitest)

- [ ] WRR/line validation, status transitions, quantity reconciliation, UOM, and discrepancy rules.
- [ ] Barcode matcher behavior and duplicate/over-quantity/unknown-item rejection.
- [ ] Conformance/non-conformance validation and required evidence/reason rules.
- [ ] Receipt commit precondition and idempotency result handling.
- [ ] Incoming ledger filter/query parameter validation.

### Integration tests

- [ ] Apply the complete migration chain in real Postgres and verify WRR/line/inspection/lot/transaction constraints.
- [ ] Verify staged WRRs create no active lots or receiving transactions.
- [ ] Verify authorized receipt commit atomically creates the approved lots and immutable receiving transactions exactly once.
- [ ] Verify failed commit rolls back and duplicate retries return one authoritative outcome.
- [ ] Verify default-deny RLS and party/flow scope for WRR, inspection, attachment, lot, and ledger access.
- [ ] Verify revoked/deactivated users cannot start, confirm, or replay receiving work.
- [ ] Verify incoming ledger uses transaction records and cannot mutate history.

### E2E tests (Playwright)

- [ ] Create/edit/stage/print a WRR without inventory side effects.
- [ ] Start receiving and simulate scanner keyboard input against expected lines.
- [ ] Verify wrong, duplicate, over-quantity, unknown, and manually recovered scans.
- [ ] Verify unknown item routes to authorized online enrollment/exception and requires rescan/revalidation.
- [ ] Verify inbound conformance and non-conformance flows, evidence, and blocked commit.
- [ ] Confirm receipt, reload/retry, and verify no duplicate outcome.
- [ ] Verify offline scan capture behavior and that confirmation/enrollment remain unavailable offline.
- [ ] Verify Incoming Ledger filters, detail access, mobile/floor and office layouts, focus, contrast, touch targets, and reduced motion.

### Manual QA

- [ ] Verify printed WRR content and physical check-off usability.
- [ ] Verify scan feedback and one-primary-action behavior on representative handheld viewport.
- [ ] Verify private CIPL/evidence links, safe errors, and no protected-data leakage.
- [ ] Physical scanner/dead-zone/fully closed-app backgrounding QA is deferred to the project-wide pre-launch hardware pass unless risk requires earlier validation.

## Sign-off

- [ ] `01-core-data-model` tables/transitions are approved and reconciled.
- [ ] RBAC/RLS review passes.
- [ ] Offline Tier 1 scan boundary and Tier 2 denylist are approved.
- [ ] All applicable tests pass, including real-Postgres verification.
- [ ] Design-system and print/physical workflow reviews pass.
- [ ] Product owner approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
