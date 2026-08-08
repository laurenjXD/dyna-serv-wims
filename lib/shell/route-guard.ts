// Shell route guard — a thin delegation layer over lib/rbac/guard.ts.
//
// Traceability: specs/05-ui-shell-and-navigation/requirements.md R6.6/R6.7
// and design.md §7 ("Navigation omission is not security... Enforce
// route/resource authorization again at the server action, route handler,
// or data boundary").
//
// This module deliberately does NOT reimplement any part of the
// forbidden-vs-not-found decision. It calls the already-implemented,
// already-reviewed lib/rbac/guard.ts#requirePermission and
// #toRouteDisclosureOutcome and passes their result straight through.

import type {
  AuthorizationContext,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import {
  requirePermission,
  toRouteDisclosureOutcome,
  type PermissionResult,
  type RouteDisclosureOutcome,
} from "@/lib/rbac/guard";

export interface RouteGuardResult {
  disclosure: RouteDisclosureOutcome;
  context?: AuthorizationContext;
}

export async function evaluateRouteGuard(
  resolver: RequestAuthorizationResolver,
  capability: string,
  options: { existenceSafeToDisclose: boolean },
): Promise<RouteGuardResult> {
  let result: PermissionResult;

  if (capability === "none") {
    // A capability-less route (e.g. "/", "/sync") requires only an
    // active/authenticated session — no specific grant is checked. We
    // still route every outcome through the same delegated
    // toRouteDisclosureOutcome so unauthenticated/forbidden semantics are
    // never re-derived here.
    const resolution = await resolver.getContext();
    if (resolution.kind === "unauthenticated") {
      result = { kind: "unauthenticated" };
    } else if (resolution.kind === "forbidden") {
      result = { kind: "forbidden", reason: resolution.reason };
    } else {
      result = { kind: "authorized", context: resolution.context };
    }
  } else {
    result = await requirePermission(resolver, capability);
  }

  const disclosure = toRouteDisclosureOutcome(result, options);

  if (disclosure === "authorized" && result.kind === "authorized") {
    return { disclosure, context: result.context };
  }

  return { disclosure };
}
