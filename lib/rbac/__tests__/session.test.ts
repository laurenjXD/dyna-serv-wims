// RED-step unit tests for lib/rbac/session.ts (does not exist yet).
//
// Traceability: specs/02-rbac-roles/design.md §6.1 (server request flow),
// §6.2 (shared guard contract — context shape only; requirePermission()
// itself is cycle 2.3, out of scope here), §6.3 (session propagation — the
// resolver's job ends at producing a trusted AuthorizationContext; the
// Drizzle/RLS transaction wrapper that consumes it is a separate concern),
// §6.4 (request-local memoization), and §3.3 (effective authorization:
// additive union of role grants, no explicit denies, fail-closed).
//
// Backing acceptance criteria (specs/02-rbac-roles/requirements.md §7):
// AC-1 (no session -> denied), AC-2 (inactive user -> no access),
// AC-3 (additive union of active role capabilities, no ungranted access),
// AC-5 (client-supplied identifiers never expand access), AC-7 (party scoped
// to one flow cannot reach another flow; null flow_type never implies
// Supplies), AC-8 (revocation/deactivation takes effect on the NEXT
// protected request, not retroactively and not "next login").
// Also implements specs/02-rbac-roles/tasks.md "Testing requirements > Unit
// tests (Vitest)" bullet: "Test session-to-authorization-context resolution
// with forged, stale, missing, and malformed claims."
//
// Cycle 2.2 scope only (per specs/00-steering/implementation-kickoff.md):
// the session resolver + typed authorization context. `requirePermission()`
// (cycle 2.3) and real-Postgres RLS behavior (cycle 2.4) are deliberately
// out of scope — this file mocks the DB/session boundary entirely.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/rbac/session.ts (for backend-builder):
//
//   export type FlowType = "vmi" | "trading" | "supplies";
//   export type ScopeKind = "global" | "assigned_party";
//   export type ProfileStatus = "invited" | "active" | "inactive";
//
//   export interface Grant {
//     resource: string;
//     action: string;
//     scopeKind: ScopeKind;
//   }
//
//   export interface PartyScope {
//     partyId: string;
//     flowType: FlowType | null;
//   }
//
//   export interface AuthSession {
//     userId: string;
//   }
//
//   // What a single server-validated lookup against Postgres returns for one
//   // user (in the real implementation, one SQL round trip / joined query —
//   // this is exactly the boundary being memoized per §6.4).
//   export interface RawAuthorizationRecord {
//     profileStatus: ProfileStatus;
//     activeRoleKeys: string[];
//     grants: Grant[]; // MAY contain duplicates across roles; resolver dedupes.
//     partyScopes: PartyScope[];
//   }
//
//   export interface AuthorizationContext {
//     userId: string;
//     profileStatus: "active";
//     activeRoleKeys: string[];
//     grants: Grant[]; // deduplicated effective additive union
//     partyScopes: PartyScope[];
//     correlationId?: string;
//   }
//
//   export type AuthorizationResolution =
//     | { kind: "unauthenticated" }
//     | { kind: "forbidden"; reason: "inactive_profile" | "missing_profile" | "resolution_error" }
//     | { kind: "authorized"; context: AuthorizationContext };
//
//   // Both deps are the ONLY channel into the resolver. There is no
//   // parameter for client-supplied identity/role/scope data anywhere in
//   // this contract — getAuthenticatedSession() must itself validate the
//   // Supabase access token server-side (§6.1 step B), and
//   // loadAuthorizationRecord() must always be called with the userId that
//   // came back from getAuthenticatedSession(), never a caller-supplied id.
//   export interface SessionResolverDeps {
//     getAuthenticatedSession(): Promise<AuthSession | null>;
//     loadAuthorizationRecord(userId: string): Promise<RawAuthorizationRecord | null>;
//   }
//
//   export interface RequestAuthorizationResolver {
//     // No arguments — a caller cannot inject a client-supplied context.
//     // Memoized: the underlying deps are invoked at most once per resolver
//     // instance (i.e. once per request), regardless of how many times
//     // getContext() is awaited within that instance's lifetime (§6.4).
//     getContext(): Promise<AuthorizationResolution>;
//   }
//
//   // One resolver instance = one request's worth of memoization. A NEW
//   // request MUST construct a NEW resolver (a fresh call to this factory),
//   // which re-invokes deps and therefore always reflects the current
//   // database state (§1, §6.4, §8.4 "next protected request").
//   export function createRequestAuthorizationResolver(
//     deps: SessionResolverDeps,
//   ): RequestAuthorizationResolver;
//
//   // Pure helper mirroring the DB-side has_party_scope() semantics
//   // (design.md §3.2/§7.2) at the application layer: a null flowType scope
//   // matches every requested flow EXCEPT 'supplies' — never a bare
//   // null-means-wildcard check.
//   export function partyScopeMatchesFlow(
//     scope: Pick<PartyScope, "flowType">,
//     requestedFlowType: FlowType,
//   ): boolean;
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationResolution,
  RawAuthorizationRecord,
  SessionResolverDeps,
} from "../session";

