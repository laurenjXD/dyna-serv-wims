// RED-step unit tests for lib/actions/receiving.ts (does not exist yet).
//
// Traceability:
//   specs/07-incoming-receiving/requirements.md
//     R1.1 — authorized back-office user creates WRR
//     R1.3 — expected line fields validated before staging
//     R1.4 — staged WRR does not create inventory
//     R3.1 — each scan matched against WRR's expected item/line
//     R3.2 — system prevents silent over-receipt
//     R3.3 — wrong/unknown/duplicate/over-quantity scan produces non-success feedback
//     R3.5 — receipt not confirmable while required lines remain outstanding
//     R7.1 — all mutations require authenticated, authorized user
//   specs/07-incoming-receiving/design.md
//     §4 — state model and command boundaries
//     §5.1 — expected line fields
//     §5.2 — scan-line state and discrepancy
//     §9 — receipt commit and idempotency
//
// Acceptance criteria covered:
//   "An authorized user with receiving.confirm can create a WRR; validation
//    failures surface as { ok: false, errors } before any DB write (R1.1, R1.3)."
//   "A barcode scan on a receiving_in_progress WRR updates scannedQty and returns
//    remainingQty + disposition; mismatches, not-found, and wrong-status cases
//    return { ok: false } with specific reasons (R3.1, R3.2, R3.3)."
//   "commitWrr passes validateCommit, sets status='confirmed', and records
//    confirmedAt/confirmedByUserId; validation failures or not-found return
//    { ok: false } (R3.5, design.md §9)."
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/actions/receiving.ts (for backend-builder):
//
//   import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
//
//   export type CreateWrrActionResult =
//     | { ok: true; wrrId: string }
//     | { ok: false; errors: string[] };
//
//   export type RecordScanResult =
//     | { ok: true; remainingQty: number; disposition: 'store' | 'inspect' }
//     | { ok: false; reason: string };
//
//   export type CommitWrrResult =
//     | { ok: true }
//     | { ok: false; errors: string[] };
//
//   // Creates a new WRR document. Requires receiving.confirm capability.
//   // Validates input via validateCreateWrr before any DB write.
//   // Returns { ok: true, wrrId } on success.
//   export async function createWrr(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     input: unknown,
//   ): Promise<CreateWrrActionResult>;
//
//   // Records a single barcode scan against an in-progress WRR.
//   // Requires receiving.scan capability.
//   // Returns remainingQty and disposition on success.
//   export async function recordScan(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     wrrId: string,
//     barcode: string,
//   ): Promise<RecordScanResult>;
//
//   // Commits a WRR: validates via validateCommit, then sets status='confirmed'.
//   // Requires receiving.confirm capability.
//   export async function commitWrr(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     wrrId: string,
//   ): Promise<CommitWrrResult>;
//
// ---------------------------------------------------------------------------
// Mocking pattern: same DI approach as lib/actions/__tests__/approvals.test.ts
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { createWrr, recordScan, commitWrr } from "../receiving";

// ---------------------------------------------------------------------------
// Resolver mock helpers
// ---------------------------------------------------------------------------

function makeResolver(
  resolution: AuthorizationResolution,
): RequestAuthorizationResolver {
  return {
    getContext: vi.fn(async () => resolution),
  };
}

const confirmContext: AuthorizationContext = {
  userId: "user-uuid-staff",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [
    { resource: "receiving", action: "confirm", scopeKind: "global" },
    { resource: "receiving", action: "scan", scopeKind: "global" },
  ],
  partyScopes: [],
};

const scanOnlyContext: AuthorizationContext = {
  userId: "user-uuid-scanner",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [{ resource: "receiving", action: "scan", scopeKind: "global" }],
  partyScopes: [],
};

const noReceivingContext: AuthorizationContext = {
  userId: "user-uuid-no-perms",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [],
  partyScopes: [],
};

const authorizedConfirmResolver = () =>
  makeResolver({ kind: "authorized", context: confirmContext });

const scanOnlyResolver = () =>
  makeResolver({ kind: "authorized", context: scanOnlyContext });

const noReceivingResolver = () =>
  makeResolver({ kind: "authorized", context: noReceivingContext });

const unauthenticatedResolver = () =>
  makeResolver({ kind: "unauthenticated" });

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

