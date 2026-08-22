// Asia/Manila calendar-date helpers — specs/12-vmi-billing/tasks.md C.5.
//
// Extracted from app/api/internal/vmi-daily-balance/route.ts (2026-08-20):
// Next.js's route type-checking rejects any named export from a
// `app/**/route.ts` file other than HTTP method handlers/route config —
// these were previously exported directly from that route, which compiled
// locally but failed the production build ("is not a valid Route export
// field"). Moved here so both the route and lib/billing/vmi-daily-balance-
// backfill.ts (Task C.6, which had its own local duplicate of the day-bounds
// logic) can share one implementation.

// Asia/Manila is UTC+8 year-round (no DST) — a fixed offset is correct here,
// unlike timezones that observe DST.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Resolves the Asia/Manila calendar date ('YYYY-MM-DD') for a given UTC
 * instant. This can differ from the UTC calendar date (e.g. 20:00 UTC on
 * Aug 19 is 04:00 Manila on Aug 20).
 */
export function resolveManilaLedgerDate(now: Date): string {
  const manilaInstant = new Date(now.getTime() + MANILA_OFFSET_MS);
  return manilaInstant.toISOString().slice(0, 10);
}

/**
 * Resolves the [startUtc, endUtc) UTC instant window corresponding to one
 * Asia/Manila calendar date, for filtering created_at columns.
 */
export function resolveManilaDayBoundsUtc(ledgerDate: string): {
  startUtc: Date;
  endUtc: Date;
} {
  const manilaMidnightAsUtcMs = new Date(`${ledgerDate}T00:00:00.000Z`).getTime();
  const startUtc = new Date(manilaMidnightAsUtcMs - MANILA_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

/** Resolves the Asia/Manila calendar date immediately before the given one. */
export function resolvePreviousManilaLedgerDate(ledgerDate: string): string {
  const previous = new Date(`${ledgerDate}T00:00:00.000Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}
