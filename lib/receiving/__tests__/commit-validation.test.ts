// RED-step unit tests for lib/receiving/commit-validation.ts, rewritten
// 2026-08-10 for the per-line-commit reversal.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §9 — Receipt commit and
//     idempotency ("Reversed 2026-08-10: per-line immediate commit, not a
//     single end-of-WRR atomic gate"). Each line's commit receives the WRR
//     ID, the specific wrr_items.id, the resolved disposition ('store' /
//     'inspect'), the accepted-or-overridden putaway_location_id (for
//     store) or the confirmed inspection location_id (for inspect), a
//     client correlation ID, and an idempotency key. Within one
//     transaction, for that line alone, it verifies the line's scanned
//     quantity, conformance decision, disposition value, and (for store)
//     the target location's active/storage state (or, for inspect, the
//     confirmed inspection location) are present and valid.
//   specs/07-incoming-receiving/design.md §5.2 — Scan-line state:
//     under-scanned (scannedQty < expectedQty) is not confirmable.
//   specs/07-incoming-receiving/requirements.md R7.1 (amended 2026-08-10,
//     "supersedes item 2's prior single-atomic-gate wording") — each line's
//     commit SHALL be an explicit, authorized server command with one
//     primary floor action, executed per line rather than gated on every
//     other line in the WRR being ready first.
//   specs/07-incoming-receiving/requirements.md R7.2 (amended 2026-08-10) —
//     each per-line commit SHALL atomically validate that specific line's
//     scan totals, conformance decisions, active item/party references,
//     flow partition, required lot metadata, disposition value, and (for
//     store) the accepted/overridden putaway location's active `storage`
//     state — or (for inspect) the confirmed `inspection` location —
//     before posting that line alone.
//   specs/07-incoming-receiving/requirements.md R7.3 (amended 2026-08-10) —
//     on a line's successful commit, `store` posts to the location accepted
//     at scan time; `inspect` posts to the confirmed inspection location.
//   specs/07-incoming-receiving/requirements.md R7.5 — each per-line commit
//     SHALL be idempotent, scoped to that line.
//   specs/07-incoming-receiving/requirements.md R7.6 — a failed per-line
//     commit SHALL leave no partial outcome for that line and SHALL NOT
//     roll back or otherwise affect any other line's already-committed
//     state.
//   specs/07-incoming-receiving/requirements.md R4.3 — unresolved items
//     block that line's confirmation.
//   specs/07-incoming-receiving/requirements.md R5.1 — null disposition
//     blocks that line's commit.
//
// THIS IS A DELIBERATE BEHAVIOR-CHANGE REWRITE, NOT AN ADDITIVE EXTENSION:
// the previous `validateCommit(wrr, lines[])` validated an entire WRR's
// lines array at once, requiring ALL lines resolved before ANY commit. Per
// design.md §9's per-line reversal, this file now tests a per-line
// function, `validateLineCommit(wrr, line, location)`, which validates
// exactly ONE line's own scan-completeness, disposition, and (for `store`)
// location-validity in isolation. The core behavior change under test:
// line A being under-scanned or otherwise invalid must NOT block line B
// from validating/committing successfully — see the isolation describe
// block below.
//
// The current lib/receiving/commit-validation.ts only exports
// `validateCommit`, which takes a `lines: WrrLine[]` array and gates on
// every line at once. It does not export `validateLineCommit` at all, so
// every test below is expected to fail (imported binding is `undefined`,
// so calling it throws a TypeError) until the implementation is reworked.
//
// Expected module contract for lib/receiving/commit-validation.ts (new):
//
//   type WrrDocument = {
//     id: string;
//     status: string;
//     flowType: string;
//     vendorPartyId: string;
//   }
//
//   type WrrLine = {
//     id: string;
//     itemId: string | null;
//     itemBarcode: string | null;
//     lotNumber: string;
//     expectedQty: number;
//     scannedQty: number;
//     disposition: 'store' | 'inspect' | null | undefined;
//     putawayLocationId?: string | null;
//   }
//
//   // The location accepted/overridden at scan time (store) or confirmed
//   // before scanning (inspect) — resolved by the caller and passed in for
//   // pure validation, since this module has no DB access of its own.
//   type CommitLocation = {
//     id: string;
//     isActive: boolean;
//     locationType: string; // e.g. 'storage' | 'inspection'
//   }
//
//   type CommitValidationResult =
//     | { ok: true }
//     | { ok: false; errors: string[] }
//
//   validateLineCommit(
//     wrr: WrrDocument,
//     line: WrrLine,
//     location: CommitLocation | null
//   ): CommitValidationResult

