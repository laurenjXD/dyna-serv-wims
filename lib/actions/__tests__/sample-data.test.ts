import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { seedSampleData } from "../sample-data";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";

function resolver(
  resolution: AuthorizationResolution,
): RequestAuthorizationResolver {
  return { getContext: vi.fn(async () => resolution) };
}

const administrator = () =>
  resolver({
    kind: "authorized",
    context: {
      userId: "user-admin-1",
      profileStatus: "active",
      activeRoleKeys: ["administrator"],
      grants: [
        { resource: "parties", action: "manage", scopeKind: "global" },
        { resource: "items", action: "manage", scopeKind: "global" },
        { resource: "receiving", action: "confirm", scopeKind: "global" },
      ],
      partyScopes: [],
    },
  });

// A compact thenable Drizzle chain for the deterministic sample-data lookup
// order: organization, role, item, WRR, then its expected line (three times).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selectSequence(rows: unknown[][]): any {
  return vi.fn(() => {
    const result = Promise.resolve(rows.shift() ?? []);
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: result.then.bind(result),
      catch: result.catch.bind(result),
      finally: result.finally.bind(result),
    };
    return chain;
  });
}

describe("seedSampleData", () => {
  it("fails before opening a DB transaction when a required capability is missing", async () => {
    const rlsDeps = mockRlsDeps({});
    const result = await seedSampleData(
      resolver({
        kind: "authorized",
        context: {
          userId: "user-1",
          profileStatus: "active",
          activeRoleKeys: ["supervisor"],
          grants: [
            { resource: "parties", action: "manage", scopeKind: "global" },
          ],
          partyScopes: [],
        },
      }),
      rlsDeps.deps,
    );

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to add sample data.",
    });
    expect(rlsDeps.conn.begin).not.toHaveBeenCalled();
  });

  it("creates three of each and is safe to invoke through the RLS transaction boundary", async () => {
    const returningIds = [
      "org-1",
      "org-2",
      "org-3",
      "item-1",
      "item-2",
      "item-3",
      "wrr-1",
      "wrr-2",
      "wrr-3",
    ];
    const db = {
      select: selectSequence(Array.from({ length: 15 }, () => [])),
      insert: vi.fn(() => {
        const chain = {
          values: vi.fn().mockReturnThis(),
          returning: vi.fn(async () => [{ id: returningIds.shift() }]),
        };
        return chain;
      }),
    };
    const rlsDeps = mockRlsDeps(db);

    const result = await seedSampleData(administrator(), rlsDeps.deps);

    expect(result).toEqual({
      ok: true,
      created: { organizations: 3, items: 3, wrrs: 3 },
    });
  });

  it("repairs the pick-required reference codes on existing sample items without adding rows", async () => {
    const existingRows = [
      [{ id: "org-1" }], [{ id: "role-1" }],
      [{ id: "org-2" }], [{ id: "role-2" }],
      [{ id: "org-3" }], [{ id: "role-3" }],
      [{ id: "item-1" }], [{ id: "item-2" }], [{ id: "item-3" }],
      [{ id: "wrr-1" }], [{ id: "line-1" }],
      [{ id: "wrr-2" }], [{ id: "line-2" }],
      [{ id: "wrr-3" }], [{ id: "line-3" }],
    ];
    const updated: unknown[] = [];
    const db = {
      select: selectSequence(existingRows),
      insert: vi.fn(),
      update: vi.fn(() => ({
        set: vi.fn((values: unknown) => {
          updated.push(values);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    };

    const result = await seedSampleData(administrator(), mockRlsDeps(db).deps);

    expect(result).toEqual({ ok: true, created: { organizations: 0, items: 0, wrrs: 0 } });
    expect(updated).toHaveLength(3);
    expect(updated[0]).toMatchObject({
      dsgcItemNumber: "SAMPLE-DSGC-001",
      supplierItemCode: "SAMPLE-SUPPLIER-001",
    });
  });
});
