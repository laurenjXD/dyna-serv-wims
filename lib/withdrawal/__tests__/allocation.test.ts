// RED-step unit tests for lib/withdrawal/allocation.ts (does not exist yet).
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R3.1 — allocation SHALL consider only lots whose status = 'available'
//     R3.2 — allocation SHALL apply FEFO for perishable items and FIFO for
//             non-perishable items using approved ordering rules
//     R3.3 — allocation SHALL operate across dispersed locations and produce
//             lot/location quantities that can be physically picked
//     R3.4 — allocation SHALL account for already committed quantities so two
//             concurrent requests cannot reserve the same available stock
//     R3.5 — SHALL not implement a second per-feature lot eligibility rule
//             that contradicts the core lots.status gate
//     R1.3 — pick-list generation SHALL validate item_code_is_provisional
//             for every requested line and SHALL refuse with a recoverable
//             validation error (this pre-allocation gate is tested separately)
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md
//     §5 — Allocation and FIFO/FEFO design
//     §6 — Stage 1 commitment transaction, step 4 (provisional item code gate)
//
// Acceptance criteria covered (requirements.md §5):
//   "A valid pick-list generation action allocates authoritative available lots
//    using approved FEFO/FIFO ordering across dispersed locations."
//   "Pick-list generation is refused, with no partial pick list created, for
//    any requested line whose item_code_is_provisional is true."
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/withdrawal/allocation.ts (for backend-builder):
//
//   export type LotLocationRow = {
//     lotId: string;
//     locationId: string;
//     lotStatus: string;          // 'available' | 'quarantine' | 'expired' | ...
//     qtyRemaining: number;
//     qtyCommitted: number;
//     receivedAt: Date;           // used for FIFO ordering
//     expiryDate: Date | null;    // non-null for perishable items → FEFO ordering
//   };
//
//   export type AllocationLineResult = {
//     lotId: string;
//     locationId: string;
//     qtyAllocated: number;
//   };
//
//   export type AllocationResult =
//     | { ok: true; lines: AllocationLineResult[] }
//     | { ok: false; error: 'insufficient_stock' | string };
//
//   // Pure function — no DB access. Takes the full list of available lot/location
//   // rows for the requested item and returns an allocation plan.
//   // isPerishable controls FEFO (true) vs. FIFO (false) ordering.
//   export function allocate(
//     rows: LotLocationRow[],
//     requestedQty: number,
//     isPerishable: boolean,
//   ): AllocationResult;
//
//   export type ProvisionalCheckInput = {
//     itemCodeIsProvisional: boolean;
//     itemId: string;
//   };
//
//   export type ProvisionalCheckResult =
//     | { ok: true }
//     | { ok: false; error: 'provisional_item_code'; blockingItemIds: string[] };
//
//   // Pre-allocation gate per design.md §6 step 4.
//   // Checks all requested lines; if any have itemCodeIsProvisional = true,
//   // returns an error naming every blocking itemId (never partial).
//   export function checkProvisionalItemCodes(
//     lines: ProvisionalCheckInput[],
//   ): ProvisionalCheckResult;
//
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { allocate, checkProvisionalItemCodes } from "../allocation";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const BASE_DATE = new Date("2026-01-01T00:00:00Z");

function makeRow(overrides: {
  lotId?: string;
  locationId?: string;
  lotStatus?: string;
  qtyRemaining?: number;
  qtyCommitted?: number;
  receivedAt?: Date;
  expiryDate?: Date | null;
}) {
  return {
    lotId: overrides.lotId ?? "lot-uuid-1",
    locationId: overrides.locationId ?? "loc-uuid-1",
    lotStatus: overrides.lotStatus ?? "available",
    qtyRemaining: overrides.qtyRemaining ?? 100,
    qtyCommitted: overrides.qtyCommitted ?? 0,
    receivedAt: overrides.receivedAt ?? BASE_DATE,
    expiryDate: overrides.expiryDate ?? null,
  };
}

// ---------------------------------------------------------------------------
// FEFO — perishable items sorted by expiryDate ascending (R3.2, design.md §5)
// ---------------------------------------------------------------------------

