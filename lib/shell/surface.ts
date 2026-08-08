// Session presentation tier resolution.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.3
// (floor/office/party shell adaptation rules) and §5 (ShellSurface type).
//
// `SurfaceTier` and `SessionPresentationTier` are intentionally the same
// type — aliased so ShellNavigation can import either name without confusion.
// "shared" is a route-registry surface value (RouteRegistryEntry.surface),
// not a session tier: a session is always floor, office, or party.
//
// Priority (design.md §3.3): floor > office > party > office (default).
// A supervisor who also holds warehouse_staff access gets the floor tier.

export type SurfaceTier = "floor" | "office" | "party";

// Re-exported alias used by ShellNavigation.tsx and LandingPage.tsx.
export type SessionPresentationTier = SurfaceTier;

/**
 * Resolves the shell presentation tier from the effective role keys in the
 * server-resolved AuthorizationContext. Never accepts client-supplied values.
 *
 * @param roleKeys - `activeRoleKeys` from the resolved AuthorizationContext.
 * @returns The presentation tier that drives nav variant, touch targets,
 *          and layout rules for the current session.
 */
export function resolveSessionPresentationTier(roleKeys: string[]): SurfaceTier {
  // Priority: floor > office > party, then default to office.
  // A user holding warehouse_staff plus any supervisor role gets floor tier —
  // the floor user's constraints are always the safer choice.
  if (roleKeys.includes("warehouse_staff")) return "floor";
  if (roleKeys.includes("supervisor") || roleKeys.includes("administrator")) return "office";
  if (roleKeys.includes("party_user")) return "party";
  // Default: treat unrecognised or empty role-key sets as office to avoid
  // accidentally applying floor-only touch/layout rules to unknown sessions.
  return "office";
}
