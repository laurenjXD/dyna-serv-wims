// Route-surface lookup and session -> presentation-tier resolution.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.3 (surface
// routing rules) and §5 (`ShellSurface`); requirements.md §2 ("A feature
// declares its surface when registering a route. The shell must not infer
// floor behavior from a mutable client role string") and R11.2.

import { ROUTE_REGISTRY, type RouteRegistryEntry, type ShellSurface } from "./registry";

export function resolveRouteSurface(
  path: string,
  registry: readonly RouteRegistryEntry[] = ROUTE_REGISTRY,
): ShellSurface | null {
  const entry = registry.find((row) => row.path === path);
  return entry ? entry.surface : null;
}

export type SessionPresentationTier = "floor" | "office" | "party";

const OFFICE_ROLE_KEYS = new Set(["supervisor", "administrator"]);
const PARTY_ROLE_KEY = "party_user";

// role-key -> tier precedence (RED-step documented decision, design.md does
// not fix an exact algorithm): office-roles > party_user > warehouse_staff
// > default "floor" for an empty/unrecognized role set (design.md §3.3's
// safety bias — over-target floor, never assume office).
export function resolveSessionPresentationTier(
  activeRoleKeys: readonly string[],
): SessionPresentationTier {
  if (activeRoleKeys.some((role) => OFFICE_ROLE_KEYS.has(role))) {
    return "office";
  }
  if (activeRoleKeys.includes(PARTY_ROLE_KEY)) {
    return "party";
  }
  return "floor";
}
