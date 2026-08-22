// `POST /api/internal/vmi-daily-balance` — specs/12-vmi-billing Task C.4a, C.5.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group C, C.4 / C.4a — "the nightly job
//     ... app/api/internal/vmi-daily-balance/route.ts — the real logic. Runs
//     C.1-C.3 for all active VMI parties, ON CONFLICT (party_id, ledger_date)
//     DO NOTHING. Secured by a shared secret (Vercel env var), rejecting any
//     request missing/mismatching it."
//   specs/12-vmi-billing/tasks.md C.5 — "Implement timezone-correct date
//     boundaries — All ledger_date values and created_at range filters use
//     Asia/Manila calendar dates."
//   specs/12-vmi-billing/requirements.md FR-2.3 — nightly snapshot, one
//     immutable row per party per day, priced same-day.
//   specs/12-vmi-billing/design.md §2.2 ("Invocation architecture" note,
//     2026-08-20): a plain Next.js route (not a Vercel-Cron `app/api/cron/*`
//     route), invoked by a Supabase Edge Function over HTTPS with a shared
//     secret. This route implements the numbered algorithm steps 1-7:
//     beginning_cbm carry-forward, movement replay scoped to "today's
//     Asia/Manila calendar day", billed_balance_cbm resolution, rate
//     resolution, INSERT ... ON CONFLICT DO NOTHING.
//
// VMI-party identification note (verified against schema, not guessed —
// `party_role` enum has no "vmi" value): a party counts as an "active VMI
// party" for this job when `parties.is_active = true` AND it has a
// currently-open `vmi_contract_terms` version (`effective_to IS NULL`).
//
// Partial-failure behavior: one party's failure (e.g. a transient movement-
// query error) does not abort the batch — it is caught, reported in that
// party's result entry, and the loop continues to the remaining parties.

import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
// Deliberate service-role job, NOT a leftover of the pre-existing, deferred
// "Drizzle client bypasses RLS" bug (specs/00-steering/revision-log.md,
// "Finding 7 — PRE-EXISTING B-CLASS", tracked against `04`). This route has
// no end-user session to scope to at all (it is invoked by a Supabase Edge
// Function on a nightly schedule, authenticated only by the shared secret
// checked below) and its whole purpose is a cross-party aggregation no
// single user's RLS row could ever cover. That is exactly the documented
// exception category in specs/04-services-and-infrastructure/design.md
// §8.6's routing table: "Cross-resource aggregations requiring privilege
// beyond any single user's scope (inventory sweeps, cron-triggered
// reconciliation) -> Trusted runtime SQL - Drizzle via transaction pooler
// (service role)". `createServiceRoleClient()` (lib/supabase/server.ts) is
// NOT substituted here: every existing call site of that helper
// (app/(authenticated)/settings/team/actions.ts,
// scripts/seed-dev-accounts.ts) uses it solely for the Supabase Admin Auth
// API (`auth.admin.*`), never as a stand-in for Drizzle's schema-typed
// join queries — its `.from(table).select(columns)` PostgREST shape is
// structurally incompatible with the `.select({...}).from().innerJoin()`
// chains this route and getVmiPartyMovements (lib/billing/vmi-movement-query.ts)
// require. So this route's use of the plain `db` Drizzle client below is an
// explicit, narrowly-justified choice per `04`'s own table, not an accident
// that will silently break (or silently keep "working") whenever Finding 7
// is eventually fixed for the session-scoped routes it actually concerns.
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
import { vmiContractTerms, vmiDailyBalanceLedger } from "@/lib/db/schema/vmi_billing";
import {
  getVmiPartyMovements,
  type VmiMovementRow,
} from "@/lib/billing/vmi-movement-query";
import {
  computeVmiDailyBalance,
  type VmiContractTermsVersion,
} from "@/lib/billing/vmi-daily-balance";
// Pure timezone helpers (tasks.md C.5) live in their own module, not as
// named exports from this file — Next.js's route type-checking only allows
// HTTP method handlers/route config to be exported from `app/**/route.ts`;
// exporting these directly here compiled locally but broke the production
// build ("resolveManilaLedgerDate is not a valid Route export field").
import {
  resolveManilaLedgerDate,
  resolveManilaDayBoundsUtc,
  resolvePreviousManilaLedgerDate,
} from "@/lib/billing/vmi-manila-time";

const SECRET_HEADER = "x-vmi-daily-balance-secret";

