import { beforeEach, describe, expect, it, vi } from "vitest";

const { getContext, recordScan, selectPickUnit, replayScan, network } = vi.hoisted(() => ({
  getContext: vi.fn(), recordScan: vi.fn(), selectPickUnit: vi.fn(), replayScan: vi.fn(), network: vi.fn(),
}));
vi.mock("@/lib/auth/page-resolver", () => ({ createPageResolver: vi.fn(async () => ({ getContext })) }));
vi.mock("@/lib/actions/receiving", () => ({ recordScan }));
vi.mock("@/lib/actions/withdrawals", () => ({ selectPickUnit }));
vi.mock("@/lib/auth/get-authenticated-session", () => ({ getAuthenticatedSession: vi.fn() }));
vi.mock("@/lib/db/rls-pool", () => ({ rlsPool: {} }));
vi.mock("@/app/(authenticated)/settings/security/actions", () => ({ verifyFloorNetworkAccess: network }));
vi.mock("@/lib/offline/server-replay", async (original) => ({
  ...await original<typeof import("@/lib/offline/server-replay")>(), replayScan,
}));
import { POST } from "./route";
import { ReplayCommandRejected } from "@/lib/offline/server-replay";

const body = { outbox_id: "op-1", action_type: "receiving_scan_observation", captured_by_user_id: "user-1",
  payload: { wrrId: "wrr-1", wrrItemId: "line-1", scannedBarcode: "BC-1" } };
function request(data: unknown = body) {
  return new Request("http://localhost/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
}
const context = { userId: "user-1", profileStatus: "active", activeRoleKeys: ["warehouse_staff"], partyScopes: [],
  grants: [{ resource: "receiving", action: "scan", scopeKind: "global" },
    { resource: "pick_list", action: "execute", scopeKind: "global" },
    { resource: "dispatch", action: "execute", scopeKind: "global" }] };

describe("POST /api/sync durable replay boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getContext.mockResolvedValue({ kind: "authorized", context });
    network.mockResolvedValue({ allowed: true });
    recordScan.mockResolvedValue({ ok: true, remainingQty: 0, disposition: "store" });
    replayScan.mockImplementation(async (_deps, _command, apply) => ({ outcome: "applied", detail: await apply({ pool: "borrowed" }) }));
  });
  it.each([null, [], false])("rejects a non-object envelope: %j", async (data) => {
    expect((await POST(request(data))).status).toBe(400);
    expect(replayScan).not.toHaveBeenCalled();
  });
  it("rejects inherited object keys as unregistered policies", async () => {
    expect((await POST(request({ ...body, action_type: "__proto__" }))).status).toBe(422);
    expect(replayScan).not.toHaveBeenCalled();
  });
  it("rejects replay under a different authenticated actor", async () => {
    getContext.mockResolvedValue({ kind: "authorized", context: { ...context, userId: "user-2" } });
    const result = await POST(request());
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ outcome: "conflict", detail: { reason: "actor_mismatch" } });
    expect(replayScan).not.toHaveBeenCalled();
  });
  it("binds operation identity and uses the borrowed transaction for the owning action", async () => {
    const result = await POST(request());
    expect(await result.json()).toMatchObject({ outcome: "applied" });
    expect(replayScan).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ operationId: "op-1", actorId: "user-1", fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }), expect.any(Function));
    expect(recordScan).toHaveBeenCalledWith(expect.anything(), "wrr-1", "BC-1", { pool: "borrowed" }, "line-1");
  });
  it("returns the original duplicate acknowledgement after rechecking current access", async () => {
    replayScan.mockResolvedValue({ outcome: "duplicate", detail: { ok: true, remainingQty: 0 } });
    const result = await POST(request());
    expect(await result.json()).toMatchObject({ outcome: "duplicate", detail: { remainingQty: 0 } });
    expect(recordScan).not.toHaveBeenCalled();
  });
  it("does not acknowledge a stored receipt after capability revocation", async () => {
    getContext.mockResolvedValue({ kind: "authorized", context: { ...context, grants: [] } });
    const result = await POST(request());
    expect(result.status).toBe(403);
    expect(replayScan).not.toHaveBeenCalled();
  });
  it("fails closed on a missing exact line reference", async () => {
    const result = await POST(request({ ...body, payload: { wrrId: "wrr-1", scannedBarcode: "BC-1" } }));
    expect(result.status).toBe(422);
    expect(replayScan).not.toHaveBeenCalled();
  });
  it("reports changed-key reuse as conflict and persistence failure as retryable", async () => {
    replayScan.mockRejectedValueOnce({ code: "22023" });
    expect((await POST(request())).status).toBe(409);
    replayScan.mockRejectedValueOnce(new Error("receipt_write_failed"));
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ outcome: "transient" });
  });
  it("returns an owning-command conflict without treating it as success", async () => {
    replayScan.mockRejectedValue(new ReplayCommandRejected({ ok: false, reason: "stale_scan" }));
    const result = await POST(request());
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ outcome: "conflict", detail: { reason: "stale_scan" } });
  });
  it("routes picking through the same durable receipt boundary", async () => {
    selectPickUnit.mockResolvedValue({ ok: true, selectedCount: 5, requiredCount: 5 });
    const result = await POST(request({ ...body, action_type: "pick_list_scan_observation", payload: { pickListId: "pick-1", pickListItemId: "pick-line-1", scannedBarcode: "LOT" } }));
    expect(await result.json()).toMatchObject({ outcome: "applied" });
    expect(selectPickUnit).toHaveBeenCalledWith(expect.anything(), "pick-1", "LOT", { pool: "borrowed" }, "pick-line-1");
  });
});