// A simple thenable chain for select-based lookups.
function makeSelectChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "leftJoin", "orderBy", "limit", "offset"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["then"] = resolved.then.bind(resolved);
  chain["catch"] = resolved.catch.bind(resolved);
  chain["finally"] = resolved.finally.bind(resolved);
  return chain;
}

// Minimal DB that records inserted rows and supports update.
function makeReceivingDb(
  wrrRows: AnyRecord[],
  wrrItemRows: AnyRecord[] = [],
) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];

  return {
    _inserted: inserted,
    _updated: updated,

    select: vi.fn().mockImplementation(() => {
      // Return wrr rows first, then item rows for subsequent calls.
      const allRows = [...wrrRows, ...wrrItemRows];
      return makeSelectChain(allRows);
    }),

    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((row: unknown) => {
        inserted.push(row);
        return {
          returning: vi.fn().mockResolvedValue([{ id: "new-wrr-uuid" }]),
        };
      }),
    })),

    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((vals: unknown) => {
        updated.push(vals);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    })),
  };
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function validCreateWrrInput() {
  return {
    vendorPartyId: "party-uuid-vendor",
    flowType: "vmi",
    commercialInvoiceNo: "CIPL-2026-001",
    lines: [
      {
        lotNumber: "LOT-001",
        expectedQty: 10,
        unitCbm: 0.5,
        uom: "CTN",
        disposition: "store",
        itemId: "item-master-uuid-1",
      },
    ],
  };
}

function wrrDocRow(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: "wrr-uuid-existing",
    wrrNumber: "WRR-2026-00001",
    status: "receiving_in_progress",
    flowType: "vmi",
    vendorPartyId: "party-uuid-vendor",
    stagedByUserId: "user-uuid-staff",
    confirmedByUserId: null,
    confirmedAt: null,
    createdAt: new Date("2026-08-08T10:00:00Z"),
    ...overrides,
  };
}

