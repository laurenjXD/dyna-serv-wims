import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (Client Components). Auth session is read
// from cookies via @supabase/ssr; never store the service-role key here.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "placeholder-anon-key";

  return createBrowserClient(url, key);
}
