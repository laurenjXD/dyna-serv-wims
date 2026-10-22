import type { OfflineQueueEnvelope } from "./index";
import {
  deleteOfflineEntry,
  listPendingOfflineEntries,
  updateOfflineEntry,
} from "./storage";

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
  const entries = await listPendingOfflineEntries(currentUserId);
  const ordered = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const results: StoredReplayResult[] = [];

  for (const entry of ordered) {
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
        : "failed";
      await updateOfflineEntry({ ...syncing, status });
    }
    results.push({ entry: syncing, outcome: submission.outcome });
  }

  return results;
}
