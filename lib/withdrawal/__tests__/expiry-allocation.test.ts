import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allocate, buildAllocationPlan, type LotLocationRow } from "../allocation";

type PolicyRow = LotLocationRow & { expiryPolicy?: "block_release" | "allow_with_acknowledgement" };
const row = (overrides: Partial<PolicyRow> = {}): PolicyRow => ({
  lotId: "old-lot", locationId: "storage-a", lotStatus: "available",
  lotNumber: "LOT-1", qtyRemaining: 24, qtyCommitted: 0,
  receivedAt: new Date("2026-10-01T00:00:00Z"), expiryDate: new Date("2026-11-03T00:00:00Z"),
  expiryPolicy: "block_release", ...overrides,
});

describe("R4/R5: allocation uses expiry eligibility before FIFO/FEFO ordering", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T04:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("excludes expired block-policy material even when its stored status remains available", () => {
    const expired = row();
    const current = row({ lotId: "current-lot", receivedAt: new Date("2026-10-02T00:00:00Z"), expiryDate: new Date("2026-11-05T00:00:00Z") });
    const result = allocate([expired, current], 12, false, 12);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lines).toEqual([{ lotId: "current-lot", locationId: "storage-a", qtyAllocated: 12 }]);
    expect(result.plan.totalAvailableQty).toBe(24);
    expect(expired.qtyRemaining).toBe(24);
    expect(expired.qtyCommitted).toBe(0);
  });

  it("retains explicitly permitted expired material in normal non-perishable FIFO order", () => {
    const old = row({ expiryPolicy: "allow_with_acknowledgement" });
    const current = row({ lotId: "current-lot", receivedAt: new Date("2026-10-02T00:00:00Z"), expiryDate: new Date("2026-11-05T00:00:00Z") });
    const result = allocate([current, old], 12, false, 12);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lines[0].lotId).toBe("old-lot");
    expect(result.plan.totalAvailableQty).toBe(48);
  });

  it("reports full demand and shortage when only expiry-blocked stock exists", () => {
    const plan = buildAllocationPlan([row()], 36, false, 12);
    expect(plan.requestedQty).toBe(36);
    expect(plan.totalAvailableQty).toBe(0);
    expect(plan.allocatedQty).toBe(0);
    expect(plan.remainingQty).toBe(36);
    expect(plan.lines).toEqual([]);
  });

  it("uses conservative block behavior when a dated legacy row has no policy", () => {
    expect(allocate([row({ expiryPolicy: undefined })], 12, false).ok).toBe(false);
  });

  it("never makes quarantined material allocatable through permissive expiry policy", () => {
    expect(allocate([row({ expiryPolicy: "allow_with_acknowledgement", lotStatus: "quarantined" })], 12, false).ok).toBe(false);
  });

  it("uses the same cutoff at Manila midnight for previews and final allocation", () => {
    vi.setSystemTime(new Date("2026-11-03T15:59:59Z"));
    expect(allocate([row()], 12, false).ok).toBe(true);
    vi.setSystemTime(new Date("2026-11-03T16:00:00Z"));
    expect(allocate([row()], 12, false).ok).toBe(false);
  });
});
