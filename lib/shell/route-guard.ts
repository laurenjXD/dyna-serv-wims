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
export async function evaluateRouteGuard(
  resolver: RequestAuthorizationResolver,
  capability: string,
  options: { existenceSafeToDisclose: boolean },
): Promise<{ disclosure: RouteDisclosureOutcome }> {
  const result = await requirePermission(resolver, capability);
  const disclosure = toRouteDisclosureOutcome(result, options);
  return { disclosure };
}
