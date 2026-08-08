<<<<<<< HEAD
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

=======
// Route-guard evaluation — maps the RBAC permission result to the correct
// route disclosure outcome (authorized / forbidden / not_found / unauthenticated).
//
// Traceability:
// - specs/05-ui-shell-and-navigation/design.md §7 ("Navigation omission is
//   not security... Enforce route/resource authorization again at the server
//   action, route handler, or data boundary").
// - requirements.md R6.3 ("Unknown or unauthorized routes SHALL use the
//   approved not-found/forbidden behavior and SHALL not disclose protected
//   resource existence") and R6.7 (not-found vs forbidden must remain
//   visibly distinct).
//
// This module is a thin adapter over lib/rbac/guard.ts — it never re-derives
// permission logic, only translates the RBAC result into the route-disclosure
// vocabulary that RouteGuard.tsx renders.

import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import type { RouteDisclosureOutcome } from "@/lib/rbac/guard";
import { requirePermission, toRouteDisclosureOutcome } from "@/lib/rbac/guard";

export type { RouteDisclosureOutcome };

/**
 * Evaluates whether the resolved session holds `capability` and translates
 * the result into a route disclosure outcome.
 *
 * @param resolver - The request-scoped authorization resolver. Never pass
 *   client-supplied identity or capability values here.
 * @param capability - A "resource.action" capability key from the 02-rbac-roles
 *   §3.2 catalog.
 * @param options.existenceSafeToDisclose - When true and authorization fails,
 *   returns "forbidden" (the route's existence can be acknowledged). When
 *   false, returns "not_found" (the route's existence is kept implicit).
 */
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
export async function evaluateRouteGuard(
  resolver: RequestAuthorizationResolver,
  capability: string,
  options: { existenceSafeToDisclose: boolean },
<<<<<<< HEAD
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

=======
): Promise<{ disclosure: RouteDisclosureOutcome }> {
  const result = await requirePermission(resolver, capability);
  const disclosure = toRouteDisclosureOutcome(result, options);
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
  return { disclosure };
}
