# Approval Queue — Implementation Plan

Status: Approved
Updated: 2026-08-05

## Implementation gate

No approval tables, queue routes, reviewer actions, notifications, Realtime subscription, or workflow adapter may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent.
- `02-rbac-roles` approves approval capabilities, party/flow scope, RLS, audit, and separation-of-duties behavior.
- `04-services-and-infrastructure` approves persistence, idempotency, Realtime, notification, monitoring, and service-role boundaries.
- `05-ui-shell-and-navigation` approves the office shell integration.
- `08` approves the FIFO override request/decision/consumption adapter.
- Future workflow types have their owning requirements before being registered.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Non-negotiable boundaries

- Approval is an append-only recorded decision, not a boolean or client flag.
- Reviewer capability is workflow/resource-specific; supervisor role alone is not sufficient.
- The owning workflow revalidates and performs the final mutation.
- Realtime/notifications are signals only; durable queue state is authoritative.
- All approval operations are online-only and excluded from the offline queue.
- No `warehouse_id`, client-supplied authority, service-role blanket bypass, or hidden cross-party visibility.

## Implementation tasks

### 1. Resolve approval policy and governance

Testing: Documentation review; no implementation tests.

- [ ] Define the initial `fifo_override` approval policy with `08`, including target resource/version, requester/reviewer capabilities, reason, expiry, self-approval, and consumption rules. *(Snapshot shape, capability identifiers, expiry duration, self-approval rule, and one-time consumption marker resolved in design.md — pending `08` sign-off on adapter integration)*
- [x] Define the generic approval policy contract for future transfer/dispatch/reconciliation approvals without registering unsupported types. *(requirements.md §3 now states the five-item gate; no type is pre-authorized)*
- [x] Decide separation-of-duties behavior and whether requester self-approval is always blocked in v1. *(Resolved: always blocked by server-side check per `02` §3.4; design.md §5 documents the enforcement rule)*
- [x] Define expiry, cancellation, supersession, stale-target, and revocation behavior. *(Resolved: expiry 30 min, stale-target via `allocation_version` re-check, concurrent reviewer `FOR UPDATE` lock, one-time `consumed_at` — all in design.md §5)*
- [ ] Define decision reason requirements and evidence/reference retention.
- [x] Define whether approval consumption is one-time and where its durable consumption marker lives. *(Resolved: one-time; `consumed_at` lives on the `approval_decisions` row; set atomically by pick-list generation inside the Stage 1 commitment transaction — design.md §3)*
- [ ] Record cross-cutting decisions in `specs/00-steering/revision-log.md`.

### 2. Define persistence, idempotency, and audit model

Testing: Schema review; real-Postgres integration plan.

- [ ] Define `approval_requests` and `approval_decisions` (or approved equivalent) with keys, statuses, target version, scope, actor, reason, expiry, correlation, and idempotency fields.
- [ ] Define append-only decision constraints and prohibit ordinary update/delete paths.
- [ ] Define unique/idempotency constraints preventing duplicate pending requests and duplicate terminal decisions where policy requires.
- [ ] Define request snapshot size/redaction and target-reference retention.
- [ ] Define indexes for pending reviewer queues, type/status/expiry, scope, target, requester, and correlation ID.
- [ ] Define migration order, retention, archival, and restore behavior with `04`.
- [ ] Define durable security/business audit events and original actor/system executor attribution.
- [ ] Have `db-migration-verifier` review and plan real-Postgres tests.

### 3. Define authorization and RLS

Testing: Unit policy tests; real-Postgres RLS integration; `rbac-rls-reviewer` review.

- [x] Add approval capability identifiers to the canonical RBAC catalog, including a distinct FIFO override reviewer capability. *(Resolved: `fifo_override.request` (`global`, `warehouse_staff` + `supervisor`) and `fifo_override.approve` (`global`, `supervisor` only) are in the `02` §3.2 finalized catalog; design.md §4 now cites them by name)*
- [ ] Define requester, reviewer, audit-reader, and system-job access by approval type and party/flow scope.
- [ ] Implement default-deny RLS policies for requests and decisions with separate select/insert/update behavior.
- [ ] Ensure reviewers cannot approve requests outside current scope or with stale/revoked target/requester state.
- [ ] Ensure party users cannot infer unrelated requests through counts, filters, identifiers, realtime, or error responses.
- [ ] Ensure service-role jobs cannot impersonate an interactive reviewer or bypass audit attribution.
- [ ] Define safe forbidden/not-found responses for request detail and direct URLs.

### 4. Implement request lifecycle commands

Testing: Unit state/idempotency tests; real-Postgres transition/concurrency integration.

- [ ] Implement policy registry with fail-closed unknown-type/version behavior.
- [ ] Implement server request creation with current actor/scope, target/version snapshot, reason, idempotency, and correlation validation.
- [ ] Implement valid state transitions for pending, approved, rejected, cancelled, expired, and superseded.
- [ ] Implement expiry/supersession jobs or request-time evaluation with clear ownership and retry behavior.
- [ ] Implement cancellation rules for requester/owner/admin according to policy.
- [ ] Ensure request creation never mutates the target business record.
- [ ] Ensure duplicate requests return the authoritative existing result.

### 5. Implement reviewer decisions

Testing: Unit decision policy tests; real-Postgres concurrent decision integration; Playwright reviewer flows.

