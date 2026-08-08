// RED-step unit tests for lib/approval/expiry.ts (does not exist yet).
//
// Traceability:
//   design.md §5 — "Requests expire 30 minutes after created_at (configurable
//     per policy; the fifo_override policy uses 30 minutes). An expired
//     request cannot be approved, rejected, or consumed — the reviewer's
//     action is rejected with an expiry error."
//   design.md §5 — "Expiry evaluation happens at decision time; a background
//     job may also sweep and mark requests expired for queue display purposes,
//     but the decision command re-checks expiry independently and does not
//     trust the expired status column alone."
//   design.md §3 — "fifo_override always has expiry" (expiry:'required').
//   requirements.md R2.1 — only valid transitions may be applied (expired
//     requests cannot transition to approved).
//   requirements.md R2.3 — "Expiry and supersession SHALL be explicit,
//     attributable, and auditable."
//   tasks.md §4 — "Implement expiry/supersession jobs or request-time
//     evaluation with clear ownership and retry behavior."
//   tasks.md Testing matrix — "State transitions, expiry/supersession/
//     cancellation, self-approval, and reason rules."
//
// These tests import from @/lib/approval/expiry which does not exist.
// Every test is expected to fail with "Cannot find module" until the
// backend-builder creates the implementation.
//
// Expected module contract for lib/approval/expiry.ts:
//   isExpired(params: {
//     createdAt:  Date;
//     expiryAt:   Date | null | undefined;
//     now:        Date;        // caller-supplied — never uses Date.now() internally
//   }): { expired: true; expiredAt: Date } | { expired: false }
//
// The fifo_override policy sets expiryAt = createdAt + 30 minutes.
// A request with no expiryAt is treated as invalid (fail-closed → expired:true).

import { describe, expect, it } from "vitest";

const MINUTES = 60 * 1000;

describe("expiry — a request with 30-min policy that has not yet expired (design.md §5)", () => {
  it("returns { expired: false } when now is 29 minutes after created_at", async () => {
    const { isExpired } = await import("@/lib/approval/expiry");

    const createdAt = new Date("2026-08-08T09:00:00.000Z");
    const expiryAt = new Date(createdAt.getTime() + 30 * MINUTES);
    const now = new Date(createdAt.getTime() + 29 * MINUTES);

    const result = isExpired({ createdAt, expiryAt, now });

    expect(result.expired).toBe(false);
  });

  it("returns { expired: false } when now equals created_at exactly (brand-new request)", async () => {
    const { isExpired } = await import("@/lib/approval/expiry");

    const createdAt = new Date("2026-08-08T09:00:00.000Z");
    const expiryAt = new Date(createdAt.getTime() + 30 * MINUTES);

    const result = isExpired({ createdAt, expiryAt, now: createdAt });

    expect(result.expired).toBe(false);
  });
});

describe("expiry — a request that has passed its expiry_at (design.md §5)", () => {
  it("returns { expired: true } when now is 31 minutes after created_at (30-min policy)", async () => {
    const { isExpired } = await import("@/lib/approval/expiry");

    const createdAt = new Date("2026-08-08T09:00:00.000Z");
    const expiryAt = new Date(createdAt.getTime() + 30 * MINUTES);
    const now = new Date(createdAt.getTime() + 31 * MINUTES);

    const result = isExpired({ createdAt, expiryAt, now });

    expect(result.expired).toBe(true);
  });

  it("returns { expired: true } when now equals expiry_at exactly (boundary: at expiry is considered expired)", async () => {
    const { isExpired } = await import("@/lib/approval/expiry");

    const createdAt = new Date("2026-08-08T09:00:00.000Z");
    const expiryAt = new Date(createdAt.getTime() + 30 * MINUTES);

    const result = isExpired({ createdAt, expiryAt, now: expiryAt });

    expect(result.expired).toBe(true);
  });
});

describe("expiry — uses caller-supplied now, not Date.now() (design.md §5 determinism requirement)", () => {
  it("gives different results for the same request depending on the 'now' parameter", async () => {
    const { isExpired } = await import("@/lib/approval/expiry");

    const createdAt = new Date("2026-08-08T09:00:00.000Z");
    const expiryAt = new Date(createdAt.getTime() + 30 * MINUTES);

    const notExpiredNow = new Date(createdAt.getTime() + 1 * MINUTES);
    const expiredNow = new Date(createdAt.getTime() + 35 * MINUTES);

    const resultA = isExpired({ createdAt, expiryAt, now: notExpiredNow });
    const resultB = isExpired({ createdAt, expiryAt, now: expiredNow });

    expect(resultA.expired).toBe(false);
    expect(resultB.expired).toBe(true);
  });

  it("two calls with the same now parameter produce the same result (pure function — no hidden clock)", async () => {
    const { isExpired } = await import("@/lib/approval/expiry");

    const createdAt = new Date("2026-08-08T09:00:00.000Z");
    const expiryAt = new Date(createdAt.getTime() + 30 * MINUTES);
    const now = new Date(createdAt.getTime() + 15 * MINUTES);

    const result1 = isExpired({ createdAt, expiryAt, now });
    const result2 = isExpired({ createdAt, expiryAt, now });

    expect(result1.expired).toBe(result2.expired);
  });
});

describe("expiry — missing expiryAt is treated as invalid (fail-closed, design.md §3 'fifo_override always has expiry')", () => {
  it("returns { expired: true } when expiryAt is null (fail-closed — no expiry means unsafe)", async () => {
    const { isExpired } = await import("@/lib/approval/expiry");

    const createdAt = new Date("2026-08-08T09:00:00.000Z");
    const now = new Date(createdAt.getTime() + 1 * MINUTES);

    const result = isExpired({ createdAt, expiryAt: null, now });

    expect(result.expired).toBe(true);
  });

  it("returns { expired: true } when expiryAt is undefined (fail-closed)", async () => {
    const { isExpired } = await import("@/lib/approval/expiry");

    const createdAt = new Date("2026-08-08T09:00:00.000Z");
    const now = new Date(createdAt.getTime() + 1 * MINUTES);

    const result = isExpired({ createdAt, expiryAt: undefined, now });

    expect(result.expired).toBe(true);
  });
});

describe("expiry — expired result carries the expiredAt Date for auditability (requirements.md R2.3)", () => {
  it("expired result includes the expiredAt timestamp that caused the expiry", async () => {
    const { isExpired } = await import("@/lib/approval/expiry");

    const createdAt = new Date("2026-08-08T09:00:00.000Z");
    const expiryAt = new Date(createdAt.getTime() + 30 * MINUTES);
    const now = new Date(createdAt.getTime() + 31 * MINUTES);

    const result = isExpired({ createdAt, expiryAt, now });

    expect(result.expired).toBe(true);
    if (!result.expired) return;
    expect(result.expiredAt).toBeInstanceOf(Date);
    // expiredAt should equal the expiryAt threshold (not the 'now' time)
    expect(result.expiredAt!.getTime()).toBe(expiryAt.getTime());
  });
});
