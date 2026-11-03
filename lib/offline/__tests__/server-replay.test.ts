import { describe, expect, it, vi } from "vitest";
import { replayScan, ReplayCommandRejected, scanCommandFingerprint } from "../server-replay";
import { withRlsTransaction, type RlsTransactionDeps } from "@/lib/db/rls-transaction";

function harness(previous: unknown = null, failWrite = false) {
  const execute = vi.fn(async (statement: unknown) => {
    const query = statement as { sql: string };
    if (query.sql.includes("read_scan_receipt")) return [{ result: previous }];
    if (query.sql.includes("write_scan_receipt") && failWrite) throw new Error("write_failed");
    return [];
  });
  const connection = { begin: vi.fn(async () => ({ execute })), commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}), release: vi.fn() };
  const deps: RlsTransactionDeps = { getAuthenticatedSession: async () => ({ userId: "actor" }),
    pool: { connect: vi.fn(async () => connection) } };
  const command = { actorId: "actor", operationId: "op", actionType: "receiving_scan_observation", fingerprint: "a".repeat(64) };
  return { deps, command, connection, execute };
}

describe("durable scan replay transaction", () => {
  it("returns the durable original response after a lost acknowledgement without running the scan again", async () => {
    const original = { ok: true, remainingQty: 3 };
    const h = harness(original);
    const apply = vi.fn();
    expect(await replayScan(h.deps, h.command, apply)).toEqual({ outcome: "duplicate", detail: original });
    expect(apply).not.toHaveBeenCalled();
    expect(h.connection.commit).toHaveBeenCalledOnce();
  });
  it("borrows the same transaction and stores success before the only real commit", async () => {
    const h = harness();
    await replayScan(h.deps, h.command, async (deps) => {
      const result = await withRlsTransaction(deps, async (tx) => {
        await tx.execute({ sql: "domain_scan" });
        return { ok: true };
      });
      expect(h.connection.commit).not.toHaveBeenCalled();
      expect(h.connection.release).not.toHaveBeenCalled();
      return result.kind === "ok" ? result.value : { ok: false };
    });
    const statements = h.execute.mock.calls.map(([q]) => (q as { sql: string }).sql);
    expect(statements.indexOf("domain_scan")).toBeLessThan(statements.findIndex((q) => q.includes("write_scan_receipt")));
    expect(h.connection.begin).toHaveBeenCalledOnce();
    expect(h.connection.commit).toHaveBeenCalledOnce();
    expect(h.connection.release).toHaveBeenCalledOnce();
  });
  it("rolls back the scan when receipt persistence fails", async () => {
    const h = harness(null, true);
    await expect(replayScan(h.deps, h.command, async () => ({ ok: true }))).rejects.toThrow("write_failed");
    expect(h.connection.commit).not.toHaveBeenCalled();
    expect(h.connection.rollback).toHaveBeenCalledOnce();
  });
  it("rolls back a rejected owning action and never writes a receipt", async () => {
    const h = harness();
    await expect(replayScan(h.deps, h.command, async () => ({ ok: false as const, reason: "stale_scan" }))).rejects.toBeInstanceOf(ReplayCommandRejected);
    expect(h.connection.rollback).toHaveBeenCalledOnce();
    expect(h.execute.mock.calls.some(([q]) => (q as { sql: string }).sql.includes("write_scan_receipt"))).toBe(false);
  });
  it("rejects an actor mismatch before opening any database connection", async () => {
    const h = harness();
    await expect(replayScan(h.deps, { ...h.command, actorId: "other" }, vi.fn())).rejects.toThrow("offline_replay_forbidden");
    expect(h.deps.pool.connect).not.toHaveBeenCalled();
  });
  it("binds the fingerprint to command, parent, exact line, and barcode", () => {
    const args = ["receive", "wrr", "line", "barcode"] as const;
    const original = scanCommandFingerprint(...args);
    expect(original).toMatch(/^[a-f0-9]{64}$/);
    args.forEach((_, index) => {
      const changed = [...args]; changed[index] += "changed";
      expect(scanCommandFingerprint(changed[0], changed[1], changed[2], changed[3])).not.toBe(original);
    });
  });
});
