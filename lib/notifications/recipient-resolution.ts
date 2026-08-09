// lib/notifications/recipient-resolution.ts
//
// Traceability: specs/14-notifications-and-alerts/design.md §5
// (authorization intersection: active capability + matching resource/
// action + matching party scope + matching optional flow_type scope).
// requirements.md R2.2/R2.3. Category/channel preference policy (design.md
// §5's fourth intersection term) is deliberately NOT implemented here —
// it's applied later, in Phase 2's delivery layer, after mandatory-channel
// rules are evaluated (design.md §4).
//
// Pure logic, no DB access — event producers (Phase 2) supply the
// candidate list (queried from user_roles/role_permissions/
// user_party_scopes, the same tables lib/auth/page-resolver.ts already
// reads) and this module decides who's actually authorized to receive
// the notification.

export interface RecipientCandidate {
  userId: string;
  grants: ReadonlyArray<{ resource: string; action: string; scopeKind: "global" | "assigned_party" }>;
  partyScopes: ReadonlyArray<{ partyId: string; flowType: "vmi" | "trading" | "supplies" | null }>;
}

export interface NotificationSourceEvent {
  requiredCapability: { resource: string; action: string };
  // null = a global/unscoped event (e.g. document_generation_failure);
  // only a global-scope grant holder ever qualifies for one — an
  // assigned_party-only grant has no party to match against.
  partyId: string | null;
  flowType: "vmi" | "trading" | "supplies" | null;
}

export interface ResolvedRecipient {
  userId: string;
}

function hasRequiredCapability(
  candidate: RecipientCandidate,
  required: { resource: string; action: string },
): ReadonlyArray<RecipientCandidate["grants"][number]> {
  return candidate.grants.filter(
    (g) => g.resource === required.resource && g.action === required.action,
  );
}

function partyScopeMatches(
  candidate: RecipientCandidate,
  event: NotificationSourceEvent,
): boolean {
  // Gate 2 (02-rbac-roles/design.md §3.2 item 2 / §7.4): can_access_party_resource
  // hard-denies every assigned_party-scope check against a supplies-flow
  // event, independent of the null-flowType rule below — not a
  // restatement of it. This is defense-in-depth against a scope row that
  // should never exist per §3.2 ("every ... capability that touches a
  // flow_type-partitioned resource for Supplies MUST be modeled with
  // scope_kind = 'global' ... never assigned_party") but might, through a
  // single implementation slip elsewhere, exist anyway.
  if (event.flowType === "supplies") return false;

  return candidate.partyScopes.some(
    (scope) =>
      scope.partyId === event.partyId &&
      // Mirrors 02-rbac-roles/design.md's has_party_scope match logic
      // exactly: a null-flowType assignment is NOT a bare wildcard — it
      // never matches a 'supplies' event, only vmi/trading/null. Kept as
      // an independent check alongside gate 2 above, per design.md's
      // explicit "second, redundant gate — not a restatement" framing.
      (scope.flowType === event.flowType ||
        (scope.flowType === null && event.flowType !== "supplies")),
  );
}

export function resolveRecipients(
  candidates: ReadonlyArray<RecipientCandidate>,
  event: NotificationSourceEvent,
): ResolvedRecipient[] {
  const seen = new Set<string>();
  const result: ResolvedRecipient[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.userId)) continue;

    const matchingGrants = hasRequiredCapability(candidate, event.requiredCapability);
    if (matchingGrants.length === 0) continue;

    const hasGlobalGrant = matchingGrants.some((g) => g.scopeKind === "global");
    // A null event.partyId is a global/unscoped event — only a
    // global-scope grant holder can qualify. An assigned_party-only
    // grant has no party to match against and never qualifies for one,
    // regardless of what its own partyScopes contain.
    const qualifies =
      event.partyId === null ? hasGlobalGrant : hasGlobalGrant || partyScopeMatches(candidate, event);
    if (!qualifies) continue;

    seen.add(candidate.userId);
    result.push({ userId: candidate.userId });
  }

  return result;
}
