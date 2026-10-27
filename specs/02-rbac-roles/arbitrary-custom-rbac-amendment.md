# Arbitrary Custom RBAC Amendment

Status: Draft — requires Product Owner and technical sign-off

## Purpose

Extend the RBAC model so administrators can create persistent custom roles by combining permissions from different warehouse modules. A user may receive one or more custom roles and therefore may have a tailored permission set across receiving, inventory, outgoing workflows, reporting, and administration.

## Requirements

1. Administrators can create, rename, update, deactivate, and delete custom roles.
2. A custom role can contain any supported combination of resource/action permissions, including permissions from multiple modules.
3. Custom-role definitions and permission grants persist in the database and survive reloads, deployments, and server restarts.
4. Users can be assigned one or more roles through `user_roles`.
5. Effective access is the union of permissions granted by the user’s active roles.
6. Built-in system roles and their seeded permissions remain protected from ordinary runtime editing.
7. Permission checks use canonical RBAC resources and actions rather than page labels alone.
8. UI visibility is advisory only; server actions, database access, and RLS must enforce authorization.
9. Creation, modification, deletion, assignment, and removal of custom-role permissions must be recorded in the audit log.
10. Removing or deactivating a custom role must not silently grant access; affected users must lose that role’s permissions.

## Persistence model

Use the existing RBAC tables:

- `roles`: custom role identity, name, description, and active state.
- `permissions`: canonical resource/action catalog.
- `role_permissions`: persistent role-to-permission grants, including scope kind.
- `user_roles`: persistent user-to-role assignments.

The implementation must use a transaction when saving a custom role and its permission set. Replacing a role’s grants must remove stale `role_permissions` rows and insert the submitted canonical grants atomically.

## Security rules

- Only an authorized administrator may manage roles and role assignments.
- System roles cannot be renamed, deleted, deactivated, or have their seeded grants edited through the custom-role UI.
- A caller must not be able to grant permissions they are not authorized to administer, unless the approved security policy explicitly permits full administrator delegation.
- All mutations must validate the canonical permission identifiers server-side.
- RLS and server-side authorization remain authoritative even if a client submits arbitrary resource/action values.

## User experience

The role editor presents permissions grouped by module and resource. Each permission exposes its supported actions, such as `view`, `create`, `edit`, `approve`, or `delete`. The editor must clearly show the resulting access summary and warn before removing permissions from an active role.

The user editor can assign multiple roles. It must display the effective permission summary as the union of all active assigned roles, without duplicating or mutating the underlying role grants.

## Acceptance criteria

- A custom role containing Receiving `view`/`create` and Inventory `view` can be saved, reloaded in a new session, and assigned to a user.
- The assigned user can perform only the granted actions and is denied ungranted actions by server-side checks/RLS.
- Updating the role removes old grants and applies the new grants atomically.
- Assigning a second role adds its permissions without changing either role definition.
- Removing one role removes only that role’s contribution to effective access.
- System roles remain protected.
- Every role, grant, and assignment mutation produces an audit record.

## Migration and delivery notes

The implementation must preserve all existing `v1`/`bam` migrations. Do not merge `ml4` wholesale or delete later migrations. Add a new forward-only migration only if the existing schema needs columns, constraints, indexes, or authorization functions for persistent custom-role management.

