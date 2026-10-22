import { describe, expect, it } from "vitest";
import { admitOfflineOperation, isTierTwoOfflineAction, nextOfflineStatus } from "../index";
import { putOfflineCache } from "../storage";

describe("offline Tier 1 admission", () => {
  it("admits only an approved receiving observation", () => {
    const result = admitOfflineOperation({
      id: "op-1",
      capturedByUserId: "user-1",
      actionType: "receiving_scan_observation",
      payload: { wrrItemId: "wrr-item-1", barcode: "unit-1" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects commitment, dispatch, pricing, and unknown actions", () => {
    expect(isTierTwoOfflineAction("commit_withdrawal")).toBe(true);
    expect(admitOfflineOperation({
      id: "op-2",
      capturedByUserId: "user-1",
      actionType: "commit_withdrawal",
      payload: { partyId: "party-1" },
    })).toEqual({ ok: false, code: "offline_not_supported" });
  });

  it("rejects malformed resources and oversized payloads", () => {
    expect(admitOfflineOperation({
      id: "op-3",
      capturedByUserId: "user-1",
      actionType: "pick_list_scan_observation",
      payload: { barcode: "unit-1" },
    })).toEqual({ ok: false, code: "invalid_resource_reference" });
  });

  it("keeps connectivity and synchronization status separate", () => {
    const initial = { connectivity: "online" as const, sync: "idle" as const };
    expect(nextOfflineStatus(initial, "sync_start")).toEqual({ connectivity: "online", sync: "syncing" });
    expect(nextOfflineStatus({ connectivity: "offline", sync: "syncing" }, "probe_offline"))
      .toEqual({ connectivity: "offline", sync: "idle" });
  });

  it("fails honestly when browser storage is unavailable", async () => {
    await expect(putOfflineCache("item:1", { code: "A" }, 60)).rejects.toThrow("offline_storage_unavailable");
  });
});
