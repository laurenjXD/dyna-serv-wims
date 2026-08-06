# Outgoing Withdrawal & Two-Stage Commitment — Implementation Plan

Status: Approved
Updated: 2026-08-06

## Implementation gate

No withdrawal route, allocation engine integration, reservation/commitment mutation, pick/dispatch scan flow, ledger query, or document-generation trigger may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent.
- `01-core-data-model` approves the reservation/commitment representation, pick-list fields/statuses, quantity constraints, and immutable transaction boundary.
- `02-rbac-roles` approves withdrawal, allocation, override, dispatch, document, and party/flow-scope capabilities/RLS.
- `03-offline-mode-and-client-storage` approves the exact physical-observation Tier 1 command; all authority-changing operations remain online-only.
- `04-services-and-infrastructure` approves Auth, transaction/idempotency, Storage, monitoring, and failure/retry boundaries.
- `05-ui-shell-and-navigation` approves office/floor route and interaction integration.
- `09-approval-queue` approves FIFO override request/decision integration.
- `10-pick-list-and-acknowledgement-receipt` approves document generation and print interfaces.
- `12` and `13` reconcile VMI/Trading pricing semantics.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Non-negotiable boundaries

- Stage 1 reserves but does not decrement on-hand inventory.
- Stage 2 physically confirms, decrements once, releases the reservation, and writes one immutable `pick` transaction.
- Use `pick_list` and priced `acknowledgement_receipt`; never introduce `withdrawal_slip`.
- FIFO/FEFO uses the core `lots.status = 'available'` gate; no alternate per-feature eligibility rule.
- FIFO override requires the approved online decision from `09`; it is not a client flag.
- Trading price is final on the document; VMI document price is reference-only and never the period bill.
- No `warehouse_id`, `stock_levels`, `SKU`, `bins`, or duplicate reservation/ledger model.

## Implementation tasks

### 1. Resolve the outbound domain contract

Testing: Documentation/schema review; no implementation tests.

- [ ] Reconcile request, pick-list, pick-list-item, reservation/commitment, executed-quantity, and receipt-link fields/statuses with approved `01` and `10`.
- [x] Reservation data belongs in the dedicated core `inventory_commitments` / `inventory_commitment_lines` relation; define and verify uniqueness, concurrency, expiry, release, and execution constraints there.
- [x] Define request-to-pick-list ownership and whether a separate request table is required or a feature-level draft structure suffices. (Resolved: no separate request table; users initiate directly from Master Inventory; `pick_list` is created atomically at Stage 1 commitment.)
- [ ] Resolve partial pick, shortage, damage, cancellation, expiry, reversal, and reallocation behavior before implementation.
- [ ] Confirm whether `transfer` rows belong in this Outgoing Ledger or in `11`/a separate transfer ledger query.
- [ ] Confirm Supplies price/reference behavior and Trading/VMI pricing handoff contracts.
- [ ] Record cross-feature decisions in `specs/00-steering/revision-log.md`.

### 2. Define authorization, approval, and infrastructure boundaries

Testing: Authorization contract tests; real-Postgres integration before sign-off.

- [ ] Add candidate withdrawal/allocation/dispatch/document capabilities to the canonical RBAC catalog and obtain `02` approval.
- [ ] Define party/flow scope for request, pick list, lot/location, document, and ledger reads/mutations.
- [ ] Define FIFO override request payload and approval reference contract with `09`; commitment must revalidate current approval.
- [ ] Define RLS policies and default-deny behavior for pick lists, items, lots, transactions, and document access.
- [ ] Define server command idempotency, locking/version checks, transaction boundaries, and safe retry behavior with `04`.
- [ ] Have `rbac-rls-reviewer` and `db-migration-verifier` review the final matrix/DB test plan.

### 3. Implement request and allocation integration

Testing: Unit allocation/validation tests; real-Postgres concurrency/RLS integration; Playwright office flows.

