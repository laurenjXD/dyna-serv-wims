-- specs/10-pick-list-and-acknowledgement-receipt/design.md §2, §7.2
--
-- Creates three tables owned by the document projection layer (10):
--   1. document_number_sequences — year-scoped sequential counters; no RLS —
--      accessed exclusively via generate_document_number() (SECURITY DEFINER).
--   2. generated_documents       — one immutable business snapshot per document
--      version; supersession creates a new row, not an in-place mutation.
--   3. document_events           — append-only history of generation, print,
--      reprint, failure, and supersession events.
--
-- Also creates:
--   generate_document_number(p_type text) — SECURITY DEFINER; acquires an
--   UPDATE lock on the counter row, increments last_seq, and returns the
--   formatted document number (PL-YYYY-NNNNNN or AR-YYYY-NNNNNN).
--
-- RLS: enabled + forced on generated_documents and document_events;
--   policies and grants are in 0019_document_rls.sql.
-- document_number_sequences carries no RLS — the only accessor is the
--   SECURITY DEFINER function above.
-- Grants: SELECT to 'authenticated' only — write access enforced by 0019.

-- ===========================================================================
-- 1. document_number_sequences
-- ===========================================================================

CREATE TABLE IF NOT EXISTS document_number_sequences (
  document_type  text NOT NULL,
  year           int  NOT NULL,
  last_seq       int  NOT NULL DEFAULT 0,

  PRIMARY KEY (document_type, year),

  CONSTRAINT doc_seq_type_check
    CHECK (document_type IN ('pick_list', 'acknowledgement_receipt'))
);
--> statement-breakpoint

-- ===========================================================================
-- 2. generated_documents
-- ===========================================================================

CREATE TABLE IF NOT EXISTS generated_documents (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type       text        NOT NULL,
  document_number     text        NOT NULL UNIQUE,
  template_version    text        NOT NULL,
  source_type         text        NOT NULL,
  source_id           uuid        NOT NULL,
  snapshot_hash       text        NOT NULL,  -- SHA-256 of serialized line data
  artifact_path       text,                  -- Storage path; NULL while generating
  mime_type           text        DEFAULT 'application/pdf',
  size_bytes          bigint,
  status              text        NOT NULL DEFAULT 'pending',
  supersedes_id       uuid        REFERENCES generated_documents(id),
  supersession_reason text,
  currency            text        NOT NULL DEFAULT 'PHP',
  created_by          uuid        REFERENCES auth.users(id),
  system_executor     text,
  correlation_id      uuid,
  generated_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT generated_documents_type_check
    CHECK (document_type IN ('pick_list', 'acknowledgement_receipt')),

  CONSTRAINT generated_documents_source_type_check
    CHECK (source_type IN ('inventory_commitment', 'inventory_transaction')),

  CONSTRAINT generated_documents_status_check
    CHECK (status IN ('pending', 'generating', 'ready', 'failed', 'voided')),

  -- A supersession_reason is mandatory whenever a document supersedes another.
  -- The inverse (no supersedes_id but a reason present) is not blocked here;
  -- that is application-layer validation per design.md §7.3.
  CONSTRAINT generated_documents_supersession_reason_check
    CHECK (supersedes_id IS NULL OR supersession_reason IS NOT NULL)
);
--> statement-breakpoint

-- ===========================================================================
-- 3. document_events (append-only)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS document_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid        NOT NULL REFERENCES generated_documents(id),
  event_type       text        NOT NULL,
  actor_id         uuid        REFERENCES auth.users(id),
  system_executor  text,
  metadata         jsonb,
  correlation_id   uuid,
  occurred_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT document_events_event_type_check
    CHECK (event_type IN ('generated', 'printed', 'reprinted', 'failed', 'superseded'))
);
--> statement-breakpoint

-- ===========================================================================
-- 4. generate_document_number(p_type text)
--    SECURITY DEFINER so it can write to document_number_sequences without
--    any RLS on that table. search_path pinned to public to prevent hijacking.
-- ===========================================================================

CREATE OR REPLACE FUNCTION generate_document_number(p_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year   int;
  v_seq    int;
  v_prefix text;
BEGIN
  -- Validate caller-supplied document type before touching the sequence.
  IF p_type NOT IN ('pick_list', 'acknowledgement_receipt') THEN
    RAISE EXCEPTION 'generate_document_number: invalid document type ''%''', p_type;
  END IF;

  v_year := EXTRACT(year FROM now())::int;

  v_prefix := CASE p_type
    WHEN 'pick_list'               THEN 'PL'
    WHEN 'acknowledgement_receipt' THEN 'AR'
  END;

  -- Ensure the counter row exists for this type/year before locking.
  -- ON CONFLICT DO NOTHING is safe here because the UPDATE below is the
  -- real atomic operation.
  INSERT INTO document_number_sequences (document_type, year, last_seq)
  VALUES (p_type, v_year, 0)
  ON CONFLICT (document_type, year) DO NOTHING;

  -- Lock the row FOR UPDATE and increment atomically.
  UPDATE document_number_sequences
  SET    last_seq = last_seq + 1
  WHERE  document_type = p_type
    AND  year = v_year
  RETURNING last_seq INTO v_seq;

  -- Format: PREFIX-YYYY-NNNNNN (zero-padded to 6 digits).
  RETURN v_prefix || '-' || v_year::text || '-' || LPAD(v_seq::text, 6, '0');
END;
$$;
--> statement-breakpoint

-- ===========================================================================
-- 5. RLS enablement — policies follow in 0019_document_rls.sql.
-- ===========================================================================

ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE document_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ===========================================================================
-- 6. Baseline SELECT grants to 'authenticated'.
--    Mutation grants (INSERT/UPDATE) are set in 0019 alongside the policies.
-- ===========================================================================

GRANT SELECT ON public.generated_documents TO authenticated;
--> statement-breakpoint

GRANT SELECT ON public.document_events TO authenticated;
