-- Approval comments/reasons are optional. Keep the durable approval request
-- row and snapshot fields non-nullable, but allow an empty string when no
-- comment is supplied by the requester.
ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS reason_min_length;
