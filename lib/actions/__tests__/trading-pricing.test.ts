// RED-step unit tests for lib/actions/trading-pricing.ts (does not exist
// yet — Task 4, bullets 4, 5, 6: the freeze command, the price-override
// flow, and immutability/never-rewritten guarantees).
//
// Traceability:
//   specs/13-trading-orders-and-pricing/requirements.md
//     R2.2 — "The resolved buy_cost, sell_price, and computed margin are
//             frozen into an immutable, hashed trading_invoice_lines row
//             (direction = 'sale') at that moment ... never recomputed
//             afterward even if the underlying trading_policies row later
//             changes."
//     R2.3 — "Price overrides at resolution time require
//             trading.price_override and a mandatory written reason,
//             appended to an immutable audit log."
//     §2 — "No configured rate card, no sale ... never a silent fallback to
//           items.selling_price."
//   specs/13-trading-orders-and-pricing/design.md
//     §2 — trading_invoice_lines column shapes (buyCost, sellPrice,
//          marginAmount, currency, sourcePolicyId, snapshotHash, lockedAt;
//          "No updatedAt — a frozen row is never edited").
//     §3 — TradingPriceSnapshot contract (exact field names/shape) and its
//          guarantees: "snapshot_hash detects any post-freeze mutation
//          attempt", "Immutable after locked_at; a later price correction
//          creates a new trading_invoice_lines row, never edits history."
//     §5 — "Overrides: trading.price_override plus a mandatory written
//          reason, appended to an immutable audit log." / "Missing rate
//          blocks the freeze" (fx_rate_required).
//     §6 — capability vocabulary: trading_policies.read, trading_policies.manage
//          (= price_set), trading_prices.read_internal (= margin_view),
//          trading_prices.override.
//   specs/13-trading-orders-and-pricing/tasks.md Task 4, bullets 4-6.
//
// Consumed, not reimplemented:
//   lib/billing/trading-price-resolution.ts's resolveActiveTradingPolicy
//     (own RED test file: lib/billing/__tests__/trading-price-resolution.test.ts)
//   lib/billing/trading-margin-calc.ts's computeTradingPriceLine — the
//     decimal-safe margin/currency/forex math. This module must call it, not
//     re-derive sell_price/margin_amount by hand.
//
// Conventions mirrored from lib/actions/withdrawals.ts (this codebase's
// established server-action pattern):
//   - RequestAuthorizationResolver + requirePermission(resolver, capability)
//     gate, checked BEFORE any DB access.
//   - withRlsTransaction(rlsDeps, callback) DB-transaction wrapper — this
//     test file injects a mocked RlsTransactionDeps via mockRlsDeps(db), the
//     same helper lib/actions/__tests__/withdrawals.test.ts uses.
//   - hashSnapshot(data) = sha256(JSON.stringify(data)).hex — withdrawals.ts
//     defines this privately (createHash("sha256").update(JSON.stringify(
//     data)).digest("hex")); this module is expected to mirror the SAME
//     algorithm (not a different hashing approach), so this test only
//     asserts the observable contract (a 64-hex-char string) rather than
//     reimplementing withdrawals.ts's private function here to compare
//     byte-for-byte — the two modules do not share an exported hash utility
//     today, so exact-value comparison is out of this file's reach without
//     inventing a new shared export the tasks.md item never asked for.
//
// Scope decision (flagged, not silently assumed): design.md §4's "no rate
// configured" recovery path names TWO options — (a) a trading.price_set
// holder creates a trading_policies row (out of scope: that's the
// list/create/edit UI, a separate Task 4 bullet), or (b) "an explicit
// one-off override, trading.price_override + reason." Reading (b) literally
// would let an override apply even with NO underlying trading_policies row
// at all, which would need its own buy_cost/currency basis to come from
// somewhere design.md never specifies for that case. This test file treats
// the override flow as always overriding a RESOLVED policy's sell_price
// (i.e. a trading_policies row must still exist and be active) — the
// override never supplies a substitute buy_cost/currency basis. This is
// the narrower, unambiguous reading directly supported by design.md §5's
// "sell_price_is_override = true, in which case the stored value is
// authoritative" framing (a property of an existing policy/resolution, not
// of a from-scratch bypass). Flagged here for backend-builder/reviewer.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/actions/trading-pricing.ts (for
// backend-builder):
//
//   import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
//   import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
//
//   export type TradingPriceSnapshot = {
//     trading_invoice_line_id: string;
//     pick_list_item_id: string;
//     item_id: string;
//     party_id: string;
//     buy_cost: string;
//     sell_price: string;
//     margin_amount: string;
//     currency: string;
//     snapshot_hash: string;
//     locked_at: string; // ISO 8601
//   };
//
//   export type FreezeTradingPriceInput = {
//     partyId: string;
//     itemId: string;
//     pickListItemId: string;
//     qty: string;
//     override?: { sellPrice: string; reason: string };
//   };
//
//   export type FreezeTradingPriceResult =
//     | { ok: true; snapshot: TradingPriceSnapshot }
//     | { ok: false; errors: string[]; partyId?: string; itemId?: string };
//
//   export async function freezeTradingPrice(
//     resolver: RequestAuthorizationResolver,
//     input: unknown,
//     rlsDeps?: RlsTransactionDeps,
//   ): Promise<FreezeTradingPriceResult>;
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { freezeTradingPrice } from "../trading-pricing";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";
import { tradingPolicies, tradingInvoiceLines } from "@/lib/db/schema/trading_pricing";
import { forexRates } from "@/lib/db/schema/forex";
import { auditLog } from "@/lib/db/schema/audit";

