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

Browser storage in this system is strictly partitioned by purpose. No feature writes to browser storage without going through the shared utility module — this is the enforcement point for the logout-clear rule and the key-prefix discipline.

### 4.1 Storage type assignment

| What | Storage type | Rationale |
|---|---|---|
| Session token / auth | Cookie (Supabase Auth managed) | Required for Next.js middleware and RLS. Never moved to `localStorage` manually. |
| Sidebar collapse state | `localStorage` | Durable across sessions. Cleared on logout. |
| Table and dashboard UI preferences | `localStorage` | Durable, non-sensitive. Cleared on logout. |
| In-progress form state | `sessionStorage` | Tab-scoped. Auto-clears on tab close. Not synced between tabs. |
| Active receiving session buffer | `sessionStorage` | Tab-scoped. Correct for per-session work — a second tab handling a different PO must not share state. |
| Offline action outbox | `IndexedDB` | Structured, survives page refresh, supports ordered processing. |
| Offline read cache | `IndexedDB` | TTL-gated snapshots of picklists, SKU lookups, active lots. |
| Sync log | `IndexedDB` | Conflict history for Supervisor review. |
| Inventory live state, lot status, approvals | ❌ Server only | Must always be authoritative. Never cached for write decisions. |

### 4.2 `localStorage` and `sessionStorage` usage

Keys in `localStorage` are prefixed `wms-` to avoid collisions with any third-party scripts.

| Key | Value | Cleared on logout |
|---|---|---|
| `wms-sidebar-{group-key}` | `"open"` \| `"closed"` | ✅ |
| `wms-table-page-size` | integer | ✅ |
| `wms-dashboard-collapsed-widgets` | string[] | ✅ |

`sessionStorage` is appropriate for state that should not survive a tab close and must not bleed between tabs handling different sessions or POs:

| Key | Value | Notes |
|---|---|---|
| `wms-withdrawal-draft` | Partial withdrawal request form | Restored on back-navigation within the same tab |
| `wms-receiving-session` | Active PO id + scanned items buffer | Scoped to the tab running that receiving session |
| `wms-scan-buffer` | Last N scanned barcodes | Short-lived; consumed on batch confirm |

### 4.3 Cookies

Managed entirely by Supabase Auth's SSR package. No application code writes cookies directly. The session token must live in a cookie (not `localStorage`) because Next.js middleware runs on the server and cannot read `localStorage` — moving it would break route protection and RLS.

### 4.4 Storage utility module (`lib/storage.ts`)

All browser storage writes in the application go through this module. Direct calls to `localStorage`, `sessionStorage`, or `indexedDB` outside this module are a code-review rejection. The logout handler calls `clearAll()` unconditionally.

```typescript
// localStorage
storage.local.get(key: string): string | null
storage.local.set(key: string, value: string): void
storage.local.clearAll(): void          // called on logout — clears all wms-* keys

// sessionStorage
storage.session.get(key: string): string | null
storage.session.set(key: string, value: string): void
storage.session.clearAll(): void        // called on tab unload if needed

// IndexedDB (async)
storage.idb.getOutbox(): Promise<OutboxEntry[]>
storage.idb.addToOutbox(entry: OutboxEntry): Promise<void>
storage.idb.markSynced(id: string, outcome: SyncOutcome): Promise<void>
storage.idb.getCache(key: string): Promise<CachedValue | null>
storage.idb.setCache(key: string, value: unknown, ttl: number): Promise<void>
storage.idb.clearStaleCache(): Promise<void>
```

### 4.5 IndexedDB schema

Three object stores handle all offline state (implemented via Dexie):

**`outbox`** — queued actions pending sync

| Field | Type | Notes |
|---|---|---|
| id | string (uuid) | Client-generated |
| action_type | enum | `"scan_confirm"` \| `"lot_create"` \| `"placement_override"` \| `"qi_outcome"` |
| payload | object | Full action data — enough for the server to apply it with no additional context |
| created_at | number (epoch ms) | Client clock — used for ordering only, never trusted as authoritative time |
| attempts | number | Sync retry count |
| status | enum | `"pending"` \| `"syncing"` \| `"failed"` |