describe("allocate — FEFO ordering for perishable items (R3.2, design.md §5)", () => {
  it("(AC: FEFO allocates earliest-expiry lot first) selects the lot with the earlier expiryDate when two perishable lots are available", () => {
    const earlyExpiry = makeRow({
      lotId: "lot-early-expiry",
      locationId: "loc-1",
      qtyRemaining: 50,
      expiryDate: new Date("2026-03-01T00:00:00Z"),
    });
    const lateExpiry = makeRow({
      lotId: "lot-late-expiry",
      locationId: "loc-2",
      qtyRemaining: 50,
      expiryDate: new Date("2026-06-01T00:00:00Z"),
    });

    const result = allocate([lateExpiry, earlyExpiry], 30, true);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].lotId).toBe("lot-early-expiry");
      expect(result.lines[0].qtyAllocated).toBe(30);
    }
  });

  it("(AC: FEFO fully exhausts first lot before moving to second) spans two lots in expiry order when one lot is insufficient", () => {
    const earlyExpiry = makeRow({
      lotId: "lot-early-expiry",
      locationId: "loc-1",
      qtyRemaining: 20,
      expiryDate: new Date("2026-02-01T00:00:00Z"),
    });
    const lateExpiry = makeRow({
      lotId: "lot-late-expiry",
      locationId: "loc-2",
      qtyRemaining: 80,
      expiryDate: new Date("2026-09-01T00:00:00Z"),
    });

    const result = allocate([lateExpiry, earlyExpiry], 50, true);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines).toHaveLength(2);
      const early = result.lines.find((l) => l.lotId === "lot-early-expiry");
      const late = result.lines.find((l) => l.lotId === "lot-late-expiry");
      expect(early).toBeDefined();
      expect(late).toBeDefined();
      expect(early!.qtyAllocated).toBe(20);
      expect(late!.qtyAllocated).toBe(30);
    }
  });
});

// ---------------------------------------------------------------------------
// FIFO — non-perishable items sorted by receivedAt ascending (R3.2, design.md §5)
// ---------------------------------------------------------------------------

describe("allocate — FIFO ordering for non-perishable items (R3.2, design.md §5)", () => {
  it("(AC: FIFO allocates oldest-received lot first) selects the lot with the earlier receivedAt when two non-perishable lots are available", () => {
    const olderLot = makeRow({
      lotId: "lot-older",
      locationId: "loc-1",
      qtyRemaining: 50,
      receivedAt: new Date("2026-01-01T00:00:00Z"),
      expiryDate: null,
    });
    const newerLot = makeRow({
      lotId: "lot-newer",
      locationId: "loc-2",
      qtyRemaining: 50,
      receivedAt: new Date("2026-04-01T00:00:00Z"),
      expiryDate: null,
    });

    const result = allocate([newerLot, olderLot], 30, false);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].lotId).toBe("lot-older");
      expect(result.lines[0].qtyAllocated).toBe(30);
    }
  });

  it("(AC: FIFO fully exhausts oldest lot before moving to newer) spans two lots in FIFO order when one lot is insufficient", () => {
    const olderLot = makeRow({
      lotId: "lot-older",
      locationId: "loc-1",
      qtyRemaining: 15,
      receivedAt: new Date("2026-01-01T00:00:00Z"),
      expiryDate: null,
    });
    const newerLot = makeRow({
      lotId: "lot-newer",
      locationId: "loc-2",
      qtyRemaining: 100,
      receivedAt: new Date("2026-05-01T00:00:00Z"),
      expiryDate: null,
    });

    const result = allocate([newerLot, olderLot], 40, false);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines).toHaveLength(2);
      const older = result.lines.find((l) => l.lotId === "lot-older");
      const newer = result.lines.find((l) => l.lotId === "lot-newer");
      expect(older).toBeDefined();
      expect(newer).toBeDefined();
      expect(older!.qtyAllocated).toBe(15);
      expect(newer!.qtyAllocated).toBe(25);
    }
  });
});

// ---------------------------------------------------------------------------
// lots.status = 'available' gate (R3.1, R3.5, design.md §5 step 1)
// ---------------------------------------------------------------------------

