# Transfer & Inspection — Requirements

Status: Draft

## 1. Purpose and scope

This feature governs controlled internal movement of inventory between physical `locations` in the one warehouse, together with inspection and exception handling specific to that transfer. It covers transfer request creation, approval integration, source/destination validation, physical scan execution, conformance/non-conformance decisions, and immutable transfer ledger records.

“Transfer” in this feature means a location-to-location movement inside the single warehouse. It does not mean a second warehouse, inter-warehouse shipment, customer withdrawal, or a receiving WRR.

## 2. Ownership boundaries

- `07-incoming-receiving` owns CIPL/WRR staging, inbound receipt reconciliation, and inbound conformance before receiving commit.
- `11` owns internal transfer requests and transfer-specific inspection.
- `08-outgoing-withdrawal-and-two-stage-commitment` owns customer/internal withdrawal and `pick` movement.
- `09-approval-queue` stores approval decisions; `11` owns transfer business state and consumes an exact decision.
- `01-core-data-model` owns canonical `locations`, `lots`, and immutable `inventory_transactions`; final transfer request/inspection tables must be reconciled before approval.
- `14`/`04` own notification delivery and infrastructure boundaries; notification is not the transfer source of truth.

## 3. Actors and surfaces

- **Requestor/operations user** — creates an internal transfer request with reason, source, destination, items/lots, and quantities.
- **Supervisor/reviewer** — approves transfer requests where the approved policy requires it.
- **Warehouse staff** — executes physical movement and scan confirmation on a floor-first handheld flow.
- **Inspector/authorized staff** — records transfer conformance/non-conformance and evidence.
- **Party users** — do not gain internal location movement authority from party-scoped data visibility.

Office request/review is desktop-first but mobile-usable. Physical transfer and inspection are floor surfaces: portrait, scanner-first, one primary action, solid high-contrast surfaces, and no dense multi-column table.

## 4. Transfer lifecycle

The final state names must be reconciled with the approved schema. The intended lifecycle is:

```text
draft → pending_approval → approved → ready_for_execution
                                      ├→ executing → inspection_pending
                                      │                ├→ passed → completed
                                      │                └→ failed → exception/resolution
                                      └→ rejected/cancelled/expired
```

Routine transfers may use a shorter path only if the approved capability/policy explicitly permits it. An approved request is not a completed movement. Completion requires the authoritative physical/transaction command.

## 5. Functional requirements

### R1. Transfer request

1. An authorized user SHALL be able to request movement from one active source `location` to one active destination `location` within the single warehouse.
2. A request SHALL identify item, lot where required, flow type, quantity/UOM, source/destination, reason, priority, and any inspection requirement.
3. Source and destination SHALL be distinct and valid for the requested movement; a location cannot be its own transfer destination.
4. The server SHALL validate the current source quantity, lot status, item identity, flow partition, location type/capacity, and caller scope.
5. A draft request SHALL not change inventory or create an `inventory_transaction`.
6. The request SHALL be versioned so later changes to source quantity, lot status, location capacity, or approval state invalidate stale plans.

### R2. Transfer approval

1. A transfer requiring approval SHALL create a typed request in `09-approval-queue` with exact target/version, source/destination, item/lot/quantity, reason, and actor context.
2. Approval SHALL be capability-specific and current; a supervisor role alone SHALL not authorize every transfer.
3. Approval SHALL be online-only, append-only, and consumable only by this exact transfer request/version.
4. The transfer command SHALL revalidate the approval, current source/destination state, lot status, quantity, scope, and business rules before execution.
5. Rejected, expired, superseded, revoked, or mismatched approval SHALL block execution.
6. Routine/internal transfers MAY omit approval only when the approved policy explicitly identifies the capability and conditions that allow the shortcut.

### R3. Transfer inspection

1. If the transfer policy requires inspection, the system SHALL create an inspection task tied to the transfer and its item/lot/location context.
2. Inspection SHALL record conformance or non-conformance, actor, timestamp, reason, remarks, and evidence where required.
3. Transfer-specific non-conformance SHALL block completion or route to an approved exception/resolution path.
4. Conformance SHALL allow execution/completion only after the transfer's other prerequisites pass.
5. Transfer inspection SHALL not modify inbound `wrr_inspection_logs` or WRR status and SHALL not be used to bypass inbound receiving rules.
6. The final inspection reason vocabulary and evidence fields must be approved for transfer context; inbound-only reasons may not be copied without review.

### R4. Physical execution and scan validation

1. The floor flow SHALL present one transfer task at a time with source, destination, item/lot, expected quantity, and current status.
2. Source scans SHALL verify the expected item/barcode, lot, location, and quantity before physical movement is accepted.
3. Destination scans SHALL verify the expected destination location and item/lot before completion.
4. Wrong item, wrong lot, wrong location, duplicate scan, over-quantity, stale request, and insufficient source quantity SHALL receive immediate recoverable feedback.
5. Manual entry MAY be a controlled recovery path but SHALL use the same server validation and audit boundary.
6. Physical scan observations MAY be Tier 1 offline work only if explicitly registered with `03-offline-mode-and-client-storage`; no offline scan may complete the transfer or mutate authoritative inventory.

