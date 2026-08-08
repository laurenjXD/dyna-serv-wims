# User Profile & Settings — Design

Status: Approved
Updated: 2026-08-05

Cites foundational specs:
- `specs/00-steering/tech.md`
- `specs/00-steering/brand-design-system.md`
- `specs/02-rbac-roles/`

---

## 1. UI Architecture & Layout

### 1.1 Personal Profile (`/profile`)
The profile layout is a centered, card-based interface focused on the individual user, built to **floor defaults** — see the amendment note below.

**Component Tree:**
```
[ Shell Layout ]
  └── <ProfileContainer>
       ├── Section: Account
       │    ├── <AvatarUpload>
       │    ├── <DisplayNameInput>
       │    └── <ContactNumberInput>
       ├── Section: Security
       │    ├── <ChangePasswordForm>
       │    └── <ActiveSessionsList>
       └── Section: Preferences
            ├── <DarkModeToggle>
            └── <DensityToggle> (Compact vs Standard padding)
```

**Amendment (2026-08-08):** `05-ui-shell-and-navigation` design.md §3.3 states that shared routes (reachable by any authenticated user, including floor staff — `/profile` is registered as `surface: "shared"` in `lib/shell/registry.ts`) use floor-first layout and touch targets by default, and may only use the `lg` sidebar/office enhancement if the feature spec explicitly declares that exception. This section did not declare such an exception. `design-system-auditor` flagged the original implementation (glassmorphism card, `<Tabs>` navigation, 44px touch targets, hover-only states, 14px text, `text-grey` body copy) as a real violation of that rule. Per Product Owner decision, `/profile` is rebuilt to floor defaults: solid `surface-white` Level-2 cards (no `backdrop-blur`), stacked full-page sections instead of `<Tabs>` (tabs/side-by-side panels are named explicitly as an office-only pattern in `brand-design-system.md` §3), 56px minimum touch targets (`brand-design-system.md` §3), `active:` press feedback instead of `hover:` (§9), `on-surface` body text (§1.2), and no text below 16px (§2). The three logical groupings (Account/Security/Preferences) are preserved as clearly separated `<section>`s on one continuous scrollable page rather than as sequential full screens — the content within each section was judged not dense enough to require screen-by-screen sequencing. `/settings` (§1.2 below) is unaffected — it remains office-first, since `02-rbac-roles`/admin routes are not floor-reachable surfaces.

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

---

## 4. Identity, authorization, and session boundaries

This section reconciles `21`'s surfaces with the final `02-rbac-roles` model and `04-services-and-infrastructure` identity boundary. Where `21` and `02` touch the same concern, `02` owns the authority and `21` owns the UI presentation.

### 4.1 Profile record

The authoritative profile record is `user_profiles` from `02-rbac-roles` (§4.1 of that design), linked to `auth.users.id`. The `21` profile UI reads from and writes to this table through controlled server commands — it does not maintain a separate profile table. The `users` query in §3.2 above must be reconciled at implementation time to join `auth.users` ↔ `user_profiles` ↔ `user_roles` as defined by `02`, not a flat application-owned `users` table.

### 4.2 Invitation

Invitation is initiated by an administrator through the `02`-owned invitation flow (`02` §8.1). The `21` module owns the **accepting side**: the UI that an invited user lands on to set their initial display name and preferences, confirm their password, and complete any required MFA enrollment. The initial role and scope assignments are captured on the `02` side before the invitation is sent; `21` does not allow the invited user to change their assigned role during the acceptance flow.

### 4.3 Activation and suspension

The activation/suspension state (`user_profiles.status` ∈ `invited`, `active`, `inactive`, per `02` §4.1) is owned entirely by `02`. The `21` profile settings surface cannot change it — only the administrator RBAC screen (`02` §8.2 and §8.4) can activate or deactivate a user.

When a user is suspended (deactivated), the `21` module shows a read-only inactive-state view to any user who still holds a session during the brief window between session revocation and client redirect. `21` cannot offer a self-service re-activation path.

### 4.4 MFA

Supabase Auth owns MFA enrollment, TOTP/WebAuthn device state, and any enforced-MFA policy. The `21` Security tab provides the UI entry point that **routes** the user into Supabase Auth's MFA setup flow (via `supabase.auth.mfa.*` client calls). `21` does not store MFA state or device records. If the administrator has configured MFA as required (a policy managed in `04`/Supabase Auth project settings), the disable control is hidden or disabled — the user cannot turn off MFA from the `21` UI.

### 4.5 Session display

`04`'s Supabase SSR session pattern governs all token lifecycle. The `21` Security tab may display read-only session information (last sign-in time, active-sessions list from Supabase Auth metadata) as a user-facing convenience. It cannot extend session expiry, mint new tokens, or revoke sessions on behalf of other devices. Session revocation following a password change follows the `02` §8.4 session-revocation pattern, triggered through a controlled server action, not a direct Supabase client call from the browser.

---

## 5. Settings scope

The table below is authoritative for which settings the `/profile` route surfaces and which are admin-only. Settings marked "Admin only" are managed exclusively through the `02`-backed `/settings/team` and related admin routes. The `/profile` route MUST NOT surface admin-only settings even as read-only display fields.

| Setting | Scope | Who can change |
|---|---|---|
| Display name | Global (per user) | User self |
| Email notification preferences | Global | User self (mandatory categories locked by admin policy) |
| Language/locale | Global | User self |
| Timezone display | Global (Asia/Manila default) | User self |
| Party/flow scope assignments | Party-scoped | Admin only (via `02` RBAC screen) |
| Role assignments | Global | Admin only |
| Account activation/suspension | Global | Admin only |
| MFA enrollment | Global | User self (cannot disable if admin-required) |
| Password change | Global | User self |

---

## 6. Security events and privilege-change notifications

When an administrator changes a user's roles, party scope, or activation status, two things happen atomically:

1. An `rbac_security_events` record is appended per `02` §4.7, with the event type, actor, target, and reason.
2. A `14-notifications-and-alerts` in-app notification is delivered to the affected user stating what changed.

The notification text must not reveal other users' data or the administrator's identity. Acceptable phrasing examples: "Your account access has been updated." or "Your role assignments have changed." The notification does not name the administrator or list other affected users.

For suspension/deactivation specifically, the user's active session is revoked per `02`'s revocation-on-deactivation rule (§8.4) in the same server transaction that marks the profile inactive. The in-app notification in this case may not be delivered if the session is already revoked before the client polls — this is acceptable behavior and does not constitute a notification failure.
