<<<<<<< HEAD
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
=======
// Navigation registry filtering — capability-based visibility and surface
// presentation selection.
//
// Traceability:
// - specs/05-ui-shell-and-navigation/design.md §5 (registry rules: hidden
//   not disabled, capability keys from 02 catalog, surface determines which
//   nav presentation shows an entry).
// - requirements.md R3.4 (visibility from server-provided capability
//   context; entries without a required capability are hidden entirely).
//
// Neither function is an authorization gate — authorization is enforced
// server-side on every request. These functions are presentation helpers only.

import type { AuthorizationContext } from "@/lib/rbac/session";
import type { SessionPresentationTier } from "./surface";
import type { RouteRegistryEntry } from "./registry";
import { ROUTE_REGISTRY } from "./registry";

/**
 * Returns the subset of ROUTE_REGISTRY entries the current session may see.
 *
 * An entry with `capability: null` is unconditionally included (only `/sync`,
 * `/`, `/profile`, and `/portal` fall into this category per the registry).
 * An entry whose capability the grants array does not cover is excluded
 * entirely — never disabled-and-visible (design.md §5, R3.4).
 */
export function filterVisibleRoutes(
  context: Pick<AuthorizationContext, "grants">,
): RouteRegistryEntry[] {
  return ROUTE_REGISTRY.filter((entry) => {
    if (entry.capability === null) return true;
    return context.grants.some(
      (g) =>
        g.resource === entry.capability!.resource &&
        g.action === entry.capability!.action,
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
    );
  });
}

<<<<<<< HEAD
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
=======
/**
 * Filters an already-capability-filtered route list to only the entries
 * appropriate for the current session's presentation tier.
 *
 * Surface rules (design.md §3.3):
 * - "shared" entries are shown to all tiers.
 * - "floor" entries are shown to floor-tier sessions only.
 * - "office" entries are shown to office-tier sessions only.
 * - "party" entries are shown to party-tier sessions only.
 */
export function selectRoutesForPresentation(
  routes: RouteRegistryEntry[],
  tier: SessionPresentationTier,
): RouteRegistryEntry[] {
  return routes.filter((entry) => {
    if (entry.surface === "shared") return true;
    if (tier === "floor") return entry.surface === "floor";
    if (tier === "office") return entry.surface === "office";
    if (tier === "party") return entry.surface === "party";
    return false;
  });
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
}
