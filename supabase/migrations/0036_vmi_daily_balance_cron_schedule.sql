-- 0036_vmi_daily_balance_cron_schedule.sql
--
-- specs/12-vmi-billing Task C.4c — pg_cron schedule that invokes the
-- vmi-daily-balance-trigger Supabase Edge Function (C.4b) over HTTPS via
-- pg_net, which in turn makes one authenticated call into the Next.js
-- route holding the real replay/storage-charge logic (C.4a,
-- app/api/internal/vmi-daily-balance/route.ts). This migration contains no
-- billing logic itself — schedule/configuration only, per
-- specs/04-services-and-infrastructure/design.md §14.5: "Schedule
-- definitions are migrations/configuration, not dashboard-only knowledge."
--
-- First pg_cron migration in this codebase — no prior in-repo precedent to
-- match; follows standard pg_cron/pg_net-on-Supabase migration conventions.
--
-- Traceability:
--   specs/12-vmi-billing/tasks.md C.4c
--   specs/12-vmi-billing/design.md §2.2 "Invocation architecture" note
--     (2026-08-20): "pg_cron schedule itself is a migration
--     (cron.schedule(...) calling pg_net.http_post against the Edge
--     Function URL), not application code."
--   specs/04-services-and-infrastructure/design.md §14.5
--   specs/00-steering/revision-log.md, 2026-08-20 entry
--
-- ---------------------------------------------------------------------------
-- Timezone conversion (explicit and auditable, per §14.5's instruction that
-- "business schedules document their Asia/Manila interpretation and
-- daylight-saving assumptions")
-- ---------------------------------------------------------------------------
--
-- Target: 23:59 Asia/Manila daily (design.md §2.2's "Schedule" line,
-- unchanged cadence from the prior design).
-- Asia/Manila is a fixed UTC+8 offset year-round — the Philippines does not
-- observe daylight saving time (confirmed assumption per `04` §14.5) — so a
-- single fixed cron expression is correct with no DST branching required.
--
--   23:59 Asia/Manila  =  23:59 local − 08:00 offset  =  15:59 UTC
--   (same calendar day: 23:59 − 8h = 15:59, no day rollover)
--
-- Therefore the UTC pg_cron expression (pg_cron schedules always interpret
-- in UTC, per `04` §14.5) is:  59 15 * * *
--
-- ---------------------------------------------------------------------------
-- Vault secrets this schedule depends on (NOT created by this migration —
-- secret material is never committed; these must be provisioned once per
-- environment via the Supabase Dashboard/CLI vault tooling before the
-- schedule will successfully invoke anything)
-- ---------------------------------------------------------------------------
--
--   'vmi_daily_balance_trigger_url'
--     Full HTTPS invocation URL of the deployed vmi-daily-balance-trigger
--     Edge Function for this environment, e.g.
--     https://<project-ref>.functions.supabase.co/vmi-daily-balance-trigger
--
--   'vmi_daily_balance_trigger_auth_token'
--     The Supabase project's service-role key (or a narrowly scoped key
--     with function-invoke permission), sent as the gateway-level
--     `Authorization: Bearer` header Supabase Edge Functions require by
--     default (separate from the app-level VMI_DAILY_BALANCE_SHARED_SECRET
--     the Edge Function itself forwards downstream to the Next.js route —
--     see supabase/functions/vmi-daily-balance-trigger/index.ts's header
--     comment; that secret is never routed through pg_cron/pg_net at all).
--
-- If these vault secrets are absent when this migration applies, the
-- `cron.schedule(...)` call below still succeeds (it only registers the
-- job); the scheduled net.http_post call will simply fail at its next
-- 15:59 UTC run until the secrets are provisioned for that environment.
-- This is expected and correct: a migration must be identical and
-- reproducible across every environment, so environment-specific secret
-- provisioning cannot live inside it.
--
-- ---------------------------------------------------------------------------
-- Verification limitation (flagging per task instructions, not silently
-- skipping): pg_cron and pg_net are Supabase-platform extensions, not part
-- of a plain/vanilla Postgres image. A disposable Postgres 16 container of
-- the kind prior migrations were verified against will not have these
-- extensions available. Every `create extension`/`cron.schedule` statement
-- below is wrapped in its own guarded `DO $$ ... EXCEPTION WHEN OTHERS ...`
-- block (matching 0032_commitment_expiry_cron_sweep.sql's established
-- pattern — fixed 2026-08-22, this migration originally ran these
-- unguarded and hard-failed the whole migration chain from this point
-- onward on any non-Supabase target), so applying this migration on a
-- vanilla Postgres host degrades gracefully (a NOTICE per skipped
-- statement) rather than aborting. This migration's SQL can still be
-- reviewed for correctness (syntax, the cron expression, the idempotent
-- unschedule-then-schedule pattern, the vault.decrypted_secrets lookups),
-- but cannot be fully exercised end-to-end (does the Edge Function actually
-- get invoked and does it actually reach C.4a) without either a real
-- Supabase project or Supabase's local CLI stack (which does bundle these
-- extensions) — that remains the achievable verification ceiling for this
-- one migration's actual scheduled behavior, independent of the chain-safety
-- fix above.
-- ---------------------------------------------------------------------------

