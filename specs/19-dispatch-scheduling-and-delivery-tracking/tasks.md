# Dispatch Scheduling & Delivery Tracking — Implementation Plan

Status: Draft

## Implementation gate

No dispatch/schedule/delivery tables, routes, state handlers, carrier integrations, approval wiring, notification producers, or delivery-status code may be implemented until `requirements.md` and `design.md` are approved, the `08`/`09`/`10`/`14`/`18` contracts are reconciled, and both sign-offs below are complete. Planning documentation is permitted while this feature remains Draft; application code is not.

## Dependencies and aligned boundaries

- `01` owns canonical parties/items/lots/locations/pick lists and immutable inventory transactions.
- `02` owns capabilities, party/flow scope, RLS, revocation, and audit authority.
- `03` owns online/offline and stale/replay behavior.
- `04` owns Auth, jobs, Realtime, external integrations, Storage, retries, rate limits, and telemetry.
- `05` owns authenticated dispatch routes, shell, responsive behavior, and status feedback.
- `08` owns final physical dispatch, reservation release, inventory decrement, and `inventory_transaction(pick)`.
- `09` owns approval decisions; `19` owns dispatch state and exact approval consumption.
- `10` owns priced documents, artifacts, printing, and reprinting.
- `14` owns notification routing/delivery; `19` publishes approved events only.
- `16` owns reporting metric definitions; `18` owns packing readiness and package truth.
- `12`/`13` own VMI billing and Trading price semantics.

## 1. Resolve dispatch and delivery policy

Testing: operations, dispatch, carrier, privacy, finance, and product review; revision-log update.

- [ ] Approve the dispatch-plan, schedule, delivery, exception, and transition vocabulary.
- [ ] Define the exact `18` packed-ready and `08` final-dispatch event/source contracts.
- [ ] Decide when dispatch approval is mandatory, which conditions may bypass it, and the `09` capability/approval policy.
- [ ] Define carrier/service, vehicle, driver/operator, destination, contact, time-window, and tracking-reference ownership.
- [ ] Define reschedule, cancellation, reassignment, delay, failed attempt, return, and post-dispatch correction policy.
- [ ] Decide proof-of-delivery scope, signature/file requirements, private Storage, retention, and privacy.
- [ ] Define offline field-observation policy, event ordering, integration retry/idempotency, and timezone/as-of behavior.
- [ ] Define initial `14` notification events/recipients and `16` reporting metrics/owners.
- [ ] Record decisions in `specs/00-steering/revision-log.md`.

## 2. Reconcile schema and source/event contracts

Testing: cross-feature schema/event review; `db-migration-verifier`; real-Postgres plan.

- [ ] Reconcile dispatch readiness with `18` packing session/package/version fields.
- [ ] Reconcile final dispatch eligibility and outcome consumption with `08`; verify `19` cannot write the pick ledger.
- [ ] Define dispatch/schedule/delivery tables or read models, indexes, version fields, RLS, retention, and append-only event history.
- [ ] Define typed approval request/decision linkage with `09`.
- [ ] Define private document/tracking references and safe `10` artifact links.
- [ ] Define normalized carrier/provider event contract and integration adapter boundary through `04`.
- [ ] Confirm no schema introduces `warehouse_id`, a second inventory ledger, competing document/pricing state, or delivery status as inventory truth.

## 3. Implement authorization-safe scheduling and approval

Testing: unit scope/transition tests; real-Postgres RLS/concurrency tests; `rbac-rls-reviewer` review.

- [ ] Add approved dispatch schedule/status/history capabilities to the RBAC catalog.
- [ ] Implement readiness validation from current `18`/`08` source versions and party/flow scope.
- [ ] Implement schedule create/reschedule/cancel/assignment commands with optimistic concurrency and idempotency.
- [ ] Implement exact versioned approval requests to `09` where required; reject stale/revoked/mismatched decisions.
- [ ] Add audit events for schedule changes, approvals requested/consumed, assignments, status transitions, denied actions, and failures.
- [ ] Implement safe totals/search/filter/error behavior that cannot reveal unrelated party shipments.

## 4. Implement final dispatch and delivery lifecycle integration

Testing: integration with `08`/`18`; state-machine and provider adapter tests.

- [ ] Supply approved schedule/readiness context to `08` without duplicating final dispatch authority.
- [ ] Consume `08` final-dispatch events idempotently and transition the `19` plan only after authoritative confirmation.
- [ ] Implement scheduled/dispatched/in-transit/attempted/delivered/delayed/failed/returned transitions with legal-state and event-order validation.
- [ ] Record immutable milestone history with source/provider references, timestamps, actor/executor, reason, version, and correlation ID.
- [ ] Implement explicit exception/recovery/retry handling; never silently overwrite history or claim completion after a failure.
- [ ] Add proof-of-delivery only if the approved policy and private Storage contract are complete.

## 5. Build dispatch board and delivery surfaces

Testing: Playwright, accessibility, responsive, and manual operations QA.

- [ ] Build readiness queue with packed/source status, approval state, schedule, party/destination, package summary, and safe document links.
- [ ] Build schedule create/edit/reschedule/cancel and assignment surfaces with conflict and stale-state feedback.
- [ ] Build delivery timeline/history with explicit status text/icons, event timestamps, source, and exception reasons.
- [ ] Build party-safe tracking view without internal notes, cost/margin, unrelated records, or unrestricted provider data.
- [ ] Preserve office desktop utility and mobile/field usability; do not present `19` status as inventory completion.

## 6. Implement notifications, reporting, offline, and integration behavior

Testing: contract tests with `14`/`16`; offline/replay, reconnect, provider outage, and job retry tests.

- [ ] Publish approved schedule/readiness/dispatch/delay/attempt/failure/return/delivery events to `14` with minimal scoped payloads.
- [ ] Publish versioned delivery metrics/events to `16` with owner, definition, source watermark, and as-of metadata.
- [ ] Keep notification delivery and reporting projections non-authoritative and failure-isolated.
- [ ] If approved, register only delivery observations in the `03` Tier 1 queue; replay must reauthorize, revalidate ordering, and be idempotent.
- [ ] Add Realtime invalidation, manual refresh, stale indicators, external-provider retries, and operator-visible dead-letter/attention handling.

## 7. End-to-end verification and approval readiness

- [ ] Verify only `18` packed-ready/current `08` sources can enter scheduling.
- [ ] Verify dispatch approval is exact and `09`-owned where required.
- [ ] Verify `08` alone decrements inventory and writes the immutable `pick` transaction.
- [ ] Verify delivery events cannot alter inventory, pricing, billing, pick-list, or acknowledgement-receipt content.
- [ ] Verify valid transition ordering, duplicate/out-of-order/provider retry behavior, and explicit exception history.
- [ ] Verify no cross-party discovery through boards, totals, filters, status APIs, notifications, reports, documents, or URLs.
- [ ] Verify offline/stale behavior, accessibility, responsive layout, privacy, integration failure, and audit retention.
- [ ] Run Vitest, real-Postgres, integration/job, Playwright, manual, and operational reconciliation checks.

## Sign-off

- [ ] Dispatch/delivery state machine, source contracts, approval policy, carrier fields, and proof-of-delivery policy approved.
- [ ] `08`, `09`, `10`, `14`, `16`, and `18` contracts reconciled and versioned.
- [ ] `02`, `03`, and `04` authorization/offline/infrastructure contracts verified.
- [ ] Tests, privacy, accessibility, provider failure, and operational QA pass.
- [ ] Product/operations approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
