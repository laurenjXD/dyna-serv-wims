// Shared authorization guard.
//
// Traceability: specs/02-rbac-roles/design.md §6.2 ("Shared guard contract" —
// requirePermission(resource, action, optional target scope) is the single
// central guard every protected Server Action/route handler/server
// component/background job must call; downstream code must not branch on
// `role === "supervisor"`), §3.2 (capability model: resource + action +
// scope_kind; assigned_party scope narrowed by flow_type via
// partyScopeMatchesFlow's null-excludes-supplies semantics), and §3.3
// (effective authorization order of checks: active profile -> grant present
// -> scope satisfied -> row/business rules -> RLS).
//
// This module builds directly on lib/rbac/session.ts's
// RequestAuthorizationResolver / AuthorizationContext shapes (cycle 2.2) and
// never reimplements session resolution or party/flow scope matching — the
// latter is delegated to session.ts's exported partyScopeMatchesFlow.
//
// Out of scope here (design.md §3.4): self-approval prohibition. That rule
// compares the invoking user against a specific approval record's
// requester_user_id — a piece of business-record state this guard's inputs
// (a resolver + a capability string + an optional {partyId, flowType}
// scope) have no way to see. It is enforced by 09-approval-queue's
// command-layer logic, not here.

import type {
  AuthorizationContext,
  FlowType,
  RequestAuthorizationResolver,
} from "./session";
import { partyScopeMatchesFlow } from "./session";

export type PermissionDenialReason =
  | "unauthenticated_upstream" // resolver itself returned unauthenticated
  | "inactive_profile"
  | "missing_profile"
  | "resolution_error"
  | "missing_grant" // no matching (resource, action, scopeKind) grant
  | "missing_scope" // grant is assigned_party but no target scope was supplied
  | "scope_mismatch" // target scope supplied but does not match any party scope/flow
  | "invalid_capability"; // malformed "resource.action" string

export type PermissionResult =
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; reason: PermissionDenialReason }
  | { kind: "authorized"; context: AuthorizationContext };

export interface RequirePermissionScope {
  partyId: string;
  flowType: FlowType;
}

export type RouteDisclosureOutcome =
  | "authorized"
  | "unauthenticated"
  | "forbidden"
  | "not_found";

// A single lowercase snake_case segment: starts with a letter, followed by
// letters/digits/underscores. Exactly two such segments joined by exactly
// one dot make a valid capability string.
const CAPABILITY_SEGMENT = /^[a-z][a-z0-9_]*$/;

function parseCapability(
  capability: string,
): { resource: string; action: string } | null {
  const parts = capability.split(".");
  if (parts.length !== 2) return null;
  const [resource, action] = parts;
  if (!CAPABILITY_SEGMENT.test(resource) || !CAPABILITY_SEGMENT.test(action)) {
    return null;
  }
  return { resource, action };
}

export async function requirePermission(
  resolver: RequestAuthorizationResolver,
  capability: string,
  scope?: RequirePermissionScope,
): Promise<PermissionResult> {
  const resolution = await resolver.getContext();

  if (resolution.kind === "unauthenticated") {
    return { kind: "unauthenticated" };
  }

  if (resolution.kind === "forbidden") {
    return { kind: "forbidden", reason: resolution.reason };
  }

  const context = resolution.context;

  const parsed = parseCapability(capability);
  if (parsed === null) {
    return { kind: "forbidden", reason: "invalid_capability" };
  }
  const { resource, action } = parsed;

  const matchingGrants = context.grants.filter(
    (grant) => grant.resource === resource && grant.action === action,
  );

  if (matchingGrants.length === 0) {
    return { kind: "forbidden", reason: "missing_grant" };
  }

  const hasGlobalGrant = matchingGrants.some(
    (grant) => grant.scopeKind === "global",
  );
  if (hasGlobalGrant) {
    return { kind: "authorized", context };
  }

  const hasAssignedPartyGrant = matchingGrants.some(
    (grant) => grant.scopeKind === "assigned_party",
  );
  if (hasAssignedPartyGrant) {
    if (scope === undefined) {
      return { kind: "forbidden", reason: "missing_scope" };
    }

    const scopeMatches = context.partyScopes.some(
      (partyScope) =>
        partyScope.partyId === scope.partyId &&
        partyScopeMatchesFlow(partyScope, scope.flowType),
    );

    if (!scopeMatches) {
      return { kind: "forbidden", reason: "scope_mismatch" };
    }

    return { kind: "authorized", context };
  }

  // Defensive fallback: a matching grant exists but its scopeKind is
  // neither "global" nor "assigned_party" (should be unreachable given the
  // current ScopeKind union) — fail closed rather than fail open.
  return { kind: "forbidden", reason: "missing_grant" };
}

// A separate, pure function: the guard itself never decides
// forbidden-vs-not-found (that decision is inherently per-route, based on
// whether the route's existence is safe to disclose per
// specs/05-ui-shell-and-navigation/requirements.md R6.7).
export function toRouteDisclosureOutcome(
  result: PermissionResult,
  options: { existenceSafeToDisclose: boolean },
): RouteDisclosureOutcome {
  if (result.kind === "unauthenticated") return "unauthenticated";
  if (result.kind === "authorized") return "authorized";
  return options.existenceSafeToDisclose ? "forbidden" : "not_found";
}