// computeVmiDailyBalance deliberately performs no display-scale rounding
// (lib/billing/vmi-daily-balance.ts's own docstring: "that is left to the
// caller/persistence layer") — storage_amount_usd is a real USD amount, so
// it is rounded to cents here, at the persistence boundary, matching the
// real June-fixture figure ($39.601 -> $39.60; design.md §2.2's "Verified"
// note / requirements.md's $39.60-exactly figure). CBM quantities and the
// per-CBM rate are not currency and are persisted unrounded.
function roundToCents(amountUsd: number): number {
  return Math.round(amountUsd * 100) / 100;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

type PartyResultStatus = "inserted" | "skipped" | "error";

type PartyResult = {
  partyId: string;
  status: PartyResultStatus;
  error?: string;
};

export async function POST(request: Request): Promise<Response> {
  const expectedSecret = process.env.VMI_DAILY_BALANCE_SHARED_SECRET;
  const providedSecret = request.headers.get(SECRET_HEADER);

  // Fail closed first, before any comparison, on a missing/empty env var or
  // a missing header — same as before.
  if (!expectedSecret || !providedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Constant-time comparison: this is the sole authorization gate on a route
  // with cross-party financial write access, so a plain `!==` string
  // comparison is a timing-attack surface. `timingSafeEqual` requires
  // equal-length buffers (it throws otherwise), so the length check must
  // happen first and short-circuit to the same 401 — this leaks only that
  // lengths differ, not which byte first differs, which is the property
  // that matters here.
  const expectedBuffer = Buffer.from(expectedSecret);
  const providedBuffer = Buffer.from(providedSecret);

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const ledgerDate = resolveManilaLedgerDate(now);
  const { startUtc, endUtc } = resolveManilaDayBoundsUtc(ledgerDate);
  const previousLedgerDate = resolvePreviousManilaLedgerDate(ledgerDate);

  // Active VMI parties: parties.is_active = true AND a currently-open
  // vmi_contract_terms version (effective_to IS NULL) — see the schema note
  // above.
  const activeParties = await db
    .select({
      partyId: parties.id,
      contractId: vmiContractTerms.id,
      storageRatePerCbmDay: vmiContractTerms.storageRatePerCbmDay,
      billingTiming: vmiContractTerms.billingTiming,
      cbmThresholdType: vmiContractTerms.cbmThresholdType,
      cbmThreshold: vmiContractTerms.cbmThreshold,
      overThresholdRate: vmiContractTerms.overThresholdRate,
      effectiveFrom: vmiContractTerms.effectiveFrom,
      effectiveTo: vmiContractTerms.effectiveTo,
    })
    .from(parties)
    .innerJoin(vmiContractTerms, eq(vmiContractTerms.partyId, parties.id))
    .where(and(eq(parties.isActive, true), isNull(vmiContractTerms.effectiveTo)));

  const results: PartyResult[] = [];

  for (const partyRow of activeParties) {
    try {
      // Beginning CBM = yesterday's (Manila calendar) ending CBM, 0/null if
      // no prior row exists.
      const priorRows = await db
        .select({ endingCbm: vmiDailyBalanceLedger.endingCbm })
        .from(vmiDailyBalanceLedger)
        .where(
          and(
            eq(vmiDailyBalanceLedger.partyId, partyRow.partyId),
            eq(vmiDailyBalanceLedger.ledgerDate, previousLedgerDate),
          ),
        )
        .limit(1);

      const previousEndingCbm =
        priorRows.length > 0 ? Number(priorRows[0].endingCbm) : null;

      // C.1's query returns full (unfiltered-by-date) history — filter down
      // to today's Asia/Manila calendar day window here (C.5).
      const allMovements: VmiMovementRow[] = await getVmiPartyMovements(
        db,
        partyRow.partyId,
      );
      const movements = allMovements.filter(
        (movement) =>
          movement.createdAt >= startUtc && movement.createdAt < endUtc,
      );

      // The active-parties join already yielded the single currently-open
      // contract version, which resolves correctly for the normal
      // forward-running nightly job (design.md §2.2 step 6 note).
      const contractVersions: VmiContractTermsVersion[] = [
        {
          id: partyRow.contractId,
          partyId: partyRow.partyId,
          storageRatePerCbmDay: Number(partyRow.storageRatePerCbmDay),
          billingTiming: partyRow.billingTiming,
          cbmThresholdType: partyRow.cbmThresholdType,
          cbmThreshold:
            partyRow.cbmThreshold !== null ? Number(partyRow.cbmThreshold) : null,
          overThresholdRate:
            partyRow.overThresholdRate !== null
              ? Number(partyRow.overThresholdRate)
              : null,
          effectiveFrom: partyRow.effectiveFrom,
          effectiveTo: partyRow.effectiveTo,
        },
      ];

      const balance = computeVmiDailyBalance({
        partyId: partyRow.partyId,
        ledgerDate,
        previousEndingCbm,
        movements,
        contractVersions,
      });

      const inserted = await db
        .insert(vmiDailyBalanceLedger)
        .values({
          partyId: balance.partyId,
          ledgerDate: balance.ledgerDate,
          beginningCbm: String(balance.beginningCbm),
          inboundCbmFg: String(balance.inboundCbmFg),
          inboundCbmRawMaterial: String(balance.inboundCbmRawMaterial),
          outboundCbmFg: String(balance.outboundCbmFg),
          outboundCbmRawMaterial: String(balance.outboundCbmRawMaterial),
          endingCbm: String(balance.endingCbm),
          billedBalanceCbm: String(balance.billedBalanceCbm),
          appliedStorageRateUsd: String(balance.appliedStorageRateUsd),
          storageAmountUsd: String(roundToCents(balance.storageAmountUsd)),
          calculatedAt: now,
        })
        .onConflictDoNothing({
          target: [vmiDailyBalanceLedger.partyId, vmiDailyBalanceLedger.ledgerDate],
        })
        .returning();

      results.push({
        partyId: partyRow.partyId,
        status: inserted.length > 0 ? "inserted" : "skipped",
      });
    } catch (err) {
      // Log the real error server-side; the per-party response only carries
      // a short generic message (this response is not access-controlled the
      // way an authenticated user-facing error would be, and the caller is
      // an automated job, not an operator who needs the raw stack/message).
      console.error(
        `[vmi-daily-balance] Failed to calculate/persist ledger row for party ${partyRow.partyId}:`,
        err,
      );
      results.push({
        partyId: partyRow.partyId,
        status: "error",
        error: "Failed to calculate VMI daily balance for this party.",
      });
    }
  }

  return Response.json({ ledgerDate, results }, { status: 200 });
}
