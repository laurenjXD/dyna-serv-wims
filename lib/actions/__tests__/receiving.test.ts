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
import { createWrr, recordScan, startReceiving } from "../receiving";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";
// commitWrr was replaced by commitWrrLine (per-line commit reversal,
// 2026-08-10) — its own coverage lives in
// lib/actions/__tests__/receiving.commit-line.integration.test.ts. This
// mocked-DB suite no longer exercises the removed whole-WRR commitWrr.

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

  const db = {
    _inserted: inserted,
    _updated: updated,

    select: vi.fn().mockImplementation(() => {
      // Return wrr rows first, then item rows for subsequent calls.
      const allRows = [...wrrRows, ...wrrItemRows];
      const chain = makeSelectChain(allRows);
      chain.from.mockImplementation((table: Record<PropertyKey, unknown>) => {
        if (table[Symbol.for("drizzle:Name")] === "locations") {
          return makeSelectChain([{ id: "location-storage-uuid" }]);
        }
        return chain;
      });
      return chain;
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
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "wrr-uuid-existing" }]),
          })),
        };
      }),
    })),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any).transaction = vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db));
  return db;
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
        putawayLocationId: "location-storage-uuid",
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
    putawayLocationId: "location-storage-uuid",
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
      validCreateWrrInput(),
      mockRlsDeps(db).deps,
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
      validCreateWrrInput(),
      mockRlsDeps(db).deps,
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
      { vendorPartyId: "party-uuid", flowType: "vmi", lines: [] },
      mockRlsDeps(db).deps,
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
      { flowType: "vmi", lines: [{ lotNumber: "LOT-001", expectedQty: 5, unitCbm: 0.5, uom: "CTN", disposition: "store" }] },
      mockRlsDeps(db).deps,
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
  it("(AC: staged header and lines are written atomically, wrrId returned) returns { ok: true, wrrId } and writes the WRR plus its expected lines", async () => {
    const db = makeReceivingDb([]);

    const result = await createWrr(
      authorizedConfirmResolver(),
      validCreateWrrInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.wrrId).toBe("string");
      expect(result.wrrId.length).toBeGreaterThan(0);
    }
    // Header and line records are staged together.
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("(AC: itemCode resolves to catalog itemId) resolves line.itemId from the items catalog when the caller supplies itemCode but not itemId, so the line is not permanently unlinked from an already-enrolled item", async () => {
    // The items-catalog lookup shares the same generic select() mock as the
    // wrr/wrr_items rows — passing the match as the second arg makes it the
    // row returned for any select() call in this test (createWrr issues only
    // one: the catalog lookup).
    const db = makeReceivingDb([], [{ id: "resolved-item-uuid" }]);

    const result = await createWrr(
      authorizedConfirmResolver(),
      {
        vendorPartyId: "party-uuid-vendor",
        flowType: "vmi",
        lines: [
          {
            lotNumber: "LOT-001",
            expectedQty: 10,
            unitCbm: 0.5,
            uom: "CTN",
            disposition: "store",
            itemCode: "SUPP-PART-001",
          },
        ],
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    // Second insert() call is the wrr_items batch (first is wrr_documents).
    const insertedLines = db._inserted[1] as AnyRecord[];
    expect(insertedLines[0].itemId).toBe("resolved-item-uuid");
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
      "wrr-uuid-existing",
      "1234567890",
      mockRlsDeps(db).deps,
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
      "non-existent-wrr-uuid",
      "1234567890",
      mockRlsDeps(db).deps,
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
      "wrr-uuid-existing",
      "1234567890",
      mockRlsDeps(db).deps,
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
      "wrr-uuid-existing",
      "1234567890",
      mockRlsDeps(db).deps,
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
      "wrr-uuid-existing",
      "UNKNOWN-BARCODE-XYZ",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unknown_item");
    }
  });

  it("rejects the current WRR's document QR without misreporting an unknown item", async () => {
    const wrr = wrrDocRow({ wrrNumber: "WRR-20260819-974952" });
    const db = makeReceivingDb([wrr], [wrrItemRow()]);

    const result = await recordScan(
      scanOnlyResolver(),
      "wrr-uuid-existing",
      wrr.wrrNumber,
      mockRlsDeps(db).deps,
    );

    expect(result).toEqual({ ok: false, reason: "wrr_document_qr" });
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("recordScan — WRR document QR", () => {
  it("returns clear document-label guidance without changing quantity", async () => {
    const doc = wrrDocRow({ wrrNumber: "WRR-20260820-123456" });
    const db = makeReceivingDb(
      [doc],
      [wrrItemRow({ barcode: "KNOWN-BARCODE-999", itemCode: "KNOWN-CODE" })],
    );

    const result = await recordScan(
      scanOnlyResolver(),
      "wrr-uuid-existing",
      "WRR-20260820-123456",
      mockRlsDeps(db).deps,
    );

    expect(result).toEqual({ ok: false, reason: "wrr_document_qr" });
    expect(db.update).not.toHaveBeenCalled();
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
      "wrr-uuid-existing",
      "MATCH-BARCODE-001",
      mockRlsDeps(db).deps,
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

  it("matches the enrolled item's registered barcode from the WRR item join", async () => {
    const catalogBarcode = "QR-REGISTERED-ITEM-001";
    const wrr = wrrDocRow();
    const line = wrrItemRow({ barcode: undefined, itemCode: "SUPPLIER-PART-001" });
    const db = makeReceivingDb([
      {
        wrr_documents: wrr,
        wrr_items: line,
        items: { id: line.itemId, barcode: catalogBarcode, flowType: "vmi" },
      },
    ]);

    const result = await recordScan(
      scanOnlyResolver(),
      "wrr-uuid-existing",
      catalogBarcode,
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });
});

describe("recordScan — sealed-carton QR (18 FR-3b)", () => {
  it("records the complete carton quantity in one scan", async () => {
    const item = wrrItemRow({ expectedQty: 10, scannedQty: 0 });
    const db = makeReceivingDb([wrrDocRow()], [item]);
    const barcode = JSON.stringify({
      type: "wrr_item_carton",
      wrr_item_id: item.id,
      quantity: 10,
    });

    const result = await recordScan(
      scanOnlyResolver(),
      "wrr-uuid-existing",
      barcode,
      mockRlsDeps(db).deps,
    );

    expect(result).toEqual({ ok: true, remainingQty: 0, disposition: "store" });
    expect(db._updated).toContainEqual({ scannedQty: 10 });
  });
});

// commitWrr's mocked-DB coverage was removed along with the function itself
// (replaced by commitWrrLine — see the import comment above). commitWrrLine's
// real-transaction/idempotency behavior is exercised against live Postgres in
// lib/actions/__tests__/receiving.commit-line.integration.test.ts, since its
// conditional-UPDATE idempotency gate and per-line isolation are not
// meaningfully verifiable against this file's hand-rolled DB mock.

// ---------------------------------------------------------------------------
// startReceiving — Authorization
// (requirements.md R2.4 — authorized server command required; R7.1)
// ---------------------------------------------------------------------------

describe("startReceiving — no receiving.confirm permission (R2.4, R7.1, design.md §4)", () => {
  it("(AC R2.4: receiving.confirm required) returns { ok: false, errors: ['forbidden'] } when resolver lacks receiving.confirm", async () => {
    const db = makeReceivingDb([wrrDocRow({ status: "staged_pending_arrival" })]);

    const result = await startReceiving(
      noReceivingResolver(), // no grants at all
      "wrr-uuid-existing",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("forbidden");
    }
    // No DB mutation must occur when forbidden.
    expect(db.update).not.toHaveBeenCalled();
  });

  it("(AC R2.4: scan-only resolver is also forbidden) returns { ok: false, errors: ['forbidden'] } when resolver has receiving.scan but not receiving.confirm", async () => {
    const db = makeReceivingDb([wrrDocRow({ status: "staged_pending_arrival" })]);

    const result = await startReceiving(
      scanOnlyResolver(), // scan but not confirm
      "wrr-uuid-existing",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("forbidden");
    }
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// startReceiving — WRR not found
// (requirements.md R2.4; design.md §4 state model)
// ---------------------------------------------------------------------------

describe("startReceiving — WRR not found (R2.4, design.md §4)", () => {
  it("(AC R2.4: not_found when wrrId is unknown) returns { ok: false, errors: ['not_found'] } when the wrrId does not exist in the database", async () => {
    const db = makeReceivingDb([]); // empty — no WRR rows

    const result = await startReceiving(
      authorizedConfirmResolver(),
      "non-existent-wrr-uuid",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("not_found");
    }
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// startReceiving — Invalid status (already in progress)
// (requirements.md R2.4 — transition only from staged_pending_arrival; design.md §4)
// ---------------------------------------------------------------------------

describe("startReceiving — invalid_status when already receiving_in_progress (R2.4, design.md §4)", () => {
  it("(AC R2.4: re-starting an in-progress WRR is rejected) returns { ok: false, errors: ['invalid_status'] } when WRR status is receiving_in_progress", async () => {
    // Default wrrDocRow has status: "receiving_in_progress"
    const db = makeReceivingDb([wrrDocRow()]);

    const result = await startReceiving(
      authorizedConfirmResolver(),
      "wrr-uuid-existing",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("invalid_status");
    }
    // No status transition must be written for a WRR that is already in progress.
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// startReceiving — Invalid status (already confirmed)
// (requirements.md R2.4; design.md §4 state model)
// ---------------------------------------------------------------------------

describe("startReceiving — invalid_status when already confirmed (R2.4, design.md §4)", () => {
  it("(AC R2.4: confirmed WRR cannot be re-opened) returns { ok: false, errors: ['invalid_status'] } when WRR status is confirmed", async () => {
    const db = makeReceivingDb([wrrDocRow({ status: "confirmed" })]);

    const result = await startReceiving(
      authorizedConfirmResolver(),
      "wrr-uuid-existing",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("invalid_status");
    }
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// startReceiving — Success
// (requirements.md R2.4 — transitions staged_pending_arrival → receiving_in_progress)
// ---------------------------------------------------------------------------

describe("startReceiving — success (R2.4, design.md §4)", () => {
  it("(AC R2.4: staged WRR transitions to receiving_in_progress) returns { ok: true } and writes status='receiving_in_progress' when WRR is staged_pending_arrival", async () => {
    const db = makeReceivingDb([wrrDocRow({ status: "staged_pending_arrival" })]);

    const result = await startReceiving(
      authorizedConfirmResolver(),
      "wrr-uuid-existing",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);

    // The status must have been updated exactly once.
    expect(db.update).toHaveBeenCalledTimes(1);

    // The update payload must transition to receiving_in_progress.
    const updatedPayload = db._updated[0] as AnyRecord;
    expect(updatedPayload).toBeDefined();
    expect(updatedPayload["status"]).toBe("receiving_in_progress");
  });
});
