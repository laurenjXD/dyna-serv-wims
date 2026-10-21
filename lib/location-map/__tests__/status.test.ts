import { describe, expect, it } from "vitest";
import { getLocationMapStatus, getLocationUtilizationPct } from "@/lib/location-map/status";

describe("warehouse map status", () => {
  it("treats inactive, unmapped, and missing-capacity locations as unavailable", () => {
    expect(getLocationMapStatus({ isActive: false, maxCbmCapacity: 10, occupiedCbm: 0 })).toBe("unavailable");
    expect(getLocationMapStatus({ isActive: true, maxCbmCapacity: 10, occupiedCbm: 3, isMapped: false })).toBe("unavailable");
    expect(getLocationMapStatus({ isActive: true, maxCbmCapacity: null, occupiedCbm: 0 })).toBe("unavailable");
  });

  it("uses the approved 75% and 90% thresholds", () => {
    expect(getLocationMapStatus({ isActive: true, maxCbmCapacity: 10, occupiedCbm: 0 })).toBe("available");
    expect(getLocationMapStatus({ isActive: true, maxCbmCapacity: 10, occupiedCbm: 5 })).toBe("occupied");
    expect(getLocationMapStatus({ isActive: true, maxCbmCapacity: 10, occupiedCbm: 7.5 })).toBe("near_capacity");
    expect(getLocationMapStatus({ isActive: true, maxCbmCapacity: 10, occupiedCbm: 9 })).toBe("full");
  });

  it("does not report a utilization percentage without a positive capacity", () => {
    expect(getLocationUtilizationPct(0, 4)).toBeNull();
    expect(getLocationUtilizationPct(null, 4)).toBeNull();
    expect(getLocationUtilizationPct(8, 6)).toBe(75);
  });
});

