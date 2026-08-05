# Offline Mode & Client Storage — Design

Status: Draft

## 1. Design intent

Offline mode is a constrained client-side continuity layer for warehouse floor work. It stores approved local inputs, queues only explicit Tier 1 commands, and replays them through authoritative server boundaries when connectivity returns.

The architecture deliberately avoids an offline replica of PostgreSQL and avoids treating cached permissions or inventory as authority. The server remains the source of truth for authorization, inventory, workflow state, approvals, pricing, FIFO/FEFO allocation, billing, and audit records.

## 2. Foundational dependencies

This design depends on:

- `specs/00-steering/tech.md` for the Next.js 15/Supabase/Drizzle stack and the unstable-offline warning.
- `specs/00-steering/structure.md` for `/lib/offline`, canonical naming, and the single-warehouse constraint.
- `specs/00-steering/testing.md` for Dexie/fake-indexeddb, browser IndexedDB, online/offline event simulation, and deferred physical QA.
- `specs/00-steering/brand-design-system.md` for floor-first feedback and touch/contrast/motion rules.
- `02-rbac-roles` for live session/capability/scope checks during replay. Its requirement that queued Tier 1 work be re-authorized is binding; its final role model remains unstable.
- `04-services-and-infrastructure` for Auth/session, server execution, observability, and outage/runbook boundaries.
- `05-ui-shell-and-navigation` for the shell's read-only connectivity indicator and the boundary between shell feedback and feature feedback.

This feature does not redefine tables from `01-core-data-model`. It may use local IndexedDB stores and server endpoints owned by feature specs. No `warehouse_id` is introduced.

## 3. Architecture overview

```text
Floor feature
   │ approved Tier 1 command
   ▼
Offline policy + payload validator
   ├── online: authoritative server command
   └── offline: Dexie queue + local projection
                         │
             reconnect/startup/visibility/manual retry
                         ▼
                  Sync coordinator
                         │ current Auth session
                         ▼
                 Server command endpoint
          auth + capability + scope + domain + RLS
                         │
                idempotent business transaction
                         ▼
              result / rejection / conflict
                         │
              local state + feature feedback
```

The client never sends arbitrary table mutations. Each queueable command is owned by a feature and maps to a versioned server command with an explicit Tier 1 classification.

## 4. Client storage model

The approved implementation direction is IndexedDB through Dexie, subject to final infrastructure/package approval. The conceptual local stores are:

### `offline_meta`

Stores schema version, device/browser instance identifier, last connectivity probe, last sync attempt, and safe aggregate status. It contains no credentials.

### `offline_queue`

Stores one durable command envelope per client operation:

```ts
type OfflineCommandEnvelope = {
  id: string;
  operationType: string;
  operationVersion: number;
  tier: 1;
  idempotencyKey: string;
  actorUserIdAtCapture?: string;
  scopeSnapshot?: { partyIds?: string[]; flowTypes?: string[] };
  resourceRefs: string[];
  payload: unknown;
  createdAt: string;
  lastAttemptAt?: string;
  attemptCount: number;
  state: "queued" | "syncing" | "succeeded" | "rejected" | "conflict" | "failed";
  lastErrorCode?: string;
  safeErrorMessage?: string;
};
```

The final scope fields must be reconciled with RBAC and feature ownership. A snapshot helps explain a rejected item but never grants current access.

### `offline_cache`

Stores minimal, explicitly allowlisted reference/workflow data needed to keep an approved floor screen usable. Every record has an owner scope, schema version, cached-at timestamp, and expiry/refresh policy. The cache is not a second authoritative inventory ledger.

### `offline_feedback`

Stores redacted user-facing attention records for rejected/conflicted operations when the queue envelope alone is insufficient. It must not become a duplicate audit log.

## 5. Command and policy contract

Each owning feature supplies an offline policy conceptually shaped as:

```ts
type OfflineOperationPolicy = {
  operationType: string;
  version: number;
  tier: 1;
  maxPayloadBytes: number;
  requiredCapability: string;
  validatePayload(payload: unknown): Result;
  resourceRefs(payload: unknown): string[];
  orderingKey(payload: unknown): string;
  conflictPolicy: "reject-and-review" | "feature-defined";
};
```

This contract is provisional until the RBAC capability type and feature command interfaces are approved. A policy registry must fail closed: unknown operations, missing versions, invalid payloads, and any tier other than explicitly approved Tier 1 are rejected locally.

The policy registry must not contain approval, pricing, FIFO override/allocation, RBAC management, billing close, write-off, or other Tier 2 operations.

## 6. Synchronization lifecycle

### Capture

