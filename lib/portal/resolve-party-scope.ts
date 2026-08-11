// Party Portal — active party-scope resolution helper.
//
// Traceability:
//   specs/22-parties-portal/design.md §4 (authorization), §8 (session-only
//     party/flow selection).
//   specs/22-parties-portal/tasks.md Task 2 (authorization/context
//     resolution layer — full multi-assignment switcher with server-side
//     re-validation is NOT YET BUILT; this helper is the interim, explicitly
//     documented resolution strategy every portal route uses until Task 2
//     ships).
//   lib/rbac/session.ts — AuthorizationContext.partyScopes (PartyScope[]),
//     resolved server-side from user_party_scopes; never client-supplied.
//
// A party user may hold more than one active party_scope row (e.g. a
// vendor who is also enrolled as a customer). This module does NOT assume
// exactly one. Until Task 2's explicit switcher exists, every portal route
// uses the caller's first active scope and nothing else — never merged,
// never aggregated across scopes. Callers MUST treat a `null` return as
// "show nothing, fail safe" and must never fall through to an unscoped
// read.

import type { AuthorizationContext, PartyScope } from "@/lib/rbac/session";

/**
 * Resolves the single party scope this portal request should read data
 * for. Returns `null` when the caller has zero active party scopes — the
 * caller MUST render a fail-safe empty state in that case, never proceed
 * to an unscoped query.
 */
export function resolveActivePartyScope(
  context: Pick<AuthorizationContext, "partyScopes">,
): PartyScope | null {
  return context.partyScopes[0] ?? null;
}
