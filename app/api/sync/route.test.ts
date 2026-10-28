import { describe, expect, it, vi } from "vitest";

const { getContext, recordScan, selectPickUnit } = vi.hoisted(() => ({
  getContext: vi.fn(),
  recordScan: vi.fn(),
  selectPickUnit: vi.fn(),
}));

vi.mock("@/lib/auth/page-resolver", () => ({ createPageResolver: vi.fn(async () => ({ getContext })) }));
vi.mock("@/lib/actions/receiving", () => ({ recordScan }));
vi.mock("@/lib/actions/withdrawals", () => ({ selectPickUnit }));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sync", () => {
  it("rejects replay under a different authenticated actor", async () => {
    getContext.mockResolvedValue({ kind: "authorized", context: { userId: "user-2" } });
    const response = await POST(request({
      outbox_id: "op-1",
      action_type: "receiving_scan_observation",
      captured_by_user_id: "user-1",
      payload: { wrrId: "wrr-1", wrrItemId: "line-1", scannedBarcode: "BC-1" },
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ outcome: "conflict", detail: { reason: "actor_mismatch" } });
    expect(recordScan).not.toHaveBeenCalled();
  });

  it("routes an authorized receiving observation to the owning command", async () => {
    getContext.mockResolvedValue({ kind: "authorized", context: { userId: "user-1" } });
    recordScan.mockResolvedValue({ ok: true, remainingQty: 0, disposition: "store" });
    const response = await POST(request({
      outbox_id: "op-2",
      action_type: "receiving_scan_observation",
      captured_by_user_id: "user-1",
      payload: { wrrId: "wrr-1", wrrItemId: "line-1", scannedBarcode: "BC-1" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "applied" });
    expect(recordScan).toHaveBeenCalledWith(expect.anything(), "wrr-1", "BC-1", undefined, "line-1");
  });
});
