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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: input.password,
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch {
    return { ok: false, error: "Unable to sign in right now. Please try again." };
  }
}
