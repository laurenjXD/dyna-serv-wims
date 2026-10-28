"use server";

import { createClient } from "@/lib/supabase/server";

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim();

  if (!email || !input.password) {
    return { ok: false, error: "Enter your email and password." };
  }

  try {
    // The server client writes the Supabase SSR session cookies onto the
    // Server Action response. This makes the session immediately available
    // to middleware and authenticated Server Components after navigation.
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: input.password,
    });

    if (error) return { ok: false, error: error.message };

    // Recovery for accounts saved by the old profile form. A base64 avatar
    // in user_metadata is copied into the JWT and can make the first
    // post-login request exceed Vercel's request-header limit. Clear only
    // that field immediately; the new profile flow stores images in Storage.
    if (typeof data.user?.user_metadata?.avatar_url === "string" &&
        data.user.user_metadata.avatar_url.startsWith("data:")) {
      const { error: cleanupError } = await supabase.auth.updateUser({
        data: { avatar_url: null },
      });
      if (cleanupError) {
        await supabase.auth.signOut();
        return { ok: false, error: "Your old profile picture must be removed before signing in. Please try again." };
      }
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Unable to sign in right now. Please try again." };
  }
}