*Note: The queue also captures local UI state, operation tier, and idempotency keys according to the Command and Policy Contract.*

**`offline_cache`** — read-only reference data needed to work offline

| Field | Type | Notes |
|---|---|---|
| key | string | e.g. `"picklist:{id}"`, `"sku:{barcode}"`, `"lot:{id}"` |
| value | object | Server snapshot at cache time |
| cached_at | number (epoch ms) | |
| ttl_seconds | number | After TTL expires, treat as stale even if still offline — do not make decisions against expired cache |

Cache is populated proactively when the user loads the Picking or Receiving pages while online. It is refreshed after every successful sync. Stale cache (past TTL) is surfaced to the user with a warning banner — the system does not silently serve expired data for operational decisions.

**`sync_log`** — outcome record of every sync attempt

| Field | Type | Notes |
|---|---|---|
| id | string (uuid) | |
| outbox_id | string | FK to the originating outbox entry |
| synced_at | number (epoch ms) | |
| outcome | enum | `"applied"` \| `"conflict"` \| `"rejected"` |
| server_response | object | Full server response — preserved for Supervisor conflict resolution |

## 5. Command and policy contract

Offline support is scoped exclusively to the action types that are safe to queue without live server state. Actions that require live `qty_available` checks, approval chain state, or configuration data are disabled offline. The offline capability does not extend to Admin, Supervisor, or Manager roles — their work requires real-time server state and must be done online.

### 5.1 Safe vs. unsafe actions offline

**Safe to queue offline (Tier 1):**

| Action | Why it is safe |
|---|---|
| Outgoing scan confirmation (Stage 2) | The picklist was already generated and the lot already committed server-side at Stage 1. The offline worker is closing a transaction that is already locked — no live `qty_available` check is needed. |
| Receiving scan + lot creation | New lots do not conflict with existing ones. The PO reference and SKU exist server-side already. Duplicate scans are detected and flagged on sync, not silently merged. |
| Placement override during receiving | Non-conflicting write — a location assignment on a lot the current receiving session created. |
| Quality Inspection outcome | Single-writer per lot in practice. The inspector physically holds the item — no concurrent resolution is possible. |

**Unsafe offline (Tier 2 - disabled offline):**

| Action | Why it is unsafe |
|---|---|
| Withdrawal request submission | The FIFO/FEFO engine runs server-side against live `qty_available`. An offline client cannot know what has been committed since connectivity was lost. |
| Picklist generation (Stage 1 commitment) | Same reason — commitment requires accurate live `qty_available`. |
| Approval queue actions | Approval decisions must be real-time. A queued approval that syncs hours later against a request that was already rejected is an audit integrity problem. |
| Any enrollment action | Configuration changes must be deliberate and online. |
| Analytics and reporting | Data must be current. Stale cached analytics would be actively misleading. |

### 5.2 Offline Policy Definition

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

### 6.1 Connectivity detection

`navigator.onLine` alone is unreliable in a warehouse environment (e.g. connected to a router with no internet). The system uses a two-signal approach:

1. **`navigator.onLine`** — coarse signal, fires `online`/`offline` events.
2. **Lightweight server ping** — on every `online` event, ping `/api/ping` (a 1-byte endpoint, no auth required). Only treat connectivity as restored when the ping succeeds. Retry the ping every 15 seconds while `navigator.onLine` is `true` but the ping is failing.

Connectivity state is held in a React context (`OfflineContext`) available to all pages.

### 6.2 Capture

1. The feature validates the input and asks the offline policy whether the command is queueable.
2. The client creates a cryptographically strong client operation ID and idempotency key.
3. The command is persisted atomically into the `outbox` with the local UI state needed to continue.
4. The feature receives an explicit `saved locally` or `sent to server` result; it never assumes success from a click.

### 6.3 Sync flow on reconnect (Trigger & Replay)

Triggered when the connectivity ping succeeds after a period of failure, application startup, visibility restoration, or explicit retry.

