# Approval Queue — Design

Status: Draft

## 1. Design intent

The Approval Queue is a durable decision subsystem with a shared office UI and workflow adapters. It stores requests and append-only decisions, exposes scoped review, and returns a typed decision reference to the owning workflow.

It is deliberately not a generic “approved” boolean attached to every business row. A decision is valid only for an approval type, exact target/version, authorized actors, current scope, and approved expiry/consumption rules.

## 2. Foundational dependencies

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, and `brand-design-system.md`.
- `02-rbac-roles` for resource/action/scope capabilities, current authorization, default-deny RLS, security events, and actor attribution.
- `03-offline-mode-and-client-storage` for the Tier 2 online-only boundary.
- `04-services-and-infrastructure` for Supabase Auth, Realtime, durable jobs/notifications, idempotency, monitoring, and service-role restrictions.
- `05-ui-shell-and-navigation` for the authenticated office shell and safe error/loading/empty states.
- `08-outgoing-withdrawal-and-two-stage-commitment` for the first FIFO override adapter.

The queue does not touch core inventory tables directly. It may reference target resource IDs and workflow snapshots, but `08` performs lot/reservation/transaction mutations. No `warehouse_id` is introduced.

## 3. Persistence model

The final table names and migration ownership must be reconciled with the approved core/infrastructure plan. The intended queue-owned tables are:

### `approval_requests`

Stores one durable request:

| Field group | Purpose |
|---|---|
| identity | Request UUID, public/reference number, idempotency key |
| classification | Approval type, owning workflow, requested action |
| target | Resource type, resource ID, target version/snapshot reference |
| scope | Party/flow scope reference evaluated by RBAC/RLS |
| requester | Auth user ID, created timestamp, reason |
| lifecycle | Pending/approved/rejected/cancelled/expired/superseded, expiry, consumed state |
| tracing | Correlation ID, source command/reference |

The target snapshot must be bounded and redacted. It is review evidence, not a duplicate authoritative target record.

### `approval_decisions`

Stores append-only decisions:

| Field group | Purpose |
|---|---|
| request | Approval request reference and target/version |
| actor | Reviewer Auth user ID and effective capability context reference |
| decision | Approved/rejected, timestamp, reason/comment |
| validity | Decision expiry/version where applicable |
| consumption | Consumer workflow, consumed timestamp, resulting transaction/reference |
| tracing | Correlation ID and source request |

No update/delete path is available to ordinary users or administrators for historical decisions. If a correction is required, a new compensating/audit event is recorded.

Whether `consumed_at` belongs on the request, decision, or a separate consumption relation is an open schema decision. The invariant is that a decision cannot be consumed twice.

## 4. Approval policy registry

Each workflow registers a server-side policy conceptually shaped as:

```ts
type ApprovalPolicy = {
  type: string;
  requestedAction: string;
  requesterCapability: string;
  reviewerCapability: string;
  targetVersion: string;
  requiresReason: boolean;
  selfApproval: "blocked" | "allowed";
  expiry: "required" | "optional";
  validateRequest(input: unknown): Result;
  canReview(context: AuthorizationContext, request: ApprovalRequest): Result;
  canConsume(decision: ApprovalDecision, currentTarget: unknown): Result;
};
```

The final capability/context types come from `02`. Unknown policies fail closed. The registry contains no role-name conditionals and cannot make a business mutation itself.

The initial `fifo_override` policy:

- is submitted by the withdrawal/allocation workflow in `08`;
- identifies the pick/request, item, lot/location plan, quantity, reason, and target version;
- is reviewed by a capability specific to FIFO override approval;
- is consumed only by the current `08` commitment command after rechecking current availability/order/commitment state.

## 5. State machine and concurrency

```text
pending
  ├── approve → approved → consume → consumed
  ├── reject  → rejected
  ├── cancel  → cancelled
  ├── expire  → expired
  └── supersede → superseded
```

The queue command uses a server transaction with a current-state/version predicate. Concurrent reviewers race on the same pending version; one valid terminal decision succeeds and the other receives a stale/already-decided result.

Approval and consumption are separate because approval delivery/realtime may be delayed and the target may change. The consumer rechecks the decision and target in the same transaction that performs the owning business mutation when feasible.

## 6. Authorization and RLS design

The request path is:

```text
Auth session
  → current capabilities + party/flow scope
  → policy validation
  → target authorization/current-state check
  → request/decision command
  → RLS-backed persistence
```

Review visibility is derived from current reviewer capability and request scope. A client-supplied `party_id`, reviewer role, or target reference can identify a requested row but cannot authorize it.

RLS requirements:

- default deny on request and decision tables;
- requester can view their own requests only where the policy permits;
- reviewers can view pending requests matching their current approval capability/scope;
- audit readers can view history through a separate capability;
- ordinary users cannot update/delete decisions;
- service-role jobs cannot substitute for interactive reviewer authorization;
- party users cannot infer unrelated requests through counts, filters, realtime, or errors.

The final policy matrix is reviewed by `rbac-rls-reviewer` and tested against separate authenticated identities in real Postgres.

## 7. Queue UI and shell integration

Provisional routes:

```text
app/(authenticated)/
  approvals/
    page.tsx                    # pending/review queue
    [approvalId]/page.tsx       # request detail and history
```

The queue is an office surface under `05`:

- desktop may use a list/table plus detail panel;
- mobile remains a stacked list/detail flow with no required horizontal scrolling;
- one primary decision action is emphasized at a time, with rejection/secondary actions clearly separated;
- pending/stale/approved/rejected/expired states use text/icon/status semantics, not color alone;
- loading, empty, stale, forbidden, and error states are recoverable;
- decision forms require accessible reason/comment fields when policy requires them.

The UI may optimistically refresh presentation after a decision, but the server response is authoritative. A stale request shows that it must be refreshed; it does not present an approval button that can succeed against an old target.

## 8. Realtime, notifications, and fallback

New pending requests and decision changes may publish minimal scoped events. The event contains a request/reference and status signal, not a full protected target snapshot. The client refetches the authoritative request after an event.

If Realtime or email fails:

- the request remains durable and reviewable by polling/manual refresh;
- approval state does not roll back;
- the infrastructure retry/dead-letter path records delivery failure;
- a reviewer is not told an action is complete based only on notification delivery.

## 9. Offline and downstream integration

Approval requests, review, approval/rejection, cancellation, and consumption are Tier 2. They do not enter the offline queue and cannot use cached capabilities.

`08` integrates by submitting a `fifo_override` request and consuming a decision reference. Future features integrate by registering an approval policy and defining the target-version/current-state contract. No feature may accept “approved” merely because a request ID appears in a client form.

## 10. Design verification before approval

- [ ] Confirm table ownership/names, retention, idempotency, and append-only decision representation.
- [ ] Confirm capability identifiers, scope, self-approval, expiry, and separation-of-duties rules with `02`.
- [ ] Confirm FIFO override payload/current-state/consumption checks with `08`.
- [ ] Confirm notification/RealtIme scope and fallback with `04`/`14` if notifications are split out.
- [ ] Confirm queue routes and office responsive/error patterns with `05`.
- [ ] Run `rbac-rls-reviewer` and `design-system-auditor` before approval.
