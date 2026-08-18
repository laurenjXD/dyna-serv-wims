"use server";

// Server Actions backing `/profile` — specs/21-user-profile-and-settings.
//
// Traceability:
// - design.md §4.1 ("The authoritative profile record is `user_profiles`
//   from `02-rbac-roles`... The `21` profile UI reads from and writes to
//   this table through controlled server commands — it does not maintain a
//   separate profile table").
// - design.md §4.5 ("Session revocation following a password change follows
//   the `02` §8.4 session-revocation pattern, triggered through a
//   controlled server action, not a direct Supabase client call from the
//   browser") — this is why `changePassword` below runs server-side against
//   the server Supabase client (cookie-scoped session), not a
//   `lib/supabase/client.ts` browser call.
// - tasks.md Task 21.2 ("Create <DisplayNameInput> and connect it to a
//   Server Action to update the users table") and Task 21.3
//   ("Implement a <ChangePasswordForm> utilizing Supabase Auth's updateUser
//   API for credential changes").
//
// KNOWN SEAM GAPS (flag for integration-reviewer, same pattern as
// app/(authenticated)/actions.ts's documented gap):
// 1. `user_profiles` (lib/db/schema/rbac.ts, per 02 design.md §4.1) has no
//    `contactNumber`/email column — only `id`, `displayName`, `status`, and
//    lifecycle/attribution fields. `updateContactNumber` is intentionally
//    NOT implemented here; `AccountTab`'s contact-number field renders
//    read-only/disabled until `02` amends its schema to add a backing
//    column (21 does not own `01`/`02`'s schema and must not redefine it
//    inline per structure.md).
// 2. Email is read-only per requirements.md FR-1.2 ("Email addresses SHALL
//    remain read-only unless an explicit email change verification flow is
//    triggered") — no email-change flow is built here; out of scope for v1.
// 3. "Revoke all other active sessions" after a password change is not
//    independently implemented — Supabase Auth's own password-update
//    behavior already invalidates other refresh tokens for the user by
//    default; a custom multi-session revocation call would need the
//    Admin API (service-role) equivalent of `02` §8.4's session-revocation
//    step, which is not wired here.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { createClient } from "@/lib/supabase/server";
import { displayNameSchema, changePasswordSchema } from "@/lib/user-settings/schemas";

export interface OwnProfile {
  id: string;
  email: string | null;
  displayName: string;
  status: string;
  lastSignInAt: string | null;
}

export async function getOwnProfile(): Promise<OwnProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const [profile] = await db
    .select({
      id: userProfiles.id,
      displayName: userProfiles.displayName,
      status: userProfiles.status,
    })
    .from(userProfiles)
    .where(eq(userProfiles.id, data.user.id))
    .limit(1);

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    displayName: profile?.displayName ?? "",
    status: profile?.status ?? "invited",
    lastSignInAt: data.user.last_sign_in_at ?? null,
  };
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateDisplayName(input: { displayName: string }): Promise<ActionResult> {
  const parsed = displayNameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid display name" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, error: "Not authenticated" };
  }

  const rlsResult = await withRlsTransaction(
    { getAuthenticatedSession, pool: rlsPool },
    async (tx) => {
      const rlsDb = tx.db as typeof db;
      const [updated] = await rlsDb
        .update(userProfiles)
        .set({ displayName: parsed.data.displayName, updatedAt: new Date() })
        .where(eq(userProfiles.id, data.user.id))
        .returning({ id: userProfiles.id });

      return updated ?? null;
    },
  );

  if (rlsResult.kind === "unauthenticated" || rlsResult.value === null) {
    return { ok: false, error: "Unable to save your display name." };
  }

  revalidatePath("/profile");
  return { ok: true };
}

export async function changePassword(input: {
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid password" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
