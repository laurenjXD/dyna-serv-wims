import { describe, expect, it, vi } from "vitest";

const { enqueueOfflineEntry } = vi.hoisted(() => ({
  enqueueOfflineEntry: vi.fn(async () => undefined),
}));

vi.mock("../storage", () => ({ enqueueOfflineEntry }));

import { queueOfflineObservation } from "../capture";

describe("offline capture", () => {
  it("creates a versioned user-owned receiving envelope and persists it", async () => {
    const entry = await queueOfflineObservation({
      capturedByUserId: "user-1",
      actionType: "receiving_scan_observation",
      payload: {
        wrrId: "wrr-1",
        wrrItemId: "wrr-item-1",
        scannedBarcode: "BARCODE-1",
        scannedQty: 1,
      },
    });

    expect(entry.actionType).toBe("receiving_scan_observation");
    expect(entry.capturedByUserId).toBe("user-1");
    expect(entry.status).toBe("pending");
    expect(entry.payload.idempotencyKey).toContain("receiving_scan_observation:");
    expect(enqueueOfflineEntry).toHaveBeenCalledWith(entry, "wrr-item-1");
  });

  it("fails closed for an unapproved operation", async () => {
    await expect(queueOfflineObservation({
      capturedByUserId: "user-1",
      actionType: "dispatch_finalization" as never,
      payload: { pickListId: "pick-1" },
    })).rejects.toThrow("offline_not_supported");
  });
});
