import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Server-side Supabase client (Server Components, Server Actions, Route
// Handlers). RBAC/session role resolution always happens against this
// client's session — never from a client-supplied parameter (tech.md).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component with no request/response
            // context to write to — safe to ignore when middleware also
            // refreshes the session (see lib/supabase/middleware.ts).
          }
        },
      },
    },
  );
}

// Service-role client for trusted server-only paths (e.g. audit_log writes,
// admin operations) that must bypass RLS deliberately. Never imported into
// any Client Component or exposed to the browser bundle.
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
