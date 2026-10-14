-- Phase 2: canonical party roles and dedicated customer RBE classifications.
-- Rebuild the enum in one transaction so legacy labels cannot be written by
-- new code and existing rows are normalized atomically.
CREATE TYPE public.party_role_v2 AS ENUM ('supplier', 'customer', 'end_customer', 'internal_supplies');

ALTER TABLE public.party_roles
  ALTER COLUMN role TYPE public.party_role_v2
  USING (
    CASE role::text
      WHEN 'vendor' THEN 'supplier'
      WHEN 'internal_warehouse' THEN 'internal_supplies'
      ELSE role::text
    END
  )::public.party_role_v2;

-- Collapse collisions created when a party already had both a legacy and
-- canonical representation of the same business role.
DELETE FROM public.party_roles a
USING public.party_roles b
WHERE a.party_id = b.party_id
  AND a.role = b.role
  AND a.id > b.id;

DROP TYPE public.party_role;
ALTER TYPE public.party_role_v2 RENAME TO party_role;

CREATE UNIQUE INDEX IF NOT EXISTS party_roles_party_role_unique
  ON public.party_roles (party_id, role);

CREATE TYPE public.rbe_classification AS ENUM ('ee', 'else', 'etc');

CREATE TABLE public.party_rbe_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  classification public.rbe_classification NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_rbe_party_classification_unique UNIQUE (party_id, classification)
);

CREATE INDEX party_rbe_classifications_party_id_idx
  ON public.party_rbe_classifications (party_id);

-- Backfill legacy note prefixes only for parties that are Customers. Invalid,
-- duplicate, and non-customer values are intentionally left in the notes for
-- manual review rather than silently discarded.
WITH legacy AS (
  SELECT
    p.id AS party_id,
    upper(trim(value)) AS classification
  FROM public.parties p
  JOIN public.party_roles pr ON pr.party_id = p.id AND pr.role = 'customer'
  CROSS JOIN LATERAL regexp_split_to_table(
    substring(p.notes from '^\\[RBE:\\s*([^\\]]+)\\]'),
    '\\s*,\\s*'
  ) AS value
  WHERE p.notes ~* '^\\[RBE:\\s*[^\\]]+\\]'
)
INSERT INTO public.party_rbe_classifications (party_id, classification)
SELECT party_id, lower(classification)::public.rbe_classification
FROM legacy
WHERE classification IN ('EE', 'ELSE', 'ETC')
ON CONFLICT (party_id, classification) DO NOTHING;

UPDATE public.parties
SET notes = nullif(trim(regexp_replace(notes, '^\\[RBE:\\s*[^\\]]+\\]\\s*', '', 1, 1, 'i')), '')
WHERE notes ~* '^\\[RBE:\\s*[^\\]]+\\]'
  AND EXISTS (
    SELECT 1 FROM public.party_roles pr
    WHERE pr.party_id = parties.id AND pr.role = 'customer'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM regexp_split_to_table(
      substring(parties.notes from '^\\[RBE:\\s*([^\\]]+)\\]'),
      '\\s*,\\s*'
    ) AS value
    WHERE upper(trim(value)) NOT IN ('EE', 'ELSE', 'ETC')
  );

ALTER TABLE public.party_rbe_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_rbe_classifications FORCE ROW LEVEL SECURITY;

CREATE POLICY party_rbe_classifications_select ON public.party_rbe_classifications
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.parties p
    WHERE p.id = party_rbe_classifications.party_id
  ));

CREATE POLICY party_rbe_classifications_insert ON public.party_rbe_classifications
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.party_roles pr
    WHERE pr.party_id = party_rbe_classifications.party_id
      AND pr.role = 'customer'
  ));

CREATE POLICY party_rbe_classifications_delete ON public.party_rbe_classifications
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.party_roles pr
    WHERE pr.party_id = party_rbe_classifications.party_id
      AND pr.role = 'customer'
  ));

GRANT SELECT, INSERT, DELETE ON public.party_rbe_classifications TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_party_rbe_max_three()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM public.party_rbe_classifications WHERE party_id = NEW.party_id) >= 3 THEN
    RAISE EXCEPTION 'A party may have at most three RBE classifications';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER party_rbe_max_three
  BEFORE INSERT ON public.party_rbe_classifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_party_rbe_max_three();
