// RED-step unit tests for lib/actions/vmi-charge-lines.ts (does not exist
// yet — Task Group D, D.2: "Implement charge-line entry commands").
//
// Traceability:
//   specs/12-vmi-billing/tasks.md D.2 — "File: lib/actions/vmi-charge-lines.ts.
//     Create/edit a vmi_charge_lines row (documentation, pre-filled from
//     contract.documentation_default_rate_usd, editable; delivery, blank,
//     required manual PHP amount; ad-hoc types, free entry). Reject edits
//     once the line's period has closed."
//   specs/12-vmi-billing/requirements.md FR-4 — Handling, Documentation, and
//     Delivery charges:
//     FR-4.2 — "Documentation defaults to contract.documentation_default_rate_usd
//       per DR/AR reference ... but an authorized user may override the
//       amount per line."
//     FR-4.3 — "Delivery is always a manual entry per delivery run ... There
//       is no rate-card formula for delivery."
//     FR-4.4 — "Documentation and Delivery (and any ad-hoc type — RTV,
//       Insurance, Cargo Transfer Fee, Admin Fee) are recorded as
//       vmi_charge_lines, each attached to one generated_documents row with
//       document_type = 'acknowledgement_receipt' ... Warehousing and
//       Handling are never represented as vmi_charge_lines."
//   specs/12-vmi-billing/requirements.md FR-1.3 — a rate edit never
//     overwrites vmi_contract_terms history; "the documentation default
//     alike" is resolved by date against the version history, exactly like
//     storage/handling (tasks.md A.9) — never "whatever the contract
//     currently says."
//   specs/12-vmi-billing/design.md §1.4 — vmi_charge_lines column shapes;
//     "source: 'auto' = pre-filled from contract.documentation_default_rate_usd,
//     still editable; 'manual' = no contract-derived default exists at all
//     (delivery, and every ad-hoc type)."
//   specs/12-vmi-billing/design.md §2.4 — Documentation and Delivery
//     formulas: "Each row defaults to contract.documentation_default_rate_usd
//     at entry time (source = 'auto') but is independently editable per
//     line (still source = 'auto' — 'manual' is reserved for charge types
//     with no contract-derived default at all, i.e. delivery and every
//     ad-hoc type)." delivery_php = SUM(... currency = 'PHP' ...).
//   specs/12-vmi-billing/design.md §0 / §1.4's own correction — a plain FK
//     can't enforce "the referenced generated_documents row has
//     document_type = 'acknowledgement_receipt'"; that validator is this
//     module's own responsibility (tasks.md B.4's own note: "not yet
//     implemented" as of the schema task, owned by D.2).
//   specs/12-vmi-billing/design.md §4 — RLS boundaries: "vmi_charge_lines:
//     ... writeable by Office Admin/Supervisor only, and only for
//     vmi_billing_periods rows not yet closed." Both Office Admin and
//     Supervisor hold reporting.financial_read (requirements.md FR-10.1),
//     and period close/payment recording are the only two actions
//     additionally gated Administrator-only — charge-line entry is not
//     named as one of those two, so the base reporting.financial_read gate
//     applies here (mirrors trading-pricing.ts's precedent of gating on the
//     base read capability, not an admin-only one, for a non-close/payment
//     command).
//
// Resolved finding (per the task's own instruction to re-verify, not
// assume): overriding a documentation charge line's amount does NOT flip
// source to 'manual'. design.md §2.4's own inline comment is explicit —
// "'manual' is reserved for charge types with no contract-derived default
// at all" — so 'documentation' is ALWAYS source = 'auto', override or not.
// Only delivery and the five ad-hoc types (which have no contract-derived
// default in the first place) are ever source = 'manual'. See the
// "documentation — overridden" describe block below.
//
// Enum-level confirmation: lib/db/schema/vmi_billing.ts's vmiChargeTypeEnum
// contains exactly ['documentation','delivery','handling_and_stripping',
// 'cargo_transfer_fee','rtv','admin_fee','insurance','other'] — no bare
// 'warehousing'/'handling' value exists at all (already schema-level
// verified in lib/db/schema/__tests__/vmi_billing.test.ts, B.4). This file
// re-confirms that at the enum level AND additionally proves THIS module's
// own runtime validator defensively rejects 'warehousing'/'handling' if
// somehow passed in as a raw, un-typed string (e.g. a stale client build,
// a hand-crafted request) — belt-and-suspenders per the task instructions,
// not a redundant schema-level test.
//
// Conventions mirrored from lib/actions/trading-pricing.ts and
// lib/actions/withdrawals.ts (this codebase's established server-action
// pattern):
//   - RequestAuthorizationResolver + requirePermission(resolver, capability)
//     gate, checked BEFORE any DB access.
//   - withRlsTransaction(rlsDeps, callback) DB-transaction wrapper — this
//     test file injects a mocked RlsTransactionDeps via mockRlsDeps(db),
//     the same helper lib/actions/__tests__/withdrawals.test.ts and
//     lib/actions/__tests__/trading-pricing.test.ts use.
//   - Table-scoped queued-select / capturing-insert / capturing-update mock
//     helpers, same shape as trading-pricing.test.ts's (file-private there,
//     not exported, so reimplemented here rather than imported).
//   - lib/billing/vmi-daily-balance.ts's resolveContractTermsForDate is the
//     established point-in-time contract-version resolver already used by
//     C.3 (storage) and D.1 (handling, lib/billing/vmi-handling.ts) — this
//     module is expected to reuse it for documentation's default rate too
//     (FR-1.3's "the documentation default alike" clause), not reimplement
//     "just take the effective_to IS NULL row."
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/actions/vmi-charge-lines.ts (for
// backend-builder):
//
//   import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
//   import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
//
//   export type VmiChargeLineSnapshot = {
//     id: string;
//     partyId: string;
//     acknowledgementReceiptId: string;
//     chargeType: string;
//     amount: string;
//     currency: string; // 'USD' | 'PHP'
//     source: "auto" | "manual";
//     chargeDate: string;
//   };
//
//   export type CreateVmiChargeLineInput = {
//     partyId: string;
//     acknowledgementReceiptId: string;
//     chargeType: string; // validated at runtime against the 8 allowed values
//     chargeDate: string; // 'YYYY-MM-DD'
//     amount?: string;    // omitted/blank only ever accepted for 'documentation'
//     notes?: string;
//   };
//
//   export type CreateVmiChargeLineResult =
//     | { ok: true; chargeLine: VmiChargeLineSnapshot }
//     | { ok: false; errors: string[] };
//
//   export async function createVmiChargeLine(
//     resolver: RequestAuthorizationResolver,
//     input: unknown,
//     rlsDeps?: RlsTransactionDeps,
//   ): Promise<CreateVmiChargeLineResult>;
//
//   export type UpdateVmiChargeLineInput = {
//     chargeLineId: string;
//     amount?: string;
//     chargeDate?: string;
//     notes?: string;
//   };
//
//   export type UpdateVmiChargeLineResult =
//     | { ok: true; chargeLine: VmiChargeLineSnapshot }
//     | { ok: false; errors: string[] };
//
//   export async function updateVmiChargeLine(
//     resolver: RequestAuthorizationResolver,
//     input: unknown,
//     rlsDeps?: RlsTransactionDeps,
//   ): Promise<UpdateVmiChargeLineResult>;
//
// Error codes this test file exercises: "forbidden", "invalid_charge_type",
// "amount_required", "invalid_acknowledgement_receipt", "period_closed",
// "not_found".
//
// Explicitly out of scope for this RED cycle (flagged, not silently
// assumed): the "documentation, no override, but NO vmi_contract_terms
// version resolves for chargeDate at all" case (no rate to default from and
// none supplied). Not one of the 8 enumerated cases this task asked for;
// left to backend-builder's judgment, distinct from and not to be confused
// with the "delivery/ad-hoc amount missing" case, which IS tested below.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { createVmiChargeLine, updateVmiChargeLine } from "../vmi-charge-lines";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";
import {
  vmiChargeLines,
  vmiChargeTypeEnum,
  vmiContractTerms,
  vmiBillingPeriods,
} from "@/lib/db/schema/vmi_billing";
import { generatedDocuments } from "@/lib/db/schema/documents";

// ---------------------------------------------------------------------------
// Resolver mock helpers
// ---------------------------------------------------------------------------

function makeResolver(
  resolution: AuthorizationResolution,
): RequestAuthorizationResolver {
  return { getContext: vi.fn(async () => resolution) };
}

// Supervisor — holds reporting.financial_read (design.md §4's "writeable by
// Office Admin/Supervisor" — neither close nor payment, so the base gate).
const supervisorContext: AuthorizationContext = {
  userId: "user-uuid-supervisor",
  profileStatus: "active",
  activeRoleKeys: ["supervisor"],
  grants: [
    { resource: "reporting", action: "financial_read", scopeKind: "global" },
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

const supervisorResolver = () =>
  makeResolver({ kind: "authorized", context: supervisorContext });
const unauthorizedResolver = () =>
  makeResolver({ kind: "authorized", context: unauthorizedContext });

// ---------------------------------------------------------------------------
// DB mock helpers — table-scoped select queues, capturing insert/update.
// Mirrors lib/actions/__tests__/trading-pricing.test.ts's pattern (not
// imported from there since those helpers are file-private).
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

function makeChargeLinesDb(
  opts: {
    arRows?: AnyRecord[];
    periodRows?: AnyRecord[];
    contractRows?: AnyRecord[];
    chargeLineRows?: AnyRecord[];
  } = {},
) {
  const queues = new Map<TableRef, unknown[][]>();
  queues.set(generatedDocuments, [opts.arRows ?? [validArRow()]]);
  queues.set(vmiBillingPeriods, [opts.periodRows ?? [draftPeriodRow()]]);
  queues.set(vmiContractTerms, [opts.contractRows ?? [activeContractRow()]]);
  queues.set(vmiChargeLines, [opts.chargeLineRows ?? []]);

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
const AR_ID = "ar-uuid-1";
const CONTRACT_ID = "contract-uuid-1";
const CHARGE_DATE_IN_PERIOD = "2026-06-15";

function validArRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: AR_ID,
    documentType: "acknowledgement_receipt",
    documentNumber: "AR-2026-06-0001",
    sourceType: "inventory_commitment",
    sourceId: "commitment-uuid-1",
    ...overrides,
  };
}

function draftPeriodRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: "period-uuid-draft",
    partyId: PARTY_ID,
    periodStartDate: "2026-06-01",
    periodEndDate: "2026-06-30",
    status: "draft",
    ...overrides,
  };
}

function activeContractRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: CONTRACT_ID,
    partyId: PARTY_ID,
    documentationDefaultRateUsd: "10.0000",
    isActive: true,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    ...overrides,
  };
}

function validCreateInput(overrides: AnyRecord = {}): AnyRecord {
  return {
    partyId: PARTY_ID,
    acknowledgementReceiptId: AR_ID,
    chargeType: "documentation",
    chargeDate: CHARGE_DATE_IN_PERIOD,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe("createVmiChargeLine — authorization (design.md §4, requirements.md FR-10.1)", () => {
  it("(AC: reporting.financial_read required) returns { ok: false, errors: ['forbidden'] } and writes nothing when resolver lacks reporting.financial_read", async () => {
    const db = makeChargeLinesDb();

    const result = await createVmiChargeLine(
      unauthorizedResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 1. Documentation charge line, no override (FR-4.2, design.md §2.4, FR-1.3)
// ---------------------------------------------------------------------------

describe("createVmiChargeLine — documentation, no override (FR-4.2, design.md §1.4/§2.4)", () => {
  it("(AC: defaults to contract.documentation_default_rate_usd, source = 'auto') inserts amount = '10.0000' and source = 'auto' when no amount is supplied", async () => {
    const db = makeChargeLinesDb({ contractRows: [activeContractRow()] });

    const result = await createVmiChargeLine(
      supervisorResolver(),
      validCreateInput(), // no amount field at all
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);

    const inserts = db._insertCalls.filter((c) => c.table === vmiChargeLines);
    expect(inserts).toHaveLength(1);
    const row = inserts[0].values;
    expect(row.chargeType).toBe("documentation");
    expect(row.amount).toBe("10.0000");
    expect(row.source).toBe("auto");
    expect(row.currency).toBe("USD");
    expect(row.partyId).toBe(PARTY_ID);
    expect(row.acknowledgementReceiptId).toBe(AR_ID);
  });

  it(
    "(AC: FR-1.3 — the documentation default is resolved BY DATE against the vmi_contract_terms " +
      "version history, exactly like storage/handling, never 'whatever the contract currently " +
      "says') a charge_date that falls under an OLDER, already-superseded contract version " +
      "resolves that older version's rate, not the current one",
    async () => {
      const oldVersion = activeContractRow({
        id: "contract-uuid-old",
        documentationDefaultRateUsd: "8.0000",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        effectiveTo: new Date("2026-06-01T00:00:00Z"),
      });
      const newVersion = activeContractRow({
        id: "contract-uuid-new",
        documentationDefaultRateUsd: "10.0000",
        effectiveFrom: new Date("2026-06-01T00:00:00Z"),
        effectiveTo: null,
      });

      const db = makeChargeLinesDb({
        contractRows: [oldVersion, newVersion],
        periodRows: [
          draftPeriodRow({
            id: "period-uuid-may",
            periodStartDate: "2026-05-01",
            periodEndDate: "2026-05-31",
          }),
        ],
      });

      const result = await createVmiChargeLine(
        supervisorResolver(),
        validCreateInput({ chargeDate: "2026-05-15" }), // predates the rate change
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(true);
      const row = db._insertCalls.find((c) => c.table === vmiChargeLines)!
        .values;
      expect(row.amount).toBe("8.0000");
      expect(row.source).toBe("auto");
    },
  );
});

// ---------------------------------------------------------------------------
// 2. Documentation charge line, overridden (FR-4.2, design.md §1.4/§2.4 —
//    still source = 'auto', per this task's own re-verification instruction)
// ---------------------------------------------------------------------------

describe("createVmiChargeLine — documentation, overridden (FR-4.2, design.md §1.4/§2.4)", () => {
  it(
    "(AC: an explicit amount is stored as-is, and source REMAINS 'auto' — design.md §2.4's own " +
      "comment: \"'manual' is reserved for charge types with no contract-derived default at all\", " +
      "which documentation is NOT) inserts amount = '0.0000' (the real fixture's evidenced " +
      "override case) with source = 'auto', not 'manual'",
    async () => {
      const db = makeChargeLinesDb({ contractRows: [activeContractRow()] });

      const result = await createVmiChargeLine(
        supervisorResolver(),
        validCreateInput({ amount: "0.0000" }),
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(true);
      const row = db._insertCalls.find((c) => c.table === vmiChargeLines)!
        .values;
      expect(row.amount).toBe("0.0000");
      expect(row.amount).not.toBe("10.0000"); // the default was NOT used
      expect(row.source).toBe("auto");
      expect(row.source).not.toBe("manual");
    },
  );

  it("(AC: a nonzero override is also stored as-is with source = 'auto') inserts amount = '25.0000', source = 'auto'", async () => {
    const db = makeChargeLinesDb({ contractRows: [activeContractRow()] });

    const result = await createVmiChargeLine(
      supervisorResolver(),
      validCreateInput({ amount: "25.0000" }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    const row = db._insertCalls.find((c) => c.table === vmiChargeLines)!
      .values;
    expect(row.amount).toBe("25.0000");
    expect(row.source).toBe("auto");
  });
});

// ---------------------------------------------------------------------------
// 3. Delivery charge line (FR-4.3, design.md §1.4/§2.4)
// ---------------------------------------------------------------------------

describe("createVmiChargeLine — delivery (FR-4.3, design.md §1.4/§2.4)", () => {
  it("(AC: no contract-derived default exists at all — amount is always required) rejects a missing amount BEFORE any DB write", async () => {
    const db = makeChargeLinesDb();

    const result = await createVmiChargeLine(
      supervisorResolver(),
      validCreateInput({ chargeType: "delivery" }), // no amount
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("amount_required");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(AC: a blank/whitespace amount is also rejected, not just a missing field) rejects amount = '' before any DB write", async () => {
    const db = makeChargeLinesDb();

    const result = await createVmiChargeLine(
      supervisorResolver(),
      validCreateInput({ chargeType: "delivery", amount: "   " }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("amount_required");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(AC: currency is always PHP; source = 'manual') inserts currency = 'PHP', source = 'manual' when a valid amount is supplied", async () => {
    const db = makeChargeLinesDb();

    const result = await createVmiChargeLine(
      supervisorResolver(),
      validCreateInput({ chargeType: "delivery", amount: "40896.0000" }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    const row = db._insertCalls.find((c) => c.table === vmiChargeLines)!
      .values;
    expect(row.chargeType).toBe("delivery");
    expect(row.amount).toBe("40896.0000");
    expect(row.currency).toBe("PHP");
    expect(row.source).toBe("manual");
  });
});

// ---------------------------------------------------------------------------
// 4. Ad-hoc charge types (FR-4.4, design.md §1.4 enum: rtv, insurance,
//    cargo_transfer_fee, admin_fee, handling_and_stripping, other)
// ---------------------------------------------------------------------------

describe("createVmiChargeLine — ad-hoc charge types (FR-4.4, design.md §1.4)", () => {
  const adHocTypes = [
    "rtv",
    "insurance",
    "cargo_transfer_fee",
    "admin_fee",
    "handling_and_stripping",
  ];

  it.each(adHocTypes)(
    "(AC: %s is free entry, amount always required, source = 'manual') inserts with the given amount and source = 'manual'",
    async (chargeType) => {
      const db = makeChargeLinesDb();

      const result = await createVmiChargeLine(
        supervisorResolver(),
        validCreateInput({ chargeType, amount: "500.0000" }),
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(true);
      const row = db._insertCalls.find((c) => c.table === vmiChargeLines)!
        .values;
      expect(row.chargeType).toBe(chargeType);
      expect(row.amount).toBe("500.0000");
      expect(row.source).toBe("manual");
      expect(row.currency).toBe("USD");
    },
  );

  it.each(adHocTypes)(
    "(AC: %s — amount is always required, missing amount rejected before any DB write)",
    async (chargeType) => {
      const db = makeChargeLinesDb();

      const result = await createVmiChargeLine(
        supervisorResolver(),
        validCreateInput({ chargeType }), // no amount
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toContain("amount_required");
      expect(db.insert).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// 5. Rejected charge types — 'warehousing'/'handling' (design.md §1.4/B.4)
// ---------------------------------------------------------------------------

describe("createVmiChargeLine — rejected charge types (design.md §1.4, tasks.md B.4)", () => {
  it("confirms the vmi_charge_type enum itself contains no bare 'warehousing'/'handling' value (schema-level half of the validator, by construction)", () => {
    expect(vmiChargeTypeEnum.enumValues).toEqual([
      "documentation",
      "delivery",
      "handling_and_stripping",
      "cargo_transfer_fee",
      "rtv",
      "admin_fee",
      "insurance",
      "other",
    ]);
    expect(vmiChargeTypeEnum.enumValues).not.toContain("warehousing");
    expect(vmiChargeTypeEnum.enumValues).not.toContain("handling");
  });

  it.each(["warehousing", "handling"])(
    "(AC: this module's own runtime validator defensively rejects charge_type = '%s' if somehow passed) returns { ok: false, errors: ['invalid_charge_type'] } and writes nothing",
    async (chargeType) => {
      const db = makeChargeLinesDb();

      const result = await createVmiChargeLine(
        supervisorResolver(),
        validCreateInput({ chargeType, amount: "100.0000" }),
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toContain("invalid_charge_type");
      expect(db.insert).not.toHaveBeenCalled();
    },
  );

  it("rejects a completely unknown charge_type string the same way", async () => {
    const db = makeChargeLinesDb();

    const result = await createVmiChargeLine(
      supervisorResolver(),
      validCreateInput({ chargeType: "not_a_real_type", amount: "1.0000" }),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("invalid_charge_type");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. Closed-period rejection — create path (design.md §4, tasks.md D.2)
// ---------------------------------------------------------------------------

describe("createVmiChargeLine — closed-period rejection (design.md §4, tasks.md D.2)", () => {
  it.each(["issued", "voided"])(
    "(AC: the period covering charge_date already has status = '%s' — creating a charge line is rejected, no DB write)",
    async (status) => {
      const db = makeChargeLinesDb({
        periodRows: [draftPeriodRow({ status })],
      });

      const result = await createVmiChargeLine(
        supervisorResolver(),
        validCreateInput(),
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toContain("period_closed");
      expect(db.insert).not.toHaveBeenCalled();
    },
  );

  it("(AC: no vmi_billing_periods row exists yet for that party/date — NOT treated as closed) succeeds when no period row covers charge_date at all", async () => {
    const db = makeChargeLinesDb({ periodRows: [] });

    const result = await createVmiChargeLine(
      supervisorResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    expect(db.insert).toHaveBeenCalled();
  });

  it("(AC: a 'draft' period does not block creation) succeeds when the covering period is still 'draft'", async () => {
    const db = makeChargeLinesDb({
      periodRows: [draftPeriodRow({ status: "draft" })],
    });

    const result = await createVmiChargeLine(
      supervisorResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. AR document validation (design.md §0/§1.4 correction, tasks.md B.4)
// ---------------------------------------------------------------------------

describe("createVmiChargeLine — AR document validation (design.md §0/§1.4, tasks.md B.4)", () => {
  it("(AC: the referenced generated_documents row does not exist at all) returns { ok: false, errors: ['invalid_acknowledgement_receipt'] } and writes nothing", async () => {
    const db = makeChargeLinesDb({ arRows: [] });

    const result = await createVmiChargeLine(
      supervisorResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("invalid_acknowledgement_receipt");
    }
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(AC: the referenced row exists but document_type != 'acknowledgement_receipt' — e.g. a pick_list) returns { ok: false, errors: ['invalid_acknowledgement_receipt'] } and writes nothing", async () => {
    const db = makeChargeLinesDb({
      arRows: [validArRow({ documentType: "pick_list" })],
    });

    const result = await createVmiChargeLine(
      supervisorResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("invalid_acknowledgement_receipt");
    }
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(AC: a valid document_type = 'acknowledgement_receipt' row succeeds) inserts the charge line", async () => {
    const db = makeChargeLinesDb({ arRows: [validArRow()] });

    const result = await createVmiChargeLine(
      supervisorResolver(),
      validCreateInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Edit path (tasks.md D.2: "Reject edits once the line's period has closed")
// ---------------------------------------------------------------------------

describe("updateVmiChargeLine — edit path (tasks.md D.2, design.md §4)", () => {
  function existingChargeLineRow(overrides: AnyRecord = {}): AnyRecord {
    return {
      id: "chargeline-uuid-1",
      partyId: PARTY_ID,
      acknowledgementReceiptId: AR_ID,
      chargeType: "documentation",
      amount: "10.0000",
      currency: "USD",
      source: "auto",
      chargeDate: CHARGE_DATE_IN_PERIOD,
      notes: null,
      recordedByUserId: "user-uuid-someone-else",
      createdAt: new Date("2026-06-15T00:00:00Z"),
      ...overrides,
    };
  }

  it("(AC: reporting.financial_read required) returns { ok: false, errors: ['forbidden'] } and updates nothing", async () => {
    const db = makeChargeLinesDb({
      chargeLineRows: [existingChargeLineRow()],
    });

    const result = await updateVmiChargeLine(
      unauthorizedResolver(),
      { chargeLineId: "chargeline-uuid-1", amount: "5.0000" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("forbidden");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("(AC: chargeLineId does not resolve to an existing row) returns { ok: false, errors: ['not_found'] } and updates nothing", async () => {
    const db = makeChargeLinesDb({ chargeLineRows: [] });

    const result = await updateVmiChargeLine(
      supervisorResolver(),
      { chargeLineId: "chargeline-uuid-missing", amount: "5.0000" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("not_found");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("(AC: editing an existing charge line still in a draft/open period updates the row) updates amount on the existing vmi_charge_lines row", async () => {
    const db = makeChargeLinesDb({
      chargeLineRows: [existingChargeLineRow()],
      periodRows: [draftPeriodRow({ status: "draft" })],
    });

    const result = await updateVmiChargeLine(
      supervisorResolver(),
      { chargeLineId: "chargeline-uuid-1", amount: "0.0000" },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    const updates = db._updateCalls.filter((c) => c.table === vmiChargeLines);
    expect(updates).toHaveLength(1);
    expect(updates[0].values.amount).toBe("0.0000");
  });

  it.each(["issued", "voided"])(
    "(AC: the SAME closed-period guard applies to edits — the covering period already has status = '%s') returns { ok: false, errors: ['period_closed'] } and updates nothing",
    async (status) => {
      const db = makeChargeLinesDb({
        chargeLineRows: [existingChargeLineRow()],
        periodRows: [draftPeriodRow({ status })],
      });

      const result = await updateVmiChargeLine(
        supervisorResolver(),
        { chargeLineId: "chargeline-uuid-1", amount: "0.0000" },
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toContain("period_closed");
      expect(db.update).not.toHaveBeenCalled();
    },
  );
});
