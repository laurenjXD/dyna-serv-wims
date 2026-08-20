// RED-step unit tests for lib/actions/parties.ts (does not exist yet).
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R1 (Party enrollment),
//     R2 (Party search and maintenance), R4.b (Contact Party), R6.1, R6.3, R6.8
//   specs/06-party-and-item-enrollment/design.md §4 (Command boundary),
//     §5 (Party model and workflows), §5a (Contact Party email action)
//   specs/06-party-and-item-enrollment/tasks.md Testing Matrix §Unit tests
//
// Acceptance criteria covered (requirements.md §5):
//   "An authorized administrator can create, search, edit, and deactivate a
//    party with business roles without creating application-user access."
//   "Cross-party, unauthorized, stale-edit, and direct-identifier manipulation
//    cases fail safely."
//   "An authorized user holding parties.manage can trigger a Contact Party email."
//
// Capability used for all party mutations (design.md §4, confirmed against
// specs/02-rbac-roles §3.2 catalog): "parties.manage"
//
// Mocking pattern: same dependency-injection approach as lib/rbac/__tests__/guard.test.ts —
// inject a RequestAuthorizationResolver whose getContext() is a vi.fn() stub
// returning a fixed AuthorizationResolution.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/actions/parties.ts (for backend-builder):
//
//   import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
//   import type { ContactPartyEmailPayload } from "@/lib/enrollment/contact-party";
//
//   // Discriminated union returned by all mutating actions.
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
//   // Creates a party. Requires parties.manage.
//   // Calls parsePartyInput for validation, then inserts via db.
//   export async function createParty(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     input: unknown,
//   ): Promise<ActionCreateResult>;
//
//   // Updates a party. Requires parties.manage.
//   // Stale-edit guard: compares submittedUpdatedAt against the current DB row's
//   // updated_at — returns { ok: false, error: "Conflict" } on mismatch.
//   export async function updateParty(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     id: string,
//     input: unknown,
//     submittedUpdatedAt: string,
//   ): Promise<ActionResult>;
//
//   // Deactivates a party (sets is_active = false). Requires parties.manage.
//   // Warn-not-block: deactivation succeeds even when the party has operational
//   // records (open WRRs, items using this party as default supplier, etc.).
//   // deps.partyHasOperationalRecords is injectable for testing.
//   export async function deactivateParty(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     id: string,
//     deps?: {
//       partyHasOperationalRecords?: (
//         db: DbLike,
//         partyId: string,
//       ) => Promise<boolean>;
//     },
//   ): Promise<ActionSimpleResult>;
//
//   // Adds a party_roles record. Requires parties.manage.
//   // Validates role value via validatePartyRoleValue, checks duplicates via
//   // checkDuplicatePartyRole.
//   export async function addPartyRole(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     partyId: string,
//     role: unknown,
//   ): Promise<ActionSimpleResult>;
//
//   // Removes a party_roles record by its row id. Requires parties.manage.
//   export async function removePartyRole(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     partyId: string,
//     roleRowId: string,
//   ): Promise<ActionSimpleResult>;
//
//   // Sends a Contact Party operational email. Requires parties.manage.
//   // Resolves party.email server-side; rejects if null/empty.
//   // sendEmail is injectable so tests can stub the Resend pipeline call.
//   export async function contactParty(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     partyId: string,
//     sendEmail: (payload: ContactPartyEmailPayload) => Promise<void>,
//     message?: string | null,
//   ): Promise<ActionSimpleResult>;
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import {
  addPartyRole,
  contactParty,
  createParty,
  deactivateParty,
  removePartyRole,
  updateParty,
} from "../parties";
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
  grants: [{ resource: "parties", action: "manage", scopeKind: "global" }],
  partyScopes: [],
};

const authorizedResolver = () =>
  makeResolver({ kind: "authorized", context: authorizedContext });

const unauthenticatedResolver = () =>
  makeResolver({ kind: "unauthenticated" });

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
    returning: vi.fn().mockResolvedValue([{ id: "party-1", is_active: false }]),
  };
}

// A select chain that returns specific rows.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSelectChain(rows: unknown[]): any {
  // Thenable chain — await db.select(...).from(...).where(...) resolves to rows
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

// Minimal valid party input for testing happy paths.
const validPartyInput = {
  code: "PARTY-001",
  name: "Acme Supplies Ltd",
  email: "contact@acme.com",
  address1: "123 Main Street",
  address2: "Barangay San Isidro",
  paymentTerms: "Net 30",
  isActive: true,
};

// ---------------------------------------------------------------------------
// createParty
// ---------------------------------------------------------------------------