describe("allocate — lots.status = 'available' eligibility gate (R3.1, R3.5, design.md §5)", () => {
  it("(AC: quarantine lot excluded) skips lots whose lotStatus is 'quarantine' and uses only available lots", () => {
    const quarantineLot = makeRow({
      lotId: "lot-quarantine",
      locationId: "loc-1",
      qtyRemaining: 100,
      lotStatus: "quarantine",
    });
    const availableLot = makeRow({
      lotId: "lot-available",
      locationId: "loc-2",
      qtyRemaining: 100,
      lotStatus: "available",
    });

    const result = allocate([quarantineLot, availableLot], 10, false);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines.every((l) => l.lotId === "lot-available")).toBe(true);
    }
  });

  it("(AC: expired lot excluded) skips lots whose lotStatus is 'expired'", () => {
    const expiredLot = makeRow({
      lotId: "lot-expired",
      locationId: "loc-1",
      qtyRemaining: 200,
      lotStatus: "expired",
    });

    const result = allocate([expiredLot], 10, false);

    expect(result.ok).toBe(false);
  });

  it("(AC: held lot excluded) skips lots whose lotStatus is 'held'", () => {
    const heldLot = makeRow({
      lotId: "lot-held",
      locationId: "loc-1",
      qtyRemaining: 50,
      lotStatus: "held",
    });
    const availableLot = makeRow({
      lotId: "lot-available",
      locationId: "loc-2",
      qtyRemaining: 20,
      lotStatus: "available",
    });

    const result = allocate([heldLot, availableLot], 10, false);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines.some((l) => l.lotId === "lot-held")).toBe(false);
      expect(result.lines.some((l) => l.lotId === "lot-available")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Existing commitments reduce available quantity (R3.4, design.md §5 step 4)
// ---------------------------------------------------------------------------

describe("allocate — existing commitments reduce available qty (R3.4, design.md §5)", () => {
  it("(AC: fully committed lot is unavailable) skips a lot where qtyCommitted >= qtyRemaining", () => {
    const fullyCommittedLot = makeRow({
      lotId: "lot-full-committed",
      locationId: "loc-1",
      qtyRemaining: 50,
      qtyCommitted: 50,
      lotStatus: "available",
    });
    const freeLot = makeRow({
      lotId: "lot-free",
      locationId: "loc-2",
      qtyRemaining: 50,
      qtyCommitted: 0,
      lotStatus: "available",
    });

    const result = allocate([fullyCommittedLot, freeLot], 10, false);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines.some((l) => l.lotId === "lot-full-committed")).toBe(false);
      expect(result.lines.some((l) => l.lotId === "lot-free")).toBe(true);
    }
  });

  it("(AC: partial commitment reduces available quantity) allocates only qtyRemaining - qtyCommitted from a partially committed lot", () => {
    // 80 remaining, 30 committed → 50 available
    const partiallyCommittedLot = makeRow({
      lotId: "lot-partial",
      locationId: "loc-1",
      qtyRemaining: 80,
      qtyCommitted: 30,
      lotStatus: "available",
    });

    // Request 50 — should succeed with exactly 50 from this lot
    const result = allocate([partiallyCommittedLot], 50, false);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].qtyAllocated).toBe(50);
    }
  });

  it("(AC: over-available after commitments returns insufficient_stock) returns insufficient_stock when committed quantity leaves too little", () => {
    const tightLot = makeRow({
      lotId: "lot-tight",
      locationId: "loc-1",
      qtyRemaining: 80,
      qtyCommitted: 70,  // only 10 actually available
      lotStatus: "available",
    });

    const result = allocate([tightLot], 20, false);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("insufficient_stock");
    }
  });
});

// ---------------------------------------------------------------------------
// Exact-quantity: single lot covers exact requested qty (R3.3, design.md §5)
// ---------------------------------------------------------------------------

describe("allocate — exact quantity from a single lot (R3.3, design.md §5)", () => {
  it("(AC: exact match single lot) returns exactly one line with qtyAllocated equal to requested quantity", () => {
    const exactLot = makeRow({
      lotId: "lot-exact",
      locationId: "loc-1",
      qtyRemaining: 100,
      qtyCommitted: 0,
      lotStatus: "available",
    });

    const result = allocate([exactLot], 100, false);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].lotId).toBe("lot-exact");
      expect(result.lines[0].qtyAllocated).toBe(100);
    }
  });
});

// ---------------------------------------------------------------------------
// Insufficient stock — never partial (R3.3, design.md §5)
// ---------------------------------------------------------------------------

describe("allocate — insufficient stock (R3.3, design.md §5)", () => {
  it("(AC: insufficient stock returns error not partial plan) returns ok: false with insufficient_stock when available qty < requested qty", () => {
    const shortLot = makeRow({
      lotId: "lot-short",
      locationId: "loc-1",
      qtyRemaining: 5,
      qtyCommitted: 0,
      lotStatus: "available",
    });

    const result = allocate([shortLot], 10, false);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("insufficient_stock");
    }
  });

  it("(AC: empty available lots returns insufficient_stock) returns ok: false when there are no eligible rows at all", () => {
    const result = allocate([], 10, false);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("insufficient_stock");
    }
  });
});

// ---------------------------------------------------------------------------
// Dispersed locations — same lot at two locations (R3.3, design.md §5 step 5)
// ---------------------------------------------------------------------------

