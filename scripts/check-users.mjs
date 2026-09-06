import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkUsers() {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false });
  console.log('--- AUTH USERS in Supabase (auth.users) ---');
  const authUsers = await sql`SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC LIMIT 10`;
  console.table(authUsers);

  console.log('--- USER PROFILES in Dyna-Serv WIMS (public.user_profiles) ---');
  const profiles = await sql`
    SELECT p.id, p.display_name, p.status, r.key as role_key
    FROM public.user_profiles p
    LEFT JOIN public.user_roles ur ON p.id = ur.user_id AND ur.revoked_at IS NULL
    LEFT JOIN public.roles r ON ur.role_id = r.id
    ORDER BY p.created_at DESC 
    LIMIT 10
  `;
  console.table(profiles);
  await sql.end();
}

checkUsers();
