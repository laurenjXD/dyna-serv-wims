// RED-step unit tests for lib/actions/items.ts (does not exist yet).
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R4 (Item enrollment),
//     R6.1, R6.3
//   specs/06-party-and-item-enrollment/design.md §4 (Command boundary),
//     §6 (Item model and workflows), §6 Barcode immutability,
//     §6 Item deactivation impact
//   specs/06-party-and-item-enrollment/tasks.md Testing Matrix §Unit tests
//
// Acceptance criteria covered (requirements.md §5):
//   "An authorized administrator can create, search, edit, and deactivate an
//    item using validated canonical party/category references."
//   "Invalid packaging/dimension/UOM combinations are rejected with actionable
//    field-level feedback."
//   "Historical references remain valid after deactivation, and destructive
//    deletion is blocked when references exist."
//   "Cross-party, unauthorized, stale-edit, and direct-identifier manipulation
//    cases fail safely."
//
// Capability used for all item mutations (design.md §4, confirmed against
// specs/02-rbac-roles §3.2 catalog): "items.manage"
//
// Mocking pattern: same DI approach as lib/rbac/__tests__/guard.test.ts.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/actions/items.ts (for backend-builder):
//
//   export type ActionCreateResult =
//     | { ok: true; data: { id: string } }
//     | { ok: false; error: string }
//     | { ok: false; fieldErrors: Record<string, string> };
//
//   export type ActionResult =
//     | { ok: true }
//     | { ok: false; error: string }
//     | { ok: false; fieldErrors: Record<string, string> };
//
//   export type ActionSimpleResult =
//     | { ok: true }
//     | { ok: false; error: string };
//
//   // Creates an item. Requires items.manage. Calls parseItemInput for validation.
//   export async function createItem(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     input: unknown,
//   ): Promise<ActionCreateResult>;
//
//   // Updates an item. Requires items.manage.
//   // Stale-edit guard on submittedUpdatedAt vs DB row's updated_at.
//   // Barcode-change guard: if barcode differs from current value and
//   // deps.getBarcodeCheckData returns hasRelatedLots/WrrItems/Transactions=true,
//   // returns { ok: false, error: '...' } (barcode immutability per design.md §6).
//   export async function updateItem(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     id: string,
//     input: unknown,
//     submittedUpdatedAt: string,
//     deps?: {
//       getBarcodeCheckData?: (
//         db: DbLike,
//         itemId: string,
//       ) => Promise<{
//         hasRelatedLots: boolean;
//         hasRelatedWrrItems: boolean;
//         hasRelatedInventoryTransactions: boolean;
//       }>;
//     },
//   ): Promise<ActionResult>;
//
//   // Deactivates an item (sets is_active = false). Requires items.manage.
//   // Warn-not-block: succeeds even when itemHasOperationalRecords returns true.
//   export async function deactivateItem(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     id: string,
//     deps?: {
//       itemHasOperationalRecords?: (db: DbLike, itemId: string) => Promise<boolean>;
//     },
//   ): Promise<ActionSimpleResult>;
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { createItem, deactivateItem, updateItem } from "../items";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";

// ---------------------------------------------------------------------------
// Resolver mock helpers (same pattern as lib/rbac/__tests__/guard.test.ts)
// ---------------------------------------------------------------------------

function makeResolver(
  resolution: AuthorizationResolution,
): RequestAuthorizationResolver {
  return {
    getContext: vi.fn(async () => resolution),
  };
}

const authorizedContext: AuthorizationContext = {
  userId: "user-admin-1",
  profileStatus: "active",
  activeRoleKeys: ["administrator"],
  grants: [{ resource: "items", action: "manage", scopeKind: "global" }],
  partyScopes: [],
};

const authorizedResolver = () =>
  makeResolver({ kind: "authorized", context: authorizedContext });
const unauthenticatedResolver = () => makeResolver({ kind: "unauthenticated" });
const forbiddenResolver = () =>
  makeResolver({ kind: "forbidden", reason: "missing_profile" });

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeInsertChain(insertedId: string): any {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: insertedId }]),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeUpdateChain(): any {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "item-1", is_active: false }]),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSelectChain(rows: unknown[]): any {
  const resolved = Promise.resolve(rows);
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  return chain;
}

