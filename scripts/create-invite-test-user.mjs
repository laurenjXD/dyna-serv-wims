import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Prefer the local developer environment, then fall back to .env. The
// command-line variables below intentionally override either file.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

if (process.env.ALLOW_TEST_INVITE_SETUP !== "1") {
  throw new Error("Refusing to modify Auth/database. Set ALLOW_TEST_INVITE_SETUP=1 explicitly for a test environment.");
}

const email = process.env.TEST_INVITE_EMAIL;
const password = process.env.TEST_INVITE_PASSWORD;
const displayName = process.env.TEST_INVITE_NAME ?? "Onboarding Test Operator";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !password || !supabaseUrl || !serviceKey) {
  throw new Error("Set TEST_INVITE_EMAIL, TEST_INVITE_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

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

const { data: role, error: roleError } = await admin
  .from("roles")
  .select("id")
  .eq("key", "warehouse_staff")
  .eq("is_active", true)
  .maybeSingle();
if (roleError || !role) throw roleError ?? new Error("warehouse_staff role is missing. Run the database migrations first.");

const { error: profileError } = await admin.from("user_profiles").upsert({
    id: user.id,
    display_name: displayName,
    status: "invited",
    updated_at: new Date().toISOString(),
  });
if (profileError) throw profileError;

const { data: existingRole, error: existingRoleError } = await admin
  .from("user_roles")
  .select("id")
  .eq("user_id", user.id)
  .eq("role_id", role.id)
  .is("revoked_at", null)
  .maybeSingle();
if (existingRoleError) throw existingRoleError;
if (!existingRole) {
  const { error: roleInsertError } = await admin.from("user_roles").insert({
    user_id: user.id,
    role_id: role.id,
  });
  if (roleInsertError) throw roleInsertError;
}

console.log(`Test onboarding user ready: ${email}`);
console.log("Sign in with the configured password, then open /accept-invite.");
console.log("For visual-only preview, open /accept-invite?preview=1 in development.");
