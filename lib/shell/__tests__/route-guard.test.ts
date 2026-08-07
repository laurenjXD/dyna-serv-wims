// RED-step unit tests for lib/shell/route-guard.ts (does not exist yet).
//
// Traceability: specs/05-ui-shell-and-navigation/requirements.md R6.6/R6.7
// ("A not-found response SHALL not reveal whether a protected resource
// exists when the caller lacks authorization; a forbidden response MAY be
// used only where the route/resource existence is safe to disclose") and
// design.md §7 ("Navigation omission is not security... Enforce
// route/resource authorization again at the server action, route handler, or
// data boundary").
//
// This module is deliberately thin: per this task's explicit instruction, it
// must call the ALREADY-implemented, already-reviewed
// lib/rbac/guard.ts#toRouteDisclosureOutcome (and #requirePermission) rather
// than reimplementing the forbidden-vs-not-found decision inside the shell.
// Every test below proves DELEGATION (the shell route-guard's output is
// exactly what lib/rbac/guard would independently produce for the same
// inputs, and the real toRouteDisclosureOutcome export is actually invoked)
// rather than testing a parallel decision tree.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/shell/route-guard.ts (for frontend-builder):
//
//   import type { RequestAuthorizationResolver, AuthorizationContext } from "@/lib/rbac/session";
//   import type { RouteDisclosureOutcome } from "@/lib/rbac/guard";
//
//   export interface RouteGuardResult {
//     disclosure: RouteDisclosureOutcome; // "authorized" | "unauthenticated" | "forbidden" | "not_found"
//     context?: AuthorizationContext;     // present only when disclosure === "authorized"
//   }
//
//   export async function evaluateRouteGuard(
//     resolver: RequestAuthorizationResolver,
//     capability: string, // the literal "none" for capability-less routes (e.g. "/", "/sync")
//     options: { existenceSafeToDisclose: boolean },
//   ): Promise<RouteGuardResult>;
//
//   Behavior:
//     - capability === "none": skip the grant check entirely (an
//       AuthorizationContext with ANY active-and-authenticated session
//       satisfies a "none"-gated route); still route the resolver's
//       unauthenticated/forbidden outcomes through
//       toRouteDisclosureOutcome unchanged.
//     - capability !== "none": delegate to lib/rbac/guard's
//       requirePermission(resolver, capability), then map the result through
//       toRouteDisclosureOutcome(result, options) UNCHANGED -- this function
//       must not itself branch on PermissionDenialReason or reimplement any
//       part of that decision.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type { AuthorizationContext, AuthorizationResolution, RequestAuthorizationResolver } from "@/lib/rbac/session";
import * as guardModule from "@/lib/rbac/guard";

function makeResolver(resolution: AuthorizationResolution): RequestAuthorizationResolver {
  return { getContext: vi.fn(async () => resolution) };
}

const authorizedContext: AuthorizationContext = {
  userId: "user-1",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [{ resource: "receiving", action: "view", scopeKind: "global" }],
  partyScopes: [],
};

