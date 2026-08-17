// RED-step unit tests for bulkGenerateLocations, added to lib/actions/locations.ts
// (does not exist yet).
//
// Traceability:
//   specs/00-steering/per page specs.md §8 — bulk location generator
//   specs/00-steering/revision-log.md (2026-08-17) — "Track B Milestone 2
//     scope calls" entry
//   specs/06-party-and-item-enrollment/design.md §4 (Command boundary),
//     §6a (Location model and workflows) — same locations.manage gate and
//     RLS-transaction pattern as createLocation/updateLocation
//   lib/enrollment/location-schema.ts — parseBulkLocationGeneratorInput,
//     expandBulkLocationCandidates (already implemented, tested separately in
//     lib/enrollment/__tests__/bulk-location-schema.test.ts)
//
// Mocking pattern: identical to lib/actions/__tests__/locations.test.ts —
// mockRlsDeps + hand-built select/insert chain mocks, not real Postgres.
//
// ---------------------------------------------------------------------------
// Expected module contract added to lib/actions/locations.ts:
//
//   export type ActionBulkGenerateLocationsResult =
//     | {
//         ok: true;
//         data: {
//           created: { id: string; label: string }[];
//           skippedDuplicates: string[];
//         };
//       }
//     | { ok: false; error: string }
//     | { ok: false; fieldErrors: Record<string, string> };
//
//   // Requires locations.manage. Parses input via
//   // parseBulkLocationGeneratorInput, expands via
//   // expandBulkLocationCandidates, checks existing labels in one query,
//   // inserts only the non-duplicate candidates, and reports which labels
//   // were skipped as already-existing (duplicate/error reporting — never a
//   // silent partial success).
//   export async function bulkGenerateLocations(
//     resolver: RequestAuthorizationResolver,
//     input: unknown,
//     rlsDeps?: RlsTransactionDeps,
//   ): Promise<ActionBulkGenerateLocationsResult>;
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { bulkGenerateLocations } from "../locations";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";

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
  grants: [{ resource: "locations", action: "manage", scopeKind: "global" }],
  partyScopes: [],
};

const supervisorContext: AuthorizationContext = {
  userId: "user-supervisor-1",
  profileStatus: "active",
  activeRoleKeys: ["supervisor"],
  grants: [{ resource: "locations", action: "read", scopeKind: "global" }],
  partyScopes: [],
};

const authorizedResolver = () =>
  makeResolver({ kind: "authorized", context: authorizedContext });
const supervisorResolver = () =>
  makeResolver({ kind: "authorized", context: supervisorContext });
const unauthenticatedResolver = () => makeResolver({ kind: "unauthenticated" });

const validBulkInput = {
  zone: "ZONE-A",
  locationType: "storage",
  maxCbmCapacity: "10.0000",
  racks: "A,B",
  levelStart: "1",
  levelEnd: "1",
  positionStart: "1",
  positionEnd: "2",
}; // expands to 4 candidates: A1-01, A1-02, B1-01, B1-02

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSelectChain(rows: unknown[]): any {
  const resolved = Promise.resolve(rows);
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeInsertChain(rows: { id: string; label: string }[]): any {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

describe("bulkGenerateLocations — authorization (locations.manage — Administrator only)", () => {
  it("returns { ok: false } when unauthenticated", async () => {
    const result = await bulkGenerateLocations(
      unauthenticatedResolver(),
      validBulkInput,
    );
    expect(result.ok).toBe(false);
  });

  it("returns { ok: false } when the resolver lacks locations.manage", async () => {
    const result = await bulkGenerateLocations(
      supervisorResolver(),
      validBulkInput,
    );
    expect(result.ok).toBe(false);
  });
});

describe("bulkGenerateLocations — validation", () => {
  it("returns fieldErrors for an invalid range without touching the database", async () => {
    const db = { select: vi.fn(), insert: vi.fn() };
    const { deps } = mockRlsDeps(db);

    const result = await bulkGenerateLocations(
      authorizedResolver(),
      { ...validBulkInput, levelStart: "9", levelEnd: "1" },
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors.levelEnd).toBeDefined();
    }
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("bulkGenerateLocations — duplicate/error reporting", () => {
  it("inserts only non-duplicate candidates and reports skipped duplicates", async () => {
    // A1-01 already exists; the other 3 (A1-02, B1-01, B1-02) do not.
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([{ label: "A1-01" }])),
      insert: vi.fn().mockReturnValue(
        makeInsertChain([
          { id: "loc-2", label: "A1-02" },
          { id: "loc-3", label: "B1-01" },
          { id: "loc-4", label: "B1-02" },
        ]),
      ),
    };
    const { deps } = mockRlsDeps(db);

    const result = await bulkGenerateLocations(
      authorizedResolver(),
      validBulkInput,
      deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.created).toHaveLength(3);
      expect(result.data.skippedDuplicates).toEqual(["A1-01"]);
    }
    // Never inserts the already-existing label.
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("reports all as skipped and does not call insert when every candidate already exists", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValue(
          makeSelectChain([
            { label: "A1-01" },
            { label: "A1-02" },
            { label: "B1-01" },
            { label: "B1-02" },
          ]),
        ),
      insert: vi.fn(),
    };
    const { deps } = mockRlsDeps(db);

    const result = await bulkGenerateLocations(
      authorizedResolver(),
      validBulkInput,
      deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.created).toHaveLength(0);
      expect(result.data.skippedDuplicates).toHaveLength(4);
    }
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates every candidate when none collide with existing labels", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])),
      insert: vi.fn().mockReturnValue(
        makeInsertChain([
          { id: "loc-1", label: "A1-01" },
          { id: "loc-2", label: "A1-02" },
          { id: "loc-3", label: "B1-01" },
          { id: "loc-4", label: "B1-02" },
        ]),
      ),
    };
    const { deps } = mockRlsDeps(db);

    const result = await bulkGenerateLocations(
      authorizedResolver(),
      validBulkInput,
      deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.created).toHaveLength(4);
      expect(result.data.skippedDuplicates).toHaveLength(0);
    }
  });
});
