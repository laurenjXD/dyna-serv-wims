import { describe, expect, it, vi } from "vitest";
import { replayOfflineEntries, retryDelayMs } from "../sync";
import type { OfflineQueueEnvelope } from "../index";

const entry = (id: string, createdAt: number, user = "user-1"): OfflineQueueEnvelope => ({
  id,
  capturedByUserId: user,
  actionType: "receiving_scan_observation",
  version: 1,
  payload: { wrrItemId: "wrr-item-1" },
  createdAt,
  attempts: 0,
  status: "pending",
});

describe("offline replay coordinator", () => {
  it("replays serially in creation order and ignores another user's entries", async () => {
    const submit = vi.fn(async (value: OfflineQueueEnvelope) => ({ outcome: value.id === "a" ? "applied" as const : "duplicate" as const }));
    const result = await replayOfflineEntries([entry("b", 2), entry("a", 1), entry("x", 0, "user-2")], "user-1", submit);
    expect(result.map((item) => item.entry.id)).toEqual(["a", "b"]);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("uses bounded exponential retry delays", () => {
    expect(retryDelayMs(0)).toBe(500);
    expect(retryDelayMs(5)).toBe(16000);
    expect(retryDelayMs(20)).toBe(30000);
  });
});
