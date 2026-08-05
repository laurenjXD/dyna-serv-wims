# Offline Mode & Client Storage — Implementation Plan

Status: Draft

## Implementation gate

No offline queue, IndexedDB schema, service worker registration, sync endpoint, cache, or feature integration may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent.
- The Tier 1 operation allowlist is approved by the owning feature specs.
- `02-rbac-roles` approves the current-authorization replay contract.
- `04-services-and-infrastructure` approves the Auth, endpoint, monitoring, and background-sync boundaries.
- `05-ui-shell-and-navigation` reconciles the read-only connectivity/sync status contract.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Non-negotiable constraints

- Only explicitly approved Tier 1 operations may enter the queue.
- Approvals, pricing, FIFO allocation/override, RBAC management, billing close, write-offs, and other Tier 2 decisions remain online-only.
- Every replay is re-authenticated, re-authorized, scope-checked, business-state-checked, idempotent, and RLS-protected on the server.
- Cached state cannot mint authority or replace current server state.
- No `warehouse_id` is introduced; no core data tables are redefined in this spec.

## Implementation tasks

### 1. Resolve offline policy and ownership

Testing: Documentation review; no implementation tests.

- [ ] Enumerate every proposed Tier 1 operation with its owning feature, payload, resource references, required capability, ordering key, conflict policy, and retention period.
- [ ] Explicitly list all Tier 2 operations that must be blocked, including approvals, pricing, FIFO allocation/override, RBAC management, billing close, and write-offs.
- [ ] Agree whether v1 supports foreground/reconnect sync only or Service Worker background wake-up as well.
- [ ] Define logout, deactivation, revocation, device-sharing, browser-clearing, quota, and local-data retention behavior.
- [ ] Define whether rejected/conflicted operations are reviewed in a shared office surface or in owning feature screens.
- [ ] Reconcile the capability/session contract with `02-rbac-roles` and the server/runtime boundary with `04-services-and-infrastructure`.
- [ ] Reconcile `OfflineStatus` and user-facing status semantics with `05-ui-shell-and-navigation`.
- [ ] Record decisions that change cross-cutting policy in `specs/00-steering/revision-log.md`.

### 2. Establish the local storage boundary

Testing: Unit tests with `fake-indexeddb`; browser IndexedDB tests in Playwright; manual quota/clear behavior.

- [ ] Add the approved Dexie/fake-indexeddb dependencies through the project setup process.
- [ ] Define versioned stores for metadata, queue envelopes, allowlisted cache records, and redacted attention records.
- [ ] Add schema versioning and migrations that are additive or safely rebuildable without claiming unsynchronized work was preserved when it was not.
- [ ] Define indexes for queue state, creation time, ordering key, idempotency key, and resource references.
- [ ] Validate payload size, record size, schema version, and allowed fields before persistence.
- [ ] Keep tokens, passwords, service credentials, and unnecessary personal data out of all local stores.
- [ ] Implement bounded retention and explicit cleanup/quarantine for logout, deactivation, scope changes, expiry, and completed commands.
- [ ] Handle unavailable/corrupt/quota-exceeded IndexedDB with an honest persistence-failure state.

### 3. Implement Tier 1 command policy and admission

Testing: Unit tests (Vitest).

- [ ] Implement a fail-closed registry of approved, versioned Tier 1 operation policies.
- [ ] Validate operation type/version, payload, payload size, resource references, required capability reference, and idempotency key before queueing.
- [ ] Reject unknown operations, missing policies, invalid versions, Tier 2 classifications, and malformed payloads locally.
- [ ] Generate unique client operation IDs and idempotency keys without using them as authorization evidence.
- [ ] Persist queue state and the minimum local UI projection atomically.
- [ ] Test that a later capture cannot overwrite a distinct queued command.
- [ ] Add contract tests proving each owning feature supplies an explicit policy rather than relying on a generic “offline allowed” flag.

### 4. Implement connectivity and status coordination

Testing: Unit tests; Playwright online/offline event simulation; E2E status assertions.

- [ ] Implement the typed connectivity probe using browser events as hints plus an authoritative application-server probe.
- [ ] Implement status transitions for checking, offline, online, syncing, idle, and attention according to the approved contract.
- [ ] Coalesce reconnect, startup, visibility, and manual retry triggers into one sync coordinator run.
- [ ] Ensure connectivity changes do not clear local work or interrupt local capture.
- [ ] Expose the read-only status contract to the UI shell and feature surfaces without exposing queue internals unnecessarily.
- [ ] Ensure online status never enables Tier 2 operations and synchronization status never overclaims freshness.

### 5. Implement synchronization and replay

Testing: Unit tests; Playwright against real browser IndexedDB; integration tests against server command endpoints; real-Postgres integration where commands touch RLS/domain transactions.

