// Unit tests for lib/actions/vmi-permits.ts —
// createVmiPermit / updateVmiPermit / listVmiPermits.
//
// Traceability: lib/db/schema/vmi_billing.ts §1.5 (vmi_permits — plain,
// non-version-dated CRUD, isActive boolean, no effective_from/effective_to).
// See lib/actions/vmi-permits.ts's header comment for the full citation
// list.
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
  createVmiPermit,
  updateVmiPermit,
  listVmiPermits,
} from "../vmi-permits";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";
import { vmiPermits } from "@/lib/db/schema/vmi_billing";

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
    { resource: "vmi_permits", action: "manage", scopeKind: "global" },
    { resource: "vmi_permits", action: "read", scopeKind: "global" },
  ],
  partyScopes: [],
};

// Holds only .read, not .manage — used to prove the two capabilities are
// gated independently.
const readOnlyContext: AuthorizationContext = {
  userId: "user-uuid-reader",
  profileStatus: "active",
  activeRoleKeys: ["supervisor"],
  grants: [{ resource: "vmi_permits", action: "read", scopeKind: "global" }],
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
const readOnlyResolver = () =>
  makeResolver({ kind: "authorized", context: readOnlyContext });
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
      return {
        where: vi.fn().mockImplementation(() => ({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: `updated-${calls.length}`, ...vals }]),
        })),
      };
    }),
  }));
  return { fn, calls };
}

function makeVmiPermitsDb(opts: { permitRows?: AnyRecord[] } = {}) {
  const queues = new Map<TableRef, unknown[][]>();
  queues.set(vmiPermits, [opts.permitRows ?? []]);

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
    permitNumber: "ELSE-LTP1-IE-007994-26E",
    itemScope: "Reel, carrier tape, tray",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    monthlyFeeUsd: "150.00",
    ...overrides,
  };
}

function existingPermitRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: "permit-uuid-1",
    partyId: PARTY_ID,
    permitNumber: "ELSE-LTP1-IE-007994-26E",
    itemScope: "Reel, carrier tape, tray",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    monthlyFeeUsd: "150.00",
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createVmiPermit
// ---------------------------------------------------------------------------

describe("createVmiPermit — authorization", () => {
  it("returns { ok: false, errors: ['forbidden'] } and writes nothing when resolver lacks vmi_permits.manage", async () => {
    const db = makeVmiPermitsDb();

    const result = await createVmiPermit(
      unauthorizedResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns { ok: false, errors: ['forbidden'] } for a read-only caller (vmi_permits.read is not sufficient to create)", async () => {
    const db = makeVmiPermitsDb();

    const result = await createVmiPermit(
      readOnlyResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("createVmiPermit — success", () => {
  it("inserts a new permit row, defaulting isActive to true when omitted", async () => {
    const db = makeVmiPermitsDb();

    const result = await createVmiPermit(
      managerResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    const inserts = db._insertCalls.filter((c) => c.table === vmiPermits);
    expect(inserts).toHaveLength(1);
    const row = inserts[0].values;
    expect(row.partyId).toBe(PARTY_ID);
    expect(row.permitNumber).toBe("ELSE-LTP1-IE-007994-26E");
    expect(row.monthlyFeeUsd).toBe("150.00");
    expect(row.isActive).toBe(true);
    if (result.ok) {
      expect(result.permit.permitNumber).toBe("ELSE-LTP1-IE-007994-26E");
    }
  });
});

describe("createVmiPermit — validation failure", () => {
  it("rejects a missing monthlyFeeUsd before any DB access", async () => {
    const db = makeVmiPermitsDb();

    const result = await createVmiPermit(
      managerResolver(),
      validCreateInput({ monthlyFeeUsd: undefined }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("monthly_fee_usd_required");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a missing permitNumber before any DB access", async () => {
    const db = makeVmiPermitsDb();

    const result = await createVmiPermit(
      managerResolver(),
      validCreateInput({ permitNumber: "" }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("permit_number_required");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateVmiPermit
// ---------------------------------------------------------------------------

describe("updateVmiPermit — authorization", () => {
  it("returns { ok: false, errors: ['forbidden'] } and updates nothing when resolver lacks vmi_permits.manage", async () => {
    const db = makeVmiPermitsDb({ permitRows: [existingPermitRow()] });

    const result = await updateVmiPermit(
      unauthorizedResolver(),
      "permit-uuid-1",
      { monthlyFeeUsd: "175.00" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("updateVmiPermit — success (plain guarded update)", () => {
  it("updates the existing row in place — no new row inserted, no version history", async () => {
    const db = makeVmiPermitsDb({ permitRows: [existingPermitRow()] });

    const result = await updateVmiPermit(
      managerResolver(),
      "permit-uuid-1",
      { monthlyFeeUsd: "175.00" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    const updates = db._updateCalls.filter((c) => c.table === vmiPermits);
    expect(updates).toHaveLength(1);
    expect(updates[0].values.monthlyFeeUsd).toBe("175.00");
    expect(updates[0].values.permitNumber).toBe("ELSE-LTP1-IE-007994-26E"); // carried over
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("supports deactivation via isActive: false", async () => {
    const db = makeVmiPermitsDb({ permitRows: [existingPermitRow()] });

    const result = await updateVmiPermit(
      managerResolver(),
      "permit-uuid-1",
      { isActive: false },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    const updates = db._updateCalls.filter((c) => c.table === vmiPermits);
    expect(updates[0].values.isActive).toBe(false);
  });

  it("rejects with ['not_found'] and writes nothing when permitId does not resolve to an existing row", async () => {
    const db = makeVmiPermitsDb({ permitRows: [] });

    const result = await updateVmiPermit(
      managerResolver(),
      "permit-uuid-missing",
      { monthlyFeeUsd: "175.00" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("not_found");
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listVmiPermits
// ---------------------------------------------------------------------------

describe("listVmiPermits — authorization", () => {
  it("returns { ok: false, errors: ['forbidden'] } when resolver lacks vmi_permits.read", async () => {
    const db = makeVmiPermitsDb({ permitRows: [existingPermitRow()] });

    const result = await listVmiPermits(
      unauthorizedResolver(),
      PARTY_ID,
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("listVmiPermits — success", () => {
  it("(AC: returns BOTH active and inactive permits for the party, not just the active set) returns all rows scoped to the party", async () => {
    const activeRow = existingPermitRow({ id: "permit-uuid-active" });
    const inactiveRow = existingPermitRow({
      id: "permit-uuid-inactive",
      isActive: false,
      permitNumber: "OLD-PERMIT-0001",
    });
    const db = makeVmiPermitsDb({ permitRows: [activeRow, inactiveRow] });

    const result = await listVmiPermits(
      managerResolver(),
      PARTY_ID,
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.permits).toHaveLength(2);
      expect(result.permits.map((p) => p.id)).toEqual([
        "permit-uuid-active",
        "permit-uuid-inactive",
      ]);
      expect(result.permits.some((p) => p.isActive === false)).toBe(true);
    }
  });

  it("(AC: a read-only caller — vmi_permits.read without .manage — may list) succeeds for readOnlyResolver", async () => {
    const db = makeVmiPermitsDb({ permitRows: [existingPermitRow()] });

    const result = await listVmiPermits(
      readOnlyResolver(),
      PARTY_ID,
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });
});
