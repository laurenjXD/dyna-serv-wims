-- Allow an authenticated user to update only their own display name/profile
-- timestamp. The existing RLS policies intentionally grant SELECT only; this
-- narrowly opens the Profile page's approved self-service display-name flow
-- without allowing status or lifecycle fields to be changed by the browser.
--
-- Traceability: specs/21-user-profile-and-settings/design.md §4.1,
-- Task 21.2; specs/02-rbac-roles/design.md §7.3 default-deny RLS boundary.

CREATE POLICY user_profiles_update_self ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
--> statement-breakpoint

GRANT UPDATE (display_name, updated_at) ON public.user_profiles TO authenticated;
