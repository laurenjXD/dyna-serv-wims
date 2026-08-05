# Dispatch Scheduling & Delivery Tracking — Requirements

Status: Draft

## 1. Purpose and scope

This feature coordinates outbound dispatch appointments, carrier/vehicle assignment, handoff readiness, and delivery-status tracking after packing. It gives operations staff and authorized parties a reliable view of what is ready, scheduled, dispatched, in transit, delivered, delayed, or exception-held.

`19` owns scheduling, dispatch plans, delivery milestones, tracking references, and delivery exceptions. It does not allocate stock, commit a pick, pack goods, decrement inventory, generate priced documents, resolve Trading prices, calculate VMI billing, or deliver notifications directly.

The v1 scope includes:

- dispatch queue and readiness review from authoritative `18` packing and `08` source state;
- scheduling date/time windows, destination, carrier/vehicle/driver references, and dispatch priority;
- optional dispatch approval integration through `09` where policy requires it;
- authoritative handoff/status events after `08` final dispatch;
- delivery milestone updates, proof/reference metadata where approved, and exception handling;
- party-safe operational tracking, reporting inputs, and `14` notification event contracts.

## 2. Alignment principles and ownership boundaries

- `08-outgoing-withdrawal-and-two-stage-commitment` owns outbound request, FIFO/FEFO allocation, commitment, physical pick/dispatch confirmation, inventory decrement, reservation release, and immutable `inventory_transactions` with `movement_type = 'pick'`.
- `18-packing` owns packing sessions, package assignment, packing exceptions, seal/ready-for-dispatch confirmation, and the packed-ready handoff.
- `19` owns dispatch scheduling, carrier/vehicle assignment, delivery milestones, tracking references, and delivery exceptions after the approved source handoff.
- `10-pick-list-and-acknowledgement-receipt` owns the priced `pick_list` and `acknowledgement_receipt`, generated artifacts, printing, and reprinting. `19` links to approved snapshots and does not create a competing document.
- `09-approval-queue` owns approval decisions; `19` owns the dispatch business state and consumes an exact current decision where approval is required.
- `01-core-data-model` owns `parties`, `items`, `locations`, `lots`, `pick_lists`, and immutable ledger rules. Final scheduling/tracking persistence must be reconciled with `01` or an approved feature-owned schema.
- `02-rbac-roles` owns capabilities, party/flow scope, RLS, and audit authorization. Client-supplied status or destination cannot establish authority.
- `03-offline-mode-and-client-storage` owns the offline boundary. Scheduling, approval, final dispatch status, delivery status, and exception resolution are online authoritative operations unless a narrowly approved observation policy says otherwise.
- `04-services-and-infrastructure` owns Auth, jobs, Realtime, private Storage, telemetry, retries, and external integration boundaries.
- `05-ui-shell-and-navigation` and the approved brand system govern route, responsive, office, and mobile behavior.
- `14-notifications-and-alerts` owns recipient routing, delivery channels, deduplication, and alert lifecycle. `19` publishes approved events/threshold inputs only.
- `16-reporting-and-analytics` consumes approved dispatch/delivery metrics; it does not recalculate operational truth.
- VMI period billing belongs to `12`; Trading document price remains final under `13`. Delivery charges or commercial adjustments are out of scope unless separately approved.
- One physical warehouse is assumed; no `warehouse_id` is introduced.

## 3. Actors and surfaces

- **Dispatch coordinator:** reviews packed-ready shipments, creates/schedules dispatch plans, assigns approved carrier/vehicle details, and manages exceptions.
- **Supervisor/approver:** reviews dispatch requests where policy requires approval through `09`.
- **Warehouse/dispatch staff:** confirms physical handoff signals or consumes the dispatch manifest; final inventory dispatch remains in `08`.
- **Carrier/driver or delivery operator:** may provide authorized delivery milestone/reference updates through a restricted surface or integration; they cannot alter inventory or pricing.
- **Party user/customer:** sees only their authorized shipment/delivery status and safe references.
- **Administrator/auditor:** reviews schedules, status history, access, and operational failures under approved capabilities.

Office scheduling is desktop-first but mobile-usable. Any handoff/status capture used in the warehouse or field is scan/tap-first, high contrast, and one-primary-action per screen.