function makeDeps(overrides: Partial<SessionResolverDeps> = {}): SessionResolverDeps {
  return {
    getAuthenticatedSession: vi.fn(async () => ({ userId: "user-1" })),
    loadAuthorizationRecord: vi.fn(
      async (): Promise<RawAuthorizationRecord> => ({
        profileStatus: "active",
        activeRoleKeys: ["warehouse_staff"],
        grants: [{ resource: "inventory", action: "read", scopeKind: "global" }],
        partyScopes: [],
      }),
    ),
    ...overrides,
  };
}

describe("lib/rbac/session — resolving a valid session (AC-3, AC-7, design.md §6.1/§3.2)", () => {
  it("resolves identity, active roles, effective grants, and party scope including flow_type narrowing", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");

    const deps = makeDeps({
      getAuthenticatedSession: vi.fn(async () => ({ userId: "party-user-9" })),
      loadAuthorizationRecord: vi.fn(async (): Promise<RawAuthorizationRecord> => ({
        profileStatus: "active",
        activeRoleKeys: ["party_user"],
        grants: [{ resource: "pick_list", action: "read", scopeKind: "assigned_party" }],
        partyScopes: [{ partyId: "party-A", flowType: "vmi" }],
      })),
    });

    const resolver = createRequestAuthorizationResolver(deps);
    const resolution = await resolver.getContext();

    expect(resolution.kind).toBe("authorized");
    if (resolution.kind !== "authorized") throw new Error("expected authorized");
    expect(resolution.context.userId).toBe("party-user-9");
    expect(resolution.context.activeRoleKeys).toEqual(["party_user"]);
    expect(resolution.context.grants).toEqual([
      { resource: "pick_list", action: "read", scopeKind: "assigned_party" },
    ]);
    expect(resolution.context.partyScopes).toEqual([
      { partyId: "party-A", flowType: "vmi" },
    ]);
  });
});

describe("lib/rbac/session — forged/tampered claims are never trusted (AC-5, design.md §6.1)", () => {
  it("always re-derives the authorization data from the server-validated session id, never a client-supplied one", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");

    const loadAuthorizationRecord = vi.fn(async (userId: string) => ({
      profileStatus: "active" as const,
      activeRoleKeys: userId === "real-user" ? ["warehouse_staff"] : [],
      grants:
        userId === "real-user"
          ? [{ resource: "inventory", action: "read", scopeKind: "global" as const }]
          : [],
      partyScopes: [],
    }));

    const deps: SessionResolverDeps = {
      getAuthenticatedSession: vi.fn(async () => ({ userId: "real-user" })),
      loadAuthorizationRecord,
    };

    const resolver = createRequestAuthorizationResolver(deps);
    const resolution = await resolver.getContext();

    // The resolver's public getContext() takes no arguments at all — there
    // is no parameter through which a forged role/party/user id could be
    // injected. The only proof available at this layer is that the DB
    // lookup was always keyed by the server-validated session id.
    expect(loadAuthorizationRecord).toHaveBeenCalledWith("real-user");
    expect(loadAuthorizationRecord).not.toHaveBeenCalledWith("attacker-supplied-id");
    if (resolution.kind !== "authorized") throw new Error("expected authorized");
    expect(resolution.context.userId).toBe("real-user");
    expect(resolution.context.activeRoleKeys).toEqual(["warehouse_staff"]);
  });

  it("getContext() has no parameter through which a caller can pass an override context", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");
    const deps = makeDeps();
    const resolver = createRequestAuthorizationResolver(deps);

    expect(resolver.getContext.length).toBe(0);

    // Calling it with extra (forged) arguments must have zero effect — the
    // implementation cannot accept them because the parameter doesn't exist.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolution = await (resolver.getContext as any)({
      role: "administrator",
      partyId: "not-mine",
    });
    expect(resolution.kind).toBe("authorized");
  });
});

