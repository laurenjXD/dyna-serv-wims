-- Durable OS&D records for cartons declared Missing during receiving.
CREATE TABLE IF NOT EXISTS public.receiving_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wrr_id uuid NOT NULL REFERENCES public.wrr_documents(id) ON DELETE CASCADE,
  wrr_item_id uuid NOT NULL REFERENCES public.wrr_items(id) ON DELETE CASCADE,
  expected_cartons integer NOT NULL CHECK (expected_cartons > 0),
  received_cartons integer NOT NULL CHECK (received_cartons >= 0),
  missing_cartons integer NOT NULL CHECK (missing_cartons > 0),
  status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution varchar(50),
  resolution_notes text,
  resolved_by_user_id uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receiving_discrepancies_wrr_item_unique UNIQUE (wrr_item_id),
  CONSTRAINT receiving_discrepancies_resolution_check CHECK (
    (status = 'open' AND resolution IS NULL AND resolved_at IS NULL)
    OR (status = 'resolved' AND resolution IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

ALTER TABLE public.receiving_discrepancies ENABLE ROW LEVEL SECURITY;

INSERT INTO public.permissions (resource, action, description)
VALUES ('receiving', 'discrepancy_resolve', 'Resolve receiving OS&D discrepancies.')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id, scope_kind)
SELECT r.id, p.id, 'global'::scope_kind
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.key IN ('administrator', 'supervisor')
  AND p.resource = 'receiving' AND p.action = 'discrepancy_resolve'
ON CONFLICT DO NOTHING;
