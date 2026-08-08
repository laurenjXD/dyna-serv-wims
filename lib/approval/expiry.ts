// ---------------------------------------------------------------------------
// Request expiry evaluation (design.md §5)
// ---------------------------------------------------------------------------

export type ExpiryResult =
  | { expired: true; expiredAt?: Date }
  | { expired: false };

export type ExpiryParams = {
  createdAt: Date;
  expiryAt: Date | null | undefined;
  now: Date;
};

/**
 * Determines whether an approval request has expired.
 *
 * Contract (design.md §5):
 * - Fail-closed: null/undefined expiryAt → { expired: true } (fifo_override
 *   always requires an expiry; absence is treated as invalid).
 * - now >= expiryAt → { expired: true, expiredAt: expiryAt }.
 * - now < expiryAt  → { expired: false }.
 *
 * The `now` parameter is always caller-supplied — this function never calls
 * Date.now() internally, making it deterministic and testable.
 */
export function isExpired({ createdAt: _createdAt, expiryAt, now }: ExpiryParams): ExpiryResult {
  if (expiryAt == null) {
    return { expired: true };
  }

  if (now.getTime() >= expiryAt.getTime()) {
    return { expired: true, expiredAt: expiryAt };
  }

  return { expired: false };
}