describe("lib/rbac/session — stale claims resolve fresh on the NEXT request, never mid-request (AC-8, design.md §1/§6.4)", () => {
  it("a role revoked between two requests is reflected on the second request's resolver, not the first", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");

    // Simulates one shared "database" whose state changes between requests.
    let currentGrants: RawAuthorizationRecord["grants"] = [
      { resource: "fifo_override", action: "approve", scopeKind: "global" },
    ];

    const deps: SessionResolverDeps = {
      getAuthenticatedSession: vi.fn(async () => ({ userId: "supervisor-1" })),
      loadAuthorizationRecord: vi.fn(async (): Promise<RawAuthorizationRecord> => ({
        profileStatus: "active",
        activeRoleKeys: ["supervisor"],
        grants: currentGrants,
        partyScopes: [],
      })),
    };

    // "Request 1": role still granted.
    const requestOneResolver = createRequestAuthorizationResolver(deps);
    const requestOneResolution = await requestOneResolver.getContext();
    if (requestOneResolution.kind !== "authorized") throw new Error("expected authorized");
    expect(requestOneResolution.context.grants).toEqual([
      { resource: "fifo_override", action: "approve", scopeKind: "global" },
    ]);

    // The capability is revoked in the database in between requests.
    currentGrants = [];

    // Re-querying the SAME (request 1) resolver instance must NOT
    // retroactively change mid-request — this proves memoization is
    // scoped to the resolver instance, not bypassed by calling again.
    const requestOneResolvedAgain = await requestOneResolver.getContext();
    if (requestOneResolvedAgain.kind !== "authorized") throw new Error("expected authorized");
    expect(requestOneResolvedAgain.context.grants).toEqual([
      { resource: "fifo_override", action: "approve", scopeKind: "global" },
    ]);

    // "Request 2": a NEW resolver instance (the real system constructs one
    // per protected request) must reflect the current, revoked state.
    const requestTwoResolver = createRequestAuthorizationResolver(deps);
    const requestTwoResolution = await requestTwoResolver.getContext();
    if (requestTwoResolution.kind !== "authorized") throw new Error("expected authorized");
    expect(requestTwoResolution.context.grants).toEqual([]);
  });
});

describe("lib/rbac/session — missing session (AC-1, design.md §6.1 flow B->C)", () => {
  it("returns a safe unauthenticated result and never queries the database", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");

    const loadAuthorizationRecord = vi.fn();
    const deps: SessionResolverDeps = {
      getAuthenticatedSession: vi.fn(async () => null),
      loadAuthorizationRecord,
    };

    const resolver = createRequestAuthorizationResolver(deps);
    const resolution = await resolver.getContext();

    expect(resolution).toEqual({ kind: "unauthenticated" });
    expect(loadAuthorizationRecord).not.toHaveBeenCalled();
  });
});

