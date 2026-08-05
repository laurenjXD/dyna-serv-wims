# Transfer & Inspection — Implementation Plan

Status: Draft

## Implementation gate

No transfer tables, routes, approval adapter, inspection mutation, scan flow, inventory transaction, or migration may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent.
- `01-core-data-model` approves the transfer transaction fields, location/lot update invariants, and ownership of transfer request/inspection persistence.
- `02-rbac-roles` approves transfer capabilities, party/flow scope, RLS, audit, and approval authority.
- `03-offline-mode-and-client-storage` approves the exact physical scan observation command; final completion remains online-only.
- `04-services-and-infrastructure` approves Auth, Storage, idempotency, Realtime, notifications, monitoring, and runtime boundaries.
- `05-ui-shell-and-navigation` approves office/floor route integration.
- `09-approval-queue` approves the transfer approval policy and exact target/version consumption.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Non-negotiable boundaries

- Transfer means movement between `locations` in one warehouse; no `warehouse_id` or second-warehouse model.
- Inbound WRR inspection remains in `07`; transfer inspection is separate.
- Approval is a durable `09` decision, not a client flag.
- Final completion writes one immutable `inventory_transaction` with `movement_type = 'transfer'` and source/destination locations.
- Offline observations cannot approve, complete, reverse, or directly update inventory.
- No duplicate transaction ledger, `SKU`, `bins`, or alternate location model.

## Implementation tasks

### 1. Resolve transfer scope and domain contract

Testing: Documentation/domain review; no implementation tests.

- [ ] Confirm internal location-to-location scope and explicitly exclude inter-warehouse transfer.
- [ ] Define which transfer types require approval and which, if any, may use an approved routine-transfer shortcut.
- [ ] Finalize lifecycle states/transitions, cancellation/expiry, partial movement, shortage, damage, failed inspection, and reversal behavior.
- [ ] Decide whether source quantity is reserved/held during execution and how that state is represented without duplicating inventory truth.
- [ ] Define transfer line, scan evidence, inspection, and executed-quantity fields.
- [ ] Define whether transfer inspection is mandatory by item/flow/location and its reason/evidence vocabulary.
- [ ] Record cross-cutting decisions in `specs/00-steering/revision-log.md`.

### 2. Define persistence, authorization, and audit

Testing: Schema review; real-Postgres/RLS test planning.

- [ ] Define `transfer_requests`, `transfer_items`, `transfer_inspections`, or approved equivalent with version/idempotency/correlation fields.
- [ ] Define foreign keys to canonical `parties`, `items`, `locations`, and `lots` without copying master records.
- [ ] Define indexes for status, source/destination, item/lot, party/flow, requester, approval reference, and age.
- [ ] Add transfer capability identifiers to the `02` catalog and define request/review/inspect/execute/reverse scope.
- [ ] Define default-deny RLS for transfer and inspection records and source/party/flow inherited access.
- [ ] Define append-only audit/security events for request, approval link, inspection, execution, completion, cancellation, failure, and reversal.
- [ ] Have `rbac-rls-reviewer` and `db-migration-verifier` review the model.

### 3. Implement request and approval integration

Testing: Unit request/policy tests; real-Postgres transition/RLS integration; Playwright office flows.

- [ ] Build office transfer request form with source/destination, item/lot, quantity/UOM, flow, reason, priority, and inspection requirement.
- [ ] Validate active locations, distinct source/destination, item/lot identity, source availability, capacity, and party/flow scope on client and server.
- [ ] Implement versioned draft/pending request state without inventory mutation.
- [ ] Submit approval-required requests to `09` with exact target/version/reason context.
- [ ] Consume only a current exact approval and block rejected/expired/revoked/mismatched decisions.
- [ ] Implement cancellation/expiry/supersession paths with concurrency protection.

### 4. Implement transfer inspection

Testing: Unit inspection state/validation tests; real-Postgres constraints/RLS integration; Playwright floor/office inspection flows.

- [ ] Build transfer-specific inspection surface tied to transfer/item/lot context.
- [ ] Implement conformance/non-conformance result, reason, remarks, evidence, actor, timestamp, and resolution validation.
- [ ] Store evidence using private Storage and source-record authorization.
- [ ] Block execution/completion for unresolved non-conformance.
- [ ] Ensure transfer inspection never writes or changes inbound `wrr_inspection_logs`/WRR state.
- [ ] Add notification/attention handoff through approved `04`/`14` interfaces without making notification authoritative.

### 5. Implement floor scan and authoritative transfer commit

Testing: Unit scan/commit tests; Playwright simulated scanner/real IndexedDB; real-Postgres transaction/idempotency/RLS integration.