function activeOrganizationRow() {
  return { id: "party-uuid-1", isActive: true };
}

function makeSelectSequence(...rowSets: unknown[][]) {
  return vi.fn().mockImplementation(() => makeSelectChain(rowSets.shift() ?? []));
}

// Minimal valid item input (no dimensions — uses direct volumeCbm).
const validItemInput = {
  code: "ITEM-001",
  name: "Acme Widget",
  barcode: "1234567890",
  uom: "piece",
  currency: "USD",
  spq: 1,
  volumeCbm: "0.0010",
  minReorderLevel: 0,
  isActive: true,
  defaultSupplierPartyId: "party-uuid-1",
};

// ---------------------------------------------------------------------------
// createItem
// ---------------------------------------------------------------------------

describe("createItem — authorization (R6.1, design.md §4: items.manage required)", () => {
  it("returns { ok: false, error } when the resolver is unauthenticated", async () => {
    const result = await createItem(unauthenticatedResolver(), validItemInput);
    expect(result.ok).toBe(false);
  });

  it("returns { ok: false, error } when the resolver lacks items.manage", async () => {
    const result = await createItem(forbiddenResolver(), validItemInput);
    expect(result.ok).toBe(false);
  });
});

describe("createItem — validation (R4.1-R4.4, design.md §6)", () => {
  it("requires an organization for a new item", async () => {
    const result = await createItem(
      authorizedResolver(),
      { ...validItemInput, defaultSupplierPartyId: "" },
    );
    expect(result).toMatchObject({ ok: false, fieldErrors: { defaultSupplierPartyId: expect.any(String) } });
  });

  it("rejects an organization that does not exist", async () => {
    const db = {
      select: makeSelectSequence([]),
      insert: vi.fn().mockReturnValue(makeInsertChain("item-new-1")),
    };
    const { deps } = mockRlsDeps(db);

    const result = await createItem(authorizedResolver(), validItemInput, deps);

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { defaultSupplierPartyId: expect.stringMatching(/no longer exists/i) },
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects an inactive organization", async () => {
    const db = {
      select: makeSelectSequence([{ id: "party-uuid-1", isActive: false }]),
      insert: vi.fn().mockReturnValue(makeInsertChain("item-new-1")),
    };
    const { deps } = mockRlsDeps(db);

    const result = await createItem(authorizedResolver(), validItemInput, deps);

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { defaultSupplierPartyId: expect.stringMatching(/inactive/i) },
    });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("returns { ok: false, fieldErrors: { code: '...' } } when item code is missing (parseItemInput fails)", async () => {
    const db = {
      insert: vi.fn().mockReturnValue(makeInsertChain("item-new-1")),
    };
    const { deps } = mockRlsDeps(db);

    const result = await createItem(
      authorizedResolver(),
      { ...validItemInput, code: undefined },
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("code");
    }
  });

  it("returns { ok: false, fieldErrors: { barcode: '...' } } when barcode is missing (R4.2)", async () => {
    const db = {
      insert: vi.fn().mockReturnValue(makeInsertChain("item-new-1")),
    };
    const { deps } = mockRlsDeps(db);

    const result = await createItem(
      authorizedResolver(),
      { ...validItemInput, barcode: undefined },
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("barcode");
    }
  });

  it("returns { ok: false, fieldErrors: { spqMeter: '...' } } when uom='roll' but spqMeter is absent (R4.3, design.md §6 Packaging and dimensional validation)", async () => {
    const db = {
      insert: vi.fn().mockReturnValue(makeInsertChain("item-new-1")),
    };
    const { deps } = mockRlsDeps(db);

    const result = await createItem(
      authorizedResolver(),
      { ...validItemInput, uom: "roll", spqMeter: undefined },
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("spqMeter");
    }
  });

  it("returns { ok: false, fieldErrors: { volumeCbm: '...' } } when no dimensions and volumeCbm is absent (R4.3, design.md §6: NOT NULL)", async () => {
    const db = {
      insert: vi.fn().mockReturnValue(makeInsertChain("item-new-1")),
    };
    const { deps } = mockRlsDeps(db);

    const result = await createItem(
      authorizedResolver(),
      { ...validItemInput, volumeCbm: undefined },
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("volumeCbm");
    }
  });
});