// ---------------------------------------------------------------------------
// Resolver mock helpers
// ---------------------------------------------------------------------------

function makeResolver(
  resolution: AuthorizationResolution,
): RequestAuthorizationResolver {
  return { getContext: vi.fn(async () => resolution) };
}

// Administrator — has trading_policies.read AND trading_prices.override.
const adminContext: AuthorizationContext = {
  userId: "user-uuid-admin",
  profileStatus: "active",
  activeRoleKeys: ["administrator"],
  grants: [
    { resource: "trading_policies", action: "read", scopeKind: "global" },
    { resource: "trading_prices", action: "override", scopeKind: "global" },
  ],
  partyScopes: [],
};

// Warehouse staff — has trading_policies.read only; NOT trading_prices.override.
const readOnlyContext: AuthorizationContext = {
  userId: "user-uuid-staff",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [
    { resource: "trading_policies", action: "read", scopeKind: "global" },
  ],
  partyScopes: [],
};

// No relevant capabilities at all.
const unauthorizedContext: AuthorizationContext = {
  userId: "user-uuid-unauthorized",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [],
  partyScopes: [],
};

// Isolates trading_prices.read_internal from trading_prices.override — has
// trading_policies.read AND trading_prices.read_internal, but explicitly NOT
// trading_prices.override. adminContext above always co-holds .override, so
// it never exercises the .read_internal-alone branch of
// hasTradingPriceInternalVisibility on its own; this fixture does.
const readInternalOnlyContext: AuthorizationContext = {
  userId: "user-uuid-read-internal",
  profileStatus: "active",
  activeRoleKeys: ["supervisor"],
  grants: [
    { resource: "trading_policies", action: "read", scopeKind: "global" },
    { resource: "trading_prices", action: "read_internal", scopeKind: "global" },
  ],
  partyScopes: [],
};

const adminResolver = () =>
  makeResolver({ kind: "authorized", context: adminContext });
const readOnlyResolver = () =>
  makeResolver({ kind: "authorized", context: readOnlyContext });
const unauthorizedResolver = () =>
  makeResolver({ kind: "authorized", context: unauthorizedContext });