- [ ] Build floor execution/inspection at 375px first with source scan, destination scan, one task per screen, full-width primary action, and solid high-contrast surfaces.
- [ ] Match source scans against expected item/barcode/lot/location/quantity.
- [ ] Match destination scans against approved destination/item/lot context.
- [ ] Reject wrong, duplicate, over-quantity, stale, insufficient-source, and invalid-destination scans recoverably.
- [ ] Define and implement the approved physical-observation Tier 1 policy with `03`.
- [ ] Implement final online completion command with current Auth/capability/scope, approval, inspection, quantity, capacity, scan, version, and idempotency checks.
- [ ] Atomically update approved lot/location state, insert one immutable `transfer` transaction, and complete the request.
- [ ] Ensure duplicate/lost-response completion returns one result and never moves stock twice.
- [ ] Implement explicit failure/reversal path; never edit/delete the original transaction.

### 6. Implement transfer history and review

Testing: Unit query/filter tests; real-Postgres RLS/query-plan integration; Playwright detail/history flows.

- [ ] Build scoped request/detail/history views with status, source/destination, item/lot, flow, approval, inspection, scan, and ledger references.
- [ ] Add filters for date/status/source/destination/item/lot/flow/requester/approval where authorized.
- [ ] Keep completed transaction history read-only and expose safe correction/reversal references.
- [ ] Ensure item/party/location data is rendered through approved shell/list/detail patterns from `05`.

### 7. Integrate offline, Realtime, and downstream reporting

Testing: Unit policy tests; Playwright reconnect/fallback; integration replay authorization/idempotency.

- [ ] Ensure request creation, approval, inspection resolution, completion, and reversal cannot enter the offline queue.
- [ ] Replay only approved source/destination scan observations with current authorization/state/approval/inspection checks.
- [ ] Add scoped Realtime invalidation and polling/manual-refresh fallback.
- [ ] Expose immutable transfer transaction references to `16` reporting without creating a duplicate ledger.
- [ ] Add contract tests proving `07`, `08`, and `09` boundaries are not duplicated or bypassed.

### 8. Review and sign-off preparation

Testing: Full matrix below.

- [ ] Run `offline-sync-reviewer`, `rbac-rls-reviewer`, `design-system-auditor`, and `db-migration-verifier`.
- [ ] Verify no cross-warehouse, client-authority, inbound-WRR, or alternate-ledger behavior exists.
- [ ] Update `specs/00-steering/gantt-mapping.md` when the spec changes status.

## Testing matrix

### Unit tests (Vitest)

- [ ] Transfer input/state/transition validation and approval policy adapter.
- [ ] Source/destination/location/lot/flow/quantity validation.
- [ ] Scan matcher and duplicate/over/stale/invalid-location rejection.
- [ ] Inspection conformance/non-conformance/reason/evidence rules.
- [ ] Commit preconditions, idempotency, rollback, reversal, and safe status presentation.

### Integration tests

- [ ] Apply migrations in real Postgres and verify transfer/inspection constraints, foreign keys, indexes, and immutable transaction references.
- [ ] Verify RLS for requester, reviewer, inspector, operator, party user, unrelated party, and revoked user.
- [ ] Verify approval is exact to transfer target/version and cannot authorize a different movement.
- [ ] Verify concurrent completion cannot move the same quantity twice.
- [ ] Verify failed completion rolls back and reversal creates a new transaction.
- [ ] Verify evidence access is private and scope-bound.

### E2E tests (Playwright)

- [ ] Create a transfer request and route approval-required requests to `09`.
- [ ] Approve/reject and verify exact transfer consumption behavior.
- [ ] Execute source/destination scans and verify mismatch feedback.
- [ ] Complete a conformant transfer and verify transaction/history state.
- [ ] Verify failed inspection blocks completion and resolution unblocks only when authorized.
- [ ] Verify offline scan observation, reconnect replay, rejection/conflict, and online-only completion.
- [ ] Verify office mobile/desktop and floor 375/430px layouts, focus, contrast, touch targets, no-hover feedback, and reduced motion.

### Manual QA

- [ ] Verify physical source/destination scan workflow and location labels on representative warehouse hardware during pre-launch QA.
- [ ] Verify inspection evidence capture, reason clarity, and exception/reversal instructions.
- [ ] Verify no party/flow/location data leaks through queue, history, notifications, or errors.

## Sign-off

- [ ] Transfer scope/state/persistence and location/lot invariants are approved.
- [ ] Approval integration with `09` and RBAC/RLS review pass.
- [ ] Inbound inspection separation from `07` is verified.
- [ ] Offline Tier 1 scan policy and Tier 2 denylist are approved.
- [ ] All applicable tests pass, including real-Postgres verification.
- [ ] Design-system and physical workflow review pass.
- [ ] Product owner approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
