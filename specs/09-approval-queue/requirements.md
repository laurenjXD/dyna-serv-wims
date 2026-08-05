# Approval Queue — Requirements

Status: Draft
Updated: 2026-08-05

## 1. Purpose and scope

The Approval Queue provides a durable, auditable workflow for decisions that must be made by an authorized reviewer before a requesting operation can proceed. It is generic infrastructure for workflow-specific approvals, beginning with FIFO/FEFO override requests from `08-outgoing-withdrawal-and-two-stage-commitment`.

The queue stores the request and decision history; it does not own the business mutation that is being approved. The owning feature remains responsible for revalidating the approved request and performing its authoritative transaction.

## 2. Principles and boundaries

- An approval is a recorded decision, not a boolean field or client flag.
- Approval capability is separate per workflow/resource; a supervisor role does not automatically approve every workflow.
- The requester’s snapshot is evidence for review, not current authorization or current business truth.
- Approval is online-only and is never authorized from cached/offline state.
- Realtime and notifications are convenience signals; the durable queue and decision records are authoritative.
- One warehouse only; no `warehouse_id` or tenant simulation is introduced.
- No approval decision changes inventory, pricing, billing, RBAC, or documents directly. The owning feature consumes the decision.

## 3. Approval type scope — v1

**v1 supports exactly one approval type: `fifo_override`.** All other approval types — including quality hold, write-off authorization, billing correction, dispatch approval, reconciliation approval, pricing exception, and transfer approval — are deferred to the owning feature spec's approval phase. A future spec must define its own approval adapter before a new type can be added to the registry. The queue server SHALL reject any approval type that is not explicitly registered in the server-side policy registry; the existence of a generic request row does not constitute registration or authorization.

### v1 registered type

- `fifo_override` — permits `08` to revalidate and commit an out-of-order FIFO/FEFO allocation when an authorized reviewer approves the specific request.

### Adding a new approval type in a future spec

A future spec that requires an approval type must resolve all of the following before the type can be registered:

1. The target payload type and all snapshot fields, including the version/optimistic-lock field that makes an approval stale.
2. The `requesterCapability` and `reviewerCapability` identifiers, added to the `02` capability catalog with their scope kind and default roles.
3. Current-state checks required before a decision may be consumed by the owning workflow.
4. Expiry duration, self-approval behavior, and reason requirements specific to that type.
5. The consumption marker location and the exact conditions under which a decision is considered stale, expired, or already consumed.

No type may be registered until all five items are resolved and the owning spec is approved. The generic approval infrastructure does not pre-authorize any future type.

## 4. Actors and surfaces

- **Requester** — submits a workflow-specific approval request with reason and evidence.
- **Reviewer/approver** — views requests within current capability and scope and records approve/reject decisions.
- **Administrator/auditor** — may review history according to the approved RBAC capability matrix; does not gain approval authority by viewing audit data.
- **Owning workflow** — revalidates and consumes the decision; it is not allowed to treat queue visibility as authorization.

The queue is an office/supervisor surface and must remain usable on a narrow mobile viewport. It is not a floor scan flow.

## 5. Functional requirements

### R1. Approval request creation

1. An authorized workflow SHALL be able to submit a versioned approval request through a server command.
2. A request SHALL identify approval type, target resource/reference, owning workflow, requested action, requester, reason, creation time, scope context, and the current target/version snapshot needed for review.
3. The request SHALL include a stable idempotency key and correlation ID.
4. The server SHALL validate the request type against a registered approval policy; unknown or unsupported types SHALL be rejected.
5. The request SHALL not mutate the target business resource when created.
6. A duplicate submission with the same idempotency key SHALL return the existing request rather than create a second pending request.
7. A request SHALL be scoped to the underlying party/flow/resource and SHALL not accept client-supplied scope as authority.

### R2. Queue states and transitions

The approved state model shall include, at minimum:

```text
pending → approved
       ├→ rejected
       ├→ cancelled
       ├→ expired
       └→ superseded
```

1. Only the valid transition for the current state may be applied by the server.
2. A terminal request SHALL not be approved, rejected, or cancelled again without an explicit new request.
3. Expiry and supersession SHALL be explicit, attributable, and auditable.
4. A target change, request-version mismatch, revoked requester, revoked approver, or invalidated business state SHALL make the request unavailable for approval or consumption according to the approval policy.
5. The queue SHALL distinguish a decision being recorded from the owning workflow successfully consuming it.

### R3. Queue review and filtering

