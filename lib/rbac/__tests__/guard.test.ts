// RED-step unit tests for lib/rbac/guard.ts (does not exist yet).
//
// Traceability: specs/02-rbac-roles/design.md §6.2 ("Shared guard contract" —
// requirePermission(resource, action, optional target scope) is the single
// central guard every protected Server Action/route handler/server component/
// background job must call; downstream code must not branch on
// `role === "supervisor"`), §3.2 (capability model: resource + action +
// scope_kind; assigned_party scope narrowed by flow_type via
// partyScopeMatchesFlow's null-excludes-supplies semantics), and §3.3
// (effective authorization order of checks: active profile -> grant present
// -> scope satisfied -> row/business rules -> RLS).
//
// Backing acceptance criteria (specs/02-rbac-roles/requirements.md §7):
// AC-1 (no session -> denied), AC-2 (inactive user -> no access; delegated to
// the session resolver, re-asserted here as forbidden), AC-3 (additive union
// -> guard only succeeds for an actually-granted resource/action/scope,
// never an ungranted one), AC-4 (feature code authorizes a capability
// without checking a system-role name -- proven structurally: the guard's
// only decision inputs are resolver + capability string + optional scope,
// never a role name), AC-5 (changing a client-supplied identifier never
// expands access -- proven structurally: no caller-supplied
// role/scope-override parameter exists on the guard signature), AC-7 (a
// party scoped to one flow cannot reach another flow for the same party).
// Also implements specs/02-rbac-roles/tasks.md decision 3A ("Central
// requirePermission(capability, scope) helper") and the "Unit tests
// (Vitest)" testing-requirements bullet: "Test authorization helper outcomes
// for allowed, unauthenticated, forbidden, and not-found cases."
// Also traces to specs/05-ui-shell-and-navigation/requirements.md R6.7 ("A
// not-found response SHALL not reveal whether a protected resource exists
// when the caller lacks authorization; a forbidden response MAY be used
// only where the route/resource existence is safe to disclose") for the
// not-found-vs-forbidden disclosure test.
//
// Cycle 2.3 scope only (per specs/00-steering/implementation-kickoff.md):
// this file tests ONLY the new lib/rbac/guard.ts module. It does not modify
// lib/rbac/session.ts or its test file, does not exercise real Postgres/RLS
// (cycle 2.4), and does not exercise Playwright/E2E flows (cycle 2.5). It
// reuses the exact resolver/DI mocking pattern already established in
// lib/rbac/__tests__/session.test.ts (inject a resolver whose getContext()
// is a vi.fn()-backed stub returning a fixed AuthorizationResolution) rather
// than inventing a new mocking approach for this layer.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/rbac/guard.ts (for backend-builder):
//
// Design choices made by this RED step (documented here since design.md
// §6.2 states the guard's contract only "conceptually" as
// `requirePermission(resource, action, optional target scope)` without
// fixing an exact TypeScript signature):
//
//   1. `capability` is a SINGLE validated string in `"resource.action"`
//      format (e.g. "fifo_override.approve", "reporting.financial_read" --
//      matching the dot-joined form design.md's own prose already uses for
//      catalog entries), not two loose string parameters. This is a
//      deliberate hardening choice: a single opaque, validated token is
//      harder to construct dynamically/incorrectly than two independently
//      suppliable strings, and malformed input has exactly one place to be
//      rejected (see requirePermission's validation branch below).
//   2. The guard takes a `RequestAuthorizationResolver` (from
//      lib/rbac/session.ts) as its first argument -- never a raw
//      role/boolean/context object supplied ad hoc by the caller. This is
//      what makes AC-4/AC-5 structurally true: there is no parameter shape
//      through which a caller could pass "treat this session as admin."
//   3. The guard returns a typed `PermissionResult`, mirroring
//      `AuthorizationResolution`'s discriminated union shape but adding a
//      `reason` on the `forbidden` variant so callers (and this test file)
//      can distinguish *why* access was denied without stringly-typed
//      comparisons.
//   4. `toRouteDisclosureOutcome(result, { existenceSafeToDisclose })` is a
//      SEPARATE pure helper -- deliberately not baked into
//      requirePermission itself -- that maps a `PermissionResult` to the
//      four route-facing outcomes named in
//      specs/05-ui-shell-and-navigation/requirements.md R6.6/R6.7
//      ("unauthenticated", "forbidden", "not_found", "authorized"). The
//      guard itself never decides forbidden-vs-not-found on its own --
//      that decision is inherently per-route (whether the ROUTE's existence
//      is safe to disclose), so the guard exposes both distinct primitives
//      and leaves the choice to the caller via this helper's boolean flag,
//      per R6.7's "MAY be used only where ... safe to disclose" language.
//
//   export type PermissionDenialReason =
//     | "unauthenticated_upstream"   // resolver itself returned unauthenticated
//     | "inactive_profile"
//     | "missing_profile"
//     | "resolution_error"
//     | "missing_grant"              // no matching (resource, action, scopeKind) grant
//     | "missing_scope"               // grant is assigned_party but no target scope was supplied
//     | "scope_mismatch"              // target scope supplied but does not match any party scope/flow
//     | "invalid_capability"          // malformed "resource.action" string
//
//   export type PermissionResult =
//     | { kind: "unauthenticated" }
//     | { kind: "forbidden"; reason: PermissionDenialReason }
//     | { kind: "authorized"; context: AuthorizationContext }
//
//   export interface RequirePermissionScope {
//     partyId: string;
//     flowType: FlowType;
//   }
//
//   export async function requirePermission(
//     resolver: RequestAuthorizationResolver,
//     capability: string,
//     scope?: RequirePermissionScope,
//   ): Promise<PermissionResult>;
//
//   export type RouteDisclosureOutcome =
//     | "authorized"
//     | "unauthenticated"
//     | "forbidden"
//     | "not_found";
//
//   export function toRouteDisclosureOutcome(
//     result: PermissionResult,
//     options: { existenceSafeToDisclose: boolean },
//   ): RouteDisclosureOutcome;
// ---------------------------------------------------------------------------
//
// Resolution on item 8 (self-approval prohibition, design.md §3.4):
// NOT tested here. §3.4 is explicit that the self-approval rule is "enforced
// by the approval-command server logic (owned by 09-approval-queue)" and is
// "not modeled as a separate RLS policy" or, by the same reasoning, as a
// generic RBAC-guard concern -- it requires comparing the invoking user
// against a specific approval record's `requester_user_id`, a piece of
// business-record state this guard's inputs (a resolver + a capability
// string + an optional {partyId, flowType} scope) have no way to see and
// are not supposed to see. Forcing that comparison into requirePermission
// would require bolting an ad hoc "and also pass me the record's requester"
// parameter onto an otherwise resource/action/scope-shaped contract, which
// design.md itself rejects ("not modeled as a separate RLS policy... It is
// enforced by the approval-command server logic"). The one thing asserted
// below is the negative: requirePermission's decision inputs and
// AuthorizationContext contain no `requester_user_id`/target-record concept
// at all, so 09-approval-queue's command layer necessarily performs that
// comparison itself with its own data, not by asking this guard to do it.

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "../session";

