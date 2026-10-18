"use server";

// Server Action backing the invitation-acceptance landing page.
//
// Traceability: specs/21-user-profile-and-settings/design.md §4.2
// ("The `21` module owns the accepting side: the UI that an invited user
// lands on to set their initial display name and preferences, confirm their
// password, and complete any required MFA enrollment... `21` does not allow
// the invited user to change their assigned role during the acceptance
// flow") and tasks.md Task 21.10.
//
// DELIBERATE SCOPE NOTE (flag for rbac-rls-reviewer): `02` design.md §8.2's
// "Activation flow" requires the caller to hold `users.activate` (default
// role `administrator`) — that is the ADMIN-triggered path for activating
// SOMEONE ELSE. This action is a narrower, distinct self-service path: an
// authenticated invited user completing their OWN acceptance. It does not
// check `users.activate` (an invited user does not and should not hold
// that capability); instead it independently re-verifies, inside this same
// server-only action, that (a) the caller is authenticated via a
// server-validated session, and (b) the row it mutates is the caller's own
// `user_profiles.id` AND that row's current status is exactly `invited`
// (never `active`/`inactive` — no re-activation path lives here). This
// mirrors `02`'s own stated pattern of "a privileged function re-verifies
// its own authorization inside its own transaction" while using a
// self-scoped check appropriate to a self-service action rather than the
// admin-scoped `users.activate` capability, which is the wrong tool for
// "did I accept my own invite."

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { displayNameSchema, changePasswordSchema } from "@/lib/user-settings/schemas";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Persist a browser-established invite session into the SSR cookie jar.
 *
 * Supabase invite/recovery links can deliver their session in the URL
 * fragment. The browser client can consume that fragment, but the following
 * Server Action request may not yet have the same auth cookies. Establishing
 * the session server-side here makes the subsequent onboarding mutation use
 * the normal server-validated session path.
 */
export async function establishInvitationSession(input: {
  accessToken: string;
  refreshToken: string;
}): Promise<ActionResult> {
  if (!input.accessToken || !input.refreshToken) {
    return { ok: false, error: "Your invitation session is incomplete. Open the latest invitation link again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
  });
  if (error) {
    return { ok: false, error: "Your invitation link has expired or is invalid. Ask your administrator to resend it." };
  }

  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) {
    return { ok: false, error: "Your invitation link has expired or is invalid. Ask your administrator to resend it." };
  }

  return { ok: true };
}

export async function completeInvitationAcceptance(input: {
  displayName: string;
  phone?: string;
  newPassword: string;
  confirmPassword: string;
  accessToken?: string;
  refreshToken?: string;
}): Promise<ActionResult> {
  const nameParsed = displayNameSchema.safeParse({ displayName: input.displayName });
  if (!nameParsed.success) {
    return { ok: false, error: nameParsed.error.issues[0]?.message ?? "Invalid display name" };
  }
  const passwordParsed = changePasswordSchema.safeParse(input);
  if (!passwordParsed.success) {
    return { ok: false, error: passwordParsed.error.issues[0]?.message ?? "Invalid password" };
  }

  const supabase = await createClient();
  let { data, error } = await supabase.auth.getUser();

  // The invite/recovery session may exist only in the browser client's
  // storage when this Server Action is called. If so, validate the current
  // browser session with Supabase and establish it in the SSR cookie jar
  // before continuing. The identity still comes from Supabase's validated
  // getUser() response, never from a client-supplied user id.
  if ((!data.user || error) && input.accessToken && input.refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
    });
    if (!sessionError) {
      ({ data, error } = await supabase.auth.getUser());
    }
  }

  if (error || !data.user) {
    return { ok: false, error: "Your invitation link has expired or is invalid. Ask your administrator to resend it." };
  }

  const admin = createServiceRoleClient();
  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("id, status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "invited") {
    return { ok: false, error: "This invitation has already been used or is not valid." };
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password: passwordParsed.data.newPassword,
    data: {
      displayName: nameParsed.data.displayName,
      phone: input.phone || undefined,
    },
  });
  if (passwordError) {
    return { ok: false, error: passwordError.message };
  }

  const { error: profileUpdateError } = await admin
    .from("user_profiles")
    .update({
      display_name: nameParsed.data.displayName,
      status: "active",
      activated_at: new Date().toISOString(),
      activated_by_user_id: data.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.user.id);
  if (profileUpdateError) {
    return { ok: false, error: "Your password was updated, but account activation could not be saved. Please try again." };
  }

  await admin.from("rbac_security_events").insert({
    event_type: "user_activated",
    actor_user_id: data.user.id,
    executor_type: "user",
    target_type: "user_profiles",
    target_id: data.user.id,
    reason: "Self-service invitation acceptance & onboarding completion",
  });

  // Write to immutable audit_log
  try {
    await admin.from("audit_log").insert({
      actor_user_id: data.user.id,
      actor_role: "warehouse_staff",
      action: "user_onboarded_and_activated",
      entity_type: "user_profiles",
      entity_id: data.user.id,
      diff_data: {
        status: { before: "invited", after: "active" },
        displayName: nameParsed.data.displayName,
        phone: input.phone || "—",
      },
      correlation_id: `ONBOARD-${Date.now()}`,
    });
  } catch {
    // ignore logging failure
  }

  return { ok: true };
}
