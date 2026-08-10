-- Per-line immediate commit for incoming receiving.
--
-- Product-owner reversal 2026-08-10 (see specs/00-steering/revision-log.md's
-- "07 receiving reversed" entry and specs/07-incoming-receiving/design.md
-- §9): each WRR line now commits independently as soon as staff completes
-- it -- creating its own lots/lot_location_balances/inventory_transactions
-- rows -- rather than the whole WRR committing atomically at once.
-- `committed_at` is the per-line idempotency gate for that commit: the
-- commit server action performs a conditional
-- `UPDATE wrr_items SET committed_at = now() WHERE id = :id AND committed_at
-- IS NULL`, mirroring the existing `wrr_documents.status = 'receiving_in_
-- progress'` conditional-claim pattern already used by `commitWrr` in
-- lib/actions/receiving.ts. Only the transaction that successfully claims
-- the null-to-timestamp transition may create the line's inventory rows;
-- retries observe the already-committed result instead of double-inserting.
-- It is also the query key for counting how many of a WRR's lines have
-- committed, used to decide whether wrr_documents.status should flip to
-- 'confirmed'.

ALTER TABLE public.wrr_items
  ADD COLUMN committed_at timestamptz;
