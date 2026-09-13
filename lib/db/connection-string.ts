/**
 * Vercel functions must use Supabase's transaction pooler. Session pooling
 * dedicates one of the project's limited database clients to every warm
 * serverless instance and eventually fails with EMAXCONNSESSION.
 *
 * Replace only the well-known Supabase pooler port in the original string so
 * encoded passwords and project-qualified usernames remain byte-for-byte
 * untouched.
 */
export function normalizeDatabaseConnectionString(
  connectionString: string,
  isServerless: boolean,
): string {
  if (!isServerless) return connectionString;
  return connectionString.replace(
    /(\.pooler\.supabase\.com):5432(?=\/|\?|$)/,
    "$1:6543",
  );
}