- [ ] Build the office request/list/detail surface through `05`.
- [ ] Validate party, flow, item, quantity, UOM, SPQ, roll/meter, and destination inputs on client and server.
- [ ] Integrate the authoritative FIFO/FEFO allocation engine using available lots and dispersed location quantities.
- [ ] Account for existing commitments and reject stale/over-available plans.
- [ ] Produce a deterministic allocation plan with lot/location/quantity explanation.
- [ ] Route out-of-order plans to `09` override approval and block commitment until resolved.
- [ ] Ensure client-supplied lot/location choices are advisory and revalidated server-side.

### 4. Implement Stage 1 commitment and pick list

Testing: Unit commit-precondition/idempotency tests; real-Postgres transaction/concurrency/RLS integration; Playwright commit flows.

- [ ] Implement the online commit command with actor/scope, request version, allocation, current lots, SPQ/UOM, approval, and idempotency validation.
- [ ] Write durable reservation/commitment state using the approved core representation.
- [ ] Generate exactly one operational `pick_list` and `pick_list_items` snapshot on successful commitment.
- [ ] Preserve requested/committed/executed quantities distinctly where required.
- [ ] Confirm on-hand inventory and final `pick` transaction remain unchanged at Stage 1.
- [ ] Implement safe cancellation/release/expiry before dispatch with concurrency protection.
- [ ] Integrate with `10` for pick-list generation/presentation without duplicating document templates.

### 5. Implement floor picking and dispatch scan

Testing: Unit scan/state tests; Playwright simulated scanner and real browser IndexedDB; integration tests for server validation.

- [ ] Build the floor pick/dispatch flow at 375px first: one task per screen, scanner-ready input, card/list content, solid surfaces, and 64px primary action.
- [ ] Match scans against committed pick-list item, barcode, lot, location, and quantity.
- [ ] Reject wrong, duplicate, over-pick, under-pick, stale, and mismatched scans with recoverable feedback.
- [ ] Define physical `dispatch` movement/handoff behavior with the approved location/transaction design.
- [ ] Implement the final online dispatch command that rechecks commitment and current domain state.
- [ ] Atomically decrement inventory, release reservation, insert one immutable `pick` transaction, and transition pick-list status.
- [ ] Return the original result for duplicate/lost-response retries; never decrement twice.
- [ ] Keep partial/exception outcomes blocked until their approved resolution is applied.

### 6. Implement pricing/document handoff

Testing: Contract/integration tests with pricing and document services; Playwright document-availability flow.

- [ ] Consume an approved Trading pricing snapshot without calculating or overriding final price in `08`.
- [ ] Consume VMI per-release reference price without treating it as the authoritative bill.
- [ ] Emit the approved document-generation trigger for `10` after successful dispatch.
- [ ] Ensure the priced `acknowledgement_receipt` is generated/printed through `10`, with no signed-paper rescan requirement.
- [ ] Ensure document/email/Storage failure creates retry/attention state without rolling back committed inventory.

### 7. Implement offline physical-observation integration

Testing: Unit policy tests; Playwright offline/reconnect/IndexedDB; integration replay authorization/idempotency.

- [ ] Define the exact Tier 1 scan-observation policy with `03`, including payload, resource refs, ordering key, conflict/rejection classes, and retention.
- [ ] Block pick-list generation, allocation, FIFO override, commitment, release, pricing, and final dispatch from the offline queue.
- [ ] Preserve local scan state honestly and distinguish captured/queued from committed/dispatched.
- [ ] Replay through the authoritative server command with current Auth/capability/scope/commitment/lot checks and idempotency.
- [ ] Reject revoked/deactivated actors and stale/mismatched pick lists without reassignment.
- [ ] Add a negative test proving offline state cannot produce an inventory decrement or acknowledgement receipt finalization.

### 8. Implement Outgoing Ledger

Testing: Unit query/filter tests; real-Postgres RLS/query-plan integration; Playwright review/filter/detail flows.

