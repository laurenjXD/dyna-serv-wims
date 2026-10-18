import "dotenv/config";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

if (process.env.ALLOW_TEST_INVITE_SETUP !== "1") {
  throw new Error("Refusing to modify Auth/database. Set ALLOW_TEST_INVITE_SETUP=1 explicitly for a test environment.");
}

const email = process.env.TEST_INVITE_EMAIL;
const password = process.env.TEST_INVITE_PASSWORD;
const displayName = process.env.TEST_INVITE_NAME ?? "Onboarding Test Operator";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL_RUNTIME ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!email || !password || !supabaseUrl || !serviceKey || !databaseUrl) {
  throw new Error("Set TEST_INVITE_EMAIL, TEST_INVITE_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL_RUNTIME/DATABASE_URL.");
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const sql = postgres(databaseUrl, {
  prepare: false,
  connect_timeout: 5,
  ssl: databaseUrl.includes("supabase") ? "require" : undefined,
});

try {
  const { data: users, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;

  let user = users.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { ...user.user_metadata, displayName },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { displayName },
    });
    if (error || !data.user) throw error ?? new Error("Supabase did not return the created test user.");
    user = data.user;
  }

  const [role] = await sql`select id from public.roles where key = 'warehouse_staff' and is_active = true limit 1`;
  if (!role) throw new Error("warehouse_staff role is missing. Run the database migrations first.");

  await sql.begin(async (transaction) => {
    await transaction`
      insert into public.user_profiles (id, display_name, status, updated_at)
      values (${user.id}, ${displayName}, 'invited', now())
      on conflict (id) do update set display_name = excluded.display_name, status = 'invited', updated_at = now()
    `;
    await transaction`
      insert into public.user_roles (user_id, role_id)
      values (${user.id}, ${role.id})
      on conflict (user_id, role_id) where revoked_at is null do nothing
    `;
  });

  console.log(`Test onboarding user ready: ${email}`);
  console.log("Sign in with the configured password, then open /accept-invite.");
  console.log("For visual-only preview, open /accept-invite?preview=1 in development.");
} finally {
  await sql.end({ timeout: 2 });
}
