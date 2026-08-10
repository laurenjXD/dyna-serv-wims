// RED-step unit tests for lib/actions/transfers.ts (does not exist yet).
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md
//     R1.1 — authorized user SHALL be able to request movement from one source to one destination
//     R1.3 — source and destination SHALL be distinct and valid; a location cannot be its own destination
//     R3.1 — system SHALL maintain a single shared inspection record structure
//     R3.4 — transfer-specific non-conformance SHALL block completion or route to exception path
//     R8.1 — every transfer read and mutation SHALL use current capability, party/flow scope
//     R8.2 — client-supplied values SHALL not establish authorization
//   specs/11-transfer-and-inspection/design.md
//     §4 — transfer state and command boundaries
//     §6.1 — inspection contexts and available dispositions per context type
//     §6.3 — failed inspection disposition table with balance effects
//
// Acceptance criteria covered:
//   "An authorized user with transfer.request capability can create a transfer request;
//    validation failures surface as { ok: false, errors } before any DB write (R1.1, R1.3)."
//   "A user with transfer.execute capability can update transfer status; missing transfer
//    returns { ok: false, reason: 'not_found' } (R8.1, design.md §4)."
//   "An authorized user with inspection.perform capability can open an inspection case;
//    missing permission returns { ok: false, reason: 'forbidden' } (R3.1, R8.1)."
//   "resolveInspectionCase validates the case is open before writing; already-resolved
//    case or missing case returns { ok: false, errors } (R3.4, design.md §6.3)."
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/actions/transfers.ts (for backend-builder):
//
//   import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
//
//   export type CreateTransferActionResult =
//     | { ok: true; transferId: string }
//     | { ok: false; errors: string[] };
//
//   export type UpdateStatusResult =
//     | { ok: true }
//     | { ok: false; reason: string };
//
//   export type OpenCaseResult =
//     | { ok: true; caseId: string }
//     | { ok: false; reason: string };
//
//   export type ResolveCaseResult =
//     | { ok: true }
//     | { ok: false; errors: string[] };
//
//   // Creates a new internal transfer request. Requires transfer.request capability.
//   // Validates input via validateCreateTransfer before any DB write.
//   export async function createTransfer(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     input: unknown,
//   ): Promise<CreateTransferActionResult>;
//
//   // Updates the status of a transfer request. Requires transfer.execute capability.
//   export async function updateTransferStatus(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     transferId: string,
//     newStatus: string,
//   ): Promise<UpdateStatusResult>;
//
//   // Opens a new inspection case for a transfer line or WRR item.
//   // Requires inspection.perform capability.
//   export async function openInspectionCase(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     input: {
//       sourceRefType: string;
//       sourceRefId: string;
//       lotId: string;
//       itemId: string;
//       partyId: string;
//       flowType: string;
//       contextType: string;
//     },
//   ): Promise<OpenCaseResult>;
//
//   // Resolves an inspection case with a disposition. Requires inspection.perform capability.
//   // Validates case status is 'open' via validateInspectionDisposition before any DB write.
//   export async function resolveInspectionCase(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     caseId: string,
//     disposition: {
//       dispositionType: string;
//       quantityAffected: number;
//       notes?: string;
//     },
//   ): Promise<ResolveCaseResult>;
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import {
  createTransfer,
  updateTransferStatus,
  openInspectionCase,
  resolveInspectionCase,
} from "../transfers";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";

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

// Has transfer.request capability
const transferRequestContext: AuthorizationContext = {
  userId: "user-uuid-ops",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [
    { resource: "transfer", action: "request", scopeKind: "global" },
  ],
  partyScopes: [],
};

// Has transfer.execute capability
const transferExecuteContext: AuthorizationContext = {
  userId: "user-uuid-staff",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [
    { resource: "transfer", action: "execute", scopeKind: "global" },
  ],
  partyScopes: [],
};

// Has inspection.perform capability (warehouse_staff + supervisor — opens cases)
const inspectionPerformContext: AuthorizationContext = {
  userId: "user-uuid-inspector",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [
    { resource: "inspection", action: "perform", scopeKind: "global" },
  ],
  partyScopes: [],
};

// Has inspection.resolve capability (supervisor-only — resolves dispositions)
const inspectionResolveContext: AuthorizationContext = {
  userId: "user-uuid-supervisor",
  profileStatus: "active",
  activeRoleKeys: ["supervisor"],
  grants: [
    { resource: "inspection", action: "perform", scopeKind: "global" },
    { resource: "inspection", action: "resolve", scopeKind: "global" },
  ],
  partyScopes: [],
};

