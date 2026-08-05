# Offline Mode & Client Storage — Requirements

Status: Draft

## 1. Purpose and scope

Offline mode keeps approved warehouse-floor work usable during temporary connectivity loss without creating a second source of truth or granting authority from cached client state. It provides local storage, an explicit Tier 1 queue, reconnect synchronization, conflict handling, and safe user feedback.

The server remains authoritative for identity, authorization, inventory state, approvals, pricing, FIFO allocation, and audit outcomes.

## 2. Core principles

- Offline availability is an explicit allowlist, not a general fallback for every mutation.
- Cached data is a read model and work aid, not an authority token.
- Every queued operation is re-authenticated, re-authorized, scope-checked, business-state-checked, and RLS-checked during synchronization.
- Queue replay is idempotent and safe to retry.
- Failed or rejected work is visible and recoverable; it is never silently discarded.
- The UI distinguishes network connectivity from synchronization state.
- One physical warehouse is assumed; no `warehouse_id` is introduced.

## 3. Tier classification

### Tier 1 — candidates for offline operation

Only operations explicitly approved here and by their owning feature spec may be queued. The initial candidate set is:

- scan/input capture that records an operator observation for a supported floor workflow;
- draft receiving, inspection, putaway, or pick-execution observations where the owning feature explicitly defines offline safety;
- local navigation and viewing of previously cached, scope-appropriate reference data;
- capture of an offline error/exception note attached to an already authorized workflow, where the owning feature allows it.

These candidates are not automatically approved merely because they appear in this list. Each must name its payload, owning feature, authorization requirement, idempotency key, conflict policy, and server endpoint before it becomes queueable.

### Tier 2 — never accepted solely from offline state

The following SHALL remain online-only unless a future approved revision explicitly changes the policy:

- approval or rejection decisions;
- pricing, price override, or trading document finalization;
- FIFO/FEFO allocation or override;
- RBAC/user/party-scope management;
- billing, period close, or accounting finalization;
- destructive inventory reconciliation or write-off decisions;
- any action requiring current global availability, current authorization, or an irreversible privileged decision.

An online UI may still render these controls only when the current server state and capability permit them. Cached UI state must not enable them offline.

## 4. Functional requirements

### R1. Connectivity and mode detection

1. The client SHALL detect browser online/offline transitions and SHALL expose the state through a shared typed status contract.
2. The client SHALL treat `navigator.onLine` as a connectivity hint, not proof that the application server is reachable.
3. The client SHALL distinguish connectivity (`online`, `offline`, `checking`) from synchronization (`idle`, `syncing`, `attention`); `idle` SHALL NOT be presented as proof that every cached record is current.
4. The shell MAY display this status as an informational indicator. It SHALL not label data as synchronized merely because the browser reports online.
5. Connectivity changes SHALL not clear local queue data or interrupt an in-progress local capture.

### R2. Local data and storage

1. Approved offline data SHALL be stored in browser-managed local storage using the approved IndexedDB/Dexie boundary.
2. Cached records SHALL be limited to the minimum fields, records, and retention period required by an approved floor workflow.
3. Cached data SHALL be partitioned by authenticated user/session scope and workflow/resource scope where required.
4. Sensitive tokens, passwords, service credentials, or durable authority claims SHALL not be stored in the offline database.
5. Local records SHALL have schema versions and a migration/clear strategy.
6. The application SHALL handle unavailable, corrupted, quota-exceeded, and cleared browser storage without claiming that offline work was persisted.
7. Logout, account deactivation, and security-sensitive scope changes SHALL trigger the approved local-data cleanup or quarantine behavior.

### R3. Queue admission

1. A mutation SHALL enter the offline queue only if its owning feature marks it as an approved Tier 1 operation.
2. Queue admission SHALL validate payload shape, size, required identifiers, workflow classification, and an idempotency key before persistence.
3. The queue SHALL reject Tier 2 operations locally with an actionable online-required message.
4. The queue SHALL record the authenticated actor/session reference available at capture time without treating it as sufficient authorization.
5. Queue records SHALL include operation type/version, creation time, client-generated idempotency key, payload, retry metadata, and a state such as queued, syncing, succeeded, rejected, conflict, or failed.
6. A queue record SHALL never be silently overwritten by a later capture with a different operation identity.

### R4. Synchronization and replay

