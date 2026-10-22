-- Flow-specific party relationships (2026-10-22).
-- One organization may participate in more than one flow without duplicate
-- party master records or ambiguous Customer dropdown entries.
CREATE TABLE IF NOT EXISTS public.party_flow_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  relationship varchar(40) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_flow_relationships_relationship_check
    CHECK (relationship IN ('vmi_customer', 'trading_customer', 'trading_supplier')),
  CONSTRAINT party_flow_relationships_party_relationship_unique
    UNIQUE (party_id, relationship)
);

CREATE INDEX IF NOT EXISTS party_flow_relationships_active_lookup_idx
  ON public.party_flow_relationships (relationship, is_active, party_id);

ALTER TABLE public.party_flow_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_flow_relationships FORCE ROW LEVEL SECURITY;

CREATE POLICY party_flow_relationships_select ON public.party_flow_relationships
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('parties', 'read', 'global')
    OR rbac_internal.has_any_party_scope(party_id)
  );

CREATE POLICY party_flow_relationships_insert ON public.party_flow_relationships
  FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('parties', 'manage', 'global'));

CREATE POLICY party_flow_relationships_update ON public.party_flow_relationships
  FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('parties', 'manage', 'global'))
  WITH CHECK (rbac_internal.has_permission('parties', 'manage', 'global'));

CREATE POLICY party_flow_relationships_delete ON public.party_flow_relationships
  FOR DELETE TO authenticated
  USING (rbac_internal.has_permission('parties', 'manage', 'global'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_flow_relationships TO authenticated;
