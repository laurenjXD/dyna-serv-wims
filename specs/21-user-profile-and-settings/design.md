# User Profile & Settings — Design

Status: Draft

Cites foundational specs:
- `specs/00-steering/tech.md`
- `specs/00-steering/brand-design-system.md`
- `specs/02-rbac-roles/`

---

## 1. UI Architecture & Layout

### 1.1 Personal Profile (`/profile`)
The profile layout will utilize a centered, card-based interface focused on the individual user.

**Component Tree:**
```
[ Shell Layout ]
  └── <ProfileContainer>
       ├── <Tabs>
       │    ├── Tab: Account
       │    │    ├── <AvatarUpload>
       │    │    ├── <DisplayNameInput>
       │    │    └── <ContactNumberInput>
       │    ├── Tab: Security
       │    │    ├── <ChangePasswordForm>
       │    │    └── <ActiveSessionsList>
       │    └── Tab: Preferences
       │         ├── <DarkModeToggle>
       │         └── <DensityToggle> (Compact vs Standard padding)
```

### 1.2 Admin Settings Shell (`/settings`)
The settings area requires deeper navigation to manage the warehouse system. It will employ a secondary left-rail navigation pattern inside the main app shell.

**Visual Layout:**
```
[ Top App Header ]
---------------------------------------------------
[ Main Nav ] | [ Settings Nav   ] | [ Content Area               ]
[ Dashboard] |  - Team Members  |  <UserManagementGrid>
[ Inventory] |  - Security      |  (Data table of all users)
[ Settings ] |  - General       |
```

---

## 2. Interaction Design & Workflows

### 2.1 The "Invite User" Flow (Admin Only)
1. Admin clicks **"Invite User"** button in `/settings/team`.
2. A `<Modal>` opens featuring a multi-step or dynamic form.
3. **Step 1: Basics.** Admin enters Email Address and Display Name.
4. **Step 2: Role Assignment.** Admin selects Role from a `<Select>` dropdown (`Admin`, `Supervisor`, `Staff`, `Party Client`).
5. **Conditional UI:** If `Party Client` is selected, a new `<Select>` component fades in requiring the Admin to pick an active `party_id` (e.g., "UBoT").
6. **Submission:** Form is validated via Zod and triggers a Server Action which calls the Supabase Admin API to generate an invite.

### 2.2 Account Suspension Flow
1. Admin locates user in the `<UserManagementGrid>`.
2. Clicks the "ellipses" action menu.
3. Selects "Suspend User".
4. A `<ConfirmationDialog>` (Danger styled) appears requiring explicit confirmation.
5. Server action updates the user's `is_active` flag in the database and revokes their active Supabase sessions.

---

## 3. Database Interactions & Form Schemas

### 3.1 Zod Validation Schema (User Invite)
The frontend MUST validate the conditional logic for Party Clients before touching the server.

```typescript
import { z } from "zod";

export const inviteUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  displayName: z.string().min(2, "Name must be at least 2 characters"),
  role: z.enum(["admin", "supervisor", "warehouse_staff", "party_user"]),
  partyId: z.string().uuid().optional()
}).superRefine((data, ctx) => {
  if (data.role === "party_user" && !data.partyId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A Party Client must be assigned to a specific Party (Vendor/Customer).",
      path: ["partyId"]
    });
  }
});
```

### 3.2 Fetching Users for the Admin Grid
To populate the Settings data table, we will query the custom `users` profile table (assuming Supabase's `auth.users` syncs to a public/private `users` table via trigger, per standard architecture).

```typescript
// Drizzle concept for fetching user list
const teamMembers = await db.select({
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  role: users.systemRole,
  partyName: parties.name,
  lastSignIn: users.lastSignInAt,
  isActive: users.isActive
})
.from(users)
.leftJoin(parties, eq(users.partyId, parties.id))
.orderBy(users.displayName);
```