### R5. Transfer commit and inventory ledger

1. Final transfer completion SHALL be an explicit authorized server command.
2. The commit SHALL atomically revalidate request state, approval/inspection, source quantity, destination validity/capacity, lot/flow identity, scan evidence, and idempotency key.
3. On success, the system SHALL update the authoritative location assignment/quantity and insert an immutable `inventory_transaction` with `movement_type = 'transfer'`, including source and destination locations.
4. The transaction SHALL preserve item, lot, flow, quantity, actor, timestamp, source transfer reference, and correlation ID.
5. Duplicate or lost-response completion SHALL return the original outcome and SHALL not move the stock twice.
6. A failed commit SHALL roll back completely and leave the request in a recoverable state.
7. A transfer SHALL not be represented as a receiving, pick, reconciliation, or pricing transaction.

### R6. Exceptions and reversal

1. Cancellation, shortage, damage, wrong destination, and failed inspection SHALL use explicit states and reasons.
2. An incomplete transfer SHALL not be marked completed by changing a client status.
3. A completed transfer SHALL not be edited or deleted from the immutable ledger.
4. A correction or reversal SHALL create the approved compensating movement/transaction with reason and authorization; it SHALL not rewrite the original transfer.
5. Reallocation of affected stock after failure SHALL use a new approved workflow action, not an implicit retry that assumes the physical state.

### R7. Transfer history and review

1. Authorized users SHALL be able to review transfer requests, current state, approval/inspection history, scan exceptions, and resulting ledger references.
2. Search/filter SHALL support status, date, source/destination, item/lot, flow, requestor, and approval state within current scope.
3. The transfer history SHALL be read-only for completed transaction records.
4. Party users SHALL not infer unrelated party/flow transfer records through identifiers, counts, filters, errors, or notifications.

### R8. Authorization, audit, and privacy

1. Every transfer read and mutation SHALL use current capability, party/flow scope, and RLS enforcement from `02-rbac-roles`.
2. Client-supplied party, flow, lot, location, quantity, approval, role, or status values SHALL not establish authorization or truth.
3. Request, approval submission, inspection, execution, completion, cancellation, failure, and reversal SHALL be attributable and auditable.
4. Evidence files SHALL use private Storage and source-record authorization.
5. Monitoring and error responses SHALL not expose tokens, SQL, protected records outside scope, or unnecessary personal data.

### R9. Offline and realtime behavior

1. Request creation, approval, allocation/validation, inspection resolution, transfer completion, reversal, and any authoritative quantity/location update SHALL be online-only in v1.
2. Approved physical scan observations MAY be queued as Tier 1, but replay SHALL re-authenticate, re-authorize, recheck current transfer state, and remain idempotent.
3. Approval decisions SHALL never enter the offline queue.
4. Realtime MAY signal new requests/status changes; durable transfer state and authoritative refetch remain the source of truth.
5. Connectivity/sync status SHALL use the shared `OfflineStatus` contract and SHALL not be shown as transfer completion.

## 6. Acceptance criteria

- [ ] A valid internal location transfer can be requested with exact item/lot/quantity/source/destination context.
- [ ] Approval-required transfers cannot execute until a current, exact approval is consumed.
- [ ] Transfer inspection is distinct from inbound WRR inspection and blocks unsafe completion.
- [ ] Source/destination scans reject mismatches and support safe recovery.
- [ ] Completion moves stock exactly once and writes one immutable `transfer` inventory transaction with both locations.
- [ ] Completed records cannot be edited/deleted; corrections use explicit compensating actions.
- [ ] Offline observations cannot approve or complete a transfer.
- [ ] Party/flow scope, RLS, stale-state, concurrency, and evidence access tests pass.

## 7. Dependencies and exclusions

- Depends on `01-core-data-model` for `parties`, `items`, `locations`, `lots`, and `inventory_transactions`; transfer/inspection persistence gaps must be resolved before approval.
- Depends on `02-rbac-roles` for capabilities, scope, RLS, audit, and approval authority.
- Depends on `03-offline-mode-and-client-storage` for Tier 1 physical-observation policy.
- Depends on `04-services-and-infrastructure` for Auth, Storage, transactions/idempotency, Realtime, notifications, and monitoring.
- Depends on `05-ui-shell-and-navigation` for office/floor routes, responsive patterns, and feedback states.
- Depends on `09-approval-queue` for transfer approval decisions.
- `07` owns inbound WRR inspection; `08` owns withdrawal/pick execution; `16` owns reporting over resulting transactions.
