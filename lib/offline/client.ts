import type { OfflineQueueEnvelope } from "./index";
import type { SyncSubmission } from "./sync";

export async function submitOfflineEntry(entry: OfflineQueueEnvelope): Promise<SyncSubmission> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { outcome: "transient" };
  let response: Response;
  try {
    response = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-correlation-id": `offline-${entry.id}`,
      },
      body: JSON.stringify({
        outbox_id: entry.id,
        client_id: entry.id,
        action_type: entry.actionType,
        version: entry.version,
        payload: entry.payload,
        idempotency_key: entry.payload.idempotencyKey ?? entry.id,
        captured_by_user_id: entry.capturedByUserId,
      }),
      cache: "no-store",
    });
  } catch {
    return { outcome: "transient" };
  }

  let body: { outcome?: SyncSubmission["outcome"]; detail?: unknown } = {};
  try {
    body = await response.json() as typeof body;
  } catch {
    return { outcome: response.status >= 500 ? "transient" : "rejected" };
  }
  if (body.outcome === "applied" || body.outcome === "duplicate" || body.outcome === "conflict" || body.outcome === "rejected" || body.outcome === "transient") {
    return { outcome: body.outcome, response: body.detail };
  }
  return { outcome: response.status >= 500 ? "transient" : response.status === 409 ? "conflict" : "rejected" };
}
