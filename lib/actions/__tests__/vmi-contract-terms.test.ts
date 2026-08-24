// Unit tests for lib/actions/vmi-contract-terms.ts —
// createVmiContractTerms / updateVmiContractTerms.
//
// Traceability: specs/12-vmi-billing/tasks.md A.9;
// lib/db/schema/vmi_billing.ts §1.1's own header comment. See
// lib/actions/vmi-contract-terms.ts's header comment for the full citation
// list and its two flagged design decisions (create rejects a duplicate
// open row; update's effective-date default is `new Date()` unless
// caller-supplied).
//
// Conventions mirrored from lib/actions/__tests__/vmi-charge-lines.test.ts /
// lib/actions/__tests__/trading-policies.test.ts.

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import {
  createVmiContractTerms,
  updateVmiContractTerms,
} from "../vmi-contract-terms";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";
import { vmiContractTerms } from "@/lib/db/schema/vmi_billing";

// ---------------------------------------------------------------------------
// Resolver mock helpers
// ---------------------------------------------------------------------------

function makeResolver(
  resolution: AuthorizationResolution,
): RequestAuthorizationResolver {
  return { getContext: vi.fn(async () => resolution) };
}

const managerContext: AuthorizationContext = {
  userId: "user-uuid-manager",
  profileStatus: "active",
  activeRoleKeys: ["administrator"],
  grants: [
    { resource: "vmi_contract_terms", action: "manage", scopeKind: "global" },
  ],
  partyScopes: [],
};

const unauthorizedContext: AuthorizationContext = {
  userId: "user-uuid-unauthorized",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [],
  partyScopes: [],
};

const managerResolver = () =>
  makeResolver({ kind: "authorized", context: managerContext });
const unauthorizedResolver = () =>
  makeResolver({ kind: "authorized", context: unauthorizedContext });

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TableRef = any;

