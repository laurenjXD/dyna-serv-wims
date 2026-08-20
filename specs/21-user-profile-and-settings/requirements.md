# User Profile & Settings — Requirements

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## 1. Purpose and scope

This feature defines user profile management (`/profile`) and administrative settings / user management (`/settings`), acting as the visual counterpart to `02-rbac-roles`.

### Terminology Alignment
Across all user-facing settings screens, forms, headers, and modals:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.

*(Note: `parties`, `party_user`, `user_party_scopes`, and `flow_type` remain canonical database identifiers.)*

## 2. Actors and surfaces

- **All Authenticated Users** — access `/profile` to view account details, reset passwords, and toggle user preferences.
- **Administrators & Users with `users.read` / `users.manage`** — access `/settings` to manage user accounts, assign RBAC roles (`warehouse_staff`, `supervisor`, `administrator`, `party_user`), and bind Organization scopes (`user_party_scopes`).

## 3. Functional requirements

### FR-1: User Profile (`/profile`)
1. All authenticated users access `/profile` to update `displayName` and `contactNumber`.
2. Password reset flow and UI preference toggles.

### FR-2: Administrative Settings & User Management (`/settings`)
1. Gated by `users.read` / `users.manage` capabilities.
2. Searchable, filterable user management data grid.
3. User invitation, suspension, and role assignment (`warehouse_staff`, `supervisor`, `administrator`, `party_user`).
4. Organization scope binding (`user_party_scopes`): when assigning `party_user`, selecting an Organization (`party_id`) is required.

### FR-3: Visual Design & 3-Component Error Feedback
1. Level 0 Cream White (`#FFF7ED`) background, Level 1 Solid White (`#FFFFFF`) cards with `#2563EB` Vibrant Blue accents, and Etna Sans Serif + Glacial Indifference typography.
2. All form validation and server action errors display 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**).

## 4. Acceptance criteria

- [ ] Users access `/profile`; Administrators and authorized users access `/settings`.
- [ ] User-facing UI labels use Organization, Inventory Model, and Organization Portal exclusively.
- [ ] User management binds `party_user` to specific Organization scopes (`user_party_scopes`).
- [ ] 3-component error feedback is present on all form and server errors.
