# User Profile & Settings — Requirements

Status: Approved

Depends on:
- `specs/00-steering/product.md`
- `specs/00-steering/tech.md`
- `specs/00-steering/brand-design-system.md`
- `specs/02-rbac-roles/` (Consumes the roles defined here)
- `specs/05-ui-shell-and-navigation/` (Applies global UI state toggles)

---

## 1. Overview

This module defines the front-end user interface for managing personal profiles, system-wide settings, and administrative Role-Based Access Control (RBAC). It acts as the visual counterpart to the backend security rules defined in Spec 02.

---

## 2. Goals

- Provide a dedicated `/profile` route for individual users to manage their credentials and preferences.
- Provide a dedicated `/settings` route restricted exclusively to Administrators.
- Allow administrators to invite, suspend, and configure permissions for internal staff and external party users via an intuitive UI table.
- Centralize system-wide configurations (e.g., warehouse operational defaults).

---

## 3. Functional Requirements

### FR-1: User Profile (`/profile`)
1. **Access:** The profile page SHALL be accessible to all authenticated users (Staff, Supervisors, Admins, and Party Clients).
2. **Personal Information:** Users SHALL be able to view and edit their `displayName` and `contactNumber`. Email addresses SHALL remain read-only unless an explicit email change verification flow is triggered.
3. **Security:** Users SHALL be able to initiate a "Password Reset" flow.
4. **UI Preferences:** Users SHALL be able to toggle global application preferences (e.g., "Dark Mode", "Compact Table View"). These preferences SHALL persist across sessions.

### FR-2: Administrative Settings Shell (`/settings`)
1. **Access:** The settings route SHALL strictly reject access to non-Admin roles, redirecting them back to `/dashboard` with an unauthorized alert.
2. **Navigation:** The settings layout SHALL utilize a tabbed or secondary sidebar navigation structure (e.g., `User Management`, `Roles & Permissions`, `System Configs`).

### FR-3: User Management UI
1. **Data Grid:** The system SHALL display a searchable, filterable data grid listing all authenticated users.
2. **User Invite Flow:** Administrators SHALL be able to invite new users by entering an email address and assigning an initial role. The system will dispatch an invitation link via Supabase Auth.
3. **Account Lifecycle:** Administrators SHALL be able to click a user record to "Suspend" or "Revoke" access instantly.

### FR-4: RBAC & Role Assignment UI
1. **Role Configuration:** When editing a user in the User Management grid, Admins SHALL be presented with a dropdown to assign system roles (`warehouse_staff`, `supervisor`, `admin`, `party_user`) as defined in `02-rbac-roles`.
2. **Party Scope Binding:** If a user is assigned the `party_user` role, the UI SHALL dynamically require the Admin to select a `party_id` from the `parties` table (e.g., binding a Vendor login to the "UBoT" party).
3. **Validation:** The UI SHALL strictly validate that a `party_user` cannot exist without a bound `party_id`.

### FR-5: System Configurations
1. **Global Variables:** The settings page SHALL include a tab for generic system-wide flags (e.g., "Enable Strict FIFO override approvals", "Default Currency").

---

## 4. Non-Functional Requirements
1. **Security & Auditability:** Every action taken in the `/settings` route (especially role assignment and user suspension) MUST be logged in an audit trail table with the Admin's `user_id` and a timestamp.
2. **Form Validation:** All inputs in the profile and settings forms MUST be validated using Zod schemas before submission to the server.

---

## 5. Out of Scope
- Granular capability matrix editing (We are sticking to predefined roles per Spec 02, not building a custom permission builder UI where users check individual capability boxes).
- Complex SSO integration configurations (e.g., hooking up Azure AD or Okta SAML). Basic email/password authentication is sufficient for v1.

---

## 6. Acceptance Criteria
1. A standard user can navigate to `/profile`, toggle dark mode, and change their display name.
2. An Administrator can navigate to `/settings`, invite a new user, and assign them the `party_user` role bound to a specific vendor `party_id`.
3. An unauthorized user attempting to navigate directly to `/settings` is securely redirected away.
