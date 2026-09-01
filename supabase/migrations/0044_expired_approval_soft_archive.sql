-- Approved 2026-08-30: expired approval requests are soft-archived for monitoring.
-- Request and decision history remains durable; no physical DELETE path exists.

ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_approval_requests_deleted_at
  ON public.approval_requests(deleted_at)
  WHERE deleted_at IS NOT NULL;
--> statement-breakpoint

REVOKE UPDATE ON public.approval_requests FROM authenticated;
--> statement-breakpoint
GRANT UPDATE (status, deleted_at, deleted_by_user_id) ON public.approval_requests TO authenticated;
--> statement-breakpoint

CREATE POLICY approval_requests_update_expired_archive ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('fifo_override', 'approve', 'global')
    AND requester_user_id <> auth.uid()
    AND deleted_at IS NULL
    AND (
      status = 'expired'
      OR (status = 'pending' AND expiry_at <= now())
    )
  )
  WITH CHECK (
    rbac_internal.has_permission('fifo_override', 'approve', 'global')
    AND requester_user_id <> auth.uid()
    AND status = 'expired'
    AND deleted_at IS NOT NULL
    AND deleted_by_user_id = auth.uid()
  );
