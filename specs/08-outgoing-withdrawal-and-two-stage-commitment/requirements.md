# Outgoing Withdrawal & Two-Stage Commitment — Requirements

Status: Draft

## 1. Purpose and scope

This feature governs outbound withdrawal from an item/lot request through FIFO/FEFO allocation, commitment, physical picking/dispatch scan, inventory decrement, and handoff to priced `pick_list` and `acknowledgement_receipt` documents.

The core safety rule is two-stage commitment:

- **Stage 1 — commitment:** reserve eligible stock and create the operational `pick_list`; inventory remains physically/systemically on hand and is not decremented.
- **Stage 2 — physical dispatch confirmation:** verify the physical scan, decrement inventory, release the reservation, write the immutable pick transaction, and produce the priced `acknowledgement_receipt`.

This feature does not own the approval queue, final pricing model, VMI period billing, document layout/printing, dispatch scheduling/delivery tracking, or offline queue infrastructure.

## 2. Actors and surfaces

- **Office/request builder** — creates or reviews an outbound request using a desktop-first office surface that remains usable on mobile.
- **Warehouse staff** — executes the committed pick/dispatch flow on a portrait handheld scanner using one task per screen.
- **Supervisor** — approves FIFO overrides or other explicitly defined exceptions through `09-approval-queue`; approval is not implied by this feature.
- **Party user/customer** — sees only authorized scoped requests/documents where downstream requirements permit; never gains allocation authority from visibility.

## 3. Lifecycle

The final status model must be reconciled with `01-core-data-model` and document spec `10`. The intended lifecycle is:

```text
request → allocation_pending → committed / pick_list(allocated)
                                      │
                                      ├── cancelled / expired / released
                                      ▼
                              physical_picking
                                      ▼
                         picked / dispatch_ready
                                      ▼
                             dispatched
```

- Before commitment, no quantity is reserved and no final pick list exists.
- `committed` reserves selected lot/location quantities and prevents double allocation without decrementing on-hand inventory.
- A FIFO override request blocks commitment until the approved decision is available.
- Physical picking/dispatch confirms what was actually moved; partial/exception behavior must be explicitly resolved before implementation.
- `dispatched` is the authoritative outbound completion state and is paired with the immutable `pick` transaction and priced acknowledgement receipt.

## 4. Functional requirements

### R1. Withdrawal request

1. An authorized user SHALL be able to create an outbound request for a receiving party/destination, `flow_type`, and one or more item quantities.
2. The request SHALL validate active item references, permitted party/flow scope, UOM, quantity, and any approved document/request metadata.
3. The system SHALL use canonical `parties`, `items`, `locations`, `lots`, `pick_lists`, and `acknowledgement_receipt` terminology.
4. The system SHALL not create a final pick list or reserve stock merely because a draft request was entered.
5. Draft requests SHALL be editable only by authorized users and SHALL have safe stale-edit/concurrency behavior.

### R2. Quantity, packaging, and flow rules

1. For VMI and Trading lots, requested piece quantities SHALL be exact multiples of `items.spq` unless an approved future requirement changes that rule.
2. Supplies withdrawals MAY use individual piece quantities where the approved flow rules permit.
3. Roll/meter items SHALL use the approved `spq_meter` conversion and preserve the required display units without duplicating or rounding away the authoritative quantity.
4. The server SHALL revalidate all quantity/UOM/packaging rules at allocation and dispatch; client calculations are advisory.
5. The system SHALL reject non-positive, over-available, incompatible-UOM, and invalid-flow quantities with actionable errors.

### R3. FIFO/FEFO allocation

1. Allocation SHALL consider only lots whose `status = 'available'` under the authoritative core model.
2. Allocation SHALL apply FEFO for perishable items and FIFO for non-perishable items using the approved ordering rules.
3. Allocation SHALL operate across dispersed locations and produce lot/location quantities that can be physically picked.
4. Allocation SHALL account for already committed quantities so two concurrent requests cannot reserve the same available stock.
5. The system SHALL not implement a second per-feature lot eligibility rule that contradicts the core `lots.status` gate.
6. A user SHALL not select a newer/out-of-sequence lot simply by changing a client value.