## 4. Functional requirements

### R1. Dispatch readiness and source integrity

1. A dispatch plan SHALL be created only from an authoritative source with the approved `18` packed/ready state and a current `08` pick/source version.
2. The plan SHALL include an opaque source reference, party/destination scope, `flow_type`, package count/details where approved, document references, readiness status, actor, timestamp, and correlation/idempotency key.
3. A packed-ready plan SHALL not be treated as final dispatched, delivered, or inventory-decremented until `08` returns the authoritative dispatch outcome.
4. The server SHALL revalidate source state, packing version, party/destination, required documents, approval state, and current authorization before scheduling or confirming a handoff.
5. Stale, cancelled, released, already-dispatched, or mismatched source state SHALL block scheduling or route to an explicit attention state.
6. Duplicate schedule/create/handoff requests SHALL be idempotent and SHALL not create duplicate dispatch plans or delivery records.

### R2. Scheduling and assignment

1. Authorized users SHALL be able to schedule an eligible dispatch within an approved date/time window and assign destination, carrier/service, vehicle, driver/operator, priority, and internal notes where permitted.
2. Scheduling SHALL validate required destination and contact fields from authorized party/master data without exposing unrelated party data.
3. Conflicting schedule windows, unavailable/invalid carrier or vehicle references, missing required package/document data, and expired readiness SHALL produce actionable errors.
4. Carrier/vehicle/driver fields SHALL be references to approved master/integration records or controlled values; free text SHALL not establish identity or authority.
5. Rescheduling, cancellation, reassignment, and priority changes SHALL be explicit, authorized, versioned, and auditable.
6. A schedule change SHALL not alter pick quantities, lot allocation, inventory balance, price, billing, or generated document content.

### R3. Dispatch approval boundary

1. If policy requires dispatch approval, `19` SHALL create a typed approval request in `09` containing the exact dispatch plan/version, source pick/packing references, destination, schedule, reason, and actor context.
2. `19` SHALL consume only a current, exact, non-revoked approval for the same plan/version and scope.
3. Approval SHALL be online-only and SHALL not be inferred from a notification, user role label, cached flag, or client status.
4. A rejected, expired, superseded, revoked, or mismatched decision SHALL block the affected dispatch command.
5. Routine dispatches MAY omit approval only where the approved capability/policy explicitly permits the conditions.
6. `19` SHALL not duplicate the approval decision ledger or change an approval record owned by `09`.

### R4. Final dispatch and handoff integration

1. `19` SHALL provide `08` with the approved schedule/readiness context required for final physical dispatch, but `08` SHALL own the final dispatch command and outcome.
2. A successful `08` dispatch outcome SHALL be accepted idempotently and SHALL transition the dispatch plan to the approved dispatched/in-transit pathway.
3. Only `08` may release the reservation, decrement authoritative lots, and insert the immutable `inventory_transaction` with `movement_type = 'pick'`.
4. `19` SHALL not create a second inventory movement, rewrite a pick list, change a price, or treat a carrier scan as inventory dispatch.
5. Dispatch handoff SHALL record date/time, actor/system executor, source event/version, package/document references where approved, and correlation ID.
6. If `08` final dispatch fails or is delayed, `19` SHALL preserve the schedule and expose an attention/recovery state without claiming the goods were dispatched.

### R5. Delivery tracking lifecycle

1. The system SHALL distinguish at least scheduled, ready, dispatch_pending, dispatched, in_transit, delivery_attempted, delivered, delayed, failed, cancelled, returned, and exception states, or an approved equivalent state model.
2. A state transition SHALL be accepted only from an allowed prior state, current source/reference, authorized actor/integration, and valid timestamp/order policy.
3. Delivery milestones SHALL record event time, received time, actor/system executor, source/reference, location or facility metadata only where approved, reason/status, and correlation ID.
4. A delivery status SHALL not alter inventory, lot status, price, billing period, approval, pick-list content, or acknowledgement-receipt content.
5. Delivered status SHALL require the approved confirmation/reference fields; proof-of-delivery files or signatures are out of scope unless explicitly approved with private Storage and retention rules.
6. Delayed, failed, returned, and attempted delivery SHALL route to explicit exception/recovery states and shall not be silently overwritten by a later optimistic status.
7. Out-of-order, duplicate, delayed, and retried updates SHALL be idempotent and SHALL preserve the event history.

