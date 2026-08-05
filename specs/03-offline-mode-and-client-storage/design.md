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
| Active receiving session buffer | `sessionStorage` | Tab-scoped. Correct for per-session work — a second tab handling a different WRR must not share state. |
| Offline action outbox | `IndexedDB` | Structured, survives page refresh, supports ordered processing. |
| Offline read cache | `IndexedDB` | TTL-gated snapshots of pick lists, item lookups, active lots. |
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
| `wms-pick-list-draft` | Partial pick-list generation input (item/quantity selections before commit) | Restored on back-navigation within the same tab; not a persisted withdrawal-request entity — there is none |
| `wms-receiving-session` | Active WRR id + scanned items buffer | Scoped to the tab running that receiving session |
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
| id | string (uuid) | Client-generated. Doubles as the idempotency key sent to the server (§7) — the server's scan-capture tables use it as a unique constraint/upsert key, so replaying the same outbox entry is a safe no-op rather than requiring a separate idempotency-record lookup. |
| captured_by_user_id | string (uuid) | The authenticated Supabase user ID active on this device at capture time (§6.2). Not authorization evidence — the server independently re-authorizes the current session on every sync (§6.4) — but the durable link that lets both the client and server refuse to sync an entry under a session that didn't capture it (§6.3, §6.4). |
| action_type | enum | `"wrr_scan_capture"` \| `"pick_scan_capture"` — see §5.1. Both are pure observation capture; neither creates a lot, decrements a balance, resolves inspection, or triggers document generation. |
| payload | object | Full action data — enough for the server to apply it with no additional context |
| created_at | number (epoch ms) | Client clock — used for ordering only, never trusted as authoritative time |
| attempts | number | Sync retry count |
| status | enum | `"pending"` \| `"syncing"` \| `"failed"` \| `"quarantined_actor_mismatch"` |

*Note: The queue also captures local UI state, operation tier, and idempotency keys according to the Command and Policy Contract.*

**Cross-session/device-sharing protection**: shared floor tablets are the explicit primary hardware for this system (§1), so a different `warehouse_staff` user signing into the same device with entries still queued from a prior user is a realistic scenario, not an edge case. Two independent, redundant gates close it — deliberately redundant so one implementation slip doesn't reopen the gap:

1. **Client-side scope filter**: the sync coordinator (§6.3 step 3) only ever selects outbox entries where `captured_by_user_id` equals the *current* authenticated session's user ID. Entries captured by a different, now-inactive-on-this-device user are never included in a sync run and are never presented to the current user as "their" pending work.
2. **Server-side actor-match check**: `/api/sync` (§6.4) rejects any submitted entry where the request's authenticated `auth.uid()` does not match the request body's `captured_by_user_id`, *before* any business-state validation runs. A mismatch returns `outcome: "conflict"` with reason `actor_mismatch` and the entry transitions to local status `quarantined_actor_mismatch`; it is never silently dropped, silently applied under the new session, or silently reassigned to the new user. This catches every honest client (including one with a buggy or missing gate 1) and any naive tampering.
3. On sign-out or forced deactivation on a device with pending entries still owned by that user, the client attempts one final sync while the session is still valid (best-effort); any entries that don't complete are left `pending` under their original `captured_by_user_id` and simply become invisible to whichever user signs in next (gate 1), surfacing later only if the original user (or an authorized supervisor review surface, §11) returns to that device while still active. This satisfies R5.2 ("rejected and logged; SHALL not be replayed under another user") and R2.7's logout/deactivation cleanup requirement without needing to guess at a device-level wipe policy that could destroy a legitimate not-yet-synced physical scan.

**Explicit residual risk, not silently accepted**: gate 2 compares `auth.uid()` (trustworthy — derived from the verified session) against `captured_by_user_id` (a value asserted in the *same* sync request, since the server has no prior record of the entry before this POST — capture happens fully offline with no online round-trip). A genuinely malicious actor with physical access to the shared device's browser storage *and* separately-valid credentials as a different current user could read another user's queued entry directly out of IndexedDB and resubmit it with `captured_by_user_id` rewritten to their own ID, passing gate 2 trivially. Closing this fully would require either an online round-trip at capture time (which defeats the purpose of offline capture) or storing a durable signed credential client-side to bind the entry cryptographically to its capturing session — the latter is explicitly forbidden by requirements.md R2.4 ("Sensitive tokens, passwords, service credentials, or durable authority claims SHALL not be stored in the offline database"). Given the bounded blast radius — this mechanism only ever governs Tier 1 capture-only observations (never approval, pricing, FIFO override, or any privileged action, which requirements.md R6.2/§5.1 already keep fully out of the offline queue regardless of actor) — this residual risk is accepted rather than engineered away, with a **detective**, not preventive, compensating control: every applied and every `quarantined_actor_mismatch` entry is durably logged with both `captured_by_user_id` and the syncing session's `auth.uid()` (§6.4's audit note), so a pattern of one user's sessions repeatedly syncing entries "captured" by other users is visible to supervisor/security review even though no single sync request can be cryptographically proven forged.