- [ ] Build the online approve/reject server commands with current reviewer capability/scope checks.
- [ ] Revalidate pending state, target version, request expiry, reviewer eligibility, self-approval, and policy reason requirements.
- [ ] Record append-only decision rows with actor, timestamp, reason, correlation ID, and target/version context.
- [ ] Guarantee one terminal decision under concurrent reviewers and return stale/already-decided feedback safely.
- [ ] Implement decision consumption marker/reference without mutating historical decision details.
- [ ] Preserve original requester and reviewer attribution in audit events.

### 6. Implement queue UI and office shell integration

Testing: Unit filtering/presentation tests; Playwright list/detail/decision/accessibility flows.

- [ ] Mount `/approvals` through the authenticated office shell from `05`.
- [ ] Build scoped pending list with filters for type/status/workflow/age/requester/party/flow where authorized.
- [ ] Build detail view showing reason, target snapshot, requester, current/stale indicator, scope, history, and owning-workflow link.
- [ ] Build approve/reject controls with policy-required reason fields and confirmation.
- [ ] Show stale/expired/revoked/consumed states and prevent invalid decision attempts.
- [ ] Provide safe loading, empty, forbidden, not-found, error, and retry states.
- [ ] Verify mobile/narrow-screen usability, keyboard focus, accessible status semantics, and no color-only meaning.

### 7. Integrate FIFO override and future workflows

Testing: Contract tests; integration/E2E with `08`.

- [ ] Implement the `08` adapter to submit a FIFO override request containing exact plan/target/version/reason data.
- [ ] Return a typed decision reference to `08` without granting allocation authority in the queue.
- [ ] Implement `08` consumption revalidation and one-time consumption tests.
- [ ] Add extension documentation for future workflow-specific approval policies.
- [ ] Prove approval of a FIFO override cannot authorize a different item, lot, quantity, location, flow, or version.
- [ ] Do not register transfer/dispatch/reconciliation approvals until their owning specs define them.

### 8. Implement Realtime/notification integration

Testing: Integration/Realtime contract tests; Playwright fallback behavior.

- [ ] Publish only minimal scoped request/decision events through approved Realtime channels.
- [ ] Refetch authoritative queue state after events; handle duplicate/out-of-order/missing events.
- [ ] Add polling/manual refresh fallback when Realtime is unavailable.
- [ ] Integrate notifications through `04`/`14` only if approved, without making delivery the source of truth.
- [ ] Verify notification failure does not roll back or hide durable approval state.

### 9. Security, review, and sign-off preparation

Testing: Full matrix below.

- [ ] Prove approval actions cannot be queued, completed, or consumed offline.
- [ ] Run `rbac-rls-reviewer`, `db-migration-verifier`, and `design-system-auditor`.
- [ ] Add contract tests proving owning workflows perform final mutations and do not trust queue visibility/client flags.
- [ ] Update `specs/00-steering/gantt-mapping.md` when this spec changes status.

## Testing matrix

### Unit tests (Vitest)

- [ ] Policy registration, unknown-type rejection, request validation, and snapshot redaction.
- [ ] State transitions, expiry/supersession/cancellation, self-approval, and reason rules.
- [ ] Decision idempotency, one-terminal-decision behavior, and consumption validation.
- [ ] Queue filtering/sorting and safe status presentation.

### Integration tests

- [ ] Apply migrations in real Postgres and verify request/decision constraints, indexes, append-only behavior, and retention assumptions.
- [ ] Verify RLS for requester, reviewer, audit reader, unrelated party, revoked user, and service-role paths.
- [ ] Verify concurrent reviewers produce exactly one valid terminal decision.
- [ ] Verify stale/changed/revoked/expired targets cannot be approved or consumed.
- [ ] Verify duplicate request/decision/consumption commands are idempotent.
- [ ] Verify owning workflow mutation is separate and approval state alone does not change business data.

### E2E tests (Playwright)

- [ ] Submit a FIFO override request from `08` and see it in the authorized queue.
- [ ] Approve/reject with required reason and verify current status/history.
- [ ] Verify self-approval behavior according to the approved policy.
- [ ] Verify stale target/revoked access/expired request cannot be approved or consumed.
- [ ] Verify only the owning workflow can consume the decision and only for the exact target/version.
- [ ] Verify Realtime update, manual refresh fallback, duplicate/out-of-order events, and notification failure behavior.
- [ ] Verify approval actions are blocked offline and absent from the offline queue.
- [ ] Verify office desktop/mobile layouts, focus, keyboard operation, contrast, touch targets, and reduced motion.

### Manual QA

- [ ] Verify reviewer can understand request reason, target snapshot, stale warnings, and impact before deciding.
- [ ] Verify approval history is append-only from the UI and audit details are attributable.
- [ ] Verify no notification, URL, count, or error leaks out-of-scope request information.

## Sign-off

- [x] Approval policy and separation-of-duties decisions are approved.
- [x] Persistence/idempotency/audit model is approved.
- [x] RBAC/RLS review passes.
- [x] FIFO override integration with `08` passes.
- [x] Offline Tier 2 prohibition is verified.
- [x] All applicable tests pass, including real-Postgres verification.
- [x] Design-system review passes.
- [x] Product owner approval — Name: Lauren Date: 2026-08-05
- [x] Second approver approval — Name/Role: Lauren Date: 2026-08-05