import { describe, expect, it } from "vitest";

const makeWrr = (
  overrides: Partial<{
    id: string;
    status: string;
    flowType: string;
    vendorPartyId: string;
  }> = {}
) => ({
  id: "wrr-uuid-001",
  status: "receiving_in_progress",
  flowType: "vmi",
  vendorPartyId: "party-uuid-001",
  ...overrides,
});

const makeLine = (
  overrides: Partial<{
    id: string;
    itemId: string | null;
    itemBarcode: string | null;
    lotNumber: string;
    expectedQty: number;
    scannedQty: number;
    disposition: "store" | "inspect" | null | undefined;
    putawayLocationId: string | null;
  }> = {}
) => ({
  id: "line-uuid-001",
  itemId: "item-uuid-001",
  itemBarcode: "BC-ALPHA-001",
  lotNumber: "LOT-2026-001",
  expectedQty: 10,
  scannedQty: 10,
  disposition: "store" as const,
  putawayLocationId: "location-storage-uuid",
  ...overrides,
});

const makeStorageLocation = (
  overrides: Partial<{ id: string; isActive: boolean; locationType: string }> = {}
) => ({
  id: "location-storage-uuid",
  isActive: true,
  locationType: "storage",
  ...overrides,
});

const makeInspectionLocation = (
  overrides: Partial<{ id: string; isActive: boolean; locationType: string }> = {}
) => ({
  id: "location-inspection-uuid",
  isActive: true,
  locationType: "inspection",
  ...overrides,
});

describe("validateLineCommit — a fully valid store line returns { ok: true } (design.md §9, requirements.md R7.2)", () => {
  it("AC-R7.2: returns { ok: true } for a fully-scanned store line with a resolved item and an active storage location", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const result = validateLineCommit(makeWrr(), makeLine(), makeStorageLocation());

    expect(result.ok).toBe(true);
  });
});

describe("validateLineCommit — a fully valid inspect line returns { ok: true } (design.md §9, requirements.md R7.2)", () => {
  it("AC-R7.2: returns { ok: true } for a fully-scanned inspect line with a resolved item and an active inspection location", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const line = makeLine({ disposition: "inspect", putawayLocationId: null });
    const result = validateLineCommit(makeWrr(), line, makeInspectionLocation());

    expect(result.ok).toBe(true);
  });
});