function makeResolver(
  resolution: AuthorizationResolution,
): RequestAuthorizationResolver {
  return {
    getContext: vi.fn(async () => resolution),
  };
}

const baseContext: AuthorizationContext = {
  userId: "user-1",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [{ resource: "inventory", action: "read", scopeKind: "global" }],
  partyScopes: [],
};

describe("lib/rbac/guard — allowed (AC-3, AC-4, design.md §6.2)", () => {
  it("resolves to authorized with the trusted context when the exact (resource, action, scopeKind) grant is present", async () => {
    const { requirePermission } = await import("../guard");
    const resolver = makeResolver({ kind: "authorized", context: baseContext });

    const result = await requirePermission(resolver, "inventory.read");

    expect(result.kind).toBe("authorized");
    if (result.kind !== "authorized") throw new Error("expected authorized");
    expect(result.context).toEqual(baseContext);
  });

  it("does not authorize a capability that was never granted, even for an otherwise-authorized active user (AC-3)", async () => {
    const { requirePermission } = await import("../guard");
    const resolver = makeResolver({ kind: "authorized", context: baseContext });

    const result = await requirePermission(resolver, "inventory.manage");

    expect(result.kind).toBe("forbidden");
    if (result.kind !== "forbidden") throw new Error("expected forbidden");
    expect(result.reason).toBe("missing_grant");
  });
});

