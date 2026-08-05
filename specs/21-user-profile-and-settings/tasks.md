# User Profile & Settings — Tasks

Status: Draft

Sign-off:
- [ ] Technical Lead Sign-off
- [ ] Product/Operations Lead Sign-off

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
