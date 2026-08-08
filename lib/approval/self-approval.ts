// ---------------------------------------------------------------------------
// Self-approval guard (design.md §5, requirements.md R4.5)
// ---------------------------------------------------------------------------

export type SelfApprovalResult =
  | { blocked: true; reason: string }
  | { blocked: false };

/**
 * Checks whether a reviewer is permitted to approve a request they submitted.
 *
 * Fail-closed:
 * - If either userId is null or undefined → blocked (missing-actor).
 * - If both are the same non-null string → blocked (self-approval).
 * - If both are different non-null strings → allowed.
 *
 * Never throws — safe to call with any input including empty strings.
 *
 * Per design.md §5: "the server command checks that the invoking user's
 * auth.uid() does not match the requester_user_id on the approval request
 * before allowing the operation."
 */
export function checkSelfApproval(
  reviewerUserId: string | null | undefined,
  requesterUserId: string | null | undefined,
): SelfApprovalResult {
  if (reviewerUserId == null || requesterUserId == null) {
    return {
      blocked: true,
      reason: "missing-actor",
    };
  }

  if (reviewerUserId === requesterUserId) {
    return {
      blocked: true,
      reason: "self-approval",
    };
  }

  return { blocked: false };
}