### R4. FIFO override and approval boundary

1. When the requested allocation would bypass FIFO/FEFO, the system SHALL block commitment and create/route an explicit override request to `09-approval-queue`.
2. The override request SHALL include the affected item/lot/location, requested quantity, reason, actor, and correlation/reference data required by the approval feature.
3. Approval SHALL be a separate online capability and recorded decision; a boolean or cached client flag is insufficient.
4. A denied, expired, revoked, or stale approval SHALL not authorize commitment.
5. The final allocation command SHALL recheck the approval against current request/lot state and scope.
6. FIFO override approval SHALL never be available solely from offline state.

### R5. Stage 1 commitment and pick list

1. Commitment SHALL be an explicit, authorized online server command.
2. The command SHALL atomically revalidate request lines, current stock, lot eligibility/order, quantity rules, existing commitments, party/flow scope, and required approvals.
3. On success, the system SHALL reserve the selected quantities, generate the operational `pick_list`, and expose the selected lot/location instructions to the floor workflow.
4. Commitment SHALL not decrement physical/on-hand inventory and SHALL not create the final `pick` inventory transaction.
5. A committed quantity SHALL be visible in the authoritative reservation/commitment model; the final schema representation must be reconciled with `01-core-data-model` before approval.
6. Commitment SHALL be idempotent and safe under concurrent requests; it SHALL not double-reserve or generate duplicate pick lists.
7. The resulting `pick_list` SHALL be operational and priced according to the approved document contract; it is not an unpriced `withdrawal_slip`.

### R6. Commitment release, cancellation, and expiry

1. The system SHALL support an approved path to cancel or release a committed request before physical dispatch.
2. Release SHALL return reserved quantity to allocatable availability without changing immutable historical transactions that do not exist yet.
3. Release/cancellation SHALL be authorized, attributable, idempotent, and safe against a concurrent dispatch.
4. The system SHALL define an expiry/attention path for commitments that remain unpicked beyond the approved operational window.
5. A commitment SHALL not be released after an authoritative dispatch commit without an approved reversal/reconciliation workflow.

### R7. Stage 2 physical pick and dispatch confirmation

1. The floor workflow SHALL present one current pick/scan task at a time, with item, lot, location, quantity, and safe exception feedback.
2. A scan SHALL verify the expected pick list, item/barcode, lot, location, and quantity before acceptance.
3. Wrong item, wrong lot/location, duplicate scan, over-pick, under-pick, or stale pick-list scans SHALL be rejected or routed to an approved exception state.
4. Physical movement to the approved `dispatch` location SHALL be represented according to the final location/transaction design; it SHALL not be confused with final customer handoff.
5. Final dispatch confirmation SHALL atomically verify the commitment and scans, decrement authoritative inventory, release the committed quantity, transition the pick list, and insert an immutable `inventory_transaction` with `movement_type = 'pick'`.
6. Duplicate confirmation or a lost response SHALL return the original authoritative outcome and SHALL not decrement inventory twice.
7. Partial fulfillment, shortage, damaged stock, and scan mismatch behavior SHALL be explicitly resolved before approval; the client SHALL not silently complete a partial pick as full dispatch.

### R8. Priced documents and handoff

1. A successful dispatch SHALL make the approved priced `acknowledgement_receipt` available for generation/printing through `10-pick-list-and-acknowledgement-receipt`.
2. The acknowledgement receipt SHALL be generated in-system and printed for physical signature at handoff; scanning the signed paper copy back into the system is not required by this feature.
3. Trading price on the document SHALL be final for that document and supplied by the approved Trading pricing boundary; this feature SHALL not invent or override it.
4. A VMI price shown on a document SHALL be a per-release reference only and SHALL never become the authoritative VMI bill; `12-vmi-billing` owns period-average billing.
5. Document generation/email/Storage failures SHALL not reverse an already committed inventory movement; the approved infrastructure retry/attention path applies.

