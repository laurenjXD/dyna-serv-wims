import { NextResponse } from "next/server";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { admitOfflineOperation, type OfflineOperationType } from "@/lib/offline";
import { recordScan } from "@/lib/actions/receiving";
import { selectPickUnit } from "@/lib/actions/withdrawals";

export const dynamic = "force-dynamic";

type SyncRequest = {
  outbox_id?: unknown;
  client_id?: unknown;
  action_type?: unknown;
  version?: unknown;
  payload?: unknown;
  captured_by_user_id?: unknown;
};

function response(outcome: "applied" | "duplicate" | "conflict" | "rejected" | "transient", detail?: unknown, status = 200) {
  return NextResponse.json({ outcome, detail }, { status, headers: { "cache-control": "no-store" } });
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Foreground replay boundary for the two live floor observation flows.
 * The owning actions remain the authority: this endpoint never writes an
 * inventory balance, creates a lot, confirms putaway, or dispatches a list.
 */
export async function POST(request: Request) {
  let body: SyncRequest;
  try {
    body = await request.json() as SyncRequest;
  } catch {
    return response("rejected", { reason: "invalid_json" }, 400);
  }

  const operationId = text(body.outbox_id) ?? text(body.client_id);
  const capturedByUserId = text(body.captured_by_user_id);
  const actionType = text(body.action_type) as OfflineOperationType | null;
  if (!operationId || !capturedByUserId || !actionType) {
    return response("rejected", { reason: "invalid_envelope" }, 400);
  }

  const admission = admitOfflineOperation({
    id: operationId,
    capturedByUserId,
    actionType,
    version: typeof body.version === "number" ? body.version : undefined,
    payload: body.payload,
  });
  if (!admission.ok) return response("rejected", { reason: admission.code }, 422);

  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();
  if (resolution.kind !== "authorized") return response("rejected", { reason: "authorization_failure" }, 403);
  if (resolution.context.userId !== capturedByUserId) {
    return response("conflict", { reason: "actor_mismatch" }, 409);
  }

  const payload = admission.envelope.payload;
  const barcode = text(payload.scannedBarcode ?? payload.barcode);
  if (!barcode) return response("rejected", { reason: "missing_scanned_barcode" }, 422);

  try {
    if (actionType === "receiving_scan_observation") {
      const wrrId = text(payload.wrrId ?? payload.wrr_id);
      if (!wrrId) return response("rejected", { reason: "missing_wrr_id" }, 422);
      const expectedWrrItemId = text(payload.wrrItemId ?? payload.wrr_item_id) ?? undefined;
      const result = await recordScan(resolver, wrrId, barcode, undefined, expectedWrrItemId);
      if (result.ok) return response("applied", result);
      return response(result.reason === "forbidden" ? "rejected" : "conflict", { reason: result.reason }, result.reason === "forbidden" ? 403 : 409);
    }

    if (actionType === "pick_list_scan_observation") {
      const pickListId = text(payload.pickListId ?? payload.pick_list_id);
      if (!pickListId) return response("rejected", { reason: "missing_pick_list_id" }, 422);
      const expectedPickListItemId = text(payload.pickListItemId ?? payload.pick_list_item_id) ?? undefined;
      const result = await selectPickUnit(resolver, pickListId, barcode, undefined, expectedPickListItemId);
      if (result.ok) return response("applied", result);
      return response(result.errors[0] === "forbidden" ? "rejected" : "conflict", { reason: result.errors[0] ?? "scan_rejected" }, result.errors[0] === "forbidden" ? 403 : 409);
    }

    // Inspection evidence is allowlisted in the shared contract but has no
    // owning runtime endpoint in this release. Fail closed and preserve the
    // local entry for attention rather than pretending it was accepted.
    return response("rejected", { reason: "inspection_sync_not_configured" }, 422);
  } catch {
    return response("transient", { reason: "server_unavailable" }, 503);
  }
}