function makeQueuedSelect(queues: Map<TableRef, unknown[][]>) {
  const callCounts = new Map<TableRef, number>();
  return vi.fn().mockImplementation(() => {
    let rows: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.from = vi.fn((table: TableRef) => {
      const queue = queues.get(table) ?? [];
      const idx = callCounts.get(table) ?? 0;
      rows = (queue[idx] ?? queue[queue.length - 1] ?? []) as unknown[];
      callCounts.set(table, idx + 1);
      return chain;
    });
    for (const method of ["where", "leftJoin", "innerJoin", "orderBy"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.limit = vi.fn((n: number) => {
      rows = rows.slice(0, n);
      return chain;
    });
    const resolved = () => Promise.resolve(rows);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.then = (...args: any[]) => resolved().then(...args);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.catch = (...args: any[]) => resolved().catch(...args);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.finally = (...args: any[]) => resolved().finally(...args);
    return chain;
  });
}

interface CapturedWrite {
  table: TableRef;
  values: AnyRecord;
}

function makeCapturingInsert() {
  const calls: CapturedWrite[] = [];
  const fn = vi.fn().mockImplementation((table: TableRef) => ({
    values: vi.fn().mockImplementation((row: AnyRecord) => {
      calls.push({ table, values: row });
      return {
        returning: vi
          .fn()
          .mockResolvedValue([{ id: `inserted-${calls.length}`, ...row }]),
      };
    }),
  }));
  return { fn, calls };
}

function makeCapturingUpdate() {
  const calls: CapturedWrite[] = [];
  const fn = vi.fn().mockImplementation((table: TableRef) => ({
    set: vi.fn().mockImplementation((vals: AnyRecord) => {
      calls.push({ table, values: vals });
      const resultRow = { id: `updated-${calls.length}`, ...vals };
      const whereResult = {
        returning: vi.fn().mockResolvedValue([resultRow]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (...args: any[]) => Promise.resolve(undefined).then(...args),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        catch: (...args: any[]) => Promise.resolve(undefined).catch(...args),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        finally: (...args: any[]) =>
          Promise.resolve(undefined).finally(...args),
      };
      return {
        where: vi.fn().mockImplementation(() => whereResult),
      };
    }),
  }));
  return { fn, calls };
}

function makeVmiContractTermsDb(
  opts: { contractRows?: AnyRecord[] } = {},
) {
  const queues = new Map<TableRef, unknown[][]>();
  queues.set(vmiContractTerms, [opts.contractRows ?? []]);

  const select = makeQueuedSelect(queues);
  const insertCap = makeCapturingInsert();
  const updateCap = makeCapturingUpdate();

  return {
    select,
    insert: insertCap.fn,
    update: updateCap.fn,
    _insertCalls: insertCap.calls,
    _updateCalls: updateCap.calls,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PARTY_ID = "party-uuid-vmi-1";

function validCreateInput(overrides: AnyRecord = {}): AnyRecord {
  return {
    partyId: PARTY_ID,
    storageRatePerCbmDay: "0.050000",
    handlingInRatePerCbm: "1.4000",
    handlingOutRatePerCbm: "1.4000",
    documentationDefaultRateUsd: "10.0000",
    ...overrides,
  };
}

function existingContractRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: "contract-uuid-1",
    partyId: PARTY_ID,
    storageRatePerCbmDay: "0.050000",
    billingTiming: "beginning_of_day",
    cbmThresholdType: "none",
    cbmThreshold: null,
    overThresholdRate: null,
    handlingInRatePerCbm: "1.4000",
    handlingOutRatePerCbm: "1.4000",
    documentationDefaultRateUsd: "10.0000",
    billingCurrency: "USD",
    isActive: true,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    createdByUserId: "user-uuid-someone-else",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createVmiContractTerms
// ---------------------------------------------------------------------------

describe("createVmiContractTerms — authorization", () => {
  it("returns { ok: false, errors: ['forbidden'] } and writes nothing when resolver lacks vmi_contract_terms.manage", async () => {
    const db = makeVmiContractTermsDb();

    const result = await createVmiContractTerms(
      unauthorizedResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("createVmiContractTerms — success (new party)", () => {
  it("inserts one open-ended (effectiveTo = null, isActive = true) row for a brand-new party with no existing terms", async () => {
    const db = makeVmiContractTermsDb({ contractRows: [] });

    const result = await createVmiContractTerms(
      managerResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    const inserts = db._insertCalls.filter((c) => c.table === vmiContractTerms);
    expect(inserts).toHaveLength(1);
    const row = inserts[0].values;
    expect(row.partyId).toBe(PARTY_ID);
    expect(row.storageRatePerCbmDay).toBe("0.050000");
    expect(row.isActive).toBe(true);
    expect(row.effectiveTo).toBeNull();
    expect(row.createdByUserId).toBe("user-uuid-manager");
  });

  it("rejects with ['contract_terms_already_exist'] when an open row already exists for the party", async () => {
    const db = makeVmiContractTermsDb({
      contractRows: [existingContractRow()],
    });

    const result = await createVmiContractTerms(
      managerResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("contract_terms_already_exist");
    }
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("createVmiContractTerms — threshold validation", () => {
  it("rejects a missing storageRatePerCbmDay before any DB access", async () => {
    const db = makeVmiContractTermsDb();

    const result = await createVmiContractTerms(
      managerResolver(),
      validCreateInput({ storageRatePerCbmDay: undefined }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("storage_rate_per_cbm_day_required");
    }
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("(AC: cbm_threshold required app-layer when threshold_type != 'none') rejects cbmThresholdType = 'minimum_billable' with no cbmThreshold", async () => {
    const db = makeVmiContractTermsDb();

    const result = await createVmiContractTerms(
      managerResolver(),
      validCreateInput({ cbmThresholdType: "minimum_billable" }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("cbm_threshold_required");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(AC: over_threshold_rate required app-layer when threshold_type = 'included_allowance') rejects that mode with a cbmThreshold but no overThresholdRate", async () => {
    const db = makeVmiContractTermsDb();

    const result = await createVmiContractTerms(
      managerResolver(),
      validCreateInput({
        cbmThresholdType: "included_allowance",
        cbmThreshold: "50.0000",
      }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("over_threshold_rate_required");
    }
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("accepts cbmThresholdType = 'included_allowance' with both cbmThreshold and overThresholdRate supplied", async () => {
    const db = makeVmiContractTermsDb({ contractRows: [] });

    const result = await createVmiContractTerms(
      managerResolver(),
      validCreateInput({
        cbmThresholdType: "included_allowance",
        cbmThreshold: "50.0000",
        overThresholdRate: "0.080000",
      }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    const row = db._insertCalls.find((c) => c.table === vmiContractTerms)!
      .values;
    expect(row.cbmThresholdType).toBe("included_allowance");
    expect(row.cbmThreshold).toBe("50.0000");
    expect(row.overThresholdRate).toBe("0.080000");
  });
});

// ---------------------------------------------------------------------------
// updateVmiContractTerms
// ---------------------------------------------------------------------------

describe("updateVmiContractTerms — authorization", () => {
  it("returns { ok: false, errors: ['forbidden'] } and updates nothing when resolver lacks vmi_contract_terms.manage", async () => {
    const db = makeVmiContractTermsDb({
      contractRows: [existingContractRow()],
    });

    const result = await updateVmiContractTerms(
      unauthorizedResolver(),
      PARTY_ID,
      { storageRatePerCbmDay: "0.060000" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("updateVmiContractTerms — version-close-and-reopen", () => {
  it("closes the existing open row and inserts a new open-ended row, with the boundary lining up and history (old rate values) preserved unchanged on the closed row", async () => {
    const db = makeVmiContractTermsDb({
      contractRows: [existingContractRow()],
    });

    const result = await updateVmiContractTerms(
      managerResolver(),
      PARTY_ID,
      { storageRatePerCbmDay: "0.060000" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);

    // The old row was closed — effectiveTo set, isActive false. Its OWN
    // rate values are never touched by this module (the closing update only
    // sets effectiveTo/isActive), so history is preserved.
    const updates = db._updateCalls.filter((c) => c.table === vmiContractTerms);
    expect(updates).toHaveLength(1);
    expect(updates[0].values.isActive).toBe(false);
    expect(updates[0].values.effectiveTo).toBeInstanceOf(Date);
    expect(updates[0].values.storageRatePerCbmDay).toBeUndefined(); // never rewritten

    // A new row was opened with the updated rate.
    const inserts = db._insertCalls.filter((c) => c.table === vmiContractTerms);
    expect(inserts).toHaveLength(1);
    const newRow = inserts[0].values;
    expect(newRow.storageRatePerCbmDay).toBe("0.060000"); // updated
    expect(newRow.handlingInRatePerCbm).toBe("1.4000"); // carried over
    expect(newRow.isActive).toBe(true);
    expect(newRow.effectiveTo).toBeNull();
    expect(newRow.createdByUserId).toBe("user-uuid-manager");

    // Boundary alignment.
    const closedEffectiveTo = (updates[0].values.effectiveTo as Date).getTime();
    const reopenedEffectiveFrom = (newRow.effectiveFrom as Date).getTime();
    expect(reopenedEffectiveFrom).toBe(closedEffectiveTo);

    if (result.ok) {
      expect(result.contractTerms.storageRatePerCbmDay).toBe("0.060000");
    }
  });

  it("(AC: caller-supplied effectiveDate is honored as the version boundary) uses the supplied effectiveDate rather than now()", async () => {
    const db = makeVmiContractTermsDb({
      contractRows: [existingContractRow()],
    });
    const suppliedDate = "2026-07-01T00:00:00.000Z";

    const result = await updateVmiContractTerms(
      managerResolver(),
      PARTY_ID,
      { storageRatePerCbmDay: "0.060000", effectiveDate: suppliedDate },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    const updates = db._updateCalls.filter((c) => c.table === vmiContractTerms);
    const inserts = db._insertCalls.filter((c) => c.table === vmiContractTerms);
    expect((updates[0].values.effectiveTo as Date).toISOString()).toBe(
      suppliedDate,
    );
    expect((inserts[0].values.effectiveFrom as Date).toISOString()).toBe(
      suppliedDate,
    );
  });

  it("rejects with ['not_found'] and writes nothing when no open row exists for the party", async () => {
    const db = makeVmiContractTermsDb({ contractRows: [] });

    const result = await updateVmiContractTerms(
      managerResolver(),
      PARTY_ID,
      { storageRatePerCbmDay: "0.060000" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("not_found");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("updateVmiContractTerms — threshold validation", () => {
  it("(AC: switching threshold_type to 'minimum_billable' without a cbmThreshold is rejected, whether pre-existing or newly supplied) rejects and writes nothing", async () => {
    const db = makeVmiContractTermsDb({
      contractRows: [existingContractRow()], // existing row has cbmThresholdType = 'none'
    });

    const result = await updateVmiContractTerms(
      managerResolver(),
      PARTY_ID,
      { cbmThresholdType: "minimum_billable" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("cbm_threshold_required");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
