import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (Client Components). Auth session is read
// from cookies via @supabase/ssr; never store the service-role key here.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Vercel's Supabase integration exports the current publishable-key
    // name. Keep the legacy anon-key fallback so existing local projects
    // continue to work during migration.
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
