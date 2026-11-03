// Backend SQL only. Never export this module through the client offline index.
import { createHash } from "node:crypto";
import { withRlsTransaction, type RlsTransactionDeps } from "@/lib/db/rls-transaction";

export function scanCommandFingerprint(action: string, resource: string, line: string, barcode: string): string {
  return createHash("sha256").update(JSON.stringify([action, resource, line, barcode])).digest("hex");
}

export class ReplayCommandRejected extends Error {
  constructor(readonly result: { ok: false; reason?: string; errors?: string[] }) {
    super("offline_scan_rejected");
  }
}

/** Claim/check, owning mutation, and durable result use ONE RLS transaction. */
export async function replayScan<T extends { ok: boolean }>(
  deps: RlsTransactionDeps,
  command: { actorId: string; operationId: string; actionType: string; fingerprint: string },
  apply: (borrowedDeps: RlsTransactionDeps) => Promise<T>,
): Promise<{ outcome: "applied" | "duplicate"; detail: T }> {
  const session = await deps.getAuthenticatedSession();
  if (!session || session.userId !== command.actorId) throw new Error("offline_replay_forbidden");
  const result = await withRlsTransaction({ ...deps, getAuthenticatedSession: async () => session }, async (tx) => {
    const params = [command.operationId, command.actionType, command.fingerprint];
    const rows = await tx.execute({
      sql: "select offline_internal.read_scan_receipt($1, $2, $3) as result",
      params,
    }) as Array<{ result: T | null }>;
    if (rows[0]?.result) return { outcome: "duplicate" as const, detail: rows[0].result };

    // Existing actions keep their current auth/RLS checks, but borrow this
    // connection. Only the outer wrapper may commit, rollback, or release it.
    const borrowedDeps: RlsTransactionDeps = {
      getAuthenticatedSession: async () => session,
      pool: { connect: async () => ({
        begin: async () => tx,
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
      }) },
    };
    const detail = await apply(borrowedDeps);
    if (!detail.ok) throw new ReplayCommandRejected(detail as { ok: false; reason?: string; errors?: string[] });
    await tx.execute({
      sql: "select offline_internal.write_scan_receipt($1, $2, $3, $4::text::jsonb)",
      // The explicit text parameter works both with postgres.js's JSONB
      // serializer and Drizzle's patched pass-through JSONB serializer.
      params: [...params, JSON.stringify(detail)],
    });
    return { outcome: "applied" as const, detail };
  });
  if (result.kind !== "ok") throw new Error("offline_replay_forbidden");
  return result.value;
}