describe("createParty — authorization (R6.1, design.md §4: parties.manage required)", () => {
  it("returns { ok: false, error: 'Forbidden' } when the resolver is unauthenticated (R6.1)", async () => {
    const result = await createParty(unauthenticatedResolver(), validPartyInput);
    expect(result.ok).toBe(false);
    if (!result.ok && "error" in result) {
      expect(result.error).toMatch(/forbidden|unauthorized|permission/i);
    }
  });

  it("returns { ok: false, error: 'Forbidden' } when the resolver is authenticated but lacks parties.manage (R6.1)", async () => {
    const result = await createParty(forbiddenResolver(), validPartyInput);
    expect(result.ok).toBe(false);
    if (!result.ok && "error" in result) {
      expect(typeof result.error).toBe("string");
    }
  });
});

describe("createParty — validation (R1.1-R1.3, design.md §5 Create)", () => {
  it("returns { ok: false, fieldErrors: { code: '...' } } when code is missing (parsePartyInput fails)", async () => {
    const db = {
      insert: vi.fn().mockReturnValue(makeInsertChain("party-new-1")),
    };

    const result = await createParty(
      authorizedResolver(),
      { name: "Acme Ltd" }, // no code
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("code");
    }
  });

  it("returns { ok: false, fieldErrors: { name: '...' } } when name is missing", async () => {
    const db = {
      insert: vi.fn().mockReturnValue(makeInsertChain("party-new-1")),
    };

    const result = await createParty(
      authorizedResolver(),
      { code: "PARTY-001" }, // no name
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors).toHaveProperty("name");
    }
  });
});

describe("createParty — success (R1.1, design.md §5 Create)", () => {
  it("returns { ok: true, data: { id: string } } on a valid authorized request", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])), // no code collision
      insert: vi.fn().mockReturnValue(makeInsertChain("party-new-uuid")),
    };

    const result = await createParty(
      authorizedResolver(),
      validPartyInput,
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result).toHaveProperty("data");
      expect(typeof (result as { ok: true; data: { id: string } }).data.id).toBe("string");
    }
  });

  it("writes the approved split-address and payment-terms fields", async () => {
    const insertChain = makeInsertChain("party-new-uuid");
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])), // no code collision
      insert: vi.fn().mockReturnValue(insertChain),
    };

    await createParty(authorizedResolver(), validPartyInput, mockRlsDeps(db).deps);

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        address1: "123 Main Street",
        address2: "Barangay San Isidro",
        paymentTerms: "Net 30",
      }),
    );
  });
});

describe("createParty — duplicate code (DB UNIQUE constraint on code; previously an unhandled raw insert error)", () => {
  it("returns { ok: false, fieldErrors: { code: '...' } } and never calls insert when the code already exists", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([{ id: "existing-party" }])),
      insert: vi.fn().mockReturnValue(makeInsertChain("party-new-uuid")),
    };

    const result = await createParty(
      authorizedResolver(),
      validPartyInput,
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors.code).toMatch(/already in use/i);
    }
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateParty
// ---------------------------------------------------------------------------

describe("updateParty — authorization (R6.1, design.md §4: parties.manage required)", () => {
  it("returns forbidden when unauthenticated", async () => {
    const result = await updateParty(
      unauthenticatedResolver(),
      "party-1",
      validPartyInput,
      "2024-01-01T12:00:00.000Z",
    );
    expect(result.ok).toBe(false);
  });

  it("returns forbidden when lacking parties.manage", async () => {
    const result = await updateParty(
      forbiddenResolver(),
      "party-1",
      validPartyInput,
      "2024-01-01T12:00:00.000Z",
    );
    expect(result.ok).toBe(false);
  });
});

