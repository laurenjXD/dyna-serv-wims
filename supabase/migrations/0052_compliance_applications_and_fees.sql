CREATE TYPE public.compliance_application_type AS ENUM ('loa', 'customs', 'in', 'out', 'handling_activity', 'others');
CREATE TYPE public.compliance_application_status AS ENUM ('draft', 'active', 'expired', 'voided');
CREATE TYPE public.compliance_fee_category AS ENUM ('peza', 'loa', 'bond', 'customs', 'in', 'out', 'handling_activity', 'others');

CREATE TABLE public.compliance_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number varchar(80) NOT NULL UNIQUE,
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  application_type public.compliance_application_type NOT NULL,
  status public.compliance_application_status NOT NULL DEFAULT 'draft',
  requested_date date NOT NULL,
  approved_date date,
  expiration_date date,
  source_document_reference varchar(255),
  notes text,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_applications_loa_expiration CHECK (
    application_type <> 'loa' OR expiration_date IS NULL OR approved_date IS NULL
    OR expiration_date = (approved_date + interval '1 year' - interval '1 day')::date
  )
);

CREATE TABLE public.compliance_application_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.compliance_applications(id) ON DELETE CASCADE,
  category public.compliance_fee_category NOT NULL,
  description varchar(255),
  amount numeric(14,4) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'PHP',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_application_fees_others_description CHECK (category <> 'others' OR nullif(trim(description), '') IS NOT NULL)
);

CREATE INDEX compliance_applications_party_idx ON public.compliance_applications(party_id);
CREATE INDEX compliance_applications_status_idx ON public.compliance_applications(status);
CREATE INDEX compliance_application_fees_application_idx ON public.compliance_application_fees(application_id);

ALTER TABLE public.compliance_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_application_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_application_fees FORCE ROW LEVEL SECURITY;

CREATE POLICY compliance_applications_select ON public.compliance_applications FOR SELECT TO authenticated USING (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
CREATE POLICY compliance_applications_write ON public.compliance_applications FOR ALL TO authenticated USING (rbac_internal.has_permission('reporting', 'financial_read', 'global')) WITH CHECK (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
CREATE POLICY compliance_application_fees_select ON public.compliance_application_fees FOR SELECT TO authenticated USING (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
CREATE POLICY compliance_application_fees_write ON public.compliance_application_fees FOR ALL TO authenticated USING (rbac_internal.has_permission('reporting', 'financial_read', 'global')) WITH CHECK (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_applications, public.compliance_application_fees TO authenticated;