describe("lib/shell/route-guard — evaluateRouteGuard delegates to lib/rbac/guard, never reimplements the decision", () => {
  it("calls the real toRouteDisclosureOutcome export exactly once with the requirePermission result and the caller's options", async () => {
    const spy = vi.spyOn(guardModule, "toRouteDisclosureOutcome");
    const { evaluateRouteGuard } = await import("../route-guard");
    const resolver = makeResolver({ kind: "authorized", context: authorizedContext });

    await evaluateRouteGuard(resolver, "receiving.view", { existenceSafeToDisclose: false });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "authorized" }),
      { existenceSafeToDisclose: false },
    );
    spy.mockRestore();
  });

  it("produces the exact same disclosure as calling requirePermission + toRouteDisclosureOutcome directly for a missing-grant case", async () => {
    const { evaluateRouteGuard } = await import("../route-guard");
    const { requirePermission, toRouteDisclosureOutcome } = guardModule;
    const resolver1 = makeResolver({ kind: "authorized", context: authorizedContext });
    const resolver2 = makeResolver({ kind: "authorized", context: authorizedContext });

    const shellResult = await evaluateRouteGuard(resolver1, "parties.manage", {
      existenceSafeToDisclose: false,
    });
    const directResult = await requirePermission(resolver2, "parties.manage");
    const directDisclosure = toRouteDisclosureOutcome(directResult, {
      existenceSafeToDisclose: false,
    });

    expect(shellResult.disclosure).toBe(directDisclosure);
    expect(shellResult.disclosure).toBe("not_found");
  });

  it("returns disclosure 'authorized' and the resolved context for a granted capability", async () => {
    const { evaluateRouteGuard } = await import("../route-guard");
    const resolver = makeResolver({ kind: "authorized", context: authorizedContext });

    const result = await evaluateRouteGuard(resolver, "receiving.view", {
      existenceSafeToDisclose: false,
    });

    expect(result.disclosure).toBe("authorized");
    expect(result.context).toEqual(authorizedContext);
  });

  it("returns disclosure 'unauthenticated' (never 'not_found' or 'forbidden') when the resolver itself is unauthenticated, for a capability-gated route", async () => {
    const { evaluateRouteGuard } = await import("../route-guard");
    const resolver = makeResolver({ kind: "unauthenticated" });

    const result = await evaluateRouteGuard(resolver, "receiving.view", {
      existenceSafeToDisclose: true,
    });

    expect(result.disclosure).toBe("unauthenticated");
    expect(result.context).toBeUndefined();
  });

  it("switches between 'forbidden' and 'not_found' for the SAME denied outcome purely based on the caller's existenceSafeToDisclose flag", async () => {
    const { evaluateRouteGuard } = await import("../route-guard");
    const resolverA = makeResolver({ kind: "authorized", context: authorizedContext });
    const resolverB = makeResolver({ kind: "authorized", context: authorizedContext });

    const safe = await evaluateRouteGuard(resolverA, "parties.manage", {
      existenceSafeToDisclose: true,
    });
    const unsafe = await evaluateRouteGuard(resolverB, "parties.manage", {
      existenceSafeToDisclose: false,
    });

    expect(safe.disclosure).toBe("forbidden");
    expect(unsafe.disclosure).toBe("not_found");
  });
});

describe("lib/shell/route-guard — capability 'none' routes (e.g. '/', '/sync') require authentication but no specific grant", () => {
  it("resolves 'authorized' for any authenticated context, regardless of that context's grants, when capability is 'none'", async () => {
    const { evaluateRouteGuard } = await import("../route-guard");
    const zeroGrantContext: AuthorizationContext = { ...authorizedContext, grants: [] };
    const resolver = makeResolver({ kind: "authorized", context: zeroGrantContext });

    const result = await evaluateRouteGuard(resolver, "none", { existenceSafeToDisclose: false });

    expect(result.disclosure).toBe("authorized");
    expect(result.context).toEqual(zeroGrantContext);
  });

  it("resolves 'unauthenticated' for capability 'none' when the resolver itself is unauthenticated", async () => {
    const { evaluateRouteGuard } = await import("../route-guard");
    const resolver = makeResolver({ kind: "unauthenticated" });

    const result = await evaluateRouteGuard(resolver, "none", { existenceSafeToDisclose: false });

    expect(result.disclosure).toBe("unauthenticated");
  });

  it("resolves a denied disclosure (not 'authorized') for capability 'none' when the resolver reports an inactive/forbidden profile", async () => {
    const { evaluateRouteGuard } = await import("../route-guard");
    const resolver = makeResolver({ kind: "forbidden", reason: "inactive_profile" });

    const result = await evaluateRouteGuard(resolver, "none", { existenceSafeToDisclose: true });

    expect(result.disclosure).toBe("forbidden");
    expect(result.disclosure).not.toBe("authorized");
  });
});
