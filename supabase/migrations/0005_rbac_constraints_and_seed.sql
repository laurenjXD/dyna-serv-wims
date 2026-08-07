-- specs/02-rbac-roles/design.md §3.1 / §3.2 / §4.6 / §12
--
-- Hand-written follow-up to 0004_rbac_tables.sql (the drizzle-kit-generated
-- RBAC table/enum migration), matching the established pattern of
-- supplementing generated DDL with a hand-written migration for anything
-- drizzle-kit's schema builder cannot express (same pattern as
-- `lot_inventory_totals`'s hand-written VIEW in 0002).
--
-- This migration:
--   1. Replaces `user_party_scopes_active_unique` with the Postgres 15+
--      `NULLS NOT DISTINCT` variant required by design.md §4.6, so a
--      null-`flow_type` ("all externally-applicable flows for this party")
--      active assignment cannot be duplicated for the same (user_id,
--      party_id) pair. Drizzle's IndexBuilder has no `.nullsNotDistinct()`
--      on a `.where()`-scoped partial index (only the non-partial
--      `unique().nullsNotDistinct()` constraint builder supports it, and
--      that can't carry a WHERE clause) — see the module header comment in
--      lib/db/schema/rbac.ts. 0004 therefore emitted a plain partial unique
--      index under this name; it is dropped and recreated here with the
--      correct modifier, rather than hand-edited into the generated file,
--      to keep 0004 a pure, reproducible drizzle-kit artifact.
--   2. Seeds the four system roles from design.md §3.1.
--   3. Seeds the full operational capability catalog from design.md §3.2
--      (RBAC-owned management capabilities plus the first-wave downstream
--      capability catalog), as `permissions` rows.
--   4. Seeds `role_permissions`, mapping each system role to its granted
--      capabilities at the scope kind(s) named in design.md §3.2. Every
--      resource/action/scope-kind row in that catalog has a corresponding
--      grant below; nothing in the catalog is silently left ungranted.
--
-- All statements are idempotent (`ON CONFLICT ... DO NOTHING`) so this
-- migration is safe to re-run against a partially-applied database.

-- ---------------------------------------------------------------------------
-- 1. Fix the active-assignment partial unique index on `user_party_scopes`.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS "user_party_scopes_active_unique";
--> statement-breakpoint

CREATE UNIQUE INDEX "user_party_scopes_active_unique"
  ON "user_party_scopes" ("user_id", "party_id", "flow_type")
  NULLS NOT DISTINCT
  WHERE "revoked_at" IS NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Seed system roles — design.md §3.1.
-- ---------------------------------------------------------------------------

INSERT INTO "roles" ("key", "name", "description", "is_system", "is_active")
VALUES
  ('warehouse_staff', 'Warehouse Staff', 'Floor and operational work; operational/global access within the one warehouse, limited by granted workflow capabilities.', true, true),
  ('supervisor', 'Supervisor', 'Oversight and selected workflow approvals; operational/global access, with approval capabilities remaining separate per workflow.', true, true),
  ('administrator', 'Administrator', 'User/access administration, master configuration, and global audit oversight; global for explicitly granted admin capabilities, still evaluated by RLS.', true, true),
  ('party_user', 'Party User', 'Scoped party self-service; requires an active user_party_scopes assignment, with no implicit scope from email or role alone.', true, true)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Seed the capability catalog — design.md §3.2 (RBAC-owned management
--    capabilities, then the first-wave operational capability catalog).
-- ---------------------------------------------------------------------------

INSERT INTO "permissions" ("resource", "action", "description")
VALUES
  -- RBAC-owned management capabilities (design.md §3.2, top table)
  ('users', 'read', 'View user profiles and their status.'),
  ('users', 'invite', 'Invite a new user.'),
  ('users', 'activate', 'Activate an invited user profile.'),
  ('users', 'deactivate', 'Deactivate a user profile.'),
  ('access_assignments', 'read', 'View role assignments.'),
  ('access_assignments', 'grant', 'Grant a role assignment.'),
  ('access_assignments', 'revoke', 'Revoke a role assignment.'),
  ('party_scopes', 'read', 'View party-scope assignments.'),
  ('party_scopes', 'grant', 'Grant a party-scope assignment.'),
  ('party_scopes', 'revoke', 'Revoke a party-scope assignment.'),
  ('security_events', 'read', 'View RBAC security events.'),

  -- Operational capability catalog (design.md §3.2, second table)
  ('receiving', 'view', 'View receiving records.'),
  ('receiving', 'scan', 'Scan items during receiving.'),
  ('receiving', 'confirm', 'Confirm a receiving record.'),
  ('inspection', 'perform', 'Perform the physical inspection scan and evidence capture.'),
  ('inspection', 'resolve', 'Resolve inspection disposition (accept, quarantine, return).'),
  ('inventory', 'read', 'View inventory records.'),
  ('inventory', 'manage', 'Manage inventory records.'),
  ('locations', 'read', 'View warehouse locations.'),
  ('locations', 'manage', 'Manage warehouse locations.'),
  ('pick_list', 'generate', 'Generate a pick list.'),
  ('pick_list', 'execute', 'Execute a pick list.'),
  ('pick_list', 'read', 'View pick lists.'),
  ('fifo_override', 'request', 'Request a FIFO/FEFO override.'),
  ('fifo_override', 'approve', 'Approve a FIFO/FEFO override request.'),
  ('dispatch', 'read', 'View dispatch records.'),
  ('dispatch', 'execute', 'Execute a dispatch.'),
  ('transfers', 'read', 'View transfer records.'),
  ('transfers', 'request', 'Request a transfer.'),
  ('transfers', 'execute', 'Execute a transfer.'),
  ('documents', 'read', 'View generated documents.'),
  ('documents', 'generate', 'Generate a document.'),
  ('documents', 'download', 'Download a document.'),
  ('vmi_statements', 'read', 'View VMI billing statements and credit notes.'),
  ('reporting', 'read', 'View reporting/analytics.'),
  ('reporting', 'export', 'Export reporting/analytics.'),
  ('reporting', 'financial_read', 'View approved revenue, cost, profit, margin, and price-reference projections.'),
  ('parties', 'read', 'View party records.'),
  ('parties', 'manage', 'Manage party records.'),
  ('items', 'read', 'View item records.'),
  ('items', 'manage', 'Manage item records.'),
  ('forex_rates', 'read', 'View forex rates.'),
  ('forex_rates', 'manage', 'Manage forex rates.'),
  ('notifications', 'read', 'View notifications.'),
  ('shipment_labels', 'generate', 'Generate a pre-arrival shipment label.'),
  ('audit_log', 'read', 'View audit log entries.')
ON CONFLICT ("resource", "action") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Seed role_permissions — every resource/action/scope-kind row from the
--    design.md §3.2 catalog, expanded per default role. Joined by role key
--    and (resource, action) rather than hard-coded UUIDs so this migration
--    has no dependency on generation order.
-- ---------------------------------------------------------------------------

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope_kind")
SELECT r."id", p."id", v.scope_kind::"scope_kind"
FROM (VALUES
  -- RBAC-owned management capabilities — administrator only, global.
  ('administrator', 'users', 'read', 'global'),
  ('administrator', 'users', 'invite', 'global'),
  ('administrator', 'users', 'activate', 'global'),
  ('administrator', 'users', 'deactivate', 'global'),
  ('administrator', 'access_assignments', 'read', 'global'),
  ('administrator', 'access_assignments', 'grant', 'global'),
  ('administrator', 'access_assignments', 'revoke', 'global'),
  ('administrator', 'party_scopes', 'read', 'global'),
  ('administrator', 'party_scopes', 'grant', 'global'),
  ('administrator', 'party_scopes', 'revoke', 'global'),
  ('administrator', 'security_events', 'read', 'global'),

  -- receiving — warehouse_staff, supervisor.
  ('warehouse_staff', 'receiving', 'view', 'global'),
  ('supervisor', 'receiving', 'view', 'global'),
  ('warehouse_staff', 'receiving', 'scan', 'global'),
  ('supervisor', 'receiving', 'scan', 'global'),
  ('warehouse_staff', 'receiving', 'confirm', 'global'),
  ('supervisor', 'receiving', 'confirm', 'global'),

  -- inspection — perform: warehouse_staff, supervisor; resolve: supervisor only.
  ('warehouse_staff', 'inspection', 'perform', 'global'),
  ('supervisor', 'inspection', 'perform', 'global'),
  ('supervisor', 'inspection', 'resolve', 'global'),

  -- inventory — read: staff/supervisor/admin; manage: admin only.
  ('warehouse_staff', 'inventory', 'read', 'global'),
  ('supervisor', 'inventory', 'read', 'global'),
  ('administrator', 'inventory', 'read', 'global'),
  ('administrator', 'inventory', 'manage', 'global'),

  -- locations — read: staff/supervisor/admin; manage: admin only.
  ('warehouse_staff', 'locations', 'read', 'global'),
  ('supervisor', 'locations', 'read', 'global'),
  ('administrator', 'locations', 'read', 'global'),
  ('administrator', 'locations', 'manage', 'global'),

  -- pick_list — generate/execute/read: staff+supervisor (global);
  -- read: party_user (assigned_party).
  ('warehouse_staff', 'pick_list', 'generate', 'global'),
  ('supervisor', 'pick_list', 'generate', 'global'),
  ('warehouse_staff', 'pick_list', 'execute', 'global'),
  ('supervisor', 'pick_list', 'execute', 'global'),
  ('warehouse_staff', 'pick_list', 'read', 'global'),
  ('supervisor', 'pick_list', 'read', 'global'),
  ('party_user', 'pick_list', 'read', 'assigned_party'),

  -- fifo_override — request: staff+supervisor; approve: supervisor only.
  ('warehouse_staff', 'fifo_override', 'request', 'global'),
  ('supervisor', 'fifo_override', 'request', 'global'),
  ('supervisor', 'fifo_override', 'approve', 'global'),

  -- dispatch — read/execute: staff+supervisor.
  ('warehouse_staff', 'dispatch', 'read', 'global'),
  ('supervisor', 'dispatch', 'read', 'global'),
  ('warehouse_staff', 'dispatch', 'execute', 'global'),
  ('supervisor', 'dispatch', 'execute', 'global'),

  -- transfers — read/request/execute: staff+supervisor.
  ('warehouse_staff', 'transfers', 'read', 'global'),
  ('supervisor', 'transfers', 'read', 'global'),
  ('warehouse_staff', 'transfers', 'request', 'global'),
  ('supervisor', 'transfers', 'request', 'global'),
  ('warehouse_staff', 'transfers', 'execute', 'global'),
  ('supervisor', 'transfers', 'execute', 'global'),

  -- documents — read/generate/download: staff+supervisor+admin (global);
  -- read: party_user (assigned_party).
  ('warehouse_staff', 'documents', 'read', 'global'),
  ('supervisor', 'documents', 'read', 'global'),
  ('administrator', 'documents', 'read', 'global'),
  ('warehouse_staff', 'documents', 'generate', 'global'),
  ('supervisor', 'documents', 'generate', 'global'),
  ('administrator', 'documents', 'generate', 'global'),
  ('warehouse_staff', 'documents', 'download', 'global'),
  ('supervisor', 'documents', 'download', 'global'),
  ('administrator', 'documents', 'download', 'global'),
  ('party_user', 'documents', 'read', 'assigned_party'),

  -- vmi_statements — read: party_user only (assigned_party).
  ('party_user', 'vmi_statements', 'read', 'assigned_party'),

  -- reporting — read/export/financial_read: supervisor+admin (global);
  -- read: party_user (assigned_party).
  ('supervisor', 'reporting', 'read', 'global'),
  ('administrator', 'reporting', 'read', 'global'),
  ('supervisor', 'reporting', 'export', 'global'),
  ('administrator', 'reporting', 'export', 'global'),
  ('supervisor', 'reporting', 'financial_read', 'global'),
  ('administrator', 'reporting', 'financial_read', 'global'),
  ('party_user', 'reporting', 'read', 'assigned_party'),

  -- parties — read: staff+supervisor+admin; manage: admin only.
  ('warehouse_staff', 'parties', 'read', 'global'),
  ('supervisor', 'parties', 'read', 'global'),
  ('administrator', 'parties', 'read', 'global'),
  ('administrator', 'parties', 'manage', 'global'),

  -- items — read: staff+supervisor+admin; manage: admin only.
  ('warehouse_staff', 'items', 'read', 'global'),
  ('supervisor', 'items', 'read', 'global'),
  ('administrator', 'items', 'read', 'global'),
  ('administrator', 'items', 'manage', 'global'),

  -- forex_rates — read: supervisor+admin; manage: admin only.
  ('supervisor', 'forex_rates', 'read', 'global'),
  ('administrator', 'forex_rates', 'read', 'global'),
  ('administrator', 'forex_rates', 'manage', 'global'),

  -- notifications — read: staff+supervisor+admin (global);
  -- read: party_user (assigned_party).
  ('warehouse_staff', 'notifications', 'read', 'global'),
  ('supervisor', 'notifications', 'read', 'global'),
  ('administrator', 'notifications', 'read', 'global'),
  ('party_user', 'notifications', 'read', 'assigned_party'),

  -- shipment_labels — generate: party_user only (assigned_party).
  ('party_user', 'shipment_labels', 'generate', 'assigned_party'),

  -- audit_log — read: supervisor+admin, global.
  ('supervisor', 'audit_log', 'read', 'global'),
  ('administrator', 'audit_log', 'read', 'global')
) AS v(role_key, resource, action, scope_kind)
JOIN "roles" r ON r."key" = v.role_key
JOIN "permissions" p ON p."resource" = v.resource AND p."action" = v.action
ON CONFLICT ("role_id", "permission_id", "scope_kind") DO NOTHING;
