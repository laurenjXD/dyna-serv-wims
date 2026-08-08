-- specs/11-transfer-and-inspection/design.md §2
--
-- Creates five tables:
--   1. transfer_requests   — operational transfer request records
--   2. transfer_lines      — per-lot/item lines within a transfer request
--   3. inspection_cases    — shared inspection record (inbound + transfer contexts)
--   4. inspection_evidence — append-only evidence attached to an inspection case
--   5. inspection_dispositions — disposition outcomes for inspection cases
--
-- Status columns use plain text with named CHECK constraints (no new SQL enum).
-- RLS is enabled + forced on all five tables; policies come in 0014.
-- Grants: SELECT only to 'authenticated' — write access enforced by 0014 policies.
-- set_updated_at() trigger is re-applied to transfer_requests using the function
-- first defined in 0009_approval_tables.sql (CREATE OR REPLACE there).

-- ===========================================================================
-- 1. transfer_requests
-- ===========================================================================

CREATE TABLE IF NOT EXISTS transfer_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_location_id     uuid NOT NULL REFERENCES locations(id),
  to_location_id       uuid NOT NULL REFERENCES locations(id),
  flow_type            flow_type NOT NULL,
  status               text NOT NULL DEFAULT 'staged',
  reference            text,
  reason               text,
  requires_approval    boolean NOT NULL DEFAULT false,
  approval_request_id  uuid REFERENCES approval_requests(id),
  version              integer NOT NULL DEFAULT 1,
  requested_by         uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  correlation_id       uuid,

  CONSTRAINT transfer_requests_status_check
    CHECK (status IN ('staged', 'in_progress', 'completed', 'cancelled'))
);

-- ===========================================================================
-- 2. transfer_lines
-- ===========================================================================

CREATE TABLE IF NOT EXISTS transfer_lines (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_request_id  uuid NOT NULL REFERENCES transfer_requests(id),
  lot_id               uuid NOT NULL REFERENCES lots(id),
  item_id              uuid NOT NULL REFERENCES items(id),
  qty_requested        numeric NOT NULL,
  qty_transferred      numeric NOT NULL DEFAULT 0,
  status               text NOT NULL DEFAULT 'pending',
  -- Nullable: set when this line enters transfer inspection.
  -- Polymorphic reference to inspection_cases.id — validated at app layer; no DB FK.
  inspection_case_id   uuid,

  CONSTRAINT transfer_lines_status_check
    CHECK (status IN ('pending', 'in_transit', 'completed', 'cancelled'))
);

-- ===========================================================================
-- 3. inspection_cases
-- ===========================================================================

CREATE TABLE IF NOT EXISTS inspection_cases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type     text NOT NULL,
  source_ref_type  text NOT NULL,
  -- Polymorphic: points to wrr_items.id or transfer_lines.id — no DB FK.
  source_ref_id    uuid NOT NULL,
  lot_id           uuid NOT NULL REFERENCES lots(id),
  item_id          uuid NOT NULL REFERENCES items(id),
  party_id         uuid NOT NULL REFERENCES parties(id),
  flow_type        flow_type NOT NULL,
  status           text NOT NULL DEFAULT 'open',
  opened_by        uuid NOT NULL,
  opened_at        timestamptz NOT NULL DEFAULT now(),
  resolved_by      uuid,
  resolved_at      timestamptz,

  CONSTRAINT inspection_cases_status_check
    CHECK (status IN ('open', 'passed', 'failed', 'cancelled')),
  CONSTRAINT inspection_cases_context_type_check
    CHECK (context_type IN ('inbound', 'transfer')),
  CONSTRAINT inspection_cases_source_ref_type_check
    CHECK (source_ref_type IN ('wrr_item', 'transfer_line'))
);

-- ===========================================================================
-- 4. inspection_evidence
-- ===========================================================================

CREATE TABLE IF NOT EXISTS inspection_evidence (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_case_id   uuid NOT NULL REFERENCES inspection_cases(id),
  evidence_type        text NOT NULL,
  -- Storage object URL for photo; free text for note; structured JSON for measurement.
  payload              text NOT NULL,
  captured_by          uuid NOT NULL,
  captured_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inspection_evidence_evidence_type_check
    CHECK (evidence_type IN ('photo', 'note', 'measurement'))
);