```
1. Set connectivity state → online
2. Lock the outbox (set all "pending" entries to "syncing" atomically)
   — no new entries accepted while sync is in progress
3. Read all "syncing" entries ordered by created_at ASC
   — sequence matters: lot_create must sync before scan_confirm on that lot
4. For each entry:
   a. Refresh/validate Auth session
   b. POST to /api/sync with { action_type, payload, client_id, outbox_id, idempotency_key }
   c. Server validates against current scope/RLS/business logic, applies if valid, returns { outcome, detail }
   d. outcome = "applied"   → write to sync_log, delete from outbox
   e. outcome = "conflict"  → write to sync_log (with server_response), mark outbox entry "failed"
   f. outcome = "rejected"  → write to sync_log (with server_response), mark outbox entry "failed"
   g. On network error mid-sync → increment attempts, set back to "pending", abort and retry later
5. After all entries processed:
   a. Refresh offline_cache from server
   b. Surface any "failed" outbox entries to Supervisor via the Alerts notification feed
   c. Unlock outbox
6. Re-enable full UI
```

Entries with `attempts >= 3` and `status = "failed"` are not retried automatically — they surface as sync conflicts requiring Supervisor resolution.

### 6.4 Server-side sync validation (`/api/sync`)

The sync endpoint applies the same business rules as the live action endpoints. Offline origin does not bypass any validation.

| Action type | Server validation on sync |
|---|---|
| `scan_confirm` | Verify `withdrawal_line` still exists and `lots.qty_committed >= line.qty`. If yes, apply Stage 2 decrement normally. If the lot was cancelled server-side while the client was offline, return `outcome: "conflict"`. |
| `lot_create` | Check for duplicate `(po_id, sku_id, location_id)`. If duplicate found, return `outcome: "conflict"` with the existing lot id — do not auto-merge. |
| `placement_override` | Check that the lot's `status` is still `available`. Apply if so; return `outcome: "conflict"` if status changed. |
| `qi_outcome` | Check that `lots.status = "under_inspection"`. Apply if so; return `outcome: "conflict"` if status changed. |

All sync actions are written to the audit log with `metadata.source = "offline_sync"` and `metadata.client_created_at` from the outbox entry — preserving the original client timestamp alongside the authoritative server timestamp.

### 6.5 Outcome classes

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

The offline package exposes a read-only status model to the shell (e.g., via `OfflineContext`).

### 9.1 UI indicators

- **Connectivity pill** — persistent in the top nav bar. Three states: `Online` (green), `Offline` (amber), `Syncing` (blue with spinner). Never hidden, never only an icon without a label.
- **Offline banner** — shown at the top of any page that is disabled or read-only while offline. States clearly what is unavailable and why, and that actions will resume when connectivity is restored.
- **Cache staleness warning** — shown on Inventory and Notifications when the offline cache has exceeded its TTL. Does not block the page but flags that data may be outdated.
- **Sync conflict badge** — a count badge on the Notifications nav item when unresolved sync conflicts exist. Supervisor sees this; floor staff do not (conflicts surface to their manager, not back to them).

### 9.2 Page behavior by connectivity state

| Page | Online | Offline |
|---|---|---|
| Dashboard | ✅ Full | ⚠️ Disabled — shows offline notice |
| Incoming / Receiving | ✅ Full | ✅ Offline-capable (lot creation + placement queued) |
| Outgoing / Withdrawal (request form) | ✅ Full | ⚠️ Disabled — requires live qty_available |
| Outgoing / Withdrawal (scan confirm) | ✅ Full | ✅ Offline-capable (Stage 2 queued) |
| Inventory | ✅ Full | ⚠️ Read-only from cache (no edits) |
| Picking | ✅ Full | ✅ Offline-capable (scan confirms queued) |
| Quality Inspection | ✅ Full | ✅ Offline-capable (outcomes queued) |
| Data Analytics | ✅ Full | ⚠️ Disabled — shows offline notice |
| Chatbot | ✅ Full | ⚠️ Disabled — requires API |
| Notifications / Alerts | ✅ Full | ⚠️ Read-only from cache |
| Approval Queue | ✅ Full | ⚠️ Disabled — real-time decisions only |
| Enrollment | ✅ Full | ⚠️ Disabled — config changes must be online |
| Settings | ✅ Full | ⚠️ Disabled — config changes must be online |
| Sync Conflicts (Alerts feed) | ✅ Full | ⚠️ Read-only from cache |

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