describe("createItem — success (R4.1, design.md §6)", () => {
  it("returns { ok: true, data: { id: string } } on a valid authorized request", async () => {
    const db = {
      select: makeSelectSequence([activeOrganizationRow()]),
      insert: vi.fn().mockReturnValue(makeInsertChain("item-new-uuid")),
    };
    const { deps } = mockRlsDeps(db);

    const result = await createItem(authorizedResolver(), validItemInput, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result).toHaveProperty("data");
      expect(
        typeof (result as { ok: true; data: { id: string } }).data.id,
      ).toBe("string");
    }
  });

  it("returns recoverable feedback with a support reference when the transaction fails", async () => {
    const db = {
      select: makeSelectSequence([activeOrganizationRow()]),
      insert: vi.fn(() => {
        throw new Error("database unavailable");
      }),
    };
    const { deps } = mockRlsDeps(db);

    const result = await createItem(authorizedResolver(), validItemInput, deps);

    expect(result).toMatchObject({ ok: false });
    if (!result.ok && "error" in result) {
      expect(result.error).toMatch(/reference/i);
      expect(result.error).toMatch(/try again/i);
    }
  });
});

// ---------------------------------------------------------------------------
// updateItem
// ---------------------------------------------------------------------------

describe("updateItem — authorization (R6.1, design.md §4: items.manage required)", () => {
  it("returns forbidden when unauthenticated", async () => {
    const result = await updateItem(
      unauthenticatedResolver(),
      "item-1",
      validItemInput,
      "2024-01-01T12:00:00.000Z",
    );
    expect(result.ok).toBe(false);
  });

  it("returns forbidden when lacking items.manage", async () => {
    const result = await updateItem(
      forbiddenResolver(),
      "item-1",
      validItemInput,
      "2024-01-01T12:00:00.000Z",
    );
    expect(result.ok).toBe(false);
  });
});

describe("updateItem — stale-edit conflict (R2.4 pattern, design.md §6)", () => {
  it("returns { ok: false, error: 'Conflict' } when submittedUpdatedAt does not match the DB row's updated_at", async () => {
    const dbRow = {
      id: "item-1",
      barcode: "1234567890",
      updated_at: new Date("2024-06-01T12:00:00.000Z"),
    };
    const db = {
      select: makeSelectSequence([activeOrganizationRow()], [dbRow]),
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };
    const { deps } = mockRlsDeps(db);

    const result = await updateItem(
      authorizedResolver(),
      "item-1",
      validItemInput,
      "2024-01-01T12:00:00.000Z", // stale
      undefined,
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "error" in result) {
      expect(result.error).toMatch(/conflict/i);
    }
  });

  it("returns recoverable feedback when an update transaction throws", async () => {
    const db = {
      select: makeSelectSequence(
        [activeOrganizationRow()],
        [{ id: "item-1", barcode: "1234567890", updated_at: new Date("2024-06-01T12:00:00.000Z") }],
      ),
      update: vi.fn(() => {
        throw new Error("database unavailable");
      }),
    };
    const { deps } = mockRlsDeps(db);

    const result = await updateItem(
      authorizedResolver(),
      "item-1",
      validItemInput,
      "2024-06-01T12:00:00.000Z",
      undefined,
      deps,
    );

    expect(result).toMatchObject({ ok: false });
    if (!result.ok && "error" in result) {
      expect(result.error).toMatch(/reference/i);
      expect(result.error).toMatch(/try again/i);
    }
  });
});