function wrrItemRow(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: "wrr-item-uuid-1",
    wrrId: "wrr-uuid-existing",
    itemId: "item-master-uuid-1",
    itemCode: "SUPP-PART-001",
    barcode: "1234567890",
    lotNumber: "LOT-001",
    expectedQty: 10,
    scannedQty: 5,
    unitCbm: "0.5000",
    uom: "CTN",
    disposition: "store",
    createdAt: new Date("2026-08-08T10:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createWrr — Authorization
// (requirements.md R1.1, R7.1; design.md §4)
// ---------------------------------------------------------------------------

describe("createWrr — unauthenticated (R7.1, design.md §4)", () => {
  it("(AC: receiving.confirm required) returns { ok: false } when resolver is unauthenticated", async () => {
    const db = makeReceivingDb([]);

    const result = await createWrr(
      unauthenticatedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      validCreateWrrInput(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("(AC: receiving.confirm required) returns { ok: false } when resolver has no receiving.confirm grant", async () => {
    const db = makeReceivingDb([]);

    const result = await createWrr(
      noReceivingResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      validCreateWrrInput(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// createWrr — Input validation (before DB)
// (requirements.md R1.3; design.md §5.1)
// ---------------------------------------------------------------------------

describe("createWrr — invalid input (R1.3, design.md §5.1)", () => {
  it("(AC: validation fails before DB) returns { ok: false, errors } when lines array is empty", async () => {
    const db = makeReceivingDb([]);
    const insertSpy = db.insert;

    const result = await createWrr(
      authorizedConfirmResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { vendorPartyId: "party-uuid", flowType: "vmi", lines: [] },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
    // DB must NOT have been written before validation passes.
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("(AC: validation fails before DB) returns { ok: false, errors } when vendorPartyId is missing", async () => {
    const db = makeReceivingDb([]);
    const insertSpy = db.insert;

    const result = await createWrr(
      authorizedConfirmResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { flowType: "vmi", lines: [{ lotNumber: "LOT-001", expectedQty: 5, unitCbm: 0.5, uom: "CTN", disposition: "store" }] },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
    }
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createWrr — Success
// (requirements.md R1.1, R1.4; design.md §4)
// ---------------------------------------------------------------------------

describe("createWrr — success (R1.1, R1.4, design.md §4)", () => {
  it("(AC: DB insert called once, wrrId returned) returns { ok: true, wrrId } and calls db.insert exactly once for valid input", async () => {
    const db = makeReceivingDb([]);

    const result = await createWrr(
      authorizedConfirmResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      validCreateWrrInput(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.wrrId).toBe("string");
      expect(result.wrrId.length).toBeGreaterThan(0);
    }
    // Exactly one insert (the wrr_documents row).
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// recordScan — Authorization
// (requirements.md R7.1; design.md §4)
// ---------------------------------------------------------------------------

describe("recordScan — no receiving.scan permission (R7.1, design.md §4)", () => {
  it("(AC: receiving.scan required) returns { ok: false, reason: 'forbidden' } when resolver lacks receiving.scan", async () => {
    const db = makeReceivingDb([wrrDocRow()], [wrrItemRow()]);

    const result = await recordScan(
      noReceivingResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-existing",
      "1234567890",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("forbidden");
    }
  });
});

// ---------------------------------------------------------------------------
// recordScan — WRR not found
// (requirements.md R3.3; design.md §6)
// ---------------------------------------------------------------------------

describe("recordScan — WRR not found (R3.3, design.md §6)", () => {
  it("(AC: unknown WRR returns not_found) returns { ok: false, reason: 'not_found' } when wrrId does not exist", async () => {
    const db = makeReceivingDb([], []);

    const result = await recordScan(
      scanOnlyResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "non-existent-wrr-uuid",
      "1234567890",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_found");
    }
  });
});

// ---------------------------------------------------------------------------
// recordScan — WRR not in receiving_in_progress
// (requirements.md R3.1; design.md §4 state model)
// ---------------------------------------------------------------------------

describe("recordScan — WRR not in receiving_in_progress (R3.1, design.md §4)", () => {
  it("(AC: wrong status blocks scan) returns { ok: false, reason: 'invalid_status' } when WRR is staged_pending_arrival", async () => {
    const db = makeReceivingDb(
      [wrrDocRow({ status: "staged_pending_arrival" })],
      [wrrItemRow()],
    );

    const result = await recordScan(
      scanOnlyResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-existing",
      "1234567890",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_status");
    }
  });

  it("(AC: confirmed WRR cannot be scanned) returns { ok: false, reason: 'invalid_status' } when WRR is confirmed", async () => {
    const db = makeReceivingDb(
      [wrrDocRow({ status: "confirmed" })],
      [wrrItemRow()],
    );

    const result = await recordScan(
      scanOnlyResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-existing",
      "1234567890",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_status");
    }
  });
});

// ---------------------------------------------------------------------------
// recordScan — Barcode does not match any line
// (requirements.md R3.3; design.md §6)
// ---------------------------------------------------------------------------

describe("recordScan — unknown barcode (R3.3, design.md §6)", () => {
  it("(AC: unmatched barcode produces exception) returns { ok: false, reason: 'unknown_item' } when barcode matches no WRR line", async () => {
    // The WRR is in progress, but the scanned barcode doesn't match any item.
    const db = makeReceivingDb(
      [wrrDocRow()],
      [wrrItemRow({ barcode: "KNOWN-BARCODE-999", itemCode: "KNOWN-CODE" })],
    );

    const result = await recordScan(
      scanOnlyResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-existing",
      "UNKNOWN-BARCODE-XYZ",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unknown_item");
    }
  });
});

// ---------------------------------------------------------------------------
// recordScan — Valid scan
// (requirements.md R3.1, R3.2; design.md §5.2, §6)
// ---------------------------------------------------------------------------

describe("recordScan — valid scan (R3.1, R3.2, design.md §5.2, §6)", () => {
  it("(AC: scannedQty incremented, remainingQty returned) returns { ok: true, remainingQty, disposition: 'store' } when barcode matches an in-progress WRR line", async () => {
    // Item has expectedQty=10, scannedQty=5 → after scan: scannedQty=6, remaining=4
    const item = wrrItemRow({
      barcode: "MATCH-BARCODE-001",
      expectedQty: 10,
      scannedQty: 5,
      disposition: "store",
    });
    const db = makeReceivingDb([wrrDocRow()], [item]);

    const result = await recordScan(
      scanOnlyResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-existing",
      "MATCH-BARCODE-001",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.remainingQty).toBe("number");
      expect(result.remainingQty).toBeGreaterThanOrEqual(0);
      expect(result.disposition).toBe("store");
    }
    // scannedQty must have been updated in the DB.
    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// commitWrr — Authorization
// (requirements.md R7.1; design.md §9)
// ---------------------------------------------------------------------------

describe("commitWrr — no receiving.confirm permission (R7.1, design.md §9)", () => {
  it("(AC: receiving.confirm required) returns { ok: false, errors: ['forbidden'] } when resolver lacks receiving.confirm", async () => {
    const db = makeReceivingDb([wrrDocRow()], [wrrItemRow()]);

    const result = await commitWrr(
      scanOnlyResolver(), // has scan but not confirm
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-existing",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("forbidden");
    }
  });
});

// ---------------------------------------------------------------------------
// commitWrr — WRR not found
// (requirements.md R3.5; design.md §9)
// ---------------------------------------------------------------------------

describe("commitWrr — WRR not found (R3.5, design.md §9)", () => {
  it("(AC: not found returns error) returns { ok: false, errors: ['not_found'] } when wrrId does not exist", async () => {
    const db = makeReceivingDb([], []);

    const result = await commitWrr(
      authorizedConfirmResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "non-existent-wrr-uuid",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("not_found");
    }
  });
});

// ---------------------------------------------------------------------------
// commitWrr — validateCommit fails (under-scanned)
// (requirements.md R3.5; design.md §9, §5.2)
// ---------------------------------------------------------------------------

describe("commitWrr — validation fails (R3.5, design.md §9, §5.2)", () => {
  it("(AC: under-scanned line blocks commit) returns { ok: false, errors } when a line is under-scanned (validateCommit fails)", async () => {
    // scannedQty (3) < expectedQty (10) — validateCommit will reject this.
    const underScannedItem = wrrItemRow({
      id: "item-under-scanned",
      expectedQty: 10,
      scannedQty: 3,
      itemId: "item-master-uuid-1",
      disposition: "store",
    });
    const db = makeReceivingDb(
      [wrrDocRow({ status: "receiving_in_progress" })],
      [underScannedItem],
    );

    const result = await commitWrr(
      authorizedConfirmResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-existing",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("(AC: unresolved itemId blocks commit) returns { ok: false, errors } when a line has null itemId (validateCommit fails)", async () => {
    // itemId is null — validateCommit will reject this (R4.3).
    const unresolvedItem = wrrItemRow({
      id: "item-unresolved",
      expectedQty: 5,
      scannedQty: 5,
      itemId: null, // not yet enrolled
      disposition: "store",
    });
    const db = makeReceivingDb(
      [wrrDocRow({ status: "receiving_in_progress" })],
      [unresolvedItem],
    );

    const result = await commitWrr(
      authorizedConfirmResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-existing",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// commitWrr — Success
// (requirements.md R3.5, R7.2; design.md §9)
// ---------------------------------------------------------------------------

describe("commitWrr — success (R3.5, R7.2, design.md §9)", () => {
  it("(AC: status set to confirmed, confirmedAt/confirmedByUserId recorded) returns { ok: true } and updates WRR status to 'confirmed' when all lines are fully scanned and resolved", async () => {
    // All lines fully scanned and have resolved itemId + disposition.
    const fullyScannedItem = wrrItemRow({
      id: "item-fully-scanned",
      expectedQty: 10,
      scannedQty: 10,
      itemId: "item-master-uuid-1",
      disposition: "store",
    });
    const db = makeReceivingDb(
      [wrrDocRow({ status: "receiving_in_progress" })],
      [fullyScannedItem],
    );

    const result = await commitWrr(
      authorizedConfirmResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-existing",
    );

    expect(result.ok).toBe(true);

    // The WRR status must have been updated.
    expect(db.update).toHaveBeenCalled();

    // The update payload must include status='confirmed'.
    const updatedPayload = db._updated[0] as AnyRecord;
    expect(updatedPayload).toBeDefined();
    expect(updatedPayload["status"]).toBe("confirmed");

    // confirmedAt and confirmedByUserId must be set.
    expect(updatedPayload).toHaveProperty("confirmedAt");
    expect(updatedPayload["confirmedAt"]).not.toBeNull();
    expect(updatedPayload).toHaveProperty("confirmedByUserId");
    expect(updatedPayload["confirmedByUserId"]).toBe("user-uuid-staff");
  });
});
