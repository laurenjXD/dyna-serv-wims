/** Shared offline admission contract.
 *
 * Only Tier 1 physical observations may be queued. The server remains
 * authoritative for every state-changing command.
 */

export type OfflineOperationType =
  | "receiving_scan_observation"
  | "pick_list_scan_observation"
  | "inspection_observation";

export type OfflineEntryStatus =
  | "pending"
  | "syncing"
  | "failed"
  | "quarantined_actor_mismatch"
  | "quarantined_conflict";

export type ConnectivityStatus = "checking" | "online" | "offline";
export type SyncStatus = "idle" | "syncing" | "attention";
export type OfflineStatus = {
  connectivity: ConnectivityStatus;
  sync: SyncStatus;
  /** Optional for compatibility with the original connectivity-only shell contract. */
  pendingCount?: number;
  attentionCount?: number;
  lastSyncedAt?: number | null;
};

export function nextOfflineStatus(
  current: OfflineStatus,
  event: "probe_start" | "probe_online" | "probe_offline" | "sync_start" | "sync_success" | "sync_attention",
): OfflineStatus {
  switch (event) {
    case "probe_start": return { ...current, connectivity: "checking" };
    case "probe_online": return { ...current, connectivity: "online" };
    case "probe_offline": return { ...current, connectivity: "offline", sync: current.sync === "syncing" ? "idle" : current.sync };
    case "sync_start": return current.connectivity === "online" ? { ...current, sync: "syncing" } : current;
    case "sync_success": return { ...current, sync: "idle" };
    case "sync_attention": return { ...current, sync: "attention" };
  }
}

export const EMPTY_OFFLINE_STATUS: OfflineStatus = {
  connectivity: "checking",
  sync: "idle",
  pendingCount: 0,
  attentionCount: 0,
  lastSyncedAt: null,
};

export type OfflineOperationPolicy = {
  operationType: OfflineOperationType;
  version: 1;
  tier: 1;
  maxPayloadBytes: number;
  requiredCapability: string;
  resourceRefs: (payload: Record<string, unknown>) => string[];
  orderingKey: (payload: Record<string, unknown>) => string;
};

export type OfflineQueueEnvelope = {
  id: string;
  capturedByUserId: string;
  actionType: OfflineOperationType;
  version: 1;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  status: OfflineEntryStatus;
};

export type OfflineAdmissionResult =
  | { ok: true; envelope: OfflineQueueEnvelope }
  | { ok: false; code: string };

const MAX_PAYLOAD_BYTES = 64 * 1024;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

function requiredString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && idPattern.test(value) ? value : null;
}

function requiredStringFrom(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = requiredString(payload, key);
    if (value) return value;
  }
  return null;
}

function baseRefs(payload: Record<string, unknown>): string[] {
  return Object.values(payload)
    .filter((value): value is string => typeof value === "string" && idPattern.test(value))
    .slice(0, 8);
}

export const OFFLINE_POLICIES: Record<OfflineOperationType, OfflineOperationPolicy> = {
  receiving_scan_observation: {
    operationType: "receiving_scan_observation",
    version: 1,
    tier: 1,
    maxPayloadBytes: MAX_PAYLOAD_BYTES,
    requiredCapability: "receiving.scan",
    resourceRefs: baseRefs,
    orderingKey: (payload) => requiredStringFrom(payload, "wrrItemId", "wrr_item_id", "wrrId", "wrr_id") ?? "invalid",
  },
  pick_list_scan_observation: {
    operationType: "pick_list_scan_observation",
    version: 1,
    tier: 1,
    maxPayloadBytes: MAX_PAYLOAD_BYTES,
    requiredCapability: "pick_list.execute",
    resourceRefs: baseRefs,
    orderingKey: (payload) => requiredStringFrom(payload, "pickListItemId", "pick_list_item_id", "pickListId", "pick_list_id") ?? "invalid",
  },
  inspection_observation: {
    operationType: "inspection_observation",
    version: 1,
    tier: 1,
    maxPayloadBytes: MAX_PAYLOAD_BYTES,
    requiredCapability: "inspection.perform",
    resourceRefs: baseRefs,
    orderingKey: (payload) => requiredString(payload, "inspectionCaseId") ?? "invalid",
  },
};

export function admitOfflineOperation(input: {
  id: string;
  capturedByUserId: string;
  actionType: string;
  version?: number;
  payload: unknown;
  createdAt?: number;
}): OfflineAdmissionResult {
  const policy = OFFLINE_POLICIES[input.actionType as OfflineOperationType];
  if (!policy || input.version !== undefined && input.version !== policy.version) {
    return { ok: false, code: "offline_not_supported" };
  }
  if (!idPattern.test(input.id) || !idPattern.test(input.capturedByUserId)) {
    return { ok: false, code: "invalid_operation_identity" };
  }
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    return { ok: false, code: "invalid_payload" };
  }
  const payload = input.payload as Record<string, unknown>;
  const serialized = JSON.stringify(payload);
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > policy.maxPayloadBytes) {
    return { ok: false, code: "payload_too_large" };
  }
  if (policy.orderingKey(payload) === "invalid") {
    return { ok: false, code: "invalid_resource_reference" };
  }
  return {
    ok: true,
    envelope: {
      id: input.id,
      capturedByUserId: input.capturedByUserId,
      actionType: policy.operationType,
      version: 1,
      payload,
      createdAt: Number.isFinite(input.createdAt) ? input.createdAt! : Date.now(),
      attempts: 0,
      status: "pending",
    },
  };
}

export function isTierTwoOfflineAction(actionType: string): boolean {
  return !Object.prototype.hasOwnProperty.call(OFFLINE_POLICIES, actionType);
}

export function createOfflineOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