Lot creation (WRR confirm), putaway/placement confirmation, inspection resolution, and final dispatch are Tier 2 online-only commands the operator submits directly while connected (§5.1). They are never entered into this outbox — only the scan observations that precede them are.

**`offline_cache`** — read-only reference data needed to work offline

| Field | Type | Notes |
|---|---|---|
| key | string | e.g. `"pick_list:{id}"`, `"item:{barcode}"`, `"lot:{id}"` |
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

Offline support is scoped exclusively to pure observation-capture actions that record a physical scan without producing any authoritative inventory outcome themselves. Every action that creates a lot, decrements a balance, resolves inspection, assigns putaway, or triggers document generation is Tier 2 online-only, per `07-incoming-receiving/design.md` §10 (lot creation, putaway confirmation, and inspection resolution are explicitly Tier 2/online-only in v1) and `08-outgoing-withdrawal-and-two-stage-commitment/design.md` §10 (only physical scan *observations* may be Tier 1; final dispatch is Tier 2). The offline capability does not extend to `supervisor`, `administrator`, or `party_user` roles (`02-rbac-roles` §3.1) — only `warehouse_staff` floor scan capture queues offline; everything else requires real-time server state and must be done online.

### 5.1 Safe vs. unsafe actions offline

**Safe to queue offline (Tier 1) — capture only, no authoritative outcome:**

| Action | Why it is safe |
|---|---|
| WRR scan capture (`wrr_scan_capture`) | Records that a barcode was scanned against an expected `wrr_item_id` on a WRR already `receiving_in_progress`. It never creates a `lots` row, writes `inventory_transactions`, resolves inspection, or assigns a location — it only increments a locally-cached observation that the server re-validates and applies to `wrr_items.scanned_qty` on sync. The confirm-receipt command that actually creates lots stays the single, online-only, authoritative transaction `07` §8 already defines. |
| Pick-list scan capture (`pick_scan_capture`) | Records that a lot/location was scanned against an already-committed `pick_list_item_id`. It never decrements `lot_location_balances.qty_remaining`, releases `qty_committed`, or triggers `acknowledgement_receipt` generation — those happen only in the final dispatch command, which stays online-only per `08` §7/§10. |

**Unsafe offline (Tier 2 — disabled offline):**

| Action | Why it is unsafe |
|---|---|
| WRR confirm-receipt (lot creation, inspection resolution, putaway) | Per `07` §8, this is a single locked server transaction that creates `lots`/`lot_location_balances` and posts `inventory_transactions` only after checking current inspection/conformance state. Deferring any part of it risks posting stock that should have been held, or racing a concurrent confirm through the normal online flow. |
| Pick-list generation (Stage 1 commitment) | The FIFO/FEFO engine and commitment write run server-side against live `qty_available`/`qty_remaining`. An offline client cannot know what has been committed since connectivity was lost. There is no separate withdrawal-request step to distinguish from this — pick-list generation *is* the commitment (`08` §6). |
| Final dispatch (Stage 2 decrement) | Decrements `lot_location_balances.qty_remaining`, releases `qty_committed`, inserts the immutable `inventory_transaction`, and triggers document generation. Must be an explicit, operator-submitted online action, not something the sync coordinator auto-applies from a queued capture — two devices (or a stale replay after another operator already dispatched through the normal online flow) could otherwise both apply the decrement. |
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
3. The command is persisted atomically into the `outbox` with the local UI state needed to continue, tagging `captured_by_user_id` from the current authenticated session (§4.5).
4. The feature receives an explicit `saved locally` or `sent to server` result; it never assumes success from a click.

### 6.3 Sync flow on reconnect (Trigger & Replay)

Triggered when the connectivity ping succeeds after a period of failure, application startup, visibility restoration, or explicit retry.

