-- Approved 01/03 repair: immutable receipts, committed WITH the scan mutation.
-- This internal schema MUST NOT be exposed through PostgREST/API schemas.
CREATE SCHEMA IF NOT EXISTS offline_internal;
REVOKE ALL ON SCHEMA offline_internal FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA offline_internal TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'offline_replay_writer') THEN
    CREATE ROLE offline_replay_writer NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;
GRANT USAGE, CREATE ON SCHEMA offline_internal TO offline_replay_writer;
GRANT USAGE ON SCHEMA public, auth, rbac_internal TO offline_replay_writer;
GRANT EXECUTE ON FUNCTION auth.uid() TO offline_replay_writer;
GRANT EXECUTE ON FUNCTION rbac_internal.has_permission(text, text, public.scope_kind) TO offline_replay_writer;

CREATE TABLE offline_internal.scan_replay_receipts (
  actor_user_id uuid NOT NULL,
  operation_id text NOT NULL CHECK (char_length(operation_id) BETWEEN 1 AND 128),
  action_type text NOT NULL CHECK (action_type IN ('receiving_scan_observation', 'pick_list_scan_observation')),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND result @> '{"ok":true}'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id, operation_id)
);
ALTER TABLE offline_internal.scan_replay_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_internal.scan_replay_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON offline_internal.scan_replay_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON offline_internal.scan_replay_receipts TO offline_replay_writer;

CREATE FUNCTION offline_internal.require_scan_actor(p_action text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'offline_replay_forbidden' USING ERRCODE = '42501'; END IF;
  IF p_action = 'receiving_scan_observation' THEN
    IF NOT rbac_internal.has_permission('receiving', 'scan', 'global') THEN
      RAISE EXCEPTION 'offline_replay_forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF p_action = 'pick_list_scan_observation' THEN
    IF NOT rbac_internal.has_permission('pick_list', 'execute', 'global')
       OR NOT rbac_internal.has_permission('dispatch', 'execute', 'global') THEN
      RAISE EXCEPTION 'offline_replay_forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE RAISE EXCEPTION 'offline_action_not_supported' USING ERRCODE = '22023';
  END IF;
  RETURN actor;
END $$;

CREATE FUNCTION offline_internal.read_scan_receipt(p_operation text, p_action text, p_hash text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; receipt offline_internal.scan_replay_receipts%ROWTYPE;
BEGIN
  actor := offline_internal.require_scan_actor(p_action);
  IF p_operation IS NULL OR char_length(p_operation) NOT BETWEEN 1 AND 128
     OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_replay_identity' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text || ':' || p_operation, 0));
  SELECT * INTO receipt FROM offline_internal.scan_replay_receipts
    WHERE actor_user_id = actor AND operation_id = p_operation;
  IF FOUND THEN
    IF receipt.action_type <> p_action OR receipt.payload_hash <> p_hash THEN
      RAISE EXCEPTION 'operation_identity_mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN receipt.result;
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION offline_internal.write_scan_receipt(p_operation text, p_action text, p_hash text, p_result jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; previous jsonb;
BEGIN
  actor := offline_internal.require_scan_actor(p_action);
  previous := offline_internal.read_scan_receipt(p_operation, p_action, p_hash);
  IF previous IS NOT NULL THEN
    RAISE EXCEPTION 'receipt_already_exists' USING ERRCODE = '23505';
  END IF;
  INSERT INTO offline_internal.scan_replay_receipts(actor_user_id, operation_id, action_type, payload_hash, result)
    VALUES (actor, p_operation, p_action, p_hash, p_result);
END $$;

ALTER FUNCTION offline_internal.require_scan_actor(text) OWNER TO offline_replay_writer;
ALTER FUNCTION offline_internal.read_scan_receipt(text, text, text) OWNER TO offline_replay_writer;
ALTER FUNCTION offline_internal.write_scan_receipt(text, text, text, jsonb) OWNER TO offline_replay_writer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA offline_internal FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION offline_internal.read_scan_receipt(text, text, text),
  offline_internal.write_scan_receipt(text, text, text, jsonb) TO authenticated;
REVOKE CREATE ON SCHEMA offline_internal FROM offline_replay_writer;
