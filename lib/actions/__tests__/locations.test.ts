// RED-step unit tests for lib/actions/locations.ts (does not exist yet).
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R3 (Location enrollment),
//     R6.1, R6.7
//   specs/06-party-and-item-enrollment/design.md §4 (Command boundary),
//     §6a (Location model and workflows)
//   specs/06-party-and-item-enrollment/tasks.md Testing Matrix §Unit tests:
//     "Location label generation (Rack+Level-Position); location_type enum
//     validation; max_cbm_capacity positivity."
//     Task 4a: "Enforce server-side label uniqueness re-validation on both
//     create and edit."
//
// Acceptance criteria covered (requirements.md §5):
//   "An authorized administrator can create, search, edit, and deactivate a
//    locations record with an auto-generated, unique Rack+Level-Position label
//    and a validated max_cbm_capacity; a supervisor can view but not
//    create/edit; warehouse staff can view but not create/edit; destructive
//    deletion is blocked when lot_location_balances/inventory_transactions
//    reference the location."
//
// Capability used for all location mutations (design.md §4, R6.7, confirmed
// against specs/02-rbac-roles §3.2 catalog — Administrator only):
// "locations.manage"
//
// Mocking pattern: same DI approach as lib/rbac/__tests__/guard.test.ts.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/actions/locations.ts (for backend-builder):
//
//   export type ActionCreateLocationResult =
//     | { ok: true; data: { id: string; label: string } }
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
//   // Creates a location. Requires locations.manage.
//   // Server computes label from rack/level/position; never accepts a
//   // client-supplied label. Validates label uniqueness before insert.
//   // Returns { ok: true, data: { id, label } } on success so the caller can
//   // display the confirmed server-generated label.
//   export async function createLocation(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     input: unknown,
//   ): Promise<ActionCreateLocationResult>;
//
//   // Updates a location. Requires locations.manage.
//   // Stale-edit guard on submittedUpdatedAt.
//   // Note: locations has no updated_at column in the approved 01 schema;
//   // stale-edit protection uses created_at or a supplied version token
//   // depending on the implementation design decision.
//   // Recomputes and re-validates label uniqueness when rack/level/position change.
//   export async function updateLocation(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     id: string,
//     input: unknown,
//     submittedUpdatedAt: string,
//   ): Promise<ActionResult>;
//
//   // Deactivates a location (sets is_active = false). Requires locations.manage.
//   // Warn-not-block: succeeds even when locationHasOperationalRecords returns true.
//   export async function deactivateLocation(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     id: string,
//     deps?: {
//       locationHasOperationalRecords?: (
//         db: DbLike,
//         locationId: string,
//       ) => Promise<boolean>;
//     },
//   ): Promise<ActionSimpleResult>;
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { createLocation, deactivateLocation, updateLocation } from "../locations";

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
  grants: [{ resource: "locations", action: "manage", scopeKind: "global" }],
  partyScopes: [],
};