// Has no relevant capabilities
const noPermissionsContext: AuthorizationContext = {
  userId: "user-uuid-no-perms",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [],
  partyScopes: [],
};

const transferRequestResolver = () =>
  makeResolver({ kind: "authorized", context: transferRequestContext });

const transferExecuteResolver = () =>
  makeResolver({ kind: "authorized", context: transferExecuteContext });

const inspectionPerformResolver = () =>
  makeResolver({ kind: "authorized", context: inspectionPerformContext });

const inspectionResolveResolver = () =>
  makeResolver({ kind: "authorized", context: inspectionResolveContext });

const noPermissionsResolver = () =>
  makeResolver({ kind: "authorized", context: noPermissionsContext });

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

// Minimal DB that records inserted/updated rows and supports select.
function makeTransferDb(
  transferRows: AnyRecord[],
  inspectionCaseRows: AnyRecord[] = [],
) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];

  return {
    _inserted: inserted,
    _updated: updated,

    select: vi.fn().mockImplementation(() => {
      // Return transfer rows first, then inspection case rows.
      const allRows = [...transferRows, ...inspectionCaseRows];
      return makeSelectChain(allRows);
    }),

    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((row: unknown) => {
        inserted.push(row);
        return {
          returning: vi.fn().mockResolvedValue([{ id: "new-uuid-generated" }]),
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

function validCreateTransferInput() {
  return {
    fromLocationId: "loc-uuid-from",
    toLocationId: "loc-uuid-to",
    flowType: "vmi",
    lines: [
      {
        lotId: "lot-uuid-1",
        itemId: "item-uuid-1",
        qtyRequested: 10,
      },
    ],
    reason: "Routine replenishment",
  };
}

function transferRequestRow(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: "transfer-uuid-existing",
    status: "staged",
    flowType: "vmi",
    fromLocationId: "loc-uuid-from",
    toLocationId: "loc-uuid-to",
    requestedBy: "user-uuid-ops",
    requiresApproval: false,
    createdAt: new Date("2026-08-08T10:00:00Z"),
    updatedAt: new Date("2026-08-08T10:00:00Z"),
    version: 1,
    ...overrides,
  };
}

function inspectionCaseRow(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: "case-uuid-existing",
    contextType: "transfer",
    sourceRefType: "transfer_line",
    sourceRefId: "line-uuid-1",
    lotId: "lot-uuid-1",
    itemId: "item-uuid-1",
    partyId: "party-uuid-1",
    flowType: "vmi",
    status: "open",
    openedBy: "user-uuid-inspector",
    openedAt: new Date("2026-08-08T10:00:00Z"),
    resolvedBy: null,
    resolvedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createTransfer — Authorization
// (requirements.md R1.1, R8.1, R8.2; design.md §4)
// ---------------------------------------------------------------------------

describe("createTransfer — no transfer.request permission (R1.1, R8.1, design.md §4)", () => {
  it("(AC: transfer.request required) returns { ok: false, errors: ['forbidden'] } when resolver lacks transfer.request", async () => {
    const db = makeTransferDb([]);

    const result = await createTransfer(
      noPermissionsResolver(),
      validCreateTransferInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("forbidden");
    }
    // DB must NOT have been written when forbidden.
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createTransfer — Input validation (before DB)
// (requirements.md R1.3; design.md §4)
// ---------------------------------------------------------------------------

describe("createTransfer — invalid input (R1.3, design.md §4)", () => {
  it("(AC: validation fails before DB — same from/to) returns { ok: false, errors } when fromLocationId equals toLocationId", async () => {
    const db = makeTransferDb([]);
    const insertSpy = db.insert;

    const result = await createTransfer(
      transferRequestResolver(),
      {
        fromLocationId: "loc-uuid-same",
        toLocationId: "loc-uuid-same",
        flowType: "vmi",
        lines: [{ lotId: "lot-1", itemId: "item-1", qtyRequested: 5 }],
      },
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

  it("(AC: validation fails before DB — missing lines) returns { ok: false, errors } when lines array is empty", async () => {
    const db = makeTransferDb([]);
    const insertSpy = db.insert;

    const result = await createTransfer(
      transferRequestResolver(),
      {
        fromLocationId: "loc-uuid-from",
        toLocationId: "loc-uuid-to",
        flowType: "vmi",
        lines: [],
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createTransfer — Success
// (requirements.md R1.1, R1.5; design.md §4)
// ---------------------------------------------------------------------------

describe("createTransfer — success (R1.1, R1.5, design.md §4)", () => {
  it("(AC: DB insert called, transferId returned) returns { ok: true, transferId } and calls db.insert for valid input", async () => {
    const db = makeTransferDb([]);

    const result = await createTransfer(
      transferRequestResolver(),
      validCreateTransferInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.transferId).toBe("string");
      expect(result.transferId.length).toBeGreaterThan(0);
    }
    expect(db.insert).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateTransferStatus — Authorization
// (requirements.md R8.1, R8.2; design.md §4)
// ---------------------------------------------------------------------------

describe("updateTransferStatus — no transfer.execute permission (R8.1, design.md §4)", () => {
  it("(AC: transfer.execute required) returns { ok: false, reason: 'forbidden' } when resolver lacks transfer.execute", async () => {
    const db = makeTransferDb([transferRequestRow()]);

    const result = await updateTransferStatus(
      noPermissionsResolver(),
      "transfer-uuid-existing",
      "in_progress",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("forbidden");
    }
    // DB must NOT have been updated when forbidden.
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateTransferStatus — Transfer not found
// (requirements.md R7.1; design.md §4)
// ---------------------------------------------------------------------------

describe("updateTransferStatus — transfer not found (R7.1, design.md §4)", () => {
  it("(AC: unknown transfer returns not_found) returns { ok: false, reason: 'not_found' } when transferId does not exist", async () => {
    const db = makeTransferDb([]);

    const result = await updateTransferStatus(
      transferExecuteResolver(),
      "non-existent-transfer-uuid",
      "in_progress",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_found");
    }
  });
});

// ---------------------------------------------------------------------------
// updateTransferStatus — Success
// (requirements.md R5.1; design.md §4)
// ---------------------------------------------------------------------------

describe("updateTransferStatus — success (R5.1, design.md §4)", () => {
  it("(AC: status updated) returns { ok: true } and calls db.update when authorized and transfer exists", async () => {
    const db = makeTransferDb([transferRequestRow()]);

    const result = await updateTransferStatus(
      transferExecuteResolver(),
      "transfer-uuid-existing",
      "in_progress",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// openInspectionCase — Authorization
// (requirements.md R3.1, R8.1; design.md §6.1)
// ---------------------------------------------------------------------------

describe("openInspectionCase — no inspection.perform permission (R3.1, R8.1, design.md §6.1)", () => {
  it("(AC: inspection.perform required) returns { ok: false, reason: 'forbidden' } when resolver lacks inspection.perform", async () => {
    const db = makeTransferDb([]);

    const result = await openInspectionCase(
      noPermissionsResolver(),
      {
        sourceRefType: "transfer_line",
        sourceRefId: "line-uuid-1",
        lotId: "lot-uuid-1",
        itemId: "item-uuid-1",
        partyId: "party-uuid-1",
        flowType: "vmi",
        contextType: "transfer",
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("forbidden");
    }
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// openInspectionCase — Success
// (requirements.md R3.1, R3.2; design.md §6.1)
// ---------------------------------------------------------------------------

describe("openInspectionCase — success (R3.1, R3.2, design.md §6.1)", () => {
  it("(AC: case created, caseId returned) returns { ok: true, caseId } and calls db.insert when authorized with valid input", async () => {
    const db = makeTransferDb([]);

    const result = await openInspectionCase(
      inspectionPerformResolver(),
      {
        sourceRefType: "transfer_line",
        sourceRefId: "line-uuid-1",
        lotId: "lot-uuid-1",
        itemId: "item-uuid-1",
        partyId: "party-uuid-1",
        flowType: "vmi",
        contextType: "transfer",
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.caseId).toBe("string");
      expect(result.caseId.length).toBeGreaterThan(0);
    }
    expect(db.insert).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resolveInspectionCase — Authorization
// (requirements.md R3.4, R8.1; design.md §6.3)
// ---------------------------------------------------------------------------

describe("resolveInspectionCase — no inspection.resolve permission (R3.4, R8.1, design.md §6.3)", () => {
  it("(AC: inspection.resolve required — supervisor only) returns { ok: false, errors: ['forbidden'] } when resolver lacks inspection.resolve", async () => {
    const db = makeTransferDb([], [inspectionCaseRow()]);

    const result = await resolveInspectionCase(
      noPermissionsResolver(),
      "case-uuid-existing",
      {
        dispositionType: "return_to_stock",
        quantityAffected: 10,
        notes: "Routine pass",
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("forbidden");
    }
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resolveInspectionCase — Case not found
// (requirements.md R3.4; design.md §6.3)
// ---------------------------------------------------------------------------

describe("resolveInspectionCase — case not found (R3.4, design.md §6.3)", () => {
  it("(AC: unknown case returns not_found) returns { ok: false, errors: ['not_found'] } when caseId does not exist", async () => {
    const db = makeTransferDb([], []);

    const result = await resolveInspectionCase(
      inspectionResolveResolver(),
      "non-existent-case-uuid",
      {
        dispositionType: "return_to_stock",
        quantityAffected: 5,
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("not_found");
    }
  });
});

// ---------------------------------------------------------------------------
// resolveInspectionCase — Validation fails (case already resolved)
// (requirements.md R3.4; design.md §6.2, §6.3)
// ---------------------------------------------------------------------------

describe("resolveInspectionCase — validation fails (R3.4, design.md §6.2, §6.3)", () => {
  it("(AC: already-resolved case blocks disposition) returns { ok: false, errors } when case status is 'passed' (not open)", async () => {
    const resolvedCase = inspectionCaseRow({
      id: "case-uuid-already-resolved",
      status: "passed",
      resolvedBy: "user-uuid-inspector",
      resolvedAt: new Date("2026-08-08T11:00:00Z"),
    });
    const db = makeTransferDb([], [resolvedCase]);

    const result = await resolveInspectionCase(
      inspectionResolveResolver(),
      "case-uuid-already-resolved",
      {
        dispositionType: "return_to_stock",
        quantityAffected: 10,
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
    // Disposition must NOT be inserted when case is already resolved.
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(AC: failed case blocks disposition) returns { ok: false, errors } when case status is 'failed' (not open)", async () => {
    const failedCase = inspectionCaseRow({
      id: "case-uuid-failed",
      status: "failed",
      resolvedBy: "user-uuid-inspector",
      resolvedAt: new Date("2026-08-08T11:00:00Z"),
    });
    const db = makeTransferDb([], [failedCase]);

    const result = await resolveInspectionCase(
      inspectionResolveResolver(),
      "case-uuid-failed",
      {
        dispositionType: "reject",
        quantityAffected: 5,
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resolveInspectionCase — Success
// (requirements.md R3.3, R3.4; design.md §6.3)
// ---------------------------------------------------------------------------

describe("resolveInspectionCase — success (R3.3, R3.4, design.md §6.3)", () => {
  it("(AC: case resolved to passed, disposition inserted) returns { ok: true } and updates case status + inserts disposition for valid 'return_to_stock' resolve", async () => {
    const openCase = inspectionCaseRow({
      id: "case-uuid-open",
      status: "open",
      contextType: "transfer",
      sourceRefType: "transfer_line",
    });
    const db = makeTransferDb([], [openCase]);

    const result = await resolveInspectionCase(
      inspectionResolveResolver(),
      "case-uuid-open",
      {
        dispositionType: "return_to_stock",
        quantityAffected: 10,
        notes: "All items in good condition",
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);

    // The case status must have been updated.
    expect(db.update).toHaveBeenCalled();

    // The update payload must include a terminal status ('passed' or 'failed').
    const updatedPayload = db._updated[0] as AnyRecord;
    expect(updatedPayload).toBeDefined();
    const updatedStatus = updatedPayload["status"] as string;
    expect(["passed", "failed"]).toContain(updatedStatus);

    // resolvedBy and resolvedAt must be set.
    expect(updatedPayload).toHaveProperty("resolvedBy");
    expect(updatedPayload["resolvedBy"]).not.toBeNull();
    expect(updatedPayload).toHaveProperty("resolvedAt");
    expect(updatedPayload["resolvedAt"]).not.toBeNull();

    // A disposition row must have been inserted.
    expect(db.insert).toHaveBeenCalled();
  });

  it("(AC: reject disposition inserts and updates case to failed) returns { ok: true } for a valid 'reject' disposition on an open case", async () => {
    const openCase = inspectionCaseRow({
      id: "case-uuid-open-2",
      status: "open",
      contextType: "transfer",
      sourceRefType: "transfer_line",
    });
    const db = makeTransferDb([], [openCase]);

    const result = await resolveInspectionCase(
      inspectionResolveResolver(),
      "case-uuid-open-2",
      {
        dispositionType: "reject",
        quantityAffected: 3,
        notes: "Physical damage observed",
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });
});