describe("lib/rbac/guard — unauthenticated is never conflated with forbidden (AC-1)", () => {
  it("returns a distinct unauthenticated outcome when the resolver itself reports unauthenticated", async () => {
    const { requirePermission } = await import("../guard");
    const resolver = makeResolver({ kind: "unauthenticated" });

    const result = await requirePermission(resolver, "inventory.read");

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(result.kind).not.toBe("forbidden");
  });
});

describe("lib/rbac/guard — forbidden is never conflated with unauthenticated (AC-2)", () => {
  it("returns a distinct forbidden outcome, never 'unauthenticated', when the resolver reports an authenticated-but-denied profile state", async () => {
    const { requirePermission } = await import("../guard");
    const resolver = makeResolver({ kind: "forbidden", reason: "inactive_profile" });

    const result = await requirePermission(resolver, "inventory.read");

    expect(result.kind).toBe("forbidden");
    if (result.kind !== "forbidden") throw new Error("expected forbidden");
    expect(result.reason).toBe("inactive_profile");
    expect(result.kind).not.toBe("unauthenticated");
  });

  it("returns forbidden with reason missing_grant for an active user missing the specific required grant, distinct from missing_profile/inactive_profile", async () => {
    const { requirePermission } = await import("../guard");
    const resolver = makeResolver({ kind: "authorized", context: baseContext });

    const result = await requirePermission(resolver, "reporting.financial_read");

    expect(result.kind).toBe("forbidden");
    if (result.kind !== "forbidden") throw new Error("expected forbidden");
    expect(result.reason).toBe("missing_grant");
  });
});

describe("lib/rbac/guard — not-found vs. forbidden disclosure is the CALLER's decision, not hardcoded (requirements.md R6.7)", () => {
  it("maps a forbidden PermissionResult to 'not_found' when the caller says resource existence is NOT safe to disclose (the default-safe choice)", async () => {
    const { requirePermission, toRouteDisclosureOutcome } = await import("../guard");
    const resolver = makeResolver({ kind: "authorized", context: baseContext });

    const result = await requirePermission(resolver, "inventory.manage");
    const outcome = toRouteDisclosureOutcome(result, { existenceSafeToDisclose: false });

    expect(outcome).toBe("not_found");
  });

  it("maps the SAME forbidden PermissionResult to 'forbidden' when the caller says resource existence IS safe to disclose", async () => {
    const { requirePermission, toRouteDisclosureOutcome } = await import("../guard");
    const resolver = makeResolver({ kind: "authorized", context: baseContext });

    const result = await requirePermission(resolver, "inventory.manage");
    const outcomeSafe = toRouteDisclosureOutcome(result, { existenceSafeToDisclose: true });
    const outcomeUnsafe = toRouteDisclosureOutcome(result, { existenceSafeToDisclose: false });

    expect(outcomeSafe).toBe("forbidden");
    expect(outcomeUnsafe).toBe("not_found");
    // The guard itself did not decide -- the exact same underlying
    // PermissionResult produces both outcomes depending purely on the
    // caller-supplied disclosure flag, proving the guard does not hardcode
    // one over the other.
    expect(outcomeSafe).not.toBe(outcomeUnsafe);
  });

  it("never remaps 'unauthenticated' to 'not_found' or 'forbidden' regardless of the disclosure flag", async () => {
    const { requirePermission, toRouteDisclosureOutcome } = await import("../guard");
    const resolver = makeResolver({ kind: "unauthenticated" });

    const result = await requirePermission(resolver, "inventory.read");

    expect(toRouteDisclosureOutcome(result, { existenceSafeToDisclose: true })).toBe(
      "unauthenticated",
    );
    expect(toRouteDisclosureOutcome(result, { existenceSafeToDisclose: false })).toBe(
      "unauthenticated",
    );
  });

  it("maps an authorized PermissionResult to 'authorized' regardless of the disclosure flag", async () => {
    const { requirePermission, toRouteDisclosureOutcome } = await import("../guard");
    const resolver = makeResolver({ kind: "authorized", context: baseContext });

    const result = await requirePermission(resolver, "inventory.read");

    expect(toRouteDisclosureOutcome(result, { existenceSafeToDisclose: true })).toBe(
      "authorized",
    );
    expect(toRouteDisclosureOutcome(result, { existenceSafeToDisclose: false })).toBe(
      "authorized",
    );
  });
});