// Supervisor holds locations.read but NOT locations.manage (R6.7, design.md §4, §8).
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
const forbiddenResolver = () =>
  makeResolver({ kind: "forbidden", reason: "missing_profile" });

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeInsertChain(insertedId: string, insertedLabel: string): any {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi
      .fn()
      .mockResolvedValue([{ id: insertedId, label: insertedLabel }]),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeUpdateChain(): any {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi
      .fn()
      .mockResolvedValue([{ id: "loc-1", is_active: false }]),
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

// Minimal valid location input.
const validLocationInput = {
  zone: "A",
  rack: "A",
  level: "1",
  position: "01",
  locationType: "storage",
  maxCbmCapacity: "10.0000",
  isActive: true,
};

// ---------------------------------------------------------------------------
// createLocation
// ---------------------------------------------------------------------------

describe("createLocation — authorization (R6.7, design.md §4/§8: locations.manage — Administrator only)", () => {
  it("returns { ok: false, error } when unauthenticated", async () => {
    const result = await createLocation(
      unauthenticatedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      validLocationInput,
    );
    expect(result.ok).toBe(false);
  });

  it("returns { ok: false, error } when the resolver lacks locations.manage (e.g. supervisor with only locations.read)", async () => {
    // Supervisor holds locations.read, not locations.manage — must not be able
    // to create (R6.7, design.md §4, requirements.md §3 Actors).
    const result = await createLocation(
      supervisorResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      validLocationInput,
    );
    expect(result.ok).toBe(false);
  });

  it("returns { ok: false, error } when the resolver is explicitly forbidden", async () => {
    const result = await createLocation(
      forbiddenResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      validLocationInput,
    );
    expect(result.ok).toBe(false);
  });
});

describe("createLocation — validation (R3.1-R3.5, design.md §6a Create)", () => {
  it("returns { ok: false, fieldErrors: { zone: '...' } } when zone is missing", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])), // no label collision
      insert: vi.fn().mockReturnValue(makeInsertChain("loc-1", "A1-01")),
    };

    const result = await createLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { ...validLocationInput, zone: undefined },
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("zone");
    }
  });

  it("returns { ok: false, fieldErrors: { locationType: '...' } } when locationType is not in the approved enum (R3.4)", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])),
      insert: vi.fn().mockReturnValue(makeInsertChain("loc-1", "A1-01")),
    };

    const result = await createLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { ...validLocationInput, locationType: "loading_dock" }, // not in approved enum
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("locationType");
    }
  });

  it("returns { ok: false, fieldErrors: { maxCbmCapacity: '...' } } when maxCbmCapacity is zero (R3.5: must be positive)", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])),
      insert: vi.fn().mockReturnValue(makeInsertChain("loc-1", "A1-01")),
    };

    const result = await createLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { ...validLocationInput, maxCbmCapacity: "0" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("maxCbmCapacity");
    }
  });

  it("returns { ok: false, fieldErrors: { maxCbmCapacity: '...' } } when maxCbmCapacity is negative", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])),
      insert: vi.fn().mockReturnValue(makeInsertChain("loc-1", "A1-01")),
    };

    const result = await createLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { ...validLocationInput, maxCbmCapacity: "-5.0" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("maxCbmCapacity");
    }
  });
});

describe("createLocation — label uniqueness collision (R3.3, design.md §6a Create step 4)", () => {
  it("returns { ok: false, fieldErrors: { label: '...' } } when the server-computed label already exists in the DB (R3.3)", async () => {
    // DB indicates label 'A1-01' is already taken
    const existingLocationWithSameLabel = {
      id: "loc-existing",
      label: "A1-01",
    };
    const db = {
      // select returns the collision row
      select: vi
        .fn()
        .mockReturnValue(makeSelectChain([existingLocationWithSameLabel])),
      insert: vi.fn().mockReturnValue(makeInsertChain("loc-new", "A1-01")),
    };

    const result = await createLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      validLocationInput, // rack=A, level=1, position=01 → label A1-01
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("label");
    }
  });
});

describe("createLocation — success (R3.1-R3.3, design.md §6a Create)", () => {
  it("returns { ok: true, data: { id: string, label: string } } on a valid, unique authorized request", async () => {
    const db = {
      // select returns no collision (label is unique)
      select: vi.fn().mockReturnValue(makeSelectChain([])),
      insert: vi.fn().mockReturnValue(makeInsertChain("loc-new-uuid", "A1-01")),
    };

    const result = await createLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      validLocationInput,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const typedResult = result as { ok: true; data: { id: string; label: string } };
      expect(typeof typedResult.data.id).toBe("string");
      expect(typeof typedResult.data.label).toBe("string");
    }
  });

  it("returns the server-computed label in data.label — never a client-supplied value (R3.2, design.md §6a Create step 3)", async () => {
    const serverComputedLabel = "B2-03"; // matches rack=B, level=2, position=03
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])),
      insert: vi
        .fn()
        .mockReturnValue(makeInsertChain("loc-new-uuid", serverComputedLabel)),
    };

    const result = await createLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      {
        ...validLocationInput,
        rack: "B",
        level: "2",
        position: "03",
        // Deliberately inject a fake client-supplied label that differs from
        // the server-computed one — the action must ignore it.
        label: "FORGED-LABEL",
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const typedResult = result as { ok: true; data: { id: string; label: string } };
      // Must be the server-computed value, not the client-supplied "FORGED-LABEL"
      expect(typedResult.data.label).not.toBe("FORGED-LABEL");
      expect(typedResult.data.label).toBe(serverComputedLabel);
    }
  });
});

// ---------------------------------------------------------------------------
// updateLocation
// ---------------------------------------------------------------------------