-- ===========================================================================
-- 5. inspection_dispositions
-- ===========================================================================

CREATE TABLE IF NOT EXISTS inspection_dispositions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_case_id      uuid NOT NULL REFERENCES inspection_cases(id),
  disposition_type        text NOT NULL,
  quantity_affected       numeric NOT NULL,
  -- Nullable: null for dispositions with no immediate balance effect (e.g. 'hold').
  lot_location_balance_id uuid REFERENCES lot_location_balances(id),
  notes                   text,
  applied_by              uuid NOT NULL,
  applied_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inspection_dispositions_disposition_type_check
    CHECK (disposition_type IN (
      'store', 'quarantine', 'return_to_party', 'hold', 'write_off',
      'return_to_stock', 'reject', 'return_to_origin'
    ))
);

-- ===========================================================================
-- 6. Indexes
-- ===========================================================================

-- transfer_requests
CREATE INDEX transfer_requests_status_idx
  ON transfer_requests(status);

CREATE INDEX transfer_requests_from_location_idx
  ON transfer_requests(from_location_id);

CREATE INDEX transfer_requests_to_location_idx
  ON transfer_requests(to_location_id);

CREATE INDEX transfer_requests_requested_by_idx
  ON transfer_requests(requested_by);

CREATE INDEX transfer_requests_approval_request_id_idx
  ON transfer_requests(approval_request_id)
  WHERE approval_request_id IS NOT NULL;

-- transfer_lines
CREATE INDEX transfer_lines_transfer_request_id_idx
  ON transfer_lines(transfer_request_id);

CREATE INDEX transfer_lines_lot_id_idx
  ON transfer_lines(lot_id);

CREATE INDEX transfer_lines_item_id_idx
  ON transfer_lines(item_id);

CREATE INDEX transfer_lines_status_idx
  ON transfer_lines(status);

-- inspection_cases
CREATE INDEX inspection_cases_status_idx
  ON inspection_cases(status);

CREATE INDEX inspection_cases_lot_id_idx
  ON inspection_cases(lot_id);

CREATE INDEX inspection_cases_item_id_idx
  ON inspection_cases(item_id);

CREATE INDEX inspection_cases_party_id_idx
  ON inspection_cases(party_id);

-- inspection_evidence
CREATE INDEX inspection_evidence_inspection_case_id_idx
  ON inspection_evidence(inspection_case_id);

-- inspection_dispositions
CREATE INDEX inspection_dispositions_inspection_case_id_idx
  ON inspection_dispositions(inspection_case_id);

-- ===========================================================================
-- 7. updated_at trigger on transfer_requests
--    set_updated_at() was first defined in 0009_approval_tables.sql.
-- ===========================================================================

CREATE TRIGGER set_transfer_requests_updated_at
  BEFORE UPDATE ON transfer_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- 8. Row-Level Security
--    Enable and force RLS on all five tables.
--    Policies come in 0014 — no policies are created here.
-- ===========================================================================

ALTER TABLE transfer_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_requests     FORCE ROW LEVEL SECURITY;

ALTER TABLE transfer_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_lines        FORCE ROW LEVEL SECURITY;

ALTER TABLE inspection_cases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_cases      FORCE ROW LEVEL SECURITY;

ALTER TABLE inspection_evidence   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_evidence   FORCE ROW LEVEL SECURITY;

ALTER TABLE inspection_dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_dispositions FORCE ROW LEVEL SECURITY;

-- ===========================================================================
-- 9. Grants
--    SELECT only; write access granted per policy in 0014.
-- ===========================================================================

GRANT SELECT ON transfer_requests      TO authenticated;
GRANT SELECT ON transfer_lines         TO authenticated;
GRANT SELECT ON inspection_cases       TO authenticated;
GRANT SELECT ON inspection_evidence    TO authenticated;
GRANT SELECT ON inspection_dispositions TO authenticated;