describe("lib/rbac/guard — assigned_party scope matching delegates to session.ts's flow semantics (AC-7, design.md §3.2)", () => {
  it("authorizes an assigned_party grant when the supplied target scope matches an active party scope's exact flow_type", async () => {
    const { requirePermission } = await import("../guard");
    const context: AuthorizationContext = {
      ...baseContext,
      grants: [{ resource: "pick_list", action: "read", scopeKind: "assigned_party" }],
      partyScopes: [{ partyId: "party-A", flowType: "vmi" }],
    };
    const resolver = makeResolver({ kind: "authorized", context });

    const result = await requirePermission(resolver, "pick_list.read", {
      partyId: "party-A",
      flowType: "vmi",
    });

    expect(result.kind).toBe("authorized");
  });

  it("forbids the SAME grant for a different flow_type on the same party (a vmi-only scope cannot reach trading)", async () => {
    const { requirePermission } = await import("../guard");
    const context: AuthorizationContext = {
      ...baseContext,
      grants: [{ resource: "pick_list", action: "read", scopeKind: "assigned_party" }],
      partyScopes: [{ partyId: "party-A", flowType: "vmi" }],
    };
    const resolver = makeResolver({ kind: "authorized", context });

    const result = await requirePermission(resolver, "pick_list.read", {
      partyId: "party-A",
      flowType: "trading",
    });

    expect(result.kind).toBe("forbidden");
    if (result.kind !== "forbidden") throw new Error("expected forbidden");
    expect(result.reason).toBe("scope_mismatch");
  });

  it("forbids the SAME grant for a different party entirely (party-A scope cannot satisfy a party-B request)", async () => {
    const { requirePermission } = await import("../guard");
    const context: AuthorizationContext = {
      ...baseContext,
      grants: [{ resource: "pick_list", action: "read", scopeKind: "assigned_party" }],
      partyScopes: [{ partyId: "party-A", flowType: "vmi" }],
    };
    const resolver = makeResolver({ kind: "authorized", context });

    const result = await requirePermission(resolver, "pick_list.read", {
      partyId: "party-B",
      flowType: "vmi",
    });

    expect(result.kind).toBe("forbidden");
    if (result.kind !== "forbidden") throw new Error("expected forbidden");
    expect(result.reason).toBe("scope_mismatch");
  });

  it("reuses session.ts's null-flow_type-excludes-supplies semantics rather than reimplementing a bare wildcard: a null-flow_type party scope satisfies vmi/trading but never supplies", async () => {
    const { requirePermission } = await import("../guard");
    const contextForFlow = (grantResource: string) =>
      ({
        ...baseContext,
        grants: [{ resource: grantResource, action: "read", scopeKind: "assigned_party" as const }],
        partyScopes: [{ partyId: "party-A", flowType: null }],
      }) satisfies AuthorizationContext;

    const vmiResult = await requirePermission(
      makeResolver({ kind: "authorized", context: contextForFlow("documents") }),
      "documents.read",
      { partyId: "party-A", flowType: "vmi" },
    );
    const tradingResult = await requirePermission(
      makeResolver({ kind: "authorized", context: contextForFlow("documents") }),
      "documents.read",
      { partyId: "party-A", flowType: "trading" },
    );
    const suppliesResult = await requirePermission(
      makeResolver({ kind: "authorized", context: contextForFlow("documents") }),
      "documents.read",
      { partyId: "party-A", flowType: "supplies" },
    );

    expect(vmiResult.kind).toBe("authorized");
    expect(tradingResult.kind).toBe("authorized");
    expect(suppliesResult.kind).toBe("forbidden");
    if (suppliesResult.kind !== "forbidden") throw new Error("expected forbidden");
    expect(suppliesResult.reason).toBe("scope_mismatch");
  });

  it("forbids with reason missing_scope when an assigned_party grant is checked but no target scope argument was supplied at all", async () => {
    const { requirePermission } = await import("../guard");
    const context: AuthorizationContext = {
      ...baseContext,
      grants: [{ resource: "pick_list", action: "read", scopeKind: "assigned_party" }],
      partyScopes: [{ partyId: "party-A", flowType: "vmi" }],
    };
    const resolver = makeResolver({ kind: "authorized", context });

    const result = await requirePermission(resolver, "pick_list.read");

    expect(result.kind).toBe("forbidden");
    if (result.kind !== "forbidden") throw new Error("expected forbidden");
    expect(result.reason).toBe("missing_scope");
  });
});