```
1. Set connectivity state → online
2. Lock the outbox (set all "pending" entries **whose `captured_by_user_id` matches the current authenticated session's user ID** to "syncing" atomically)
   — no new entries accepted while sync is in progress
   — entries captured by a different user are left untouched: not locked, not synced, not surfaced as this session's pending work (§4.5's cross-session protection, gate 1)
3. Read all "syncing" entries ordered by created_at ASC
   — both Tier 1 action types are independent capture events with no
     cross-entry ordering dependency of their own; ordering here is for
     deterministic replay, not to satisfy a dependency between entries
4. For each entry:
   a. Refresh/validate Auth session
   b. POST to /api/sync with { action_type, payload, client_id, outbox_id, idempotency_key, captured_by_user_id }
   c. Server independently verifies `auth.uid() == captured_by_user_id` before any business-state check (§4.5's gate 2); on mismatch, `outcome: "conflict"` with `reason: "actor_mismatch"`, entry → `quarantined_actor_mismatch`, skip to next entry
   d. Server validates against current scope/RLS/business logic, applies if valid, returns { outcome, detail }
   e. outcome = "applied"   → write to sync_log, delete from outbox
   f. outcome = "conflict"  → write to sync_log (with server_response), mark outbox entry "failed" (or `quarantined_actor_mismatch` per step c)
   g. outcome = "rejected"  → write to sync_log (with server_response), mark outbox entry "failed"
   h. On network error mid-sync → increment attempts, set back to "pending", abort and retry later
5. After all entries processed:
   a. Refresh offline_cache from server
   b. Surface any "failed" outbox entries to Supervisor via the Alerts notification feed
   c. Unlock outbox
6. Re-enable full UI
```

Entries with `attempts >= 3` and `status = "failed"` are not retried automatically — they surface as sync conflicts requiring Supervisor resolution.

### 6.4 Server-side sync validation (`/api/sync`)

The sync endpoint applies the same business rules as the live action endpoints. Offline origin does not bypass any validation. Before either row below runs, the endpoint first verifies `auth.uid() == captured_by_user_id` (§4.5, §6.3 step 4c) — a mismatch is rejected as `actor_mismatch` before any business-state check, so a revoked or logged-out user's captured work can never be applied under a different, later session. Both action types apply only capture-level state (no lot creation, no balance decrement, no document trigger); the corresponding Tier 2 command remains a separate, online-only, operator-submitted step.

