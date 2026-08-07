// Capability-based navigation presentation filtering.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §5 (an entry
// whose capability the user does not hold is hidden from navigation
// presentation) and §3.3 (surface routing rules — which ShellSurface a
// given nav-widget presentation may draw from).
//
// This module is presentation-only (requirements.md R3.4, R3.5): it never
// performs an authorization side effect, it only reads `context.grants` to
// decide what is worth rendering. Real authorization happens again at the
// server action/route handler/data boundary (design.md §7).

import type { AuthorizationContext } from "@/lib/rbac/session";
import { ROUTE_REGISTRY, type RouteRegistryEntry } from "./registry";

export function filterVisibleRoutes(
  context: Pick<AuthorizationContext, "grants">,
  registry: readonly RouteRegistryEntry[] = ROUTE_REGISTRY,
): readonly RouteRegistryEntry[] {
  return registry.filter((row) => {
    if (row.capability === "none") return true;
    const [resource, action] = row.capability.split(".");
    return context.grants.some(
      (grant) => grant.resource === resource && grant.action === action,
    );
  });
}

export function selectRoutesForPresentation(
  routes: readonly RouteRegistryEntry[],
  presentation: "floor" | "office" | "party",
): readonly RouteRegistryEntry[] {
  if (presentation === "floor") {
    return routes.filter((row) => row.surface === "floor" || row.surface === "shared");
  }
  if (presentation === "office") {
    return routes.filter((row) => row.surface === "office" || row.surface === "shared");
  }
  return routes.filter((row) => row.surface === "party");
}
