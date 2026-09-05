import { describe, it, expect } from "vitest";
import {
  VEHICLE_TYPES,
  LOGISTICS_RATE_MATRIX,
  lookupEffectiveLogisticsRate,
} from "../rate-matrix";

describe("Logistics Rate Matrix", () => {
  it("exports standard vehicle types", () => {
    expect(VEHICLE_TYPES).toContain("4-Wheeler");
    expect(VEHICLE_TYPES).toContain("6-Wheeler");
    expect(VEHICLE_TYPES).toContain("6-Wheeler Forward");
    expect(VEHICLE_TYPES).toContain("10-Wheeler Forward");
    expect(VEHICLE_TYPES).toContain("Customer Pick-up (Self-service)");
  });

  it("accurately returns Clark 10-Wheeler Forward rate of ₱7,230.00", () => {
    const rate = lookupEffectiveLogisticsRate("UPI — Clark Facility", "10-Wheeler Forward");
    expect(rate).toBe(7230.0);
  });

  it("accurately returns Cavite Assembly rates based on vehicle type", () => {
    expect(lookupEffectiveLogisticsRate("UPI — Cavite Assembly Plant A", "6-Wheeler Forward")).toBe(3000.0);
    expect(lookupEffectiveLogisticsRate("UPI — Cavite Assembly Plant A", "6-Wheeler")).toBe(2000.0);
    expect(lookupEffectiveLogisticsRate("UPI — Cavite Assembly Plant A", "4-Wheeler")).toBe(600.0);
  });

  it("returns 0 for customer pick-up / self-service regardless of destination", () => {
    expect(lookupEffectiveLogisticsRate("UPI — Clark Facility", "Customer Pick-up (Self-service)")).toBe(0.0);
    expect(lookupEffectiveLogisticsRate("AMPLEON (Laguna)", "Customer Pick-up (Self-service)")).toBe(0.0);
  });

  it("fuzzy matches destination names", () => {
    expect(lookupEffectiveLogisticsRate("Clark Subcontractor", "10-Wheeler Forward")).toBe(7230.0);
    expect(lookupEffectiveLogisticsRate("Ampleon Laguna Hub", "6-Wheeler Forward")).toBe(3470.0);
  });
});
