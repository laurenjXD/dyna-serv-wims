import type { OfflineQueueEnvelope } from "./index";
import {
  deleteOfflineEntry,
  listOfflineEntries,
  listPendingOfflineEntries,
  updateOfflineEntry,
} from "./storage";
import { storage } from "@/lib/storage";

export type SyncOutcome = "applied" | "duplicate" | "transient" | "rejected" | "conflict";
export type SyncSubmission = {
  outcome: SyncOutcome;
  response?: unknown;
};

export type SyncSubmitter = (entry: OfflineQueueEnvelope) => Promise<SyncSubmission>;

export type StoredReplayResult = {
  entry: OfflineQueueEnvelope;
  outcome: SyncOutcome | "submit_failed";
};

export function retryDelayMs(attempts: number): number {
  return Math.min(30_000, 500 * 2 ** Math.max(0, attempts));
}

export async function replayOfflineEntries(
  entries: OfflineQueueEnvelope[],
  currentUserId: string,
  submit: SyncSubmitter,
): Promise<Array<{ entry: OfflineQueueEnvelope; outcome: SyncOutcome | "actor_mismatch" }>> {
  const ordered = [...entries]
    .filter((entry) => entry.capturedByUserId === currentUserId)
    .sort((a, b) => a.createdAt - b.createdAt);
  const results: Array<{ entry: OfflineQueueEnvelope; outcome: SyncOutcome | "actor_mismatch" }> = [];

  for (const entry of ordered) {
    if (entry.capturedByUserId !== currentUserId) {
      results.push({ entry, outcome: "actor_mismatch" });
      continue;
    }
    results.push({ entry, outcome: (await submit(entry)).outcome });
  }
  return results;
}

/**
 * Replays the durable IndexedDB outbox and persists every state transition.
 * Applied/duplicate observations are removed only after the server returns a
 * terminal success; transient failures remain retryable, while conflicts are
 * quarantined for explicit supervisor/operator review.
 */
export async function replayStoredOfflineEntries(
  currentUserId: string,
  submit: SyncSubmitter,
): Promise<StoredReplayResult[]> {
  // Load all pending entries so observations captured under a revoked or
  // changed session can be quarantined explicitly instead of disappearing
  // from the replay scan.
  const entries = await listPendingOfflineEntries();
  const ordered = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const results: StoredReplayResult[] = [];

  for (const entry of ordered) {
    if (entry.capturedByUserId !== currentUserId) {
      const quarantined: OfflineQueueEnvelope = {
        ...entry,
        status: "quarantined_actor_mismatch",
      };
      await updateOfflineEntry(quarantined);
      results.push({ entry: quarantined, outcome: "conflict" });
      continue;
    }
    const syncing: OfflineQueueEnvelope = {
      ...entry,
      status: "syncing",
      attempts: entry.attempts + 1,
    };
    await updateOfflineEntry(syncing);

    let submission: SyncSubmission;
    try {
      submission = await submit(syncing);
    } catch {
      submission = { outcome: "transient" };
    }

    if (submission.outcome === "applied" || submission.outcome === "duplicate") {
      await deleteOfflineEntry(entry.id);
    } else {
      const status = submission.outcome === "conflict"
        ? "quarantined_conflict"
        : submission.outcome === "transient"
          ? "pending"
          : "failed";
      await updateOfflineEntry({ ...syncing, status });
    }
    results.push({ entry: syncing, outcome: submission.outcome });
  }

  return results;
}

let activeReplay: Promise<StoredReplayResult[]> | null = null;

/** Coalesces reconnect/visibility/manual triggers in this browser tab. */
export function replayStoredOfflineEntriesOnce(
  currentUserId: string,
  submit: SyncSubmitter,
): Promise<StoredReplayResult[]> {
  if (activeReplay) return activeReplay;
  activeReplay = replayStoredOfflineEntries(currentUserId, submit).finally(() => {
    activeReplay = null;
  });
  return activeReplay;
}

export async function getOfflineQueueCounts(currentUserId: string): Promise<{
  pendingCount: number;
  attentionCount: number;
}> {
  const rows = await listOfflineEntries();
  const owned = rows.filter((row) => row.capturedByUserId === currentUserId);
  return {
    pendingCount: owned.filter((row) => row.status === "pending" || row.status === "failed" || row.status === "syncing").length,
    attentionCount: owned.filter((row) => row.status === "failed" || row.status === "quarantined_conflict" || row.status === "quarantined_actor_mismatch").length,
  };
}

export function syncLockAvailable(): boolean {
  const key = "wms-offline-sync-lock";
  const now = Date.now();
  const current = Number(storage.local.get(key) ?? 0);
  if (current > now) return false;
  storage.local.set(key, String(now + 30_000));
  return true;
}

export function releaseSyncLock(): void {
  storage.local.remove("wms-offline-sync-lock");
}
