import { NextResponse } from "next/server";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { admitOfflineOperation, type OfflineOperationType } from "@/lib/offline";
import { recordScan } from "@/lib/actions/receiving";
import { selectPickUnit } from "@/lib/actions/withdrawals";
import { requirePermission } from "@/lib/rbac/guard";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { rlsPool } from "@/lib/db/rls-pool";
import { ReplayCommandRejected, replayScan, scanCommandFingerprint } from "@/lib/offline/server-replay";
import { verifyFloorNetworkAccess } from "@/app/(authenticated)/settings/security/actions";

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

  if (!body || typeof body !== "object" || Array.isArray(body)) return response("rejected", { reason: "invalid_envelope" }, 400);

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

  if (actionType === "inspection_observation") {
    return response("rejected", { reason: "inspection_sync_not_configured" }, 422);
  }
  if (operationId.length > 128) return response("rejected", { reason: "invalid_envelope" }, 400);
  const receiving = actionType === "receiving_scan_observation";
  const resourceId = receiving ? text(payload.wrrId ?? payload.wrr_id) : text(payload.pickListId ?? payload.pick_list_id);
  const lineId = receiving ? text(payload.wrrItemId ?? payload.wrr_item_id) : text(payload.pickListItemId ?? payload.pick_list_item_id);
  if (!resourceId || !lineId) return response("rejected", { reason: "missing_resource_reference" }, 422);

  try {
    // Check current access even when a completed receipt already exists.
    const capability = receiving ? "receiving.scan" : "pick_list.execute";
    const permission = await requirePermission(resolver, capability);
    if (permission.kind !== "authorized") return response("rejected", { reason: "forbidden" }, 403);
    if (!receiving && (await requirePermission(resolver, "dispatch.execute")).kind !== "authorized") {
      return response("rejected", { reason: "forbidden" }, 403);
    }
    if (!(await verifyFloorNetworkAccess()).allowed) {
      return response("rejected", { reason: "network_restricted" }, 403);
    }
    const result = await replayScan(
      { getAuthenticatedSession, pool: rlsPool },
      { actorId: capturedByUserId, operationId, actionType,
        fingerprint: scanCommandFingerprint(actionType, resourceId, lineId, barcode) },
      async (deps) => receiving
        ? recordScan(resolver, resourceId, barcode, deps, lineId)
        : selectPickUnit(resolver, resourceId, barcode, deps, lineId),
    );
    return response(result.outcome, result.detail);
  } catch (error) {
    if (error instanceof ReplayCommandRejected) {
      const reason = error.result.reason ?? error.result.errors?.[0] ?? "scan_rejected";
      return response(reason === "forbidden" ? "rejected" : "conflict", { reason }, reason === "forbidden" ? 403 : 409);
    }
    const databaseError = error as { code?: string; message?: string };
    if (databaseError.code === "42501" || databaseError.message === "offline_replay_forbidden") {
      return response("rejected", { reason: "forbidden" }, 403);
    }
    if (databaseError.code === "22023") return response("conflict", { reason: "operation_identity_mismatch" }, 409);
    // Missing migration, failed persistence, or interrupted DB connection all
    // remain retryable; never acknowledge a scan without its durable receipt.
    return response("transient", { reason: "server_unavailable" }, 503);
  }
}
