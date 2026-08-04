# Client-side storage strategy

Browser storage in this system is strictly partitioned by purpose. No feature writes to browser storage without going through the shared utility module described in §9.5 — this is the enforcement point for the logout-clear rule and the key-prefix discipline.

### 9.1 Storage type assignment

| What | Storage type | Rationale |
|---|---|---|
| Session token / auth | Cookie (Supabase Auth managed) | Required for Next.js middleware and RLS. Never moved to `localStorage` manually. |
| Sidebar collapse state | `localStorage` | Durable across sessions. Cleared on logout. |
| Table and dashboard UI preferences | `localStorage` | Durable, non-sensitive. Cleared on logout. |
| In-progress form state | `sessionStorage` | Tab-scoped. Auto-clears on tab close. Not synced between tabs. |
| Active receiving session buffer | `sessionStorage` | Tab-scoped. Correct for per-session work — a second tab handling a different PO must not share state. |
| Offline action outbox | `IndexedDB` | Structured, survives page refresh, supports ordered processing. See §10. |
| Offline read cache | `IndexedDB` | TTL-gated snapshots of picklists, SKU lookups, active lots. See §10. |
| Sync log | `IndexedDB` | Conflict history for Supervisor review. See §10. |
| Inventory live state, lot status, approvals | ❌ Server only | Must always be authoritative. Never cached for write decisions. |

### 9.2 `localStorage` usage

Keys are prefixed `wms-` to avoid collisions with any third-party scripts.

| Key | Value | Cleared on logout |
|---|---|---|
| `wms-sidebar-{group-key}` | `"open"` \| `"closed"` | ✅ |
| `wms-table-page-size` | integer | ✅ |
| `wms-dashboard-collapsed-widgets` | string[] | ✅ |

All `localStorage` writes go through `lib/storage.ts` which exposes `get`, `set`, and `clearAll`. The logout handler calls `clearAll()` unconditionally — no feature is responsible for cleaning up its own keys.

### 9.3 `sessionStorage` usage

`sessionStorage` is appropriate for state that should not survive a tab close and must not bleed between tabs handling different sessions or POs.

| Key | Value | Notes |
|---|---|---|
| `wms-withdrawal-draft` | Partial withdrawal request form | Restored on back-navigation within the same tab |
| `wms-receiving-session` | Active PO id + scanned items buffer | Scoped to the tab running that receiving session |
| `wms-scan-buffer` | Last N scanned barcodes | Short-lived; consumed on batch confirm |

### 9.4 Cookies

Managed entirely by Supabase Auth's SSR package. No application code writes cookies directly. The session token must live in a cookie (not `localStorage`) because Next.js middleware runs on the server and cannot read `localStorage` — moving it would break route protection and RLS.

### 9.5 Storage utility module (`lib/storage.ts`)

All browser storage writes in the application go through this module. Direct calls to `localStorage`, `sessionStorage`, or `indexedDB` outside this module are a code-review rejection.

The module exposes:

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

---

## 10. Offline mode

### 10.1 Scope and rationale

Floor staff (Warehouseman, Warehouseman QC) frequently operate in areas of the warehouse with poor or no connectivity. The system must remain functional for their core tasks during connectivity loss and sync their activity to the server once connectivity is restored.

Offline support is scoped exclusively to the action types that are safe to queue without live server state — see §10.2. Actions that require live `qty_available` checks, approval chain state, or configuration data are disabled offline. The offline capability does not extend to Admin, Supervisor, or Manager roles — their work (approvals, analytics, enrollment, configuration) requires real-time server state and must be done online.

### 10.2 Safe vs. unsafe actions offline

**Safe to queue offline — these actions do not require live server state at the time they are performed:**

| Action | Why it is safe |
|---|---|
| Outgoing scan confirmation (Stage 2) | The picklist was already generated and the lot already committed server-side at Stage 1. The offline worker is closing a transaction that is already locked — no live `qty_available` check is needed. |
| Receiving scan + lot creation | New lots do not conflict with existing ones. The PO reference and SKU exist server-side already. Duplicate scans are detected and flagged on sync, not silently merged. |
| Placement override during receiving | Non-conflicting write — a location assignment on a lot the current receiving session created. |
| Quality Inspection outcome | Single-writer per lot in practice. The inspector physically holds the item — no concurrent resolution is possible. |

**Unsafe offline — disabled when the client detects it is offline:**

