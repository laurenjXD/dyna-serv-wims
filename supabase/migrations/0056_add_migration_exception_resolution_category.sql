-- Keep the resolution decision separate from its optional explanatory note.
-- This makes migration exception handling auditable and filterable.

ALTER TABLE public.migration_exceptions
  ADD COLUMN IF NOT EXISTS resolution_category varchar(80);