1. Authorized reviewers SHALL see only requests within their current approval capability and party/flow scope.
2. The queue SHALL support filtering by approval type, status, workflow, age, requester, party/flow where authorized, and target reference.
3. The review view SHALL show the reason, requested action, target snapshot, current status, requester, timestamps, related workflow link, and any required evidence.
4. The UI SHALL show when the snapshot may be stale and require authoritative revalidation before the decision is accepted.
5. Party users SHALL not see global approval queues or infer unrelated pending requests through counts, search, URLs, errors, or notifications.
6. A read-only audit/history view MAY show terminal decisions according to a separate audit capability.

### R4. Decision recording

1. An authorized reviewer SHALL be able to approve or reject a pending request through an explicit server command.
2. The decision SHALL record request ID, decision, reviewer, timestamp, reason/comment, current authorization/scope context, and correlation ID.
3. The decision history SHALL be append-only; prior decisions SHALL not be edited or deleted.
4. The reviewer’s current capability and scope SHALL be checked at decision time, not inferred from the requester or cached UI.
5. The system SHALL support the approved separation-of-duties rule; self-approval SHALL be blocked if that rule is selected.
6. Approval SHALL be specific to the request/version/target snapshot and SHALL not grant a general permission or future approval authority.
7. Decision submission SHALL be idempotent and safe under concurrent reviewers; only one valid terminal decision may win.
8. Rejection SHALL require a reason when the approved policy marks the request as sensitive or when the product owner requires it.

### R5. Owning-workflow consumption

1. An approved decision SHALL be consumable only by its owning workflow and exact target/version.
2. The owning workflow SHALL recheck current requester/actor authorization, approver authorization, target state, scope, business invariants, and expiry before applying the approved action.
3. A stale, revoked, superseded, mismatched, or already-consumed decision SHALL not authorize a mutation.
4. Approval consumption SHALL be recorded with consumer, time, correlation ID, and resulting business transaction reference where available.
5. The queue SHALL not directly change `lots`, `inventory_transactions`, prices, billing, users, roles, or documents.

### R6. Notifications and realtime

1. The system MAY notify eligible reviewers when a new request or status change occurs.
2. Realtime events SHALL be scoped by current capability/RLS and SHALL contain minimal metadata.
3. Realtime delivery SHALL never be the only way to discover or act on a request; polling/manual refresh SHALL remain available.
4. Delayed, duplicated, out-of-order, or missing events SHALL not corrupt queue state.
5. Notification delivery failure SHALL not change the durable approval state.

### R7. Security, audit, and privacy

1. Requests, decisions, cancellations, expiry, supersession, and consumption SHALL be attributable and auditable.
2. Security-sensitive decisions SHALL preserve actor, target, action, scope, reason, timestamp, and correlation ID.
3. RLS SHALL default deny protected queue/history data and enforce current caller scope.
4. Service-role/background processing SHALL be server-only, narrowly scoped, and preserve original actor plus system executor where applicable.
5. Error responses SHALL distinguish safe forbidden/not-found behavior without revealing out-of-scope requests.
6. Logs/monitoring SHALL exclude tokens, credentials, unnecessary personal data, and full protected target payloads.

### R8. Offline behavior

1. Creating, reviewing, approving, rejecting, cancelling, expiring, and consuming approval requests SHALL be online-only.
2. Approval requests SHALL never enter the Tier 1 offline queue.
3. Cached queue data MAY be displayed as stale read-only information, but SHALL not enable a decision.
4. The UI SHALL clearly distinguish stale/cached, current pending, approved, and consumed states.

## 6. Acceptance criteria

- [ ] `08` can submit a versioned FIFO override request with reason and target snapshot.
- [ ] An authorized reviewer sees only scoped pending requests and can record one append-only approve/reject decision.
- [ ] Self-approval behavior follows the approved separation-of-duties decision.
- [ ] An approved decision cannot be consumed against a changed, stale, revoked, expired, or different target.
- [ ] The owning workflow, not the queue, performs the final mutation.
- [ ] Duplicate requests/decisions do not create duplicate state transitions.
- [ ] Realtime/notification failure does not hide durable requests or alter decisions.
- [ ] Approval operations are blocked offline and cannot enter the offline queue.
- [ ] RLS, audit, privacy, and real-Postgres tests pass before approval.

## 7. Dependencies and exclusions

- Depends on `02-rbac-roles` for capability identifiers, scope, RLS, session resolution, audit events, and separation-of-duties policy.
- Depends on `03-offline-mode-and-client-storage` for the explicit Tier 2 prohibition and stale-cache behavior.
- Depends on `04-services-and-infrastructure` for Auth, Realtime, notification/jobs, monitoring, idempotency, and runtime boundaries.
- Depends on `05-ui-shell-and-navigation` for the office route/layout, page header, loading/error, and responsive contracts.
- `08` owns FIFO/FEFO override request creation and consumption of the decision.
- Future workflow specs own their approval policies and target mutations.
- This feature may own approval request/decision persistence; it does not redefine core inventory or pricing tables.