describe("updateParty — stale-edit conflict (R2.4, design.md §5 Edit/deactivate)", () => {
  it("returns { ok: false, error: 'Conflict' } when submittedUpdatedAt does not match the DB row's updated_at", async () => {
    // DB row has updated_at = 2024-06-01 (newer than what the client submitted)
    const dbRow = {
      id: "party-1",
      updated_at: new Date("2024-06-01T12:00:00.000Z"),
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([dbRow])),
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };

    const result = await updateParty(
      authorizedResolver(),
      "party-1",
      validPartyInput,
      "2024-01-01T12:00:00.000Z", // stale: older than the DB row
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "error" in result) {
      expect(result.error).toMatch(/conflict/i);
    }
  });

  it("returns { ok: true } when submittedUpdatedAt matches the current DB row's updated_at", async () => {
    const currentUpdatedAt = "2024-06-01T12:00:00.000Z";
    const dbRow = {
      id: "party-1",
      updated_at: new Date(currentUpdatedAt),
    };
    const db = {
      // Two sequential select calls: 1) stale-edit fetch of the current row,
      // 2) duplicate-code check (excludes self via ne(), but this mock
      // doesn't evaluate WHERE clauses — mockReturnValueOnce keeps them
      // distinct so the duplicate check sees "no collision" rather than
      // wrongly matching the current row against itself).
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectChain([dbRow]))
        .mockReturnValueOnce(makeSelectChain([])),
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };

    const result = await updateParty(
      authorizedResolver(),
      "party-1",
      validPartyInput,
      currentUpdatedAt,
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });

  it("returns { ok: false, fieldErrors: { code: '...' } } and never calls update when the new code collides with a DIFFERENT party", async () => {
    const currentUpdatedAt = "2024-06-01T12:00:00.000Z";
    const dbRow = { id: "party-1", updated_at: new Date(currentUpdatedAt) };
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectChain([dbRow])) // stale-edit fetch
        .mockReturnValueOnce(makeSelectChain([{ id: "some-other-party" }])), // collision
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };

    const result = await updateParty(
      authorizedResolver(),
      "party-1",
      validPartyInput,
      currentUpdatedAt,
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors.code).toMatch(/already in use/i);
    }
    expect(db.update).not.toHaveBeenCalled();
  });

});

// ---------------------------------------------------------------------------
// deactivateParty
// ---------------------------------------------------------------------------

describe("deactivateParty — authorization (R6.1, design.md §4: parties.manage required)", () => {
  it("returns forbidden when unauthenticated", async () => {
    const result = await deactivateParty(
      unauthenticatedResolver(),
      "party-1",
    );
    expect(result.ok).toBe(false);
  });
});

