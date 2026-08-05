# User Profile & Settings — Tasks

Status: Approved
Updated: 2026-08-05

Sign-off:
- [x] Technical Lead Sign-off
- [x] Product/Operations Lead Sign-off

---

## Task Checklist

### 1. Personal Profile Features (`/profile`)
- [ ] **Task 21.1: Build Profile Layout & Shell**
  - Implement the centered `<ProfileContainer>` and `<Tabs>` navigation component.
- [ ] **Task 21.2: Account Information Form**
  - Create `<DisplayNameInput>` and connect it to a Server Action to update the `users` table.
- [ ] **Task 21.3: Security Tab & Passwords**
  - Implement a `<ChangePasswordForm>` utilizing Supabase Auth's `updateUser` API for credential changes.
- [ ] **Task 21.4: UI Preferences Context**
  - Build a React Context provider or use Zustand to manage Dark Mode and table density states locally.

### 2. Admin Settings Features (`/settings`)
- [ ] **Task 21.5: Build Admin Settings Shell**
  - Implement the restricted `/settings` route layout with secondary sidebar navigation.
  - Apply middleware/RLS to strictly bounce non-admins.
- [ ] **Task 21.6: Build User Management Grid (`<UserManagementGrid>`)**
  - Author Drizzle query to fetch the list of registered users and joined Party Data.
  - Build the React table with search and filtering capabilities.
- [ ] **Task 21.7: User Invitation Workflow**
  - Build the `Invite User` modal with Zod form validation.
  - Implement the conditional UI logic for `party_id` when the `party_user` role is selected.
  - Wire form submission to a Server Action that invokes the Supabase Admin API to create the user and insert their role.
- [ ] **Task 21.8: Account Lifecycle Actions**
  - Implement the "Suspend User" confirmation dialog.
  - Write Server Action to toggle user `is_active` status.

### 3. Review & Polish
- [ ] **Task 21.9: RBAC Integration Testing**
  - Verify that a newly invited `party_user` can log in and successfully triggers the RLS filters defined in Spec 02.
  - Verify that non-admins are blocked from `/settings`.

### 4. Identity, authorization, and session flows (design.md §4)
- [ ] **Task 21.10: Invitation acceptance UI**
  - Build the landing page an invited user reaches after clicking the email invite link.
  - Allow the user to set initial display name and preferences; do not expose role or party-scope fields.
  - Wire to `02`'s profile activation flow on submission.
- [ ] **Task 21.11: MFA UI entry point (Security tab)**
  - Add the MFA enrollment entry point to the Security tab that routes into `supabase.auth.mfa.*` setup flow.
  - Hide or disable the MFA disable control when admin-required MFA policy is active.
- [ ] **Task 21.12: Session info display (Security tab)**
  - Display read-only last-sign-in time and active-sessions list sourced from Supabase Auth metadata.
  - Do not expose any session-extension or token-mint controls from this surface.

### 5. Settings scope enforcement (design.md §5)
- [ ] **Task 21.13: Settings scope audit**
  - Verify that the `/profile` route does not surface any admin-only settings (party/flow scope assignments, role assignments, account activation/suspension) even as read-only fields.
  - Verify admin-only settings are accessible only through the `02`-backed `/settings/team` route.

### 6. Privilege-change notifications (design.md §6)
- [ ] **Task 21.14: Privilege-change notification display**
  - Wire the `14-notifications-and-alerts` in-app feed to surface privilege-change notifications (role change, party-scope change, activation/suspension) to the affected user.
  - Verify notification text does not reveal the administrator's identity or other users' data.
  - Depends on `14-notifications-and-alerts` implementation being available.
