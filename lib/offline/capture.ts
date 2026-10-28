import {
  admitOfflineOperation,
  createOfflineOperationId,
  type OfflineOperationType,
  type OfflineQueueEnvelope,
} from "./index";
import { enqueueOfflineEntry } from "./storage";
import { storage } from "@/lib/storage";

let sequence = 0;

function nextClientSequenceId(): number {
  const key = "wms-offline-client-sequence";
  const previous = Number(storage.session.get(key) ?? 0);
  sequence = Math.max(sequence + 1, Number.isFinite(previous) ? previous + 1 : 1);
  storage.session.set(key, String(sequence));
  return sequence;
}

export async function queueOfflineObservation(input: {
  capturedByUserId: string;
  actionType: OfflineOperationType;
  payload: Record<string, unknown>;
}): Promise<OfflineQueueEnvelope> {
  const id = createOfflineOperationId();
  const clientSequenceId = nextClientSequenceId();
  const idempotencyKey = `${input.actionType}:${id}`;
  const admission = admitOfflineOperation({
    id,
    capturedByUserId: input.capturedByUserId,
    actionType: input.actionType,
    payload: {
      ...input.payload,
      clientSequenceId,
      capturedAt: new Date().toISOString(),
      idempotencyKey,
    },
  });
  if (!admission.ok) throw new Error(admission.code);

  const orderingKey = input.actionType === "receiving_scan_observation"
    ? String(input.payload.wrrItemId ?? input.payload.wrrId)
    : input.actionType === "pick_list_scan_observation"
      ? String(input.payload.pickListItemId ?? input.payload.pickListId)
      : String(input.payload.inspectionCaseId);
  await enqueueOfflineEntry(admission.envelope, orderingKey);
  return admission.envelope;
}
