import { describe, expect, it } from "vitest";
import { evaluateExpiry, expiryReviewKey, manilaBusinessDate, validateExpiryAcknowledgement } from "../expiry-policy";

// Material expiry policy amendment R1/R2/R4: calendar expiry and explicit policy.
const now = new Date("2026-11-04T04:00:00.000Z");
const base = {
  expiryDate: "2026-11-03",
  expiryPolicy: "block_release",
  lotStatus: "available",
  isPerishable: false,
  now,
};

describe("R2: one server-derived Asia/Manila expiry boundary", () => {
  it("uses the next Manila date while UTC is still the previous day", () => {
    expect(manilaBusinessDate(new Date("2026-11-03T16:00:00.000Z"))).toBe("2026-11-04");
    expect(manilaBusinessDate(new Date("2026-11-03T15:59:59.999Z"))).toBe("2026-11-03");
  });

  it("remains valid through the complete printed expiry day", () => {
    expect(evaluateExpiry({ ...base, expiryDate: "2026-11-04" })).toMatchObject({
      pastExpiry: false, daysPastExpiry: 0, businessDate: "2026-11-04",
      eligible: true, requiresAcknowledgement: false,
    });
  });

  it("blocks from the first instant of the following Manila day", () => {
    expect(evaluateExpiry({ ...base, now: new Date("2026-11-03T16:00:00.000Z") })).toMatchObject({
      pastExpiry: true, daysPastExpiry: 1, eligible: false,
    });
  });

  it("counts calendar days across months and a leap day", () => {
    expect(evaluateExpiry({ ...base, expiryDate: "2024-02-28", now: new Date("2024-03-01T04:00:00Z") })).toMatchObject({
      pastExpiry: true, daysPastExpiry: 2,
    });
    expect(evaluateExpiry({ ...base, expiryDate: "2024-02-29", now: new Date("2024-03-01T04:00:00Z") })).toMatchObject({
      pastExpiry: true, daysPastExpiry: 1,
    });
  });

  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-11-00", "2026-11-32", "11/03/2026", "not-a-date"])(
    "rejects the invalid calendar date %s instead of silently normalizing it",
    (expiryDate) => {
      const result = evaluateExpiry({ ...base, expiryDate });
      expect(result.eligible).toBe(false);
      expect(result.error).toEqual(expect.any(String));
      expect(result.requiresAcknowledgement).toBe(false);
    },
  );

  it("allows a legitimately undated non-perishable without inventing expiry", () => {
    expect(evaluateExpiry({ ...base, expiryDate: null })).toMatchObject({
      pastExpiry: false, daysPastExpiry: 0, eligible: true, requiresAcknowledgement: false,
    });
  });

  it("does not let permissive policy bypass the required perishable expiry date", () => {
    const result = evaluateExpiry({ ...base, expiryDate: null, isPerishable: true, expiryPolicy: "allow_with_acknowledgement" });
    expect(result.eligible).toBe(false);
    expect(result.error).toEqual(expect.any(String));
  });
});

describe("R5/R6: acknowledgement binds to the actual reviewed allocation and business date", () => {
  const line = {
    itemId: "item-1", lotId: "lot-1", locationId: "location-1", qty: 12,
    expiryDate: "2026-11-03", expiryPolicy: "allow_with_acknowledgement" as const,
    expiryPolicyVersion: 2,
  };

  it("creates the same review identity regardless of input line order", () => {
    const second = { ...line, lotId: "lot-2", locationId: "location-2" };
    expect(expiryReviewKey([line, second], now)).toBe(expiryReviewKey([second, line], now));
  });

  it("invalidates review at the next Manila business date", () => {
    expect(expiryReviewKey([line], now)).not.toBe(expiryReviewKey([line], new Date("2026-11-04T16:00:00Z")));
  });

  it.each([
    { itemId: "item-2" }, { lotId: "lot-2" }, { locationId: "location-2" },
    { qty: 13 }, { expiryDate: "2026-11-02" }, { expiryPolicyVersion: 3 },
    { expiryPolicy: "block_release" as const },
  ])("invalidates review when an acknowledged fact changes: %j", (change) => {
    expect(expiryReviewKey([line], now)).not.toBe(expiryReviewKey([{ ...line, ...change }], now));
  });

  it("requires a positive acknowledgement, reason, and matching current review", () => {
    const input = { acknowledged: true, reason: "Customer requested the material", reviewKey: expiryReviewKey([line], now) };
    expect(validateExpiryAcknowledgement(input, [line], now)).toBe(true);
    expect(validateExpiryAcknowledgement({ ...input, acknowledged: false }, [line], now)).toBe(false);
    expect(validateExpiryAcknowledgement({ ...input, reason: "   " }, [line], now)).toBe(false);
    expect(validateExpiryAcknowledgement({ ...input, reason: "a".repeat(1001) }, [line], now)).toBe(false);
    expect(validateExpiryAcknowledgement({ ...input, reviewKey: "stale" }, [line], now)).toBe(false);
    expect(validateExpiryAcknowledgement(null, [line], now)).toBe(false);
    expect(validateExpiryAcknowledgement({ ...input, acknowledged: "true" }, [line], now)).toBe(false);
  });

  it("rejects the old acknowledgement after a quantity edit or midnight", () => {
    const input = { acknowledged: true, reason: "Documented request", reviewKey: expiryReviewKey([line], now) };
    expect(validateExpiryAcknowledgement(input, [{ ...line, qty: 13 }], now)).toBe(false);
    expect(validateExpiryAcknowledgement(input, [line], new Date("2026-11-04T16:00:00Z"))).toBe(false);
  });
});

describe("R1/R4: explicit item policy and independent quality state", () => {
  it("blocks dated expired material even when it is non-perishable", () => {
    expect(evaluateExpiry(base)).toMatchObject({
      pastExpiry: true, daysPastExpiry: 1, eligible: false, requiresAcknowledgement: false,
    });
  });

  it("allows explicitly permissive dated material only with acknowledgement", () => {
    expect(evaluateExpiry({ ...base, expiryPolicy: "allow_with_acknowledgement" })).toMatchObject({
      pastExpiry: true, daysPastExpiry: 1, eligible: true, requiresAcknowledgement: true,
    });
  });

  it.each([undefined, null, "allow", "", "unexpected_policy"])("fails closed for unknown or absent policy %s", (expiryPolicy) => {
    const result = evaluateExpiry({ ...base, expiryPolicy });
    expect(result.eligible).toBe(false);
    expect(result.error).toEqual(expect.any(String));
    expect(result.requiresAcknowledgement).toBe(false);
  });

  it.each(["quarantined", "held", "rejected", "staged", "depleted", "expired"])(
    "never reopens %s stock merely because its item permits past-expiry release",
    (lotStatus) => {
      expect(evaluateExpiry({ ...base, lotStatus, expiryPolicy: "allow_with_acknowledgement" })).toMatchObject({
        pastExpiry: true, eligible: false, requiresAcknowledgement: false,
      });
    },
  );

  it("does not require an expiry acknowledgement for a future-dated permissive lot", () => {
    expect(evaluateExpiry({ ...base, expiryDate: "2026-11-05", expiryPolicy: "allow_with_acknowledgement" })).toMatchObject({
      pastExpiry: false, eligible: true, requiresAcknowledgement: false,
    });
  });
});
