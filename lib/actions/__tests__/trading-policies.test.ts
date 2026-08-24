// Unit tests for lib/actions/trading-policies.ts —
// createTradingPolicy / updateTradingPolicy.
//
// Traceability: specs/13-trading-orders-and-pricing/design.md §2/§5/§6; see
// lib/actions/trading-policies.ts's own header comment for the full
// citation list and the two flagged design decisions (create rejects a
// duplicate open row; update's effective-date default is `new Date()`
// unless caller-supplied).
//
// Conventions mirrored from lib/actions/__tests__/vmi-charge-lines.test.ts /
// lib/actions/__tests__/trading-pricing.test.ts: RequestAuthorizationResolver
// mock helpers, mockRlsDeps(db), table-scoped queued-select /
// capturing-insert / capturing-update mock helpers (reimplemented here,
// file-private in the source files they're mirrored from).

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import {
  createTradingPolicy,
  updateTradingPolicy,
} from "../trading-policies";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";
import { tradingPolicies } from "@/lib/db/schema/trading_pricing";

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
  activeRoleKeys: ["supervisor"],
  grants: [
    { resource: "trading_policies", action: "manage", scopeKind: "global" },
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

// Supports BOTH `await db.update(t).set(v).where(...)` (bare, no
// .returning()) and `.returning()` chained after `.where()` — this
// codebase's real action files use both shapes (see
// lib/actions/withdrawals.ts's plain updates vs.
// lib/actions/vmi-charge-lines.ts's `.returning()` updates).
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

function makeTradingPoliciesDb(
  opts: { tradingPolicyRows?: AnyRecord[] } = {},
) {
  const queues = new Map<TableRef, unknown[][]>();
  queues.set(tradingPolicies, [opts.tradingPolicyRows ?? []]);

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

const PARTY_ID = "party-uuid-trading-1";
const ITEM_ID = "item-uuid-trading-1";

function validCreateInput(overrides: AnyRecord = {}): AnyRecord {
  return {
    partyId: PARTY_ID,
    itemId: ITEM_ID,
    buyCost: "100.0000",
    buyCurrency: "USD",
    marginType: "percentage",
    marginValue: "15.0000",
    sellPrice: "115.0000",
    sellCurrency: "USD",
    ...overrides,
  };
}

function existingPolicyRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: "policy-uuid-1",
    partyId: PARTY_ID,
    itemId: ITEM_ID,
    buyCost: "100.0000",
    buyCurrency: "USD",
    marginType: "percentage",
    marginValue: "15.0000",
    sellPrice: "115.0000",
    sellPriceIsOverride: false,
    sellCurrency: "USD",
    fxSource: null,
    isActive: true,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    createdByUserId: "user-uuid-someone-else",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createTradingPolicy
// ---------------------------------------------------------------------------

describe("createTradingPolicy — authorization", () => {
  it("returns { ok: false, errors: ['forbidden'] } and writes nothing when resolver lacks trading_policies.manage", async () => {
    const db = makeTradingPoliciesDb();

    const result = await createTradingPolicy(
      unauthorizedResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("createTradingPolicy — success", () => {
  it("inserts a new open-ended (effectiveTo = null, isActive = true) row when no active policy exists for (party, item)", async () => {
    const db = makeTradingPoliciesDb({ tradingPolicyRows: [] });

    const result = await createTradingPolicy(
      managerResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    const inserts = db._insertCalls.filter((c) => c.table === tradingPolicies);
    expect(inserts).toHaveLength(1);
    const row = inserts[0].values;
    expect(row.partyId).toBe(PARTY_ID);
    expect(row.itemId).toBe(ITEM_ID);
    expect(row.buyCost).toBe("100.0000");
    expect(row.sellPrice).toBe("115.0000");
    expect(row.isActive).toBe(true);
    expect(row.effectiveTo).toBeNull();
    expect(row.createdByUserId).toBe("user-uuid-manager");
    if (result.ok) {
      expect(result.policy.partyId).toBe(PARTY_ID);
      expect(result.policy.itemId).toBe(ITEM_ID);
    }
  });

  it("rejects with ['policy_already_exists'] and writes nothing when an open row already exists for (party, item)", async () => {
    const db = makeTradingPoliciesDb({
      tradingPolicyRows: [existingPolicyRow()],
    });

    const result = await createTradingPolicy(
      managerResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("policy_already_exists");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("createTradingPolicy — validation failure", () => {
  it("rejects a missing buyCost before any DB access", async () => {
    const db = makeTradingPoliciesDb();

    const result = await createTradingPolicy(
      managerResolver(),
      validCreateInput({ buyCost: undefined }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("buy_cost_required");
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects an invalid marginType before any DB access", async () => {
    const db = makeTradingPoliciesDb();

    const result = await createTradingPolicy(
      managerResolver(),
      validCreateInput({ marginType: "not_a_real_margin_type" }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("invalid_margin_type");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(AC: design.md §5 — fx_source required app-layer when buy_currency != sell_currency) rejects a missing fxSource when currencies differ", async () => {
    const db = makeTradingPoliciesDb();

    const result = await createTradingPolicy(
      managerResolver(),
      validCreateInput({ buyCurrency: "USD", sellCurrency: "PHP" }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("fx_source_required");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateTradingPolicy
// ---------------------------------------------------------------------------

describe("updateTradingPolicy — authorization", () => {
  it("returns { ok: false, errors: ['forbidden'] } and updates nothing when resolver lacks trading_policies.manage", async () => {
    const db = makeTradingPoliciesDb({
      tradingPolicyRows: [existingPolicyRow()],
    });

    const result = await updateTradingPolicy(
      unauthorizedResolver(),
      { partyId: PARTY_ID, itemId: ITEM_ID },
      { sellPrice: "120.0000" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("updateTradingPolicy — version-close-and-reopen", () => {
  it("closes the existing open row (effectiveTo set, isActive false) and inserts a new open-ended row with the updated fields, preserving unset fields from the closed row", async () => {
    const db = makeTradingPoliciesDb({
      tradingPolicyRows: [existingPolicyRow()],
    });

    const result = await updateTradingPolicy(
      managerResolver(),
      { partyId: PARTY_ID, itemId: ITEM_ID },
      { sellPrice: "120.0000" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);

    // The old row was closed.
    const updates = db._updateCalls.filter((c) => c.table === tradingPolicies);
    expect(updates).toHaveLength(1);
    expect(updates[0].values.isActive).toBe(false);
    expect(updates[0].values.effectiveTo).toBeInstanceOf(Date);

    // A new row was opened.
    const inserts = db._insertCalls.filter((c) => c.table === tradingPolicies);
    expect(inserts).toHaveLength(1);
    const newRow = inserts[0].values;
    expect(newRow.sellPrice).toBe("120.0000"); // updated field
    expect(newRow.buyCost).toBe("100.0000"); // carried over, unchanged
    expect(newRow.isActive).toBe(true);
    expect(newRow.effectiveTo).toBeNull();

    // The boundary lines up between the closed row and the reopened one.
    const closedEffectiveTo = (updates[0].values.effectiveTo as Date).getTime();
    const reopenedEffectiveFrom = (newRow.effectiveFrom as Date).getTime();
    expect(reopenedEffectiveFrom).toBe(closedEffectiveTo);

    // History is preserved on the fixture object itself — this module never
    // mutates the caller-supplied existing row.
    if (result.ok) {
      expect(result.policy.sellPrice).toBe("120.0000");
    }
  });

  it("rejects with ['not_found'] and writes nothing when no open row exists for (party, item)", async () => {
    const db = makeTradingPoliciesDb({ tradingPolicyRows: [] });

    const result = await updateTradingPolicy(
      managerResolver(),
      { partyId: PARTY_ID, itemId: ITEM_ID },
      { sellPrice: "120.0000" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("not_found");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("updateTradingPolicy — validation failure", () => {
  it("rejects an invalid marginType before any DB access", async () => {
    const db = makeTradingPoliciesDb({
      tradingPolicyRows: [existingPolicyRow()],
    });

    const result = await updateTradingPolicy(
      managerResolver(),
      { partyId: PARTY_ID, itemId: ITEM_ID },
      { marginType: "not_a_real_margin_type" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("invalid_margin_type");
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