| Action type | Server validation on sync |
|---|---|
| `wrr_scan_capture` | Verify `wrr_documents.status = 'receiving_in_progress'` (reject with `conflict` if `confirmed`/`cancelled`) and that `wrr_item_id` belongs to that WRR. Re-apply the `07` §6 matcher rules (wrong WRR, wrong item, unknown item, duplicate/over quantity, invalid UOM, unresolved lot context) against current server state. On accept, increment `wrr_items.scanned_qty` by the captured delta using the outbox entry's `id` as the idempotency/upsert key. On reject, return `outcome: "conflict"` and preserve the scan for supervisor review — the physical scan happened; it is never silently dropped. |
| `pick_scan_capture` | Verify the target `inventory_commitment_line` is still `active` or `inspection_pending` (per `01`'s `commitmentStatusEnum`) and that the scanned lot/location matches its `lot_location_balance_id`. On accept, record scan evidence only, using the outbox entry's `id` as the idempotency/upsert key — no decrement, no ledger insert, no document trigger. If the commitment was already `released`/`expired`/`cancelled`, or dispatch already completed through another path, return `outcome: "conflict"`, not silent success. |

All sync actions are written to the audit log with `metadata.source = "offline_sync"`, `metadata.client_created_at`, and `metadata.captured_by_user_id` from the outbox entry — preserving the original client timestamp and the original capturing actor alongside the authoritative server timestamp and the (necessarily identical, per the actor-match gate above) syncing session's identity, satisfying requirements.md R8.4's requirement to preserve original actor and client operation identity in the recorded outcome.

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

The mechanism is: the outbox entry's client-generated `id` (§4.5) is the idempotency key, and the server-side scan-capture write uses it directly as a unique constraint/upsert key on the row it writes (e.g. one scan-observation row per outbox `id`), not a separate idempotency-log table consulted before a non-idempotent write. A replayed `wrr_scan_capture`/`pick_scan_capture` with the same `id` therefore resolves to the same row deterministically regardless of how many times it is submitted or how server state changed in between — this must hold even when the underlying WRR/commitment state has since moved to a conflicting status, in which case the write itself (not a separate idempotency check) is what returns `conflict`. `07`'s and `08`'s owning confirm/dispatch commands define their own idempotency mechanism for their own (Tier 2, non-queued) writes; this section governs only the two Tier 1 capture types above.

## 8. Security, scope, and data lifecycle

- Cached capability data may hide/show controls but never authorizes a replay.
- The server compares the current actor and scope to the command's resource references; a stale capture scope is explanatory metadata only.
- A deactivated/revoked actor's commands are rejected, not reassigned — concretely enforced by §4.5/§6.3/§6.4's `captured_by_user_id` mechanism: the client never includes another user's entries in its own sync run (gate 1), and the server independently rejects any entry whose captured actor doesn't match the current session (gate 2), so a revoked actor's queued work cannot be silently picked up and applied by whichever user is currently signed in on that device.
- Logout/deactivation handling on a shared device leaves that user's still-`pending` entries in place, invisible to a subsequently-signed-in different user (gate 1 above) rather than reassigning or destroying them; it does not silently delete unsynchronized work.
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
| Incoming / Receiving | ✅ Full | ✅ Scan capture only (`wrr_scan_capture` queued) — lot creation, inspection resolution, and putaway confirmation require connectivity and remain disabled |
| Outgoing / Master Inventory (pick-list generation) | ✅ Full | ⚠️ Disabled — requires live `qty_available` |
| Outgoing / Pick execution (dispatch) | ✅ Full | ✅ Scan capture only (`pick_scan_capture` queued) — final dispatch/decrement requires connectivity and remains a separate online step |
| Inventory | ✅ Full | ⚠️ Read-only from cache (no edits) |
| Quality Inspection | ✅ Full | ⚠️ Disabled — inspection resolution is Tier 2/online-only |
| Data Analytics | ✅ Full | ⚠️ Disabled — shows offline notice |
| Chatbot | ✅ Full | ⚠️ Disabled — requires API |
| Notifications / Alerts | ✅ Full | ⚠️ Read-only from cache |
| Approval Queue | ✅ Full | ⚠️ Disabled — real-time decisions only |
| Enrollment | ✅ Full | ⚠️ Disabled — config changes must be online |
| Settings | ✅ Full | ⚠️ Disabled — config changes must be online |
| Sync Conflicts (Alerts feed) | ✅ Full | ⚠️ Read-only from cache |

No page should be described as offline-capable for an action beyond scan capture — a floor worker must never be able to reasonably believe putaway, inspection resolution, or dispatch "worked" while offline when it is, per `07`/`08`, still pending a separate online step.

The shell must never enable Tier 2 actions because `connectivity` is `online`, and must never claim `sync: idle` means all data is current unless the coordinator has authoritative evidence.

## 10. Server and infrastructure boundary

The sync coordinator uses the approved Auth/session and server-command path from `04-services-and-infrastructure`. It does not create a new background worker or Redis queue by default. Service-worker background sync may wake the app or request a sync, but domain authorization and business transactions remain server-side.

Feature endpoints should use the owning domain transaction and idempotency mechanism. If an offline operation creates an outbox/job follow-up, that follows the infrastructure spec's transactional enqueue rules; the client must not enqueue infrastructure jobs directly.

## 11. Verification and open decisions

- [ ] Approve the exact Tier 1 operation allowlist with each owning feature.
- [x] Device-sharing threat model resolved **for the honest/buggy-client case**: `captured_by_user_id` on every outbox entry (§4.5) plus the two-gate client/server actor-match check (§6.3 step 2 and 4c, §6.4) prevents an honest client — including one with a missing or buggy gate 1 — from ever syncing a queued entry under a different user's session.
- [ ] **Accepted residual risk, not fully closed**: a maliciously modified client with physical access to the shared device's browser storage and separately-valid credentials as a different user could forge `captured_by_user_id` to bypass gate 2 (§4.5's "Explicit residual risk" note). Closing this fully would require either an online round-trip at capture time or storing a durable signed credential client-side, and the latter is forbidden by R2.4. Accepted given the bounded blast radius (Tier 1 capture-only, never a privileged action) with a detective audit-trail control in place instead of a preventive one. Revisit only if a concrete incident or a stronger requirement makes this cost worth paying.
- [ ] Approve the local data retention and browser-storage threat model (quota/eviction handling, retention duration per cache/queue class) beyond the device-sharing mechanism resolved above.
- [ ] Confirm the capability/session context and replay rejection contract with `02-rbac-roles`.
- [ ] Confirm Auth, endpoint, monitoring, and service-worker boundaries with `04-services-and-infrastructure`.
- [ ] Reconcile `OfflineStatus` with `05-ui-shell-and-navigation` before either spec is approved.
- [ ] Decide whether background sync is required for v1 or whether foreground/reconnect sync is sufficient.
- [ ] Decide whether queue review belongs in a shared office surface or in each owning feature.
- [ ] Have `offline-sync-reviewer` review the final design for Tier 2 leakage, replay authorization, and conflict handling.
- [ ] Decide whether a `pending` (not-yet-synced) outbox entry can be corrected or cancelled by the operator before sync. §4.4's `storage.idb` interface currently has no `removeFromOutbox`/`editOutboxEntry` method, and §6.4 applies each accepted `wrr_scan_capture` as a delta on `wrr_items.scanned_qty` — so an uncorrected wrong-quantity entry queued before a needed correction would surface as a duplicate/over-quantity `conflict` for supervisor review rather than being silently correctable. This is safe (no Tier 2 leakage; the entry never leaves capture-only territory) but the UX and API surface for it are currently undefined.