describe("lib/rbac/guard — capability format validation (resource.action)", () => {
  const resolver = () => makeResolver({ kind: "authorized", context: baseContext });

  it.each([
    "inventoryread",
    "inventory.read.extra",
    "Inventory.Read",
    ".read",
    "inventory.",
    "",
    "inventory..read",
  ])("rejects malformed capability string %j as forbidden/invalid_capability, never authorized and never a thrown exception", async (malformed) => {
    const { requirePermission } = await import("../guard");

    let result;
    let threw = false;
    try {
      result = await requirePermission(resolver(), malformed);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeDefined();
    expect(result!.kind).not.toBe("authorized");
    expect(result!.kind).toBe("forbidden");
    if (result!.kind !== "forbidden") throw new Error("expected forbidden");
    expect(result!.reason).toBe("invalid_capability");
  });

  it("accepts a well-formed lowercase snake_case-per-segment resource.action capability string", async () => {
    const { requirePermission } = await import("../guard");
    const result = await requirePermission(resolver(), "inventory.read");
    expect(result.kind).toBe("authorized");
  });
});

describe("lib/rbac/guard — no client-supplied override of the authorization decision (AC-4, AC-5, design.md §6.1)", () => {
  it("the exported requirePermission function accepts only (resolver, capability, scope) -- no role/boolean override parameter exists in the signature", async () => {
    const { requirePermission } = await import("../guard");

    // Structural proof: the declared arity is exactly resolver + capability
    // (+ optional scope, which counts toward .length only if given without a
    // default -- either way, there is no fourth slot for an override).
    expect(requirePermission.length).toBeLessThanOrEqual(3);
  });

  it("ignores any extra caller-supplied arguments beyond (resolver, capability, scope) -- passing a forged role/boolean has zero effect on the outcome", async () => {
    const { requirePermission } = await import("../guard");
    const resolver = makeResolver({ kind: "authorized", context: baseContext });

    const resultWithoutOverride = await requirePermission(resolver, "inventory.manage");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultWithForgedOverride = await (requirePermission as any)(
      resolver,
      "inventory.manage",
      undefined,
      { role: "administrator", isAdmin: true, bypassRls: true },
    );

    expect(resultWithForgedOverride).toEqual(resultWithoutOverride);
    expect(resultWithForgedOverride.kind).toBe("forbidden");
  });

  it("only ever consults the resolver's getContext() for the authorization decision -- never re-derives grants from a caller-supplied context object", async () => {
    const { requirePermission } = await import("../guard");
    const resolver = makeResolver({ kind: "authorized", context: baseContext });

    await requirePermission(resolver, "inventory.read");

    expect(resolver.getContext).toHaveBeenCalledTimes(1);
    expect(resolver.getContext).toHaveBeenCalledWith();
  });
});

describe("lib/rbac/guard — self-approval prohibition is explicitly OUT OF SCOPE for this guard (design.md §3.4)", () => {
  it("requirePermission's decision inputs (resolver, capability string, {partyId, flowType} scope) and the resolved AuthorizationContext carry no requester_user_id/approval-target concept, so this guard cannot and does not enforce self-approval -- that remains 09-approval-queue's command-layer responsibility per §3.4", async () => {
    const { requirePermission } = await import("../guard");
    const context: AuthorizationContext = {
      ...baseContext,
      activeRoleKeys: ["supervisor"],
      grants: [{ resource: "fifo_override", action: "approve", scopeKind: "global" }],
    };
    const resolver = makeResolver({ kind: "authorized", context });

    // The guard authorizes purely on capability + scope match. It has no
    // parameter for "and this specific approval record's requester_user_id"
    // -- proven structurally by calling it with only the documented
    // parameters and confirming it authorizes based on the grant alone.
    const result = await requirePermission(resolver, "fifo_override.approve");

    expect(result.kind).toBe("authorized");
    if (result.kind !== "authorized") throw new Error("expected authorized");
    expect(result.context).not.toHaveProperty("requesterUserId");
    expect(result.context).not.toHaveProperty("requester_user_id");
    // requirePermission's own arity has no slot for a target-record
    // identifier through which a requester comparison could be threaded.
    expect(requirePermission.length).toBeLessThanOrEqual(3);
  });
});
