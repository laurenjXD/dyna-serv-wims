-- Atomically claims one approved FIFO/FEFO override for the exact allocation
-- that Stage 1 is about to reserve. The caller invokes this inside the same
-- transaction that creates the pick list; any later failure rolls this update
-- back with the reservation.

CREATE OR REPLACE FUNCTION public.consume_fifo_override_approval(
  p_request_id uuid,
  p_item_id uuid,
  p_lot_id uuid,
  p_location_id uuid,
  p_party_id uuid,
  p_requested_qty integer,
  p_flow_type public.flow_type,
  p_pick_list_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_decision_id uuid;
  v_snapshot jsonb;
  v_target_balance_id uuid;
  v_target_version integer;
  v_current_version integer;
  v_available integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'approval_forbidden';
  END IF;

  SELECT ar.target_snapshot, ar.target_resource_id,
         (ar.target_snapshot->>'allocation_version')::integer,
         ad.id
    INTO v_snapshot, v_target_balance_id, v_target_version, v_decision_id
  FROM public.approval_requests ar
  JOIN public.approval_decisions ad ON ad.request_id = ar.id
  WHERE ar.id = p_request_id
    AND ar.approval_type = 'fifo_override'
    AND ar.status = 'approved'
    AND ar.expiry_at > now()
    AND ar.requester_user_id = auth.uid()
    AND ar.party_id = p_party_id
    AND ad.outcome = 'approved'
    AND ad.consumed_at IS NULL
  FOR UPDATE OF ad;

  IF v_decision_id IS NULL THEN
    RAISE EXCEPTION 'approval_unavailable';
  END IF;

  IF (v_snapshot->>'item_id')::uuid <> p_item_id
     OR (v_snapshot->>'lot_id')::uuid <> p_lot_id
     OR (v_snapshot->>'location_id')::uuid <> p_location_id
     OR (v_snapshot->>'requested_qty')::numeric <> p_requested_qty
     OR v_snapshot->>'flow_type' <> p_flow_type::text THEN
    RAISE EXCEPTION 'approval_mismatch';
  END IF;

  SELECT llb.version, llb.qty_remaining - llb.qty_committed
    INTO v_current_version, v_available
  FROM public.lot_location_balances llb
  JOIN public.lots l ON l.id = llb.lot_id
  WHERE llb.id = v_target_balance_id
    AND llb.lot_id = p_lot_id
    AND llb.location_id = p_location_id
    AND l.item_id = p_item_id
    AND l.flow_type = p_flow_type
    AND l.status = 'available'
  FOR UPDATE OF llb;

  IF v_current_version IS NULL
     OR v_current_version <> v_target_version
     OR v_available < p_requested_qty THEN
    RAISE EXCEPTION 'approval_stale';
  END IF;

  UPDATE public.approval_decisions
  SET consumed_at = now(),
      consumer_workflow = 'fifo_override_commitment',
      resulting_reference = p_pick_list_id::text
  WHERE id = v_decision_id AND consumed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval_consumed';
  END IF;

  RETURN v_decision_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_fifo_override_approval(
  uuid, uuid, uuid, uuid, uuid, integer, public.flow_type, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.consume_fifo_override_approval(
  uuid, uuid, uuid, uuid, uuid, integer, public.flow_type, uuid
) TO authenticated;
