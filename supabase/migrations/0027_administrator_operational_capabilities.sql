-- specs/02-rbac-roles/design.md §3.2 (2026-08-17 amendment)
--
-- PO decision (specs/00-steering/revision-log.md, "Administrator granted
-- full operational oversight" entry, 2026-08-17): administrator is meant to
-- oversee the whole system, but the original §3.2 catalog seeded in
-- 0005_rbac_constraints_and_seed.sql omitted administrator from the
-- receiving/inspection/pick_list/fifo_override/dispatch/transfers rows —
-- every other resource row in that catalog already includes administrator
-- alongside supervisor (inventory, locations, documents, reporting, parties,
-- items, forex_rates, notifications, audit_log). This migration makes
-- administrator a true superset of supervisor by adding the missing grants,
-- rather than editing the already-applied 0005 migration in place.
--
-- All statements are idempotent (`ON CONFLICT ... DO NOTHING`), matching
-- 0005's pattern, so this migration is safe to re-run.

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope_kind")
SELECT r."id", p."id", v.scope_kind::"scope_kind"
FROM (VALUES
  -- receiving — administrator joins warehouse_staff/supervisor.
  ('administrator', 'receiving', 'view', 'global'),
  ('administrator', 'receiving', 'scan', 'global'),
  ('administrator', 'receiving', 'confirm', 'global'),

  -- inspection — administrator joins both perform (staff+supervisor) and
  -- resolve (supervisor-only).
  ('administrator', 'inspection', 'perform', 'global'),
  ('administrator', 'inspection', 'resolve', 'global'),

  -- pick_list — administrator joins warehouse_staff/supervisor's global grant.
  ('administrator', 'pick_list', 'generate', 'global'),
  ('administrator', 'pick_list', 'execute', 'global'),
  ('administrator', 'pick_list', 'read', 'global'),

  -- fifo_override — administrator joins request (staff+supervisor) and
  -- approve (supervisor-only). The existing self-approval prohibition
  -- (design.md §3.4) is a requester != approver check independent of role,
  -- so it continues to apply to administrator approvers unchanged.
  ('administrator', 'fifo_override', 'request', 'global'),
  ('administrator', 'fifo_override', 'approve', 'global'),

  -- dispatch — administrator joins warehouse_staff/supervisor.
  ('administrator', 'dispatch', 'read', 'global'),
  ('administrator', 'dispatch', 'execute', 'global'),

  -- transfers — administrator joins warehouse_staff/supervisor.
  ('administrator', 'transfers', 'read', 'global'),
  ('administrator', 'transfers', 'request', 'global'),
  ('administrator', 'transfers', 'execute', 'global')
) AS v(role_key, resource, action, scope_kind)
JOIN "roles" r ON r."key" = v.role_key
JOIN "permissions" p ON p."resource" = v.resource AND p."action" = v.action
ON CONFLICT ("role_id", "permission_id", "scope_kind") DO NOTHING;