describe("updateItem — barcode immutability (R4.10, design.md §6 Barcode immutability)", () => {
  it("returns { ok: false, error: '...' } when barcode is changed and hasRelatedLots=true", async () => {
    const currentUpdatedAt = "2024-06-01T12:00:00.000Z";
    const dbRow = {
      id: "item-1",
      barcode: "OLD-BARCODE",
      updated_at: new Date(currentUpdatedAt),
    };
    const db = {
      select: makeSelectSequence([activeOrganizationRow()], [dbRow]),
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };
    const { deps } = mockRlsDeps(db);

    const result = await updateItem(
      authorizedResolver(),
      "item-1",
      { ...validItemInput, barcode: "NEW-BARCODE" }, // barcode changed
      currentUpdatedAt,
      {
        getBarcodeCheckData: vi.fn().mockResolvedValue({
          hasRelatedLots: true,
          hasRelatedWrrItems: false,
          hasRelatedInventoryTransactions: false,
        }),
      },
      deps,
    );

    // design.md §6 Barcode immutability: "The server must reject a barcode
    // update on any item that has a related lots, wrr_items, or
    // inventory_transactions row."
    expect(result.ok).toBe(false);
    if (!result.ok && "error" in result) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns { ok: false, error: '...' } when barcode is changed and hasRelatedWrrItems=true", async () => {
    const currentUpdatedAt = "2024-06-01T12:00:00.000Z";
    const dbRow = {
      id: "item-1",
      barcode: "OLD-BARCODE",
      updated_at: new Date(currentUpdatedAt),
    };
    const db = {
      select: makeSelectSequence([activeOrganizationRow()], [dbRow]),
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };
    const { deps } = mockRlsDeps(db);

    const result = await updateItem(
      authorizedResolver(),
      "item-1",
      { ...validItemInput, barcode: "NEW-BARCODE" },
      currentUpdatedAt,
      {
        getBarcodeCheckData: vi.fn().mockResolvedValue({
          hasRelatedLots: false,
          hasRelatedWrrItems: true,
          hasRelatedInventoryTransactions: false,
        }),
      },
      deps,
    );

    expect(result.ok).toBe(false);
  });

  it("allows barcode change when the item has no related lots, WRR items, or transactions (R4.2)", async () => {
    const currentUpdatedAt = "2024-06-01T12:00:00.000Z";
    const dbRow = {
      id: "item-1",
      barcode: "OLD-BARCODE",
      updated_at: new Date(currentUpdatedAt),
    };
    const db = {
      select: makeSelectSequence([activeOrganizationRow()], [dbRow]),
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };
    const { deps } = mockRlsDeps(db);

    const result = await updateItem(
      authorizedResolver(),
      "item-1",
      { ...validItemInput, barcode: "NEW-BARCODE" },
      currentUpdatedAt,
      {
        getBarcodeCheckData: vi.fn().mockResolvedValue({
          hasRelatedLots: false,
          hasRelatedWrrItems: false,
          hasRelatedInventoryTransactions: false,
        }),
      },
      deps,
    );

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deactivateItem
// ---------------------------------------------------------------------------

describe("deactivateItem — authorization (R6.1, design.md §4: items.manage required)", () => {
  it("returns forbidden when unauthenticated", async () => {
    const result = await deactivateItem(unauthenticatedResolver(), "item-1");
    expect(result.ok).toBe(false);
  });

  it("returns forbidden when lacking items.manage", async () => {
    const result = await deactivateItem(forbiddenResolver(), "item-1");
    expect(result.ok).toBe(false);
  });
});

describe("deactivateItem — warn-not-block (R4.9, design.md §6 Item deactivation impact)", () => {
  it("returns { ok: true } even when itemHasOperationalRecords returns true (warn-not-block per design.md §6)", async () => {
    // design.md §6 Item deactivation impact:
    // "Existing committed lots, open wrr_items lines on in-progress WRR
    // documents, and already-allocated inventory_commitment_lines are NOT
    // automatically cancelled when an item is deactivated."
    // The deactivation action itself is not blocked.
    const db = {
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };
    const { deps } = mockRlsDeps(db);

    const result = await deactivateItem(
      authorizedResolver(),
      "item-1",
      {
        itemHasOperationalRecords: vi.fn().mockResolvedValue(true),
      },
      deps,
    );

    expect(result.ok).toBe(true);
  });

  it("returns { ok: true } when itemHasOperationalRecords returns false (clean deactivation)", async () => {
    const db = {
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };
    const { deps } = mockRlsDeps(db);

    const result = await deactivateItem(
      authorizedResolver(),
      "item-1",
      {
        itemHasOperationalRecords: vi.fn().mockResolvedValue(false),
      },
      deps,
    );

    expect(result.ok).toBe(true);
  });
});