1. The feature validates the input and asks the offline policy whether the command is queueable.
2. The client creates a cryptographically strong client operation ID and idempotency key.
3. The command is persisted atomically with the local UI state needed to continue.
4. The feature receives an explicit `saved locally` or `sent to server` result; it never assumes success from a click.

### Trigger

Sync is requested on browser `online`, application startup, visibility restoration, and explicit retry. These triggers coalesce into one coordinator run. `navigator.onLine` starts a probe; it does not bypass server failure handling.

### Replay

1. Acquire a per-browser sync lock so tabs do not replay the same queue concurrently.
2. Refresh/validate the current Auth session through the approved infrastructure boundary.
3. Select queued commands in dependency order.
4. Submit each command to its owning server endpoint with the idempotency key and correlation ID.
5. Let the server perform current authentication, capability, party/flow scope, domain-state, and RLS checks.
6. Mark the local command only after receiving an idempotent durable outcome.
7. Pause on connectivity loss; continue on the next trigger.

### Outcome classes

| Outcome | Local state | Client behavior |
|---|---|---|
| Accepted | `succeeded` | Update local projection and remove/compact the envelope after durable acknowledgment. |
| Duplicate/idempotent replay | `succeeded` | Treat as the existing authoritative outcome; never create another outcome. |
| Authorization/session rejection | `rejected` | Preserve redacted attention record; require current access/manual review. |
| Domain conflict/stale state | `conflict` | Preserve command; feature-specific resolution only, no generic merge. |
| Invalid/permanent failure | `failed` or `rejected` | Stop automatic retry and show safe actionable feedback. |
| Transient server/network failure | `queued` | Back off with bounded retries and retry on a future trigger. |

## 7. Ordering, concurrency, and idempotency

Commands sharing an `orderingKey` replay serially. Examples may include a single workflow session, document, item/lot/location operation, or scan sequence, but the owning feature must define the actual key.

Independent keys may replay concurrently only after the owning feature proves that no cross-command invariant can be violated. The default is conservative serial replay.

The server owns idempotency storage/behavior for business commands. The client key is a deduplication input, not evidence that a command succeeded. Lost responses and repeated submissions must return the original outcome or a safe equivalent.

## 8. Security, scope, and data lifecycle

- Cached capability data may hide/show controls but never authorizes a replay.
- The server compares the current actor and scope to the command's resource references; a stale capture scope is explanatory metadata only.
- A deactivated/revoked actor's commands are rejected, not reassigned.
- Logout/deactivation handling clears or quarantines user-scoped queue/cache data according to the approved threat model; it does not silently delete unsynchronized work.
- Storage retention is bounded by workflow need and documented per cache/queue class.
- Browser storage errors are surfaced as persistence failure, never as successful local save.
- Payloads are minimized and redacted in monitoring. Secrets and session tokens never enter local stores.

## 9. Shell and feature integration

The offline package exposes a read-only status model to the shell:

```ts
type OfflineStatus = {
  connectivity: "online" | "offline" | "checking";
  sync: "idle" | "syncing" | "attention";
  queuedCount: number;
  lastSuccessfulSyncAt?: string;
};
```

The final type is subject to the shell design reconciliation. The shell may display connectivity and broad attention status. Feature screens own operation-specific saved/queued/rejected/conflict feedback, especially during active floor flows.

The shell must never enable Tier 2 actions because `connectivity` is `online`, and must never claim `sync: idle` means all data is current unless the coordinator has authoritative evidence.

## 10. Server and infrastructure boundary

The sync coordinator uses the approved Auth/session and server-command path from `04-services-and-infrastructure`. It does not create a new background worker or Redis queue by default. Service-worker background sync may wake the app or request a sync, but domain authorization and business transactions remain server-side.

Feature endpoints should use the owning domain transaction and idempotency mechanism. If an offline operation creates an outbox/job follow-up, that follows the infrastructure spec's transactional enqueue rules; the client must not enqueue infrastructure jobs directly.

## 11. Verification and open decisions

- [ ] Approve the exact Tier 1 operation allowlist with each owning feature.
- [ ] Approve the local data retention, logout/deactivation cleanup, device-sharing, and browser-storage threat model.
- [ ] Confirm the capability/session context and replay rejection contract with `02-rbac-roles`.
- [ ] Confirm Auth, endpoint, monitoring, and service-worker boundaries with `04-services-and-infrastructure`.
- [ ] Reconcile `OfflineStatus` with `05-ui-shell-and-navigation` before either spec is approved.
- [ ] Decide whether background sync is required for v1 or whether foreground/reconnect sync is sufficient.
- [ ] Decide whether queue review belongs in a shared office surface or in each owning feature.
- [ ] Have `offline-sync-reviewer` review the final design for Tier 2 leakage, replay authorization, and conflict handling.
