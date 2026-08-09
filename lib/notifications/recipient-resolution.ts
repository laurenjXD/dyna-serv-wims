//
// Traceability: specs/14-notifications-and-alerts/design.md §5
// (authorization intersection: active capability +
// matching resource/action + matching party scope + matching optional
// flow_type scope). requirements.md R2.2/R2.3.
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
  // a candidate's own scope kind still governs whether they qualify.
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
  if (event.partyId === null) return true; // global event — no party restriction to check
  return candidate.partyScopes.some(
    (scope) =>
      scope.partyId === event.partyId &&
      // Mirrors 02-rbac-roles/design.md's has_party_scope match logic exactly:
      // a null-flowType assignment is NOT a bare wildcard — it never matches
      // a 'supplies' event, only vmi/trading/null. A single implementation
      // slip here would leak Supplies-flow notifications through a
      // VMI/Trading party assignment (design.md §3.4, acceptance criterion
      // #7: party_user grants never expose internal Supplies data).
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
    const qualifies = hasGlobalGrant || partyScopeMatches(candidate, event);
    if (!qualifies) continue;

    seen.add(candidate.userId);
    result.push({ userId: candidate.userId });
  }

  return result;
}