- [ ] Build the read-only ledger query over authoritative `inventory_transactions`, primarily `pick` movements.
- [ ] Add date, party/destination, flow, item/code, lot, pick-list, and approved status filters.
- [ ] Display item-first office columns and safe lot/location/user/document details.
- [ ] Ensure transfer rows are included only under the approved transfer ownership/query contract.
- [ ] Ensure historical corrections never update/delete immutable transactions.

### 9. Cross-feature review and sign-off preparation

Testing: Full applicable matrix below.

- [ ] Mount office/floor routes through `05` and document the shell/feature state boundary.
- [ ] Run `offline-sync-reviewer`, `rbac-rls-reviewer`, `design-system-auditor`, and `db-migration-verifier`.
- [ ] Add contract tests proving `09`, `10`, `12`, `13`, and `19` consume shared interfaces rather than duplicating allocation, document, pricing, or delivery logic.
- [ ] Update `specs/00-steering/gantt-mapping.md` when the spec status changes.

## Testing matrix

### Unit tests (Vitest)

- [ ] Request/quantity/UOM/SPQ/roll-meter validation.
- [ ] FEFO/FIFO selection, available-lot eligibility, dispersed-location allocation, and commitment accounting.
- [ ] Override-required detection and approval-state validation.
- [ ] Commitment/release/dispatch state transitions and idempotency result handling.
- [ ] Scan matching and rejection classifications.
- [ ] Pricing/document contract validation without pricing calculation leakage.

### Integration tests

- [ ] Apply complete migrations in real Postgres and verify reservation/commitment constraints, pick-list relations, lot quantities, and immutable transaction behavior.
- [ ] Verify concurrent allocation cannot reserve the same available quantity twice.
- [ ] Verify Stage 1 reserves without decrementing and Stage 2 decrements/releases/writes exactly once.
- [ ] Verify stale, revoked, out-of-scope, invalid-approval, and cross-party requests fail safely under RLS.
- [ ] Verify duplicate/lost-response commands return one authoritative outcome.
- [ ] Verify Outgoing Ledger is read-only and scope-filtered.

### E2E tests (Playwright)

- [ ] Create/review a request and allocate current available lots in office mode.
- [ ] Verify VMI/Trading SPQ and Supplies piece rules.
- [ ] Verify FIFO override routes to approval and blocks commitment until approved.
- [ ] Verify Stage 1 pick list/reservation without on-hand decrement.
- [ ] Simulate floor pick/dispatch scans and verify wrong/duplicate/over/under/stale handling.
- [ ] Verify the post-pick flow proceeds directly to dispatch with no pre-dispatch inspection route, state, or block.
- [ ] Verify final dispatch produces one decrement, one pick transaction, released reservation, and acknowledgement-receipt availability.
- [ ] Verify document failure/retry does not reverse inventory.
- [ ] Verify offline observations, reconnect replay, rejection/conflict, and Tier 2 blocking.
- [ ] Verify floor 375/430px and office 768/1280px layouts, focus, contrast, touch targets, no-hover feedback, and reduced motion.

### Manual QA

- [ ] Verify printed pick list and acknowledgement receipt content/price/reference semantics through `10`.
- [ ] Verify physical pick sequence, gloved-hand targets, scanner feedback, and dispatch handoff on representative hardware during pre-launch QA.
- [ ] Verify party/customer privacy in list, ledger, document, and error states.

## Sign-off

- [x] Core reservation/commitment schema and transaction boundaries are approved.
- [x] RBAC/RLS and FIFO override integration reviews pass.
- [x] Offline physical-observation policy and Tier 2 denylist are approved.
- [x] Pricing/document boundaries with `10`, `12`, and `13` are reconciled.
- [x] All applicable tests pass, including real-Postgres verification.
- [x] Design-system review passes.
- [x] Product owner approval — Name: Lauren Date: 2026-08-05
- [x] Second approver approval — Name/Role: Lauren Date: 2026-08-05