- [ ] Implement a per-browser/tab sync lock and resumable coordinator.
- [ ] Refresh/validate the current Auth session before replay and stop safely when it is absent or revoked.
- [ ] Select commands by approved dependency/order key; default to serial replay until concurrency is proven safe.
- [ ] Submit versioned command envelopes to owning server endpoints with correlation and idempotency identifiers.
- [ ] Ensure server replay performs current authentication, capability, party/flow scope, domain-state, and RLS checks.
- [ ] Mark local commands only after durable authoritative acknowledgment.
- [ ] Implement bounded retry/backoff for transient failures and pause on connectivity loss.
- [ ] Handle lost responses and duplicate delivery through server idempotency behavior.
- [ ] Ensure revoked/deactivated actors' work is rejected, never reassigned or replayed under cached credentials.

### 6. Implement conflict, rejection, and recovery behavior

Testing: Unit tests; Playwright user flows; integration tests for authoritative response classes.

- [ ] Define typed result classes for accepted, duplicate, transient failure, authorization rejection, invalid payload, permanent failure, and domain conflict.
- [ ] Preserve redacted local attention records for rejected/conflicted commands.
- [ ] Provide retry only for retryable outcomes and explicit discard/manual-resolution actions for permanent outcomes.
- [ ] Ensure no generic merge silently combines quantities, inventory facts, locations, prices, approvals, or other domain decisions.
- [ ] Ensure feature-owned conflict handlers can return the user to the owning workflow without duplicating shell error handling.
- [ ] Test queue recovery after tab close, browser restart, service-worker wake-up where supported, and repeated network loss.

### 7. Integrate with shell and owning features

Testing: Type-check/build contracts; E2E smoke flows for representative floor and office surfaces; design-system review.

- [ ] Publish the `OfflineStatus` contract for `05-ui-shell-and-navigation` to consume.
- [ ] Add floor feedback patterns for locally saved, queued, syncing, accepted, rejected, and conflict states using approved icon/text/color semantics.
- [ ] Ensure scanner input readiness and one-primary-action floor rules are preserved during offline capture and replay.
- [ ] Add an office attention/review surface only if approved; otherwise document the owning feature responsibilities.
- [ ] Integrate one representative Tier 1 floor workflow end-to-end without making its domain rules generic.
- [ ] Add a negative integration test proving a representative Tier 2 action cannot be queued or accepted from offline state.
- [ ] Ensure feature specs do not duplicate the queue coordinator, storage schema, or shell connectivity indicator.

## Testing matrix

### Unit tests (Vitest)

- [ ] Queue envelope validation, versioning, size limits, idempotency, state transitions, and retention.
- [ ] Tier 1 policy allowlist and Tier 2 rejection.
- [ ] Connectivity and sync-status state machine.
- [ ] Retry/backoff classification and ordering-key selection.
- [ ] Redaction and safe diagnostic metadata.

### Integration tests

- [ ] Replay against authoritative server command endpoints with current session/capability/scope checks.
- [ ] Real-Postgres tests for any idempotency constraint, RLS policy, SQL function, or domain transaction introduced for replay; run migrations in order as required by `testing.md`.
- [ ] Verify revoked/deactivated actors and stale scopes cannot replay queued work.
- [ ] Verify duplicate delivery and lost acknowledgment do not duplicate business outcomes.

### E2E tests (Playwright)

- [ ] Simulate scanner keyboard input while offline and verify local persistence in real browser IndexedDB.
- [ ] Simulate reconnect, sync, retry, repeated network loss, tab reload, and browser restart.
- [ ] Verify Tier 2 controls are blocked offline and do not enter the queue.
- [ ] Verify accepted, rejected, conflict, transient failure, and permanent failure UX.
- [ ] Verify shell connectivity indicator distinguishes online from syncing/attention.
- [ ] Verify floor touch targets, contrast, text size, focus, portrait layout, press feedback, and reduced-motion behavior.
- [ ] Verify no protected payload, token, or unnecessary personal data is exposed in client logs or monitoring requests.

### Manual QA

- [ ] Run `offline-sync-reviewer` against the final policy, replay, and conflict design.
- [ ] Run `design-system-auditor` against floor feedback and shell integration.
- [ ] Test storage clearing/quota exhaustion and document the observed recovery path.
- [ ] Defer physical scanner, dead-zone, and fully closed-app backgrounding QA to the project-wide pre-launch hardware pass unless a feature-specific risk requires earlier validation.

## Sign-off

- [ ] Tier 1 allowlist and Tier 2 denylist are approved by owning feature/spec owners.
- [ ] Requirements and design are complete and internally consistent.
- [ ] All applicable tests pass, with database integration applicability explicitly recorded.
- [ ] `rbac-rls-reviewer` confirms replay cannot bypass current authorization or RLS.
- [ ] `offline-sync-reviewer` confirms no Tier 2 action leaks into the queue.
- [ ] Product owner approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