const readInternalOnlyResolver = () =>
  makeResolver({ kind: "authorized", context: readInternalOnlyContext });

// ---------------------------------------------------------------------------
// DB mock helpers — table-scoped select queues, capturing insert/update.
// Mirrors lib/actions/__tests__/withdrawals.test.ts's makeQueuedSelect /
// makeCapturingInsert / makeCapturingUpdate pattern (not imported from there
// since those helpers are file-private, not exported).
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

function makeTradingDb(opts: {
  policyRows?: AnyRecord[];
  forexRows?: AnyRecord[];
} = {}) {
  const queues = new Map<TableRef, unknown[][]>();
  queues.set(tradingPolicies, [opts.policyRows ?? []]);
  queues.set(forexRates, [opts.forexRows ?? []]);

  const select = makeQueuedSelect(queues);
  const insertCap = makeCapturingInsert();
  const updateFn = vi.fn(); // never expected to be called by this module

  return {
    select,
    insert: insertCap.fn,
    update: updateFn,
    _insertCalls: insertCap.calls,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PARTY_ID = "party-uuid-customer";
const ITEM_ID = "item-uuid-1";
const PICK_LIST_ITEM_ID = "pli-uuid-1";

function activePolicyRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: "policy-uuid-1",
    partyId: PARTY_ID,
    itemId: ITEM_ID,
    buyCost: "100.0000",
    buyCurrency: "USD",
    marginType: "percentage",
    marginValue: "20.0000",
    sellPrice: "120.0000",
    sellPriceIsOverride: false,
    sellCurrency: "USD",
    fxSource: null,
    isActive: true,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    createdByUserId: "user-uuid-admin",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function validFreezeInput(overrides: AnyRecord = {}): AnyRecord {
  return {
    partyId: PARTY_ID,
    itemId: ITEM_ID,
    pickListItemId: PICK_LIST_ITEM_ID,
    qty: "10.0000",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe("freezeTradingPrice — authorization (design.md §6)", () => {
  it("(AC: trading_policies.read required) returns { ok: false, errors: ['forbidden'] } when resolver lacks trading_policies.read, and writes nothing", async () => {
    const db = makeTradingDb({ policyRows: [activePolicyRow()] });

    const result = await freezeTradingPrice(
      unauthorizedResolver(),
      validFreezeInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Missing rate card — clean block naming both party and item (§2, R2.1)
// ---------------------------------------------------------------------------

describe("freezeTradingPrice — missing rate card blocks freeze (§2, R2.1, design.md §4)", () => {
  it("(AC: no active trading_policies row -> clean rejection naming BOTH party and item, never a silent fallback) returns { ok: false, errors: ['no_rate_configured'], partyId, itemId } and inserts nothing", async () => {
    const db = makeTradingDb({ policyRows: [] });

    const result = await freezeTradingPrice(
      adminResolver(),
      validFreezeInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("no_rate_configured");
      expect(result.partyId).toBe(PARTY_ID);
      expect(result.itemId).toBe(ITEM_ID);
    }
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Freeze command — success (R2.2, design.md §2/§3)
// ---------------------------------------------------------------------------

describe("freezeTradingPrice — freeze command success (R2.2, design.md §2/§3)", () => {
  it("(AC: computes via computeTradingPriceLine and inserts an immutable, hashed direction='sale' trading_invoice_lines row) inserts exactly one trading_invoice_lines row with buyCost/sellPrice/marginAmount from the margin formula, a snapshot_hash, and a lockedAt timestamp", async () => {
    const policy = activePolicyRow();
    const db = makeTradingDb({ policyRows: [policy] });

    const result = await freezeTradingPrice(
      adminResolver(),
      validFreezeInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);

    const inserts = db._insertCalls.filter(
      (c) => c.table === tradingInvoiceLines,
    );
    expect(inserts).toHaveLength(1);

    const row = inserts[0].values;
    expect(row.direction).toBe("sale");
    expect(row.pickListItemId).toBe(PICK_LIST_ITEM_ID);
    expect(row.partyId).toBe(PARTY_ID);
    expect(row.itemId).toBe(ITEM_ID);
    // 100 buy_cost + 20% markup = 120.0000 sell_price, 20.0000 margin — the
    // literal design.md §5 markup-on-cost formula, computed via
    // computeTradingPriceLine, never hand-derived here.
    expect(row.buyCost).toBe("100.0000");
    expect(row.sellPrice).toBe("120.0000");
    expect(row.marginAmount).toBe("20.0000");
    expect(row.currency).toBe("USD");
    expect(row.sourcePolicyId).toBe(policy.id);

    // Immutable/hashed snapshot fields.
    expect(typeof row.snapshotHash).toBe("string");
    expect(row.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.lockedAt).toBeInstanceOf(Date);
    expect(row.createdByUserId).toBe(adminContext.userId);
  });

  it("(AC: no update path exists anywhere in this module) never calls db.update, for a fully successful freeze", async () => {
    const db = makeTradingDb({ policyRows: [activePolicyRow()] });

    const result = await freezeTradingPrice(
      adminResolver(),
      validFreezeInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("(AC: returned snapshot matches design.md §3's TradingPriceSnapshot contract exactly — snake_case keys, decimal strings, no floats) returns the exact TradingPriceSnapshot shape 08/10 consume", async () => {
    const db = makeTradingDb({ policyRows: [activePolicyRow()] });

    const result = await freezeTradingPrice(
      adminResolver(),
      validFreezeInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot).toMatchObject({
        pick_list_item_id: PICK_LIST_ITEM_ID,
        item_id: ITEM_ID,
        party_id: PARTY_ID,
        buy_cost: "100.0000",
        sell_price: "120.0000",
        margin_amount: "20.0000",
        currency: "USD",
      });
      expect(typeof result.snapshot.trading_invoice_line_id).toBe("string");
      expect(result.snapshot.snapshot_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof result.snapshot.locked_at).toBe("string");
      // Never a float — every monetary field is a decimal string.
      expect(typeof result.snapshot.buy_cost).toBe("string");
      expect(typeof result.snapshot.sell_price).toBe("string");
      expect(typeof result.snapshot.margin_amount).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// Never rewritten by a later policy change (R2.2, design.md §3)
// ---------------------------------------------------------------------------

describe("freezeTradingPrice — never rewritten by a later trading_policies change (R2.2, design.md §2/§3)", () => {
  it(
    "(AC: a second freeze against a superseding policy version never touches the first " +
      "frozen row — no update path, and the first insert's values remain exactly what " +
      "they were computed as at ITS OWN freeze time) produces two independent, differently-" +
      "priced inserts and never calls db.update across either call",
    async () => {
      const policyV1 = activePolicyRow({
        id: "policy-uuid-v1",
        buyCost: "100.0000",
        marginValue: "20.0000",
      });

      const dbFirstFreeze = makeTradingDb({ policyRows: [policyV1] });
      const firstResult = await freezeTradingPrice(
        adminResolver(),
        validFreezeInput({ pickListItemId: "pli-uuid-first" }),
        mockRlsDeps(dbFirstFreeze).deps,
      );
      expect(firstResult.ok).toBe(true);

      const firstInsert = dbFirstFreeze._insertCalls.find(
        (c) => c.table === tradingInvoiceLines,
      )!;
      expect(firstInsert.values.buyCost).toBe("100.0000");
      expect(firstInsert.values.sellPrice).toBe("120.0000");
      expect(firstInsert.values.sourcePolicyId).toBe("policy-uuid-v1");
      expect(dbFirstFreeze.update).not.toHaveBeenCalled();

      // The policy is later revised — v1 deactivated, v2 active with a
      // different buy_cost/margin (a completely separate freeze call/db
      // instance, exactly like a later request hitting the now-current row).
      const policyV2 = activePolicyRow({
        id: "policy-uuid-v2",
        buyCost: "150.0000",
        marginValue: "10.0000",
      });

      const dbSecondFreeze = makeTradingDb({ policyRows: [policyV2] });
      const secondResult = await freezeTradingPrice(
        adminResolver(),
        validFreezeInput({ pickListItemId: "pli-uuid-second" }),
        mockRlsDeps(dbSecondFreeze).deps,
      );
      expect(secondResult.ok).toBe(true);

      const secondInsert = dbSecondFreeze._insertCalls.find(
        (c) => c.table === tradingInvoiceLines,
      )!;
      // 150 + 10% = 165.0000 — a genuinely different snapshot, proving the
      // second freeze used the NEW policy, not a cached/stale value.
      expect(secondInsert.values.buyCost).toBe("150.0000");
      expect(secondInsert.values.sellPrice).toBe("165.0000");
      expect(secondInsert.values.sourcePolicyId).toBe("policy-uuid-v2");
      expect(dbSecondFreeze.update).not.toHaveBeenCalled();

      // The FIRST frozen row's own values are untouched by the second
      // freeze — no rewrite mechanism was ever invoked against it.
      expect(firstInsert.values.buyCost).toBe("100.0000");
      expect(firstInsert.values.sellPrice).toBe("120.0000");
    },
  );
});

// ---------------------------------------------------------------------------
// Override flow (R2.3, design.md §5)
// ---------------------------------------------------------------------------

describe("freezeTradingPrice — override flow (R2.3, design.md §5)", () => {
  it("(AC: trading_prices.override required) returns { ok: false, errors: ['forbidden'] } and inserts nothing when a caller without trading_prices.override supplies an override", async () => {
    const db = makeTradingDb({ policyRows: [activePolicyRow()] });

    const result = await freezeTradingPrice(
      readOnlyResolver(),
      validFreezeInput({
        override: { sellPrice: "150.0000", reason: "Customer negotiated rate" },
      }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(AC: mandatory written reason — empty string rejected) returns { ok: false, errors: ['override_reason_required'] } and inserts nothing when reason is an empty string", async () => {
    const db = makeTradingDb({ policyRows: [activePolicyRow()] });

    const result = await freezeTradingPrice(
      adminResolver(),
      validFreezeInput({
        override: { sellPrice: "150.0000", reason: "" },
      }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("override_reason_required");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(AC: mandatory written reason — missing field rejected) returns { ok: false, errors: ['override_reason_required'] } when reason is omitted entirely", async () => {
    const db = makeTradingDb({ policyRows: [activePolicyRow()] });

    const result = await freezeTradingPrice(
      adminResolver(),
      validFreezeInput({
        // @ts-expect-error — intentionally malformed to prove the runtime
        // guard rejects, not just the type system.
        override: { sellPrice: "150.0000" },
      }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("override_reason_required");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it(
    "(AC: authorized override with a valid reason uses the override price instead of the " +
      "formula-derived one, and the override + reason are appended to an immutable audit " +
      "log) inserts sell_price = override.sellPrice (not the 120.0000 formula result) and " +
      "writes an audit_log row referencing the frozen line and the reason",
    async () => {
      const policy = activePolicyRow(); // formula would derive 120.0000
      const db = makeTradingDb({ policyRows: [policy] });

      const result = await freezeTradingPrice(
        adminResolver(),
        validFreezeInput({
          override: {
            sellPrice: "150.0000",
            reason: "Customer negotiated rate per PO-2026-0819",
          },
        }),
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(true);

      const invoiceLineInsert = db._insertCalls.find(
        (c) => c.table === tradingInvoiceLines,
      )!;
      // Override wins outright — never the margin_type/margin_value formula
      // result (design.md §5: "the stored value is authoritative").
      expect(invoiceLineInsert.values.sellPrice).toBe("150.0000");
      expect(invoiceLineInsert.values.sellPrice).not.toBe("120.0000");
      expect(invoiceLineInsert.values.buyCost).toBe("100.0000");

      const auditInsert = db._insertCalls.find((c) => c.table === auditLog);
      expect(auditInsert).toBeDefined();
      expect(auditInsert!.values.actorUserId).toBe(adminContext.userId);
      expect(auditInsert!.values.entityType).toBe("trading_invoice_lines");
      // Reason and the override price must be recoverable from the audit
      // record — trading_invoice_lines itself has no override-reason column
      // (verified against lib/db/schema/trading_pricing.ts before writing
      // this test), so this is the ONLY place the reason is persisted.
      const afterData = JSON.stringify(auditInsert!.values.afterData);
      expect(afterData).toContain("Customer negotiated rate per PO-2026-0819");
      expect(afterData).toContain("150.0000");
    },
  );

  it("(AC: no override supplied -> no audit_log write) never inserts into audit_log for a plain, non-override freeze", async () => {
    const db = makeTradingDb({ policyRows: [activePolicyRow()] });

    const result = await freezeTradingPrice(
      adminResolver(),
      validFreezeInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    const auditInsert = db._insertCalls.find((c) => c.table === auditLog);
    expect(auditInsert).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Currency/forex missing-rate rejection (design.md §5, mirrors
// trading-margin-calc.ts's fx_rate_required)
// ---------------------------------------------------------------------------

describe("freezeTradingPrice — currency/forex missing-rate rejection (design.md §5)", () => {
  it(
    "(AC: buy/sell currencies differ and no forex_rates row is resolvable -> the freeze " +
      "command propagates computeTradingPriceLine's fx_rate_required as a clean block, " +
      "never proceeding with a partial/wrong price) returns { ok: false, errors: " +
      "['fx_rate_required'] } and inserts nothing",
    async () => {
      const crossCurrencyPolicy = activePolicyRow({
        id: "policy-uuid-fx",
        buyCurrency: "USD",
        sellCurrency: "PHP",
        fxSource: "forex_rates:daily",
      });
      // No forexRates row provided at all — the missing-rate case.
      const db = makeTradingDb({
        policyRows: [crossCurrencyPolicy],
        forexRows: [],
      });

      const result = await freezeTradingPrice(
        adminResolver(),
        validFreezeInput(),
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("fx_rate_required");
      }
      const inserts = db._insertCalls.filter(
        (c) => c.table === tradingInvoiceLines,
      );
      expect(inserts).toHaveLength(0);
    },
  );
});

// ---------------------------------------------------------------------------
// Internal-pricing (margin) visibility redaction (requirements.md §5 —
// "Margin (buy_cost, sell_price, margin, margin %) is visible only to
// trading.margin_view holders"; design.md §5's margin-visibility rule,
// implemented as hasTradingPriceInternalVisibility gating on
// trading_prices.read_internal OR trading_prices.override).
//
// A real rbac-rls-reviewer finding: freezeTradingPrice's returned
// TradingPriceSnapshot was leaking buy_cost/margin_amount to callers who
// hold neither capability. Fixed in trading-pricing.ts by omitting (not
// nulling) those two keys unless hasTradingPriceInternalVisibility(context)
// is true. Nothing in the pre-existing 12 tests distinctly proves this: the
// only prior test touching a non-admin caller is the override-forbidden
// case above, which returns before snapshot construction is ever reached,
// and adminContext always co-holds trading_prices.override, so it never
// isolates .read_internal on its own.
// ---------------------------------------------------------------------------

describe("freezeTradingPrice — internal-pricing (margin) visibility redaction (requirements.md §5, design.md §5)", () => {
  it("(AC: trading_prices.read_internal alone — without .override — still grants visibility) a successful freeze under a caller holding ONLY trading_prices.read_internal (not trading_prices.override) returns a snapshot that INCLUDES buy_cost and margin_amount", async () => {
    const db = makeTradingDb({ policyRows: [activePolicyRow()] });

    const result = await freezeTradingPrice(
      readInternalOnlyResolver(),
      validFreezeInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot).toMatchObject({
        buy_cost: "100.0000",
        margin_amount: "20.0000",
      });
      expect("buy_cost" in result.snapshot).toBe(true);
      expect("margin_amount" in result.snapshot).toBe(true);
    }
  });

  it("(AC: neither trading_prices.read_internal nor trading_prices.override — margin fields OMITTED, not nulled) a successful freeze under readOnlyResolver() (trading_policies.read only) returns a snapshot with NEITHER buy_cost NOR margin_amount present as keys", async () => {
    const db = makeTradingDb({ policyRows: [activePolicyRow()] });

    const result = await freezeTradingPrice(
      readOnlyResolver(),
      validFreezeInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Key-omission, not toBeUndefined() — the fix omits the keys entirely
      // rather than setting them to null/undefined while present.
      expect("buy_cost" in result.snapshot).toBe(false);
      expect("margin_amount" in result.snapshot).toBe(false);
      // The rest of the snapshot contract is still intact for this caller.
      expect(result.snapshot).toMatchObject({
        pick_list_item_id: PICK_LIST_ITEM_ID,
        item_id: ITEM_ID,
        party_id: PARTY_ID,
        sell_price: "120.0000",
        currency: "USD",
      });
    }
  });

  it("(AC: return-value redaction never affects the persisted trading_invoice_lines row) the DB insert always carries the real, non-redacted buyCost/marginAmount regardless of which caller-visibility case triggered the freeze", async () => {
    const dbNoVisibility = makeTradingDb({ policyRows: [activePolicyRow()] });
    const resultNoVisibility = await freezeTradingPrice(
      readOnlyResolver(),
      validFreezeInput({ pickListItemId: "pli-uuid-no-visibility" }),
      mockRlsDeps(dbNoVisibility).deps,
    );
    expect(resultNoVisibility.ok).toBe(true);

    const insertNoVisibility = dbNoVisibility._insertCalls.find(
      (c) => c.table === tradingInvoiceLines,
    )!;
    // Persisted row is the real computed values even though the RETURNED
    // snapshot above omitted buy_cost/margin_amount for this same caller.
    expect(insertNoVisibility.values.buyCost).toBe("100.0000");
    expect(insertNoVisibility.values.marginAmount).toBe("20.0000");

    const dbReadInternalOnly = makeTradingDb({ policyRows: [activePolicyRow()] });
    const resultReadInternalOnly = await freezeTradingPrice(
      readInternalOnlyResolver(),
      validFreezeInput({ pickListItemId: "pli-uuid-read-internal" }),
      mockRlsDeps(dbReadInternalOnly).deps,
    );
    expect(resultReadInternalOnly.ok).toBe(true);

    const insertReadInternalOnly = dbReadInternalOnly._insertCalls.find(
      (c) => c.table === tradingInvoiceLines,
    )!;
    expect(insertReadInternalOnly.values.buyCost).toBe("100.0000");
    expect(insertReadInternalOnly.values.marginAmount).toBe("20.0000");

    const dbAdmin = makeTradingDb({ policyRows: [activePolicyRow()] });
    const resultAdmin = await freezeTradingPrice(
      adminResolver(),
      validFreezeInput({ pickListItemId: "pli-uuid-admin" }),
      mockRlsDeps(dbAdmin).deps,
    );
    expect(resultAdmin.ok).toBe(true);

    const insertAdmin = dbAdmin._insertCalls.find(
      (c) => c.table === tradingInvoiceLines,
    )!;
    expect(insertAdmin.values.buyCost).toBe("100.0000");
    expect(insertAdmin.values.marginAmount).toBe("20.0000");
  });
});
