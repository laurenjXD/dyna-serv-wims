# Invitation Link Onboarding Implementation Plan

## Objective

When an administrator invites a user, the user receives an email invitation. Clicking the invitation must establish a temporary authenticated session and send the user directly to the onboarding page to set a password and complete account setup.

## Target User Flow

1. Administrator opens **Settings → Team**.
2. Administrator enters the user’s email, display name, role, and organization scope when required.
3. The system validates the invitation details.
4. Supabase sends the invitation email.
5. The user clicks **Accept invitation**.
6. The server processes the invitation token and creates the session.
7. The user is redirected to `/accept-invite`.
8. The user sets a password and confirms their details.
9. The system activates the account and redirects the user to the correct landing page for their role.

## Phase 1 — Invitation Creation

- Validate the email, display name, role, and organization assignment with the invitation schema.
- Confirm that the selected role exists and is active before sending the email.
- Confirm that the required server configuration exists:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL_RUNTIME`, `DATABASE_URL`, or `POSTGRES_URL`
  - `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_SITE_URL`
- Build the callback URL as:

  ```text
  https://your-domain.com/auth/callback?next=/accept-invite
  ```

- Call Supabase Admin Auth to send the invitation email.
- Create the local `user_profiles` row with status `invited`.
- Assign the selected role in `user_roles`.
- Assign the organization scope in `user_party_scopes` when required.
- Write the invitation event to `audit_log`.
- If local persistence fails after Supabase creates the user, remove the orphaned Supabase user and return an actionable error.

## Phase 2 — Supabase Email Configuration

Configure Supabase Auth with:

- Site URL:

  ```text
  https://your-domain.com
  ```

- Allowed redirect URL:

  ```text
  https://your-domain.com/auth/callback
  ```

- An enabled email provider or SMTP sender.
- An invitation email template that uses:

  ```text
  {{ .ConfirmationURL }}
  ```

The template must not send users directly to `/login`.

## Phase 3 — Callback Processing

Use `/auth/callback` as the single server-side invitation callback.

The callback must support:

- PKCE `code` parameters.
- `token_hash&type=invite` parameters.
- Legacy hash-token invitation links.

Processing steps:

1. Read the invitation token from the request.
2. Exchange the PKCE code or verify the OTP server-side.
3. Write the authenticated session cookie.
4. Allow only internal redirect paths.
5. Redirect valid invitations to `/accept-invite`.

Invalid or expired links must redirect to an invitation-specific error state with a message explaining that the administrator must resend the invitation.

## Phase 4 — Onboarding Page

The `/accept-invite` page must:

- Remain outside the authenticated application shell.
- Display a loading state while the invitation session is processed.
- Read the invited user’s pre-assigned display name from metadata.
- Collect:
  - Full name
  - Phone number
  - New password
  - Password confirmation
- Prevent changes to the assigned role or organization.
- Show a clear error when no valid invitation session exists.
- Avoid sending valid invitation users back to the normal sign-in form.

## Phase 5 — Account Activation

When onboarding is submitted:

1. Validate the form input with Zod.
2. Read the current authenticated Supabase user server-side.
3. Confirm that the user owns the matching `user_profiles` row.
4. Confirm the profile status is exactly `invited`.
5. Set the password using Supabase Auth.
6. Save the display name and phone number.
7. Change the profile status from `invited` to `active`.
8. Record activation and onboarding audit events.
9. Redirect the user to the role-appropriate landing page.

If the invitation is already used, inactive, or missing, reject the request without changing the account.

## Phase 6 — Resend and Cancellation

- Allow resend only for profiles with status `invited`.
- Generate a new invitation token through Supabase.
- Preserve the existing role and organization scope.
- Record an `invite_resent` audit event.
- Prevent duplicate local profiles.
- Allow administrators to cancel pending invitations.
- Remove the pending profile, role assignment, organization scope, and Supabase user when cancellation succeeds.

## Testing Plan

### Unit Tests

- Accept valid invitation input.
- Reject invalid email addresses.
- Reject missing organization assignment for `party_user`.
- Reject inactive or missing roles.
- Normalize callback URLs.
- Process PKCE invitation codes.
- Process `token_hash&type=invite` links.
- Reject expired or invalid tokens.
- Reject already-used invitations.
- Validate password confirmation.
- Activate a valid invited profile.

### Integration Tests

- Create a Supabase invitation and local invited profile.
- Assign the requested role and organization scope.
- Process the callback and create the SSR session.
- Redirect the user to `/accept-invite`.
- Complete password setup.
- Change the profile from `invited` to `active`.
- Create the required audit events.
- Remove orphaned records when setup fails.
- Resend an invitation without creating duplicate records.

### End-to-End Test

1. Sign in as an administrator.
2. Invite a new user.
3. Open the invitation email.
4. Click **Accept invitation**.
5. Confirm that the onboarding page opens instead of the sign-in page.
6. Set a password and submit the form.
7. Confirm redirect to the correct role landing page.
8. Sign out and sign in again with the new password.
9. Confirm the invitation link cannot be reused.

## Required Environment Configuration

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL_RUNTIME or DATABASE_URL or POSTGRES_URL
NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL
```

Supabase migrations must be applied before testing the complete flow.

## Acceptance Criteria

- A valid invitation link never stops at the normal sign-in form.
- A valid invitation always reaches `/accept-invite`.
- The user can set a password and complete onboarding.
- The account changes from `invited` to `active`.
- The assigned role and organization scope remain unchanged.
- Expired and reused links show clear errors.
- Resend invitation works.
- Duplicate profiles and orphaned Supabase users are prevented.
- Unit, integration, and end-to-end tests pass.