describe("deactivateParty — warn-not-block (R1.7, design.md §5 Edit/deactivate: warn but do not block when operational records exist)", () => {
  it("returns { ok: true } even when partyHasOperationalRecords returns true (warn-not-block per design.md §5)", async () => {
    const db = {
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };

    const result = await deactivateParty(
      authorizedResolver(),
      "party-1",
      {
        partyHasOperationalRecords: vi.fn().mockResolvedValue(true),
      },
      mockRlsDeps(db).deps,
    );

    // Design.md §5: "evaluate impact... [but] historical records remain
    // addressable." Deactivation is never blocked by existing references —
    // blocking only applies to new use of the inactive party in downstream
    // workflows, not to the deactivation action itself.
    expect(result.ok).toBe(true);
  });

  it("returns { ok: true } when partyHasOperationalRecords returns false (clean deactivation)", async () => {
    const db = {
      update: vi.fn().mockReturnValue(makeUpdateChain()),
    };

    const result = await deactivateParty(
      authorizedResolver(),
      "party-1",
      {
        partyHasOperationalRecords: vi.fn().mockResolvedValue(false),
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addPartyRole
// ---------------------------------------------------------------------------

describe("addPartyRole — authorization (R6.1, design.md §4: parties.manage required)", () => {
  it("returns forbidden when unauthenticated", async () => {
    const result = await addPartyRole(
      unauthenticatedResolver(),
      "party-1",
      "vendor",
    );
    expect(result.ok).toBe(false);
  });
});

describe("addPartyRole — role validation (R1.4, R1.5, design.md §5 Create step 4)", () => {
  it("returns { ok: false, error: '...' } when validatePartyRoleValue rejects the role (e.g. application-user role 'administrator')", async () => {
    const result = await addPartyRole(
      authorizedResolver(),
      "party-1",
      "administrator", // application-user role, not a business party role
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns { ok: false, error: '...' } for an unrecognized role value", async () => {
    const result = await addPartyRole(
      authorizedResolver(),
      "party-1",
      "unknown_role",
    );
    expect(result.ok).toBe(false);
  });
});

describe("addPartyRole — duplicate prevention (R1.4, design.md §2 party_roles: no DB-level unique constraint — server action must enforce)", () => {
  it("returns { ok: false, error: '...' } when checkDuplicatePartyRole detects the party already has that role", async () => {
    // DB returns existing party_roles that include 'vendor'
    const existingRoles = [{ id: "role-row-1", party_id: "party-1", role: "vendor" }];
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain(existingRoles)),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "role-row-new" }]),
      }),
    };

    const result = await addPartyRole(
      authorizedResolver(),
      "party-1",
      "vendor", // already present
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });

  it("returns { ok: true } when the role is valid and not yet assigned to the party", async () => {
    // DB returns no existing vendor role for this party
    const existingRoles = [
      { id: "role-row-1", party_id: "party-1", role: "supplier" },
    ];
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain(existingRoles)),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "role-row-new" }]),
      }),
    };

    const result = await addPartyRole(
      authorizedResolver(),
      "party-1",
      "vendor", // not yet assigned
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removePartyRole
// ---------------------------------------------------------------------------

describe("removePartyRole — authorization (R1.4, design.md §5)", () => {
  it("returns forbidden when unauthenticated", async () => {
    const result = await removePartyRole(
      unauthenticatedResolver(),
      "party-1",
      "role-row-uuid-1",
    );
    expect(result.ok).toBe(false);
  });

  it("returns forbidden when lacking parties.manage", async () => {
    const result = await removePartyRole(
      forbiddenResolver(),
      "party-1",
      "role-row-uuid-1",
    );
    expect(result.ok).toBe(false);
  });
});

describe("removePartyRole — success (R1.4, design.md §5)", () => {
  it("returns { ok: true } when authorized and the role row exists", async () => {
    const db = {
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const result = await removePartyRole(
      authorizedResolver(),
      "party-1",
      "role-row-uuid-1",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// contactParty
// ---------------------------------------------------------------------------

describe("contactParty — authorization (R6.8, design.md §5a, requirements.md R6.8: parties.manage required)", () => {
  it("returns forbidden when unauthenticated (R6.8)", async () => {
    const sendEmail = vi.fn();
    const result = await contactParty(
      unauthenticatedResolver(),
      "party-1",
      sendEmail,
    );
    expect(result.ok).toBe(false);
    // sendEmail must NOT have been called when unauthorized
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns forbidden when lacking parties.manage (R6.8)", async () => {
    const sendEmail = vi.fn();
    const result = await contactParty(
      forbiddenResolver(),
      "party-1",
      sendEmail,
    );
    expect(result.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("contactParty — null email rejection (R1.9, design.md §5a step 2: reject if parties.email is null/empty)", () => {
  it("returns { ok: false, error: '...' } when the server-resolved party has a null email (R1.9)", async () => {
    const partyWithNoEmail = {
      id: "party-1",
      email: null,
      contact_person: "Jane Doe",
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([partyWithNoEmail])),
    };
    const sendEmail = vi.fn();

    const result = await contactParty(
      authorizedResolver(),
      "party-1",
      sendEmail,
      null,
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
    // sendEmail must NOT be called when party has no email
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns { ok: false, error: '...' } when the server-resolved party has an empty string email", async () => {
    const partyWithBlankEmail = {
      id: "party-1",
      email: "   ", // blank
      contact_person: "Jane Doe",
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([partyWithBlankEmail])),
    };
    const sendEmail = vi.fn();

    const result = await contactParty(
      authorizedResolver(),
      "party-1",
      sendEmail,
      null,
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("contactParty — success (R1.9, design.md §5a)", () => {
  it("returns { ok: true } and invokes sendEmail when authorized and party has a valid email", async () => {
    const partyWithEmail = {
      id: "party-1",
      email: "contact@acme.com",
      contact_person: "Jane Doe",
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([partyWithEmail])),
    };
    const sendEmail = vi.fn().mockResolvedValue(undefined);

    const result = await contactParty(
      authorizedResolver(),
      "party-1",
      sendEmail,
      "Please review the attached inventory report.",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("never passes a client-supplied email address to sendEmail — recipient is always server-resolved (R6.3, design.md §5a step 2)", async () => {
    const partyWithEmail = {
      id: "party-1",
      email: "server-resolved@acme.com",
      contact_person: "Jane Doe",
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([partyWithEmail])),
    };
    const sendEmail = vi.fn().mockResolvedValue(undefined);

    await contactParty(
      authorizedResolver(),
      "party-1",
      sendEmail,
      null,
      mockRlsDeps(db).deps,
    );

    // The payload passed to sendEmail must use the server-resolved email,
    // not any client-supplied value.
    const callPayload = sendEmail.mock.calls[0][0];
    expect(callPayload.recipientEmail).toBe("server-resolved@acme.com");
    // resourceType is always 'party', resourceId is always the party's id
    expect(callPayload.resourceType).toBe("party");
    expect(callPayload.resourceId).toBe("party-1");
  });

  it("contactParty failure from sendEmail does not bubble as a thrown error — fail-open per 04-services design (design.md §5a step 5)", async () => {
    const partyWithEmail = {
      id: "party-1",
      email: "contact@acme.com",
      contact_person: null,
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([partyWithEmail])),
    };
    // Simulate Resend API transient failure
    const sendEmail = vi.fn().mockRejectedValue(new Error("Resend API timeout"));

    // The action must not throw — it must catch the send failure and
    // either return ok:true (fire-and-forget) or ok:false with an error,
    // but MUST NOT propagate an unhandled rejection.
    let threw = false;
    let result;
    try {
      result = await contactParty(
        authorizedResolver(),
        "party-1",
        sendEmail,
        null,
        mockRlsDeps(db).deps,
      );
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeDefined();
  });
});