describe("allocate — dispersed locations (R3.3, design.md §5)", () => {
  it("(AC: same lot at two locations both contribute) allocates from two location rows for the same lot when needed", () => {
    const rowAtLoc1 = makeRow({
      lotId: "lot-dispersed",
      locationId: "loc-shelf-1",
      qtyRemaining: 30,
      qtyCommitted: 0,
      lotStatus: "available",
      receivedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const rowAtLoc2 = makeRow({
      lotId: "lot-dispersed",
      locationId: "loc-shelf-2",
      qtyRemaining: 40,
      qtyCommitted: 0,
      lotStatus: "available",
      receivedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const result = allocate([rowAtLoc1, rowAtLoc2], 50, false);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines).toHaveLength(2);
      const loc1Line = result.lines.find((l) => l.locationId === "loc-shelf-1");
      const loc2Line = result.lines.find((l) => l.locationId === "loc-shelf-2");
      expect(loc1Line).toBeDefined();
      expect(loc2Line).toBeDefined();
      const totalAllocated = result.lines.reduce((sum, l) => sum + l.qtyAllocated, 0);
      expect(totalAllocated).toBe(50);
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-lot allocation with correct split (R3.3, design.md §5)
// ---------------------------------------------------------------------------

describe("allocate — multi-lot allocation produces correct split (R3.3, design.md §5)", () => {
  it("(AC: three lots allocated in FIFO order with correct per-lot quantities) splits request across three FIFO-ordered lots", () => {
    const lot1 = makeRow({
      lotId: "lot-1",
      locationId: "loc-1",
      qtyRemaining: 10,
      receivedAt: new Date("2026-01-01T00:00:00Z"),
      expiryDate: null,
      lotStatus: "available",
    });
    const lot2 = makeRow({
      lotId: "lot-2",
      locationId: "loc-2",
      qtyRemaining: 20,
      receivedAt: new Date("2026-02-01T00:00:00Z"),
      expiryDate: null,
      lotStatus: "available",
    });
    const lot3 = makeRow({
      lotId: "lot-3",
      locationId: "loc-3",
      qtyRemaining: 30,
      receivedAt: new Date("2026-03-01T00:00:00Z"),
      expiryDate: null,
      lotStatus: "available",
    });

    const result = allocate([lot3, lot1, lot2], 55, false);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const line1 = result.lines.find((l) => l.lotId === "lot-1");
      const line2 = result.lines.find((l) => l.lotId === "lot-2");
      const line3 = result.lines.find((l) => l.lotId === "lot-3");
      expect(line1!.qtyAllocated).toBe(10);
      expect(line2!.qtyAllocated).toBe(20);
      expect(line3!.qtyAllocated).toBe(25);
      const total = result.lines.reduce((sum, l) => sum + l.qtyAllocated, 0);
      expect(total).toBe(55);
    }
  });
});

// ---------------------------------------------------------------------------
// checkProvisionalItemCodes — pre-allocation gate
// (R1.3, design.md §6 step 4)
// ---------------------------------------------------------------------------

describe("checkProvisionalItemCodes — provisional item code gate (R1.3, design.md §6 step 4)", () => {
  it("(AC: all non-provisional passes) returns { ok: true } when no requested lines have itemCodeIsProvisional = true", () => {
    const result = checkProvisionalItemCodes([
      { itemId: "item-1", itemCodeIsProvisional: false },
      { itemId: "item-2", itemCodeIsProvisional: false },
    ]);

    expect(result.ok).toBe(true);
  });

  it("(AC: single provisional line blocks entire generation) returns { ok: false, error: 'provisional_item_code' } when one line is provisional", () => {
    const result = checkProvisionalItemCodes([
      { itemId: "item-good", itemCodeIsProvisional: false },
      { itemId: "item-provisional", itemCodeIsProvisional: true },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("provisional_item_code");
      expect(result.blockingItemIds).toContain("item-provisional");
      // The non-provisional item must NOT appear in blocking list
      expect(result.blockingItemIds).not.toContain("item-good");
    }
  });

  it("(AC: multiple provisional lines names all blocking items) returns all blocking itemIds when multiple lines are provisional", () => {
    const result = checkProvisionalItemCodes([
      { itemId: "item-ok", itemCodeIsProvisional: false },
      { itemId: "item-prov-1", itemCodeIsProvisional: true },
      { itemId: "item-prov-2", itemCodeIsProvisional: true },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("provisional_item_code");
      expect(result.blockingItemIds).toHaveLength(2);
      expect(result.blockingItemIds).toContain("item-prov-1");
      expect(result.blockingItemIds).toContain("item-prov-2");
    }
  });

  it("(AC: all provisional blocks entire generation) returns all itemIds when every line is provisional", () => {
    const result = checkProvisionalItemCodes([
      { itemId: "item-prov-a", itemCodeIsProvisional: true },
      { itemId: "item-prov-b", itemCodeIsProvisional: true },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blockingItemIds).toHaveLength(2);
    }
  });

  it("(AC: empty lines array passes) returns { ok: true } when the lines array is empty", () => {
    const result = checkProvisionalItemCodes([]);

    expect(result.ok).toBe(true);
  });
});