describe("lib/rbac/session — malformed/corrupt session and record data are handled safely (design.md §6, fail-closed NFR)", () => {
  it("treats a thrown session-validation error as unauthenticated, not an unhandled exception", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");
    const deps: SessionResolverDeps = {
      getAuthenticatedSession: vi.fn(async () => {
        throw new Error("token signature invalid");
      }),
      loadAuthorizationRecord: vi.fn(),
    };

    const resolver = createRequestAuthorizationResolver(deps);
    await expect(resolver.getContext()).resolves.toEqual({ kind: "unauthenticated" });
  });

  it("treats a session missing a usable userId as unauthenticated rather than crashing", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");
    const deps: SessionResolverDeps = {
      // Malformed: no userId at all.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getAuthenticatedSession: vi.fn(async () => ({}) as any),
      loadAuthorizationRecord: vi.fn(),
    };

    const resolver = createRequestAuthorizationResolver(deps);
    const resolution = await resolver.getContext();
    expect(resolution.kind).toBe("unauthenticated");
  });

  it("treats a thrown database-lookup error as a safe forbidden denial, not a leaked exception", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");
    const deps: SessionResolverDeps = {
      getAuthenticatedSession: vi.fn(async () => ({ userId: "user-1" })),
      loadAuthorizationRecord: vi.fn(async () => {
        throw new Error("connection terminated unexpectedly: password=supersecret");
      }),
    };

    const resolver = createRequestAuthorizationResolver(deps);
    const resolution = await resolver.getContext();

    expect(resolution.kind).toBe("forbidden");
    if (resolution.kind !== "forbidden") throw new Error("expected forbidden");
    expect(resolution.reason).toBe("resolution_error");
    // The denial must not leak the raw internal error text.
    expect(JSON.stringify(resolution)).not.toContain("supersecret");
  });

  it("treats a missing profile row as forbidden with reason missing_profile", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");
    const deps: SessionResolverDeps = {
      getAuthenticatedSession: vi.fn(async () => ({ userId: "ghost-user" })),
      loadAuthorizationRecord: vi.fn(async () => null),
    };

    const resolver = createRequestAuthorizationResolver(deps);
    const resolution = await resolver.getContext();
    expect(resolution).toEqual({ kind: "forbidden", reason: "missing_profile" });
  });

  it.each(["invited", "inactive"] as const)(
    "treats a profile with status '%s' as forbidden with reason inactive_profile (AC-2)",
    async (status) => {
      const { createRequestAuthorizationResolver } = await import("../session");
      const deps: SessionResolverDeps = {
        getAuthenticatedSession: vi.fn(async () => ({ userId: "user-1" })),
        loadAuthorizationRecord: vi.fn(async (): Promise<RawAuthorizationRecord> => ({
          profileStatus: status,
          activeRoleKeys: ["warehouse_staff"],
          grants: [{ resource: "inventory", action: "read", scopeKind: "global" }],
          partyScopes: [],
        })),
      };

      const resolver = createRequestAuthorizationResolver(deps);
      const resolution: AuthorizationResolution = await resolver.getContext();
      expect(resolution).toEqual({ kind: "forbidden", reason: "inactive_profile" });
    },
  );
});

describe("lib/rbac/session — multiple active roles combine additively (AC-3, design.md §1/§3.3)", () => {
  it("unions grants across roles and de-duplicates identical (resource, action, scope_kind) grants", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");

    const deps: SessionResolverDeps = {
      getAuthenticatedSession: vi.fn(async () => ({ userId: "dual-role-user" })),
      // Simulates a raw joined query result where both `warehouse_staff`
      // and `supervisor` grant `inventory.read`/global, plus supervisor's
      // own extra `inspection.resolve`/global grant.
      loadAuthorizationRecord: vi.fn(async (): Promise<RawAuthorizationRecord> => ({
        profileStatus: "active",
        activeRoleKeys: ["warehouse_staff", "supervisor"],
        grants: [
          { resource: "inventory", action: "read", scopeKind: "global" },
          { resource: "receiving", action: "scan", scopeKind: "global" },
          { resource: "inventory", action: "read", scopeKind: "global" }, // duplicate via 2nd role
          { resource: "inspection", action: "resolve", scopeKind: "global" },
        ],
        partyScopes: [],
      })),
    };

    const resolver = createRequestAuthorizationResolver(deps);
    const resolution = await resolver.getContext();
    if (resolution.kind !== "authorized") throw new Error("expected authorized");

    expect(resolution.context.activeRoleKeys).toEqual(
      expect.arrayContaining(["warehouse_staff", "supervisor"]),
    );

    // Additive: every distinct grant from every active role is present.
    expect(resolution.context.grants).toEqual(
      expect.arrayContaining([
        { resource: "inventory", action: "read", scopeKind: "global" },
        { resource: "receiving", action: "scan", scopeKind: "global" },
        { resource: "inspection", action: "resolve", scopeKind: "global" },
      ]),
    );
    // De-duplicated: the repeated grant appears exactly once.
    const inventoryReadGrants = resolution.context.grants.filter(
      (g) => g.resource === "inventory" && g.action === "read" && g.scopeKind === "global",
    );
    expect(inventoryReadGrants).toHaveLength(1);
  });
});