1. Synchronization SHALL run on reconnect, app startup/visibility restoration, and an explicit user refresh/retry action where supported.
2. Synchronization SHALL use the approved server endpoint/command for the owning feature; the client SHALL not write directly to arbitrary tables.
3. The server SHALL re-authenticate and re-authorize every queued operation against current session, capability, party/flow scope, business state, and RLS.
4. The server SHALL use the idempotency key to make duplicate replay safe.
5. Replay SHALL preserve operation ordering where operations share a workflow/resource dependency; independent operations MAY be synchronized concurrently only when the design proves that safe.
6. A successful replay SHALL be acknowledged durably before the local record is removed or marked complete.
7. A lost response SHALL be retried safely rather than blindly creating a second business outcome.
8. The sync process SHALL be bounded, resumable, and safe to pause when connectivity is lost again.

### R5. Rejection, conflict, and recovery

1. The server SHALL distinguish authentication failure, authorization failure, invalid payload, stale business state, conflict, transient failure, and permanent failure where the owning workflow can do so safely.
2. Revoked/deactivated users' queued operations SHALL be rejected and logged; they SHALL not be replayed under another user.
3. Conflict or rejection SHALL retain enough redacted local context for the user to understand what needs attention without exposing protected data outside scope.
4. The user SHALL be able to retry only retryable failures, discard a local operation only through an explicit action, and return to the owning workflow when manual resolution is needed.
5. The system SHALL not automatically merge conflicting inventory facts, quantities, locations, prices, or approvals without a feature-specific approved rule.
6. A permanent rejection SHALL not be represented as successful local completion.

### R6. Security and privacy

1. Offline state SHALL never mint, extend, or substitute for an Auth session.
2. Cached capabilities SHALL be treated as stale presentation data and SHALL not authorize a Tier 2 action or final server outcome.
3. Local storage and sync logs SHALL exclude passwords, access tokens, service credentials, and unnecessary personal data.
4. Sync diagnostics SHALL use correlation IDs and redacted metadata; payloads and protected records SHALL not be sent to Sentry unless explicitly approved and minimized.
5. A user with revoked access SHALL lose the ability to replay queued work when the server is reached.
6. The design SHALL document the residual risk of data remaining in a browser after device sharing, browser clearing, or theft and the approved mitigation.

### R7. User experience

1. Floor screens SHALL clearly communicate whether a capture is saved locally, queued, syncing, accepted, rejected, or requires attention.
2. The interface SHALL provide one obvious next action during a floor flow and SHALL not force a warehouseman to inspect a dense queue table to continue work.
3. Offline feedback SHALL use icon/text/state semantics in addition to color and SHALL follow the brand-design-system touch, contrast, typography, and motion rules.
4. Sync feedback SHALL not block scanner input or local capture longer than necessary.
5. Office users SHALL have an appropriate queue/attention view when their workflow owns review of rejected or conflicted operations.
6. The shell's connectivity indicator consumes this spec's read-only status contract; it does not own queue replay or conflict resolution.

### R8. Observability and audit

1. Every sync attempt SHALL have a correlation identifier.
2. The system SHALL record safe operational metrics for queue depth, age, replay success, retry, rejection, conflict, and permanent failure.
3. Business audit records SHALL be created by the owning server transaction, not fabricated by the client.
4. Offline capture and replay events SHALL preserve the original actor and client operation identity when the server records the business outcome.
5. Monitoring alerts SHALL distinguish a client-storage problem, connectivity outage, authorization rejection, and domain conflict.

## 5. Acceptance criteria

- [ ] An approved Tier 1 operation can be captured with simulated scanner keyboard input while offline and is visibly stored locally.
- [ ] A Tier 2 operation is blocked offline and cannot enter the queue.
- [ ] Reconnect/sync re-authorizes queued work using current server state and rejects revoked/deactivated actors safely.
- [ ] Duplicate delivery or lost acknowledgment does not create duplicate business outcomes.
- [ ] Conflict, rejection, retryable failure, and permanent failure are distinguishable and recoverable.
- [ ] Browser storage failure/quota loss is communicated honestly and does not claim persistence.
- [ ] The shell receives a connectivity/sync status without conflating online status with synchronization.
- [ ] Unit, Playwright, and any required real-Postgres tests in `tasks.md` pass before approval.

## 6. Dependencies and exclusions

- `02-rbac-roles` owns the capability/session contract and requires Tier 1 replay re-authorization; this spec owns queue mechanics, not the role model.
- `04-services-and-infrastructure` owns runtime, Auth, monitoring, and server endpoint boundaries; this spec must align its worker/retry approach with the approved infrastructure design.
- `05-ui-shell-and-navigation` consumes the read-only connectivity/sync status contract and owns shell presentation; this spec owns the state semantics.
- Owning feature specs define exactly which Tier 1 operations are safe and how domain conflicts are resolved.
- No core database table is redefined here. Server-side mutations use the tables and transactions of their owning feature specs.