### R6. Notifications, reports, and documents

1. `19` MAY publish approved events for schedule changes, dispatch readiness, dispatch completion, delay, delivery attempt, delivery failure, return, and delivery completion to `14`.
2. `14` SHALL own recipient resolution, preferences, channel delivery, deduplication, and notification acknowledgement; `19` SHALL not send directly or treat notification delivery as workflow completion.
3. `16` SHALL consume versioned delivery metrics and status events from `19`; dashboard formulas remain subject to `16` approval.
4. Shipment and delivery views SHALL link to authorized `10` document snapshots without changing their price/content. Trading price remains final; VMI document price remains reference-only and not the period bill.
5. Error, notification, report, or document failure SHALL not change authoritative dispatch or delivery state.

### R7. Authorization, privacy, and audit

1. Read, schedule, assign, approve-request, reschedule, cancel, dispatch-status accept, delivery-status update, exception resolve, document link, export, and history operations SHALL use current capability, party/flow scope, and RLS.
2. Client-supplied party, destination, carrier, vehicle, driver, status, timestamp, approval, role, or source reference SHALL not establish authority or truth.
3. Party users SHALL not discover unrelated shipments through IDs, counts, search, filters, schedules, status endpoints, errors, notifications, labels, or URLs.
4. All schedule and status changes, denied actions, integration attempts, corrections, and failures SHALL be attributable and auditable with actor/system executor, timestamp, reason, prior/new state, source/version, and correlation ID.
5. Operational logs and telemetry SHALL redact credentials, tokens, unrestricted document contents, internal cost/margin, and unnecessary personal data.

### R8. Offline, realtime, and integration behavior

1. Schedule creation/change/cancellation, approval requests, final dispatch-status acceptance, delivery-status mutation, exception resolution, and proof/reference submission SHALL be online-only in v1.
2. A narrowly approved field observation MAY be captured offline, but it SHALL not become an authoritative delivery milestone until replay re-authenticates, re-authorizes, validates state/order, and applies idempotency.
3. Offline data SHALL distinguish local observation from accepted dispatched/delivered state and SHALL never claim synchronization from a cached status.
4. Realtime MAY signal schedule/status changes; clients SHALL refetch durable state after reconnect, visibility change, manual refresh, or missed signals.
5. External carrier/integration failures SHALL be retryable, observable, and isolated from source inventory/document transactions.

## 5. Acceptance criteria

- [ ] Only an authorized packed-ready, current source can be scheduled.
- [ ] Dispatch approval, where required, is exact, current, online, and owned by `09`.
- [ ] Final dispatch remains owned by `08`; `19` never decrements inventory or writes a second movement ledger.
- [ ] Scheduling conflicts, stale sources, duplicate requests, and invalid assignments fail safely and audibly.
- [ ] Delivery milestones enforce valid transitions, preserve history, and handle out-of-order/retried updates idempotently.
- [ ] Party/flow scope prevents cross-party discovery through all views, counts, integrations, notifications, and URLs.
- [ ] Trading/VMI document and billing semantics remain unchanged; `10` remains document owner and `12` remains VMI billing owner.
- [ ] `14` notification and `16` reporting integrations use approved contracts without becoming sources of truth.
- [ ] Offline/stale state, accessibility, responsive behavior, integration failure, RLS, concurrency, and audit tests pass.

## 6. Decisions required before approval

- Final dispatch plan/schedule/delivery schema, state vocabulary, and transition matrix.
- Exact `18` packed-ready and `08` final-dispatch source/event contracts.
- Whether dispatch approval is mandatory by flow/destination/carrier and the `09` capability/approval policy.
- Carrier, vehicle, driver, delivery-address, time-window, and external tracking master-data ownership.
- Proof-of-delivery scope, signature/file fields, private Storage, retention, and privacy policy.
- Field observation/offline policy, integration retry/idempotency, and timezone/as-of rules.
- Initial `14` notification events/recipients and `16` metric definitions.