describe("updateLocation — authorization (R6.7, design.md §4: locations.manage required)", () => {
  it("returns forbidden when unauthenticated", async () => {
    const result = await updateLocation(
      unauthenticatedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      "loc-1",
      validLocationInput,
      "2024-06-01T00:00:00.000Z",
    );
    expect(result.ok).toBe(false);
  });

  it("returns forbidden when supervisor (locations.read only, not locations.manage — R6.7)", async () => {
    const result = await updateLocation(
      supervisorResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      "loc-1",
      validLocationInput,
      "2024-06-01T00:00:00.000Z",
    );
    expect(result.ok).toBe(false);
  });
});

describe("updateLocation — stale-edit conflict (design.md §6a Edit/deactivate: same stale-edit protection as parties/items)", () => {
  it("returns { ok: false, error: 'Conflict' } when submittedUpdatedAt does not match the current row timestamp", async () => {
    // The DB has a location created after the client's token
    const dbRow = {
      id: "loc-1",
      label: "A1-01",
      created_at: new Date("2024-06-01T12:00:00.000Z"),
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([dbRow])),
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };

    const result = await updateLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "loc-1",
      validLocationInput,
      "2024-01-01T00:00:00.000Z", // stale
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "error" in result) {
      expect(result.error).toMatch(/conflict/i);
    }
  });
});

describe("updateLocation — label uniqueness re-check on rack/level/position change (R3.3, design.md §6a Edit/deactivate)", () => {
  it("returns { ok: false, fieldErrors: { label: '...' } } when updated rack/level/position resolves to a label already used by another location", async () => {
    const currentTimestamp = "2024-06-01T12:00:00.000Z";
    // First select: the location being edited
    const currentRow = {
      id: "loc-1",
      label: "A1-01",
      rack: "A",
      level: "1",
      position: "01",
      created_at: new Date(currentTimestamp),
    };
    // Second select (label uniqueness check): another location already uses B2-03
    const collidingRow = { id: "loc-other", label: "B2-03" };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectChain([currentRow]))
        .mockReturnValueOnce(makeSelectChain([collidingRow])),
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };

    const result = await updateLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "loc-1",
      { ...validLocationInput, rack: "B", level: "2", position: "03" }, // new label B2-03
      currentTimestamp,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("label");
    }
  });

  it("returns { ok: true } when the updated rack/level/position resolves to a unique label", async () => {
    const currentTimestamp = "2024-06-01T12:00:00.000Z";
    const currentRow = {
      id: "loc-1",
      label: "A1-01",
      rack: "A",
      level: "1",
      position: "01",
      created_at: new Date(currentTimestamp),
    };

    const db = {
      // First select: current row; second select: no collision
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectChain([currentRow]))
        .mockReturnValueOnce(makeSelectChain([])), // label B2-05 is free
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };

    const result = await updateLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "loc-1",
      { ...validLocationInput, rack: "B", level: "2", position: "05" },
      currentTimestamp,
    );

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deactivateLocation
// ---------------------------------------------------------------------------

describe("deactivateLocation — authorization (R6.7, design.md §4: locations.manage required)", () => {
  it("returns forbidden when unauthenticated", async () => {
    const result = await deactivateLocation(
      unauthenticatedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      "loc-1",
    );
    expect(result.ok).toBe(false);
  });

  it("returns forbidden when supervisor (locations.read only — R6.7)", async () => {
    const result = await deactivateLocation(
      supervisorResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      "loc-1",
    );
    expect(result.ok).toBe(false);
  });
});

describe("deactivateLocation — warn-not-block (R3.7, design.md §6a Edit/deactivate)", () => {
  it("returns { ok: true } even when locationHasOperationalRecords returns true (warn-not-block per design.md §6a)", async () => {
    // design.md §6a Edit/deactivate:
    // "Before committing, the server evaluates impact on existing
    // lot_location_balances rows occupying the location... this feature does
    // not recompute or reassign those balances — it only gates new use via
    // is_active."
    const db = {
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };

    const result = await deactivateLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "loc-1",
      {
        locationHasOperationalRecords: vi.fn().mockResolvedValue(true),
      },
    );

    expect(result.ok).toBe(true);
  });

  it("returns { ok: true } when locationHasOperationalRecords returns false (clean deactivation)", async () => {
    const db = {
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };

    const result = await deactivateLocation(
      authorizedResolver(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "loc-1",
      {
        locationHasOperationalRecords: vi.fn().mockResolvedValue(false),
      },
    );

    expect(result.ok).toBe(true);
  });
});
