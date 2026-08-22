-- Nightly commitment-expiry sweep — pg_cron safety net for Stage 2's
-- real-time reservation-expiry check.
--
-- Traceability:
--   specs/00-steering/revision-log.md — "Spec 08 — Pick-list expiry
--     enforcement: Option C (staleness check at Stage 2 + nightly CRON
--     sweep)": "Stage 2 dispatch rejects and marks `expired` in real time
--     when `expires_at` is in the past. A nightly pg_cron job sweeps for any
--     commitments past `expires_at` that were never attempted and marks them
--     `expired`, freeing `qty_committed` on `lot_location_balances`. Both
--     paths write the same `expired` transition; the CRON is the safety
--     net, not the primary enforcer."
--   Product Owner decision (this task): reservation TTL is 24 hours from
--     commitment creation. `inventory_commitments.expires_at = created_at +
--     24h` is set at Stage 1 commit time in lib/actions/withdrawals.ts by a
--     separate, already-in-flight backend-builder task — not touched here.
--   specs/08-outgoing-withdrawal-and-two-stage-commitment/tasks.md Task 4
--     (unchecked): "Implement safe cancellation/release/expiry before
--     dispatch with concurrency protection."
--   lib/actions/__tests__/withdrawals.integration.test.ts — real-Postgres
--     spec for `SELECT expire_stale_commitments()`: one commitment forced
--     stale (`expires_at` in the past, `status = 'active'`, never
--     dispatched) must end up `status = 'expired'` with its reserved
--     quantity released back onto `lot_location_balances.qty_committed`
--     (never `qty_remaining`); a second, genuinely active commitment
--     (`expires_at` still in the future) must be left completely untouched.
--
-- This migration:
--   1. Enables pg_cron — guarded (see note below); not available on every
--      Postgres install.
--   2. Grants the existing `rbac_definer` role (0008_rls_policies.sql;
--      BYPASSRLS, NOLOGIN, NOINHERIT) SELECT+UPDATE on the three tables the
--      sweep touches. `lot_location_balances`, `inventory_commitments`, and
--      `inventory_commitment_lines` all carry FORCE ROW LEVEL SECURITY
--      (0008_rls_policies.sql), which applies to table owners too — a plain
--      SECURITY DEFINER function owned by the migration-executing role is
--      NOT sufficient to bypass it, because Supabase's hosted `postgres`
--      role is not a true superuser (0008's own note, ~line 164) and
--      therefore does not itself bypass RLS. `rbac_definer` is this repo's
--      one existing mechanism for a system-level function that must cross
--      FORCE ROW LEVEL SECURITY boundaries rather than operate inside one
--      caller's own RLS scope — reused here rather than inventing a second
--      bypass role. Its existing grants (0008) cover only the RBAC catalog
--      tables, so new grants are required for these three.
--   3. Defines `expire_stale_commitments()` — SECURITY DEFINER, owned by
--      `rbac_definer`, unconditionally created (no pg_cron dependency) so
--      it is directly callable by tests/db-migration-verifier/the cron job
--      alike. Idempotent: a second call with nothing newly stale is a
--      no-op, and it only ever touches commitments/lines currently
--      `status = 'active'` with `expires_at` in the past — never
--      'executed'/'released'/'cancelled'/already-'expired' rows. EXECUTE is
--      revoked from PUBLIC — this is a system/cron sweep that bypasses RLS
--      across every party's commitments, not something an ordinary
--      `authenticated` session should be able to invoke directly (matching
--      this repo's established caution around SECURITY DEFINER functions;
--      see revision-log.md's "02 RBAC/RLS design review" finding 4).
--   4. Schedules the sweep nightly via `cron.schedule` at 02:00 UTC
--      (10:00 PHT, UTC+8) — guarded, same reason as step 1. No "quiet
--      hours" convention is documented anywhere in this repo, so 02:00 UTC
--      is chosen as a low-traffic window well outside a typical warehouse
--      floor day (roughly 06:00-18:00 PHT) and unrelated to the 24h TTL
--      itself — the sweep is a safety net for commitments that were already
--      stale by the time it runs, not a clock the TTL is measured against.
--
-- pg_cron availability note: `CREATE EXTENSION pg_cron` requires the
-- extension binary to be present on the Postgres server
-- (`postgresql-<version>-cron` on Debian/Ubuntu). It ships pre-installed on
-- Supabase-managed Postgres but NOT on a vanilla `apt-get install
-- postgresql` instance — which is exactly what
-- .claude/agents/db-migration-verifier.md step 1 spins up, and what
-- lib/actions/__tests__/withdrawals.integration.test.ts's migration runner
-- (applying every supabase/migrations/*.sql file, in order, against
-- TEST_DATABASE_URL/DATABASE_URL) actually runs against. An unguarded
-- `CREATE EXTENSION pg_cron` / `cron.schedule` would hard-fail migration
-- application and break every integration test in this repo that shares
-- this same migration-runner pattern, not just this file's own expiry
-- tests. Steps 1 and 4 are therefore wrapped in exception-handling DO
-- blocks that emit a NOTICE and continue when pg_cron is unavailable,
-- rather than failing the whole migration chain. On real Supabase, both DO
-- blocks succeed for real and the job is actually scheduled.

-- ===========================================================================
-- 1. Enable pg_cron (guarded).
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
--> statement-breakpoint

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  GRANT USAGE ON SCHEMA cron TO postgres;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron extension unavailable on this Postgres instance (%): skipping. Expected on non-Supabase/vanilla test hosts; expire_stale_commitments() is still created below and directly callable.', SQLERRM;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- 2. rbac_definer needs SELECT+UPDATE on the three tables this sweep
--    touches — its existing grants (0008_rls_policies.sql) cover only the
--    RBAC catalog tables.
-- ===========================================================================

GRANT SELECT, UPDATE ON public.inventory_commitments TO rbac_definer;
--> statement-breakpoint

GRANT SELECT, UPDATE ON public.inventory_commitment_lines TO rbac_definer;
--> statement-breakpoint

GRANT SELECT, UPDATE ON public.lot_location_balances TO rbac_definer;
--> statement-breakpoint

-- ===========================================================================
-- 3. expire_stale_commitments() — the nightly (and directly callable)
--    safety-net sweep.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.expire_stale_commitments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale_ids uuid[];
BEGIN
  -- Snapshot the stale commitment ids once, up front, so all three writes
  -- below act on exactly the same set regardless of write order — a
  -- commitment already 'expired' by an earlier call, or one whose
  -- expires_at is still in the future, is never included.
  SELECT array_agg(id) INTO v_stale_ids
  FROM public.inventory_commitments
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  IF v_stale_ids IS NULL THEN
    RETURN 0;
  END IF;

  -- Release each stale commitment's reserved quantity back onto
  -- lot_location_balances.qty_committed only. qty_remaining is never
  -- touched — stock for a reservation that was never dispatched never left
  -- the shelf. Mirrors dispatchPickList's own release arithmetic
  -- (lib/actions/withdrawals.ts: qty_committed decremented by the
  -- commitment line's reserved qty_committed amount), minus its parallel
  -- qty_remaining decrement, since Stage 2 physical movement never happened
  -- for a swept commitment.
  --
  -- Aggregated per lot_location_balance_id (not a plain single-row
  -- UPDATE ... FROM join) because Postgres's UPDATE ... FROM applies only
  -- one arbitrary matching source row per target row when multiple
  -- FROM-joined rows match the same target — it does not sum/loop across
  -- all matches. When two or more stale commitment lines (from different
  -- commitments, both going stale in the same sweep call) reference the
  -- identical lot_location_balance_id, a plain join silently drops every
  -- release but one. Summing per balance row first makes this correct
  -- both when multiple lines collide on one balance row and in the
  -- ordinary case of a single matching line (SUM of one row is a no-op).
  UPDATE public.lot_location_balances llb
  SET    qty_committed = llb.qty_committed - agg.total_qty,
         version = llb.version + 1,
         updated_at = now()
  FROM   (
    SELECT icl.lot_location_balance_id, SUM(icl.qty_committed) AS total_qty
    FROM   public.inventory_commitment_lines icl
    WHERE  icl.commitment_id = ANY(v_stale_ids)
      AND  icl.status = 'active'
    GROUP BY icl.lot_location_balance_id
  ) agg
  WHERE  llb.id = agg.lot_location_balance_id;

  -- Mark each stale commitment line 'expired' — keeps both status columns
  -- consistent, same as dispatchPickList's own line-then-header status
  -- writes.
  UPDATE public.inventory_commitment_lines
  SET    status = 'expired',
         updated_at = now()
  WHERE  commitment_id = ANY(v_stale_ids)
    AND  status = 'active';

  -- Mark the stale commitment headers 'expired'. released_at records when
  -- the sweep actually freed the reservation.
  UPDATE public.inventory_commitments
  SET    status = 'expired',
         released_at = now(),
         updated_at = now()
  WHERE  id = ANY(v_stale_ids);

  RETURN array_length(v_stale_ids, 1);
END;
$$;
--> statement-breakpoint

ALTER FUNCTION public.expire_stale_commitments() OWNER TO rbac_definer;
--> statement-breakpoint

-- Not exposed to ordinary authenticated users — see header note. Its only
-- real caller is the pg_cron job scheduled below (which runs as the
-- job-owning role, not as 'authenticated') and db-migration-verifier /
-- integration tests connecting directly as the database owner.
REVOKE EXECUTE ON FUNCTION public.expire_stale_commitments() FROM PUBLIC;
--> statement-breakpoint

-- ===========================================================================
-- 4. Schedule the nightly sweep (guarded — see header note). 02:00 UTC ==
--    10:00 PHT (UTC+8).
-- ===========================================================================

DO $$
BEGIN
  PERFORM cron.schedule(
    'expire-stale-commitments-nightly',
    '0 2 * * *',
    $cron$SELECT public.expire_stale_commitments();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling unavailable on this Postgres instance (%): skipping cron.schedule. Expected on non-Supabase/vanilla test hosts.', SQLERRM;
END
$$;