-- Guarded, matching 0032_commitment_expiry_cron_sweep.sql's established
-- pattern (fixed 2026-08-22 — this migration originally ran these
-- statements unguarded, which hard-failed the entire migration chain from
-- this point onward on any non-Supabase Postgres target, breaking every
-- integration test's beforeAll replay, not just this one migration's own
-- verifiability. The header comment above already documented the
-- expectation that this would fail on vanilla Postgres, but documenting a
-- hard failure is not the same as not causing one — this brings the
-- behavior in line with that documented intent instead of just describing
-- it.)
do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'pg_cron extension unavailable on this Postgres instance (%): skipping. Expected on non-Supabase/vanilla test hosts.', sqlerrm;
end
$$;

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net extension unavailable on this Postgres instance (%): skipping. Expected on non-Supabase/vanilla test hosts.', sqlerrm;
end
$$;

-- supabase_vault (the `vault` schema and its `vault.decrypted_secrets`
-- view) ships enabled by default on every Supabase project. Declared here
-- defensively/idempotently for environments where it is not yet enabled;
-- it is not expected to exist at all on a plain, non-Supabase Postgres
-- instance, which is part of the verification limitation noted above.
do $$
begin
  create extension if not exists supabase_vault with schema vault;
exception when others then
  raise notice 'supabase_vault extension unavailable on this Postgres instance (%): skipping. Expected on non-Supabase/vanilla test hosts.', sqlerrm;
end
$$;

-- Idempotent re-application: cron.schedule() upserts by job name on recent
-- pg_cron versions, but an explicit unschedule-then-schedule makes this
-- migration's behavior correct and auditable regardless of the installed
-- pg_cron version, and safe to re-run if this migration is ever re-applied
-- to the same database. Guarded as a whole: if pg_cron itself wasn't
-- available above, the `cron` schema doesn't exist and every statement in
-- this block would fail — skip the whole block in that case rather than
-- fail line by line.
do $$
begin
  if exists (
    select 1 from cron.job where jobname = 'vmi-daily-balance-trigger'
  ) then
    perform cron.unschedule('vmi-daily-balance-trigger');
  end if;

  perform cron.schedule(
    'vmi-daily-balance-trigger',
    '59 15 * * *', -- 23:59 Asia/Manila (UTC+8, no DST) — see conversion note above
    $sql$
    select net.http_post(
      url := (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'vmi_daily_balance_trigger_url'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'vmi_daily_balance_trigger_auth_token'
        )
      ),
      body := jsonb_build_object('triggered_at', now())
    ) as request_id;
    $sql$
  );
exception when others then
  raise notice 'pg_cron scheduling unavailable on this Postgres instance (%): skipping cron.schedule. Expected on non-Supabase/vanilla test hosts.', sqlerrm;
end
$$;