describe("lib/rbac/session — assigned_party scope with null flow_type excludes Supplies (AC-7, design.md §3.2)", () => {
  it("partyScopeMatchesFlow: a null flow_type scope matches vmi and trading but never supplies", async () => {
    const { partyScopeMatchesFlow } = await import("../session");

    expect(partyScopeMatchesFlow({ flowType: null }, "vmi")).toBe(true);
    expect(partyScopeMatchesFlow({ flowType: null }, "trading")).toBe(true);
    expect(partyScopeMatchesFlow({ flowType: null }, "supplies")).toBe(false);
  });

  it("partyScopeMatchesFlow: a narrowed flow_type scope matches only that exact flow", async () => {
    const { partyScopeMatchesFlow } = await import("../session");

    expect(partyScopeMatchesFlow({ flowType: "vmi" }, "vmi")).toBe(true);
    expect(partyScopeMatchesFlow({ flowType: "vmi" }, "trading")).toBe(false);
    expect(partyScopeMatchesFlow({ flowType: "trading" }, "vmi")).toBe(false);
  });

  it("a party-scoped user with flow_type = NULL cannot see Supplies-flow data end to end via the resolved context", async () => {
    const { createRequestAuthorizationResolver, partyScopeMatchesFlow } = await import(
      "../session"
    );

    const deps: SessionResolverDeps = {
      getAuthenticatedSession: vi.fn(async () => ({ userId: "party-user-1" })),
      loadAuthorizationRecord: vi.fn(async (): Promise<RawAuthorizationRecord> => ({
        profileStatus: "active",
        activeRoleKeys: ["party_user"],
        grants: [{ resource: "documents", action: "read", scopeKind: "assigned_party" }],
        // Null flow_type: "all externally applicable flows" per §3.2 — must
        // never be treated as covering 'supplies'.
        partyScopes: [{ partyId: "party-A", flowType: null }],
      })),
    };

    const resolver = createRequestAuthorizationResolver(deps);
    const resolution = await resolver.getContext();
    if (resolution.kind !== "authorized") throw new Error("expected authorized");

    const [scope] = resolution.context.partyScopes;
    expect(partyScopeMatchesFlow(scope, "vmi")).toBe(true);
    expect(partyScopeMatchesFlow(scope, "trading")).toBe(true);
    expect(partyScopeMatchesFlow(scope, "supplies")).toBe(false);
  });
});

describe("lib/rbac/session — request-local memoization (design.md §6.4, tasks.md 'no cross-request cache')", () => {
  // NOTE (judgment call, cycle 2.2): there is no existing precedent in this
  // repo for a DB-call-count memoization assertion — lib/db/schema/__tests__
  // only introspects Drizzle table *definitions* (no live/mocked queries at
  // all), a different layer entirely. The pattern adopted here is: inject a
  // `vi.fn()`-wrapped dependency object into the module's own factory
  // function (`createRequestAuthorizationResolver`), call the returned
  // `getContext()` multiple times, and assert the mock's `.mock.calls.length`
  // to prove the underlying "database" is hit at most once per resolver
  // instance. This requires no real Postgres, no fake-indexeddb, and no new
  // test infrastructure — it reuses Vitest's built-in `vi.fn()` call-count
  // tracking directly against the dependency-injection seam the module
  // contract above already requires for testability. Documented here since
  // backend-builder should keep this DI seam intact rather than reaching for
  // a module-level singleton/global cache that would defeat this test.
  it("invokes each dependency at most once per resolver instance, even when getContext() is awaited many times", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");
    const deps = makeDeps();

    const resolver = createRequestAuthorizationResolver(deps);
    const [first, second, third] = await Promise.all([
      resolver.getContext(),
      resolver.getContext(),
      resolver.getContext(),
    ]);

    expect(deps.getAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(deps.loadAuthorizationRecord).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });

  it("a second resolver instance (the next request) re-invokes dependencies independently of the first", async () => {
    const { createRequestAuthorizationResolver } = await import("../session");
    const deps = makeDeps();

    const resolverA = createRequestAuthorizationResolver(deps);
    await resolverA.getContext();
    await resolverA.getContext();

    const resolverB = createRequestAuthorizationResolver(deps);
    await resolverB.getContext();

    expect(deps.getAuthenticatedSession).toHaveBeenCalledTimes(2);
    expect(deps.loadAuthorizationRecord).toHaveBeenCalledTimes(2);
  });
});
