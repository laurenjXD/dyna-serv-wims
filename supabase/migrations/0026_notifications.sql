-- specs/14-notifications-and-alerts/design.md §3 (logical model,
-- "notifications" table) and §5 (authorization/privacy), trimmed per the
-- 2026-08-16 P1 MVP-slice scoping decision recorded in
-- specs/00-steering/revision-log.md ("`14` — P1 MVP slice scoped:
-- notifications table + navbar bell, not full spec").
--
-- Scope: ONLY the `notifications` table. `notification_deliveries`,
-- `notification_preferences`, `alert_rules`, and `inventory_alert_events`
-- (design.md §3's other four tables) are explicitly deferred — no email
-- delivery, no preferences, no alert-rule engine yet. No event producers
-- are wired in this pass either (07/08/09/10/11/13 do not yet INSERT into
-- this table); the bell is real infrastructure with an honest empty state.
--
-- Authorization for this slice (design.md §5, narrowed): design.md §5's
-- full recipient-query intersection (active capability + resource/action +
-- party scope + optional flow_type scope + category/channel policy) and
-- specs/02-rbac-roles/design.md's `notifications.read`/`update_state`
-- capability rows are the eventual model once producers exist across
-- multiple parties/flows. For this slice, `02`'s own catalog note already
-- names the real row-level boundary: "a recipient can only ever mutate
-- their own notification row (enforced by the query layer's/RLS's
-- `recipient_user_id = auth.uid()` predicate, the actual row-level
-- boundary)". This migration implements exactly that: a user reads and
-- marks-read only their own rows. No capability check is layered on top
-- because every internal/party role in `02`'s catalog already holds
-- `notifications.read`/`update_state` at some scope — the row-level
-- `recipient_user_id = auth.uid()` predicate is the only real gate at this
-- table shape, matching the established "own row" precedent
-- (`user_profiles`, `approval_requests`'s requester self-cancellation
-- policy in 0010_approval_rls_policies.sql).
--
-- Brand-new table (not covered by 0008_rls_policies.sql's blanket RLS
-- enable) — RLS is enabled/forced here, matching the pattern established in
-- 0013_transfer_and_inspection_tables.sql and 0025_wrr_item_unit_scans.sql
-- for their new tables.
--
-- No INSERT policy for `authenticated`: notification rows are created only
-- by trusted server-side workflows (service-role, bypassing RLS) once
-- producers are wired in a later phase — an ordinary session must never be
-- able to manufacture a notification addressed to itself or anyone else.
-- No DELETE policy: notifications are a durable record; deletion policy is
-- a retention-phase concern (see the permanent-retention decision in
-- specs/00-steering/revision-log.md for `audit_log`/`lot_history_export`,
-- which `14`'s eventual retention policy is expected to follow), not an
-- ordinary authenticated-session capability.

CREATE TABLE public.notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   uuid NOT NULL REFERENCES auth.users(id),
  category            text NOT NULL,
  title               text NOT NULL,
  body                text,
  source_type         text,
  source_id           uuid,
  flow_type           public.flow_type,
  created_at          timestamptz NOT NULL DEFAULT now(),
  read_at             timestamptz,
  expires_at          timestamptz
);
--> statement-breakpoint

-- Unread-lookup support: "my unread notifications" / unread-count queries.
CREATE INDEX notifications_recipient_read_idx
  ON public.notifications (recipient_user_id, read_at);
--> statement-breakpoint

-- List-query support: "my notifications, newest first".
CREATE INDEX notifications_recipient_created_at_idx
  ON public.notifications (recipient_user_id, created_at DESC);
--> statement-breakpoint

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- SELECT: a user reads only their own rows as recipient.
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());
--> statement-breakpoint

-- UPDATE: a user may mark only their own rows read. USING guards which rows
-- are reachable; WITH CHECK additionally forbids re-attributing a row to a
-- different recipient via the update itself (mirrors
-- approval_requests_update_requester's USING+WITH CHECK shape in
-- 0010_approval_rls_policies.sql). Application code restricts the actual
-- mutation to setting read_at; no column-level GRANT restriction is added
-- here because no other mutable column exists on this trimmed table yet.
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());
--> statement-breakpoint

-- INSERT/DELETE: intentionally absent for `authenticated` — denied by
-- default. Row creation is a trusted server-side (service-role) operation
-- once producers are wired; see header comment.

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
