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

// Human-readable role labels for shell chrome (account card, etc.), per
// specs/00-steering/page-role-map.md's "Who sees what" naming. Roles are
// additive (a session can hold more than one, e.g. the bootstrap admin
// account also holds Supervisor) — displayed in this fixed precedence order,
// most-privileged first, joined with " / " when more than one is active.
const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  supervisor: "Supervisor",
  warehouse_staff: "Warehouse Staff",
  party_user: "Party User",
};
const ROLE_PRECEDENCE = ["administrator", "supervisor", "warehouse_staff", "party_user"];

export function roleDisplayLabel(activeRoleKeys: readonly string[]): string {
  const labels = ROLE_PRECEDENCE.filter((role) => activeRoleKeys.includes(role)).map(
    (role) => ROLE_LABELS[role],
  );
  return labels.length > 0 ? labels.join(" / ") : "Signed in";
}