| Action | Why it is unsafe |
|---|---|
| Withdrawal request submission | The FIFO/FEFO engine runs server-side against live `qty_available`. An offline client cannot know what has been committed since connectivity was lost and may queue a request against fully committed stock. |
| Picklist generation (Stage 1 commitment) | Same reason — commitment requires accurate live `qty_available`. |
| Approval queue actions | Approval decisions must be real-time. A queued approval that syncs hours later against a request that was already rejected or superseded is an audit integrity problem. |
| Any enrollment action | Configuration changes must be deliberate and online. |
| Analytics and reporting | Data must be current. Stale cached analytics would be actively misleading. |

### 10.3 IndexedDB schema

Three object stores handle all offline state.

**`outbox`** — queued actions pending sync

| Field | Type | Notes |
|---|---|---|
| id | string (uuid) | Client-generated |
| action_type | enum | `"scan_confirm"` \| `"lot_create"` \| `"placement_override"` \| `"qi_outcome"` |
| payload | object | Full action data — enough for the server to apply it with no additional context |
| created_at | number (epoch ms) | Client clock — used for ordering only, never trusted as authoritative time |
| attempts | number | Sync retry count |
| status | enum | `"pending"` \| `"syncing"` \| `"failed"` |

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

### 10.4 Connectivity detection

`navigator.onLine` alone is unreliable — it returns `true` when connected to a router with no internet, which is a common scenario in warehouse environments. The system uses a two-signal approach:

1. **`navigator.onLine`** — coarse signal, fires `online`/`offline` events.
2. **Lightweight server ping** — on every `online` event, ping `/api/ping` (a 1-byte endpoint, no auth required). Only treat connectivity as restored when the ping succeeds. Retry the ping every 15 seconds while `navigator.onLine` is `true` but the ping is failing.

Connectivity state is held in a React context (`OfflineContext`) available to all pages, so any component can read `isOnline` without coupling to the detection logic.

### 10.5 Sync flow on reconnect

Triggered when the connectivity ping succeeds after a period of failure.

```
1. Set connectivity state → online
2. Lock the outbox (set all "pending" entries to "syncing" atomically)
   — no new entries accepted while sync is in progress
3. Read all "syncing" entries ordered by created_at ASC
   — sequence matters: lot_create must sync before scan_confirm on that lot
4. For each entry:
   a. POST to /api/sync with { action_type, payload, client_id, outbox_id }
   b. Server validates, applies if valid, returns { outcome, detail }
   c. outcome = "applied"   → write to sync_log, delete from outbox
   d. outcome = "conflict"  → write to sync_log (with server_response), mark outbox entry "failed"
   e. outcome = "rejected"  → write to sync_log (with server_response), mark outbox entry "failed"
   f. On network error mid-sync → increment attempts, set back to "pending", abort and retry later
5. After all entries processed:
   a. Refresh offline_cache from server
   b. Surface any "failed" outbox entries to Supervisor via the Alerts notification feed
   c. Unlock outbox
6. Re-enable full UI
```

Entries with `attempts >= 3` and `status = "failed"` are not retried automatically — they surface as sync conflicts requiring Supervisor resolution.

### 10.6 Server-side sync validation (`/api/sync`)

The sync endpoint applies the same business rules as the live action endpoints. Offline origin does not bypass any validation.

| Action type | Server validation on sync |
|---|---|
| `scan_confirm` | Verify `withdrawal_line` still exists and `lots.qty_committed >= line.qty`. If yes, apply Stage 2 decrement normally. If the lot was cancelled server-side while the client was offline, return `outcome: "conflict"`. |
| `lot_create` | Check for duplicate `(po_id, sku_id, location_id)`. If duplicate found, return `outcome: "conflict"` with the existing lot id — do not auto-merge. |
| `placement_override` | Check that the lot's `status` is still `available`. Apply if so; return `outcome: "conflict"` if status changed. |
| `qi_outcome` | Check that `lots.status = "under_inspection"`. Apply if so; return `outcome: "conflict"` if status changed. |

All sync actions are written to the audit log with `metadata.source = "offline_sync"` and `metadata.client_created_at` from the outbox entry — so the audit trail distinguishes online actions from offline-queued ones and preserves the original client timestamp alongside the authoritative server timestamp.

### 10.7 Page behavior by connectivity state

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

### 10.8 UI indicators

- **Connectivity pill** — persistent in the top nav bar. Three states: `Online` (green), `Offline` (amber), `Syncing` (blue with spinner). Never hidden, never only an icon without a label.
- **Offline banner** — shown at the top of any page that is disabled or read-only while offline. States clearly what is unavailable and why, and that actions will resume when connectivity is restored.
- **Cache staleness warning** — shown on Inventory and Notifications when the offline cache has exceeded its TTL. Does not block the page but flags that data may be outdated.
- **Sync conflict badge** — a count badge on the Notifications nav item when unresolved sync conflicts exist. Supervisor sees this; floor staff do not (conflicts surface to their manager, not back to them).