### R9. Outgoing ledger and review

1. The Outgoing Ledger SHALL be a filtered view of authoritative `inventory_transactions`, primarily `movement_type = 'pick'`; `transfer` rows SHALL be included only where the approved ownership/query contract requires it.
2. It SHALL show authorized date/time, item code, description, lot, location, quantity/UOM, pick list, destination/party, flow type, dispatching user, and document references.
3. It SHALL support date, party/destination, flow, item/code, lot, and pick-list filters subject to authorization.
4. It SHALL remain read-only; corrections/reversals use approved new transactions, never edits/deletes of immutable history.

### R10. Authorization, audit, and privacy

1. Request creation, allocation, override submission, commitment, release, pick, dispatch, ledger reads, and document access SHALL use current server capability and party/flow scope checks from `02-rbac-roles`.
2. Client-supplied party, flow, lot, location, quantity, role, or approval values SHALL not establish authorization or availability.
3. Sensitive decisions SHALL record actor, timestamp, reason/reference, and correlation ID through the approved audit boundary.
4. Party users SHALL not infer unrelated requests, inventory, prices, or ledger rows through IDs, filters, counts, errors, realtime events, or document URLs.

### R11. Offline behavior

1. Request creation, FIFO/FEFO allocation, FIFO override, commitment, release/cancellation, pricing, final dispatch confirmation, inventory decrement, and acknowledgement-receipt finalization SHALL be online-only in v1.
2. Physical pick/dispatch scan observations MAY be Tier 1 offline work only if this feature defines an approved command policy with `03-offline-mode-and-client-storage`.
3. Offline observations SHALL not reserve, decrement, release, approve, price, or finalize stock/documents.
4. Sync SHALL re-authenticate and re-authorize the actor, recheck current pick-list/lot/commitment state, and use idempotency before accepting any outcome.
5. The UI SHALL distinguish locally captured/scanned from committed/dispatched and SHALL consume the shared `OfflineStatus` without overclaiming freshness.

## 5. Acceptance criteria

- [ ] A valid request can be allocated using authoritative available lots and approved FEFO/FIFO ordering across dispersed locations.
- [ ] VMI/Trading SPQ rules and Supplies piece rules are enforced server-side.
- [ ] FIFO override blocks commitment until an approved, current decision exists.
- [ ] Stage 1 commitment reserves stock without decrementing inventory and creates exactly one operational `pick_list`.
- [ ] Stage 2 confirmation decrements inventory, releases reservation, writes exactly one immutable pick transaction, and exposes the priced acknowledgement receipt.
- [ ] Duplicate/lost-response/concurrent operations do not double-reserve or double-decrement.
- [ ] Trading/VMI pricing boundaries and `10` document ownership are respected.
- [ ] Offline observations cannot authorize allocation, commitment, approval, pricing, or final dispatch.
- [ ] Cross-party, RLS, stale-state, invalid-scan, and ledger immutability tests pass.

## 6. Dependencies and exclusions

- Depends on `01-core-data-model` for `parties`, `items`, `locations`, `lots`, `pick_lists`, `pick_list_items`, and `inventory_transactions`; the missing/final commitment representation must be resolved there before approval.
- Depends on `02-rbac-roles` for capabilities, party/flow scope, RLS, audit, and approval authorization.
- Depends on `03-offline-mode-and-client-storage` for the explicit physical-observation queue policy and replay contract.
- Depends on `04-services-and-infrastructure` for Auth, idempotency, transaction/runtime, document Storage, monitoring, and retry behavior.
- Depends on `05-ui-shell-and-navigation` for office/floor surfaces, route protection, page headers, and status feedback.
- Depends on `09-approval-queue` for FIFO override decisions.
- Depends on `10-pick-list-and-acknowledgement-receipt` for document templates, generation, and printing.
- Depends on `12-vmi-billing` and `13-trading-orders-and-pricing` for pricing/billing boundaries.
- `19-dispatch-scheduling-and-delivery-tracking` owns scheduling/status tracking beyond physical dispatch confirmation.
