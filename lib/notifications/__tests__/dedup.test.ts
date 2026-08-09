import { describe, expect, it } from "vitest";
import { buildIdempotencyKey, isWithinCooldown } from "../dedup";

describe("buildIdempotencyKey (design.md §4 composite dedup key)", () => {
  it("produces the same key for the same (eventId, recipientId, channel, templateVersion)", () => {
    const a = buildIdempotencyKey({
      eventId: "evt-1",
      recipientId: "user-1",
      channel: "email",
      templateVersion: "v1",
    });
    const b = buildIdempotencyKey({
      eventId: "evt-1",
      recipientId: "user-1",
      channel: "email",
      templateVersion: "v1",
    });
    expect(a).toBe(b);
  });

  it("produces a different key when any one input differs", () => {
    const base = { eventId: "evt-1", recipientId: "user-1", channel: "email" as const, templateVersion: "v1" };
    const key = buildIdempotencyKey(base);
    expect(buildIdempotencyKey({ ...base, channel: "in_app" })).not.toBe(key);
    expect(buildIdempotencyKey({ ...base, recipientId: "user-2" })).not.toBe(key);
    expect(buildIdempotencyKey({ ...base, templateVersion: "v2" })).not.toBe(key);
  });
});

describe("isWithinCooldown (design.md §9 cooldown/deduplication)", () => {
  it("returns true when the last alert fired inside the cooldown window", () => {
    const now = new Date("2026-08-09T12:00:00Z");
    const lastFiredAt = new Date("2026-08-09T06:00:00Z"); // 6 hours ago
    expect(isWithinCooldown({ lastFiredAt, now, cooldownHours: 24 })).toBe(true);
  });

  it("returns false once the cooldown window has fully elapsed", () => {
    const now = new Date("2026-08-09T12:00:00Z");
    const lastFiredAt = new Date("2026-08-08T11:00:00Z"); // 25 hours ago
    expect(isWithinCooldown({ lastFiredAt, now, cooldownHours: 24 })).toBe(false);
  });

  it("returns false when there is no prior firing at all (null lastFiredAt)", () => {
    const now = new Date("2026-08-09T12:00:00Z");
    expect(isWithinCooldown({ lastFiredAt: null, now, cooldownHours: 24 })).toBe(false);
  });

  it("treats the exact cooldown boundary as no longer within cooldown", () => {
    const now = new Date("2026-08-09T12:00:00Z");
    const lastFiredAt = new Date("2026-08-08T12:00:00Z"); // exactly 24 hours ago
    expect(isWithinCooldown({ lastFiredAt, now, cooldownHours: 24 })).toBe(false);
  });
});
