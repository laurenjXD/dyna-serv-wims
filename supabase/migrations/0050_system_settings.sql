CREATE TABLE public.system_settings (
  key varchar(100) PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY system_settings_select ON public.system_settings
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('users', 'read', 'global'));

CREATE POLICY system_settings_write ON public.system_settings
  FOR ALL TO authenticated
  USING (rbac_internal.has_permission('users', 'read', 'global'))
  WITH CHECK (rbac_internal.has_permission('users', 'read', 'global'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
