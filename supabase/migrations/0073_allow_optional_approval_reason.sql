-- The approval queue now treats the request comment as optional.
-- Production databases that stopped before the 0071 cleanup can still carry
-- the original 0009 reason_min_length check, which rejects FIFO overrides
-- submitted without a comment before the approval row can be created.
ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS reason_min_length;