describe("validateLineCommit — WRR must be in 'receiving_in_progress' status (design.md §9, requirements.md R7.2)", () => {
  it("AC-R7.2: returns { ok: false } when wrr.status is 'staged_pending_arrival'", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const wrr = makeWrr({ status: "staged_pending_arrival" });
    const result = validateLineCommit(wrr, makeLine(), makeStorageLocation());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R7.2: returns { ok: false } when wrr.status is 'confirmed'", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const wrr = makeWrr({ status: "confirmed" });
    const result = validateLineCommit(wrr, makeLine(), makeStorageLocation());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateLineCommit — line must have a resolved itemId (requirements.md R4.3, R7.2)", () => {
  it("AC-R4.3: returns { ok: false } when the line's itemId is null", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const line = makeLine({ itemId: null });
    const result = validateLineCommit(makeWrr(), line, makeStorageLocation());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateLineCommit — line must be fully scanned (design.md §5.2, requirements.md R7.2)", () => {
  it("AC-R7.2: returns { ok: false } when scannedQty < expectedQty for this line", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const line = makeLine({ expectedQty: 10, scannedQty: 7 });
    const result = validateLineCommit(makeWrr(), line, makeStorageLocation());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateLineCommit — line must have a set disposition (requirements.md R5.1)", () => {
  it("AC-R5.1: returns { ok: false } when disposition is null", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const line = makeLine({ disposition: null });
    const result = validateLineCommit(makeWrr(), line, makeStorageLocation());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R5.1: returns { ok: false } when disposition is undefined", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const line = makeLine({ disposition: undefined });
    const result = validateLineCommit(makeWrr(), line, makeStorageLocation());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateLineCommit — store disposition requires an active 'storage' location (design.md §9/§6.2, requirements.md R7.2/R1.4)", () => {
  it("AC-R7.2: returns { ok: false } when a store line's location is null (no location accepted/overridden at scan time)", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const result = validateLineCommit(makeWrr(), makeLine(), null);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R7.2: returns { ok: false } when a store line's location is inactive", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const location = makeStorageLocation({ isActive: false });
    const result = validateLineCommit(makeWrr(), makeLine(), location);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R7.2: returns { ok: false } when a store line's location has locationType 'inspection' instead of 'storage'", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const location = makeInspectionLocation();
    const result = validateLineCommit(makeWrr(), makeLine(), location);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateLineCommit — inspect disposition requires an active 'inspection' location (design.md §9/§6.3, requirements.md R7.2/R3.9)", () => {
  it("AC-R7.2: returns { ok: false } when an inspect line's location is null (no inspection location confirmed before scanning)", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const line = makeLine({ disposition: "inspect", putawayLocationId: null });
    const result = validateLineCommit(makeWrr(), line, null);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R7.2: returns { ok: false } when an inspect line's location has locationType 'storage' instead of 'inspection'", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const line = makeLine({ disposition: "inspect", putawayLocationId: null });
    const result = validateLineCommit(makeWrr(), line, makeStorageLocation());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateLineCommit — collects multiple errors for a single line without failing fast (design.md §9, requirements.md R7.2)", () => {
  it("AC-R7.2: returns multiple error messages when one line has an unresolved item AND is under-scanned AND has no disposition", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const line = makeLine({
      itemId: null,
      expectedQty: 10,
      scannedQty: 3,
      disposition: null,
    });
    const result = validateLineCommit(makeWrr(), line, makeStorageLocation());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe("validateLineCommit — CORE BEHAVIOR CHANGE: one line's invalidity does not block another line's validation (design.md §9 'Reversed 2026-08-10', requirements.md R7.1/R7.6)", () => {
  it("AC-R7.1/R7.6: line A under-scanned and unresolved does not affect line B's independent validation — calling validateLineCommit for line B alone still returns { ok: true }", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    const wrr = makeWrr();

    // Line A: badly broken — unresolved item, under-scanned, no disposition.
    const lineA = makeLine({
      id: "line-A",
      itemId: null,
      expectedQty: 10,
      scannedQty: 2,
      disposition: null,
    });
    // Line B: fully valid and independent of line A.
    const lineB = makeLine({ id: "line-B" });

    const resultA = validateLineCommit(wrr, lineA, makeStorageLocation());
    const resultB = validateLineCommit(wrr, lineB, makeStorageLocation());

    // Line A fails on its own merits...
    expect(resultA.ok).toBe(false);
    // ...but this must NOT be a shared/collected result gating the whole
    // WRR — line B, validated independently, must still succeed. This is
    // the defining behavior change from "all lines gate the WRR" (old
    // validateCommit(wrr, lines[])) to "each line gates only itself."
    expect(resultB.ok).toBe(true);
  });

  it("AC-R7.1: validateLineCommit's signature takes exactly one line, not a lines[] array, so there is no way for the caller to accidentally couple two lines' outcomes together", async () => {
    const { validateLineCommit } = await import("@/lib/receiving/commit-validation");

    // Calling with a single line (not an array) must be a valid call shape.
    const result = validateLineCommit(makeWrr(), makeLine(), makeStorageLocation());

    expect(result.ok).toBe(true);
  });
});
