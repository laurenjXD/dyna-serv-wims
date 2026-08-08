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

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles, rbacSecurityEvents } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { displayNameSchema, changePasswordSchema } from "@/lib/user-settings/schemas";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function completeInvitationAcceptance(input: {
  displayName: string;
  newPassword: string;
  confirmPassword: string;
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
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, error: "Your invitation link has expired. Ask an administrator to resend it." };
  }

  const [profile] = await db
    .select({ id: userProfiles.id, status: userProfiles.status })
    .from(userProfiles)
    .where(eq(userProfiles.id, data.user.id))
    .limit(1);

  if (!profile || profile.status !== "invited") {
    return { ok: false, error: "This invitation has already been used or is not valid." };
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password: passwordParsed.data.newPassword,
  });
  if (passwordError) {
    return { ok: false, error: passwordError.message };
  }

  await db
    .update(userProfiles)
    .set({
      displayName: nameParsed.data.displayName,
      status: "active",
      activatedAt: new Date(),
      activatedByUserId: data.user.id,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.id, data.user.id));

  await db.insert(rbacSecurityEvents).values({
    eventType: "user_activated",
    actorUserId: data.user.id,
    executorType: "user",
    targetType: "user_profiles",
    targetId: data.user.id,
    reason: "Self-service invitation acceptance",
  });

  return { ok: true };
}
