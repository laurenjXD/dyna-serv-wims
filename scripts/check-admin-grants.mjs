import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkAdminGrants() {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false });

  const adminEmail = 'admin@dyna-serv.com';
  console.log(`--- Checking user & roles for: ${adminEmail} ---`);
  
  const user = await sql`
    SELECT u.id, u.email, p.status as profile_status
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON u.id = p.id
    WHERE u.email = ${adminEmail}
  `;
  console.table(user);

  if (user.length === 0) {
    console.error('User not found!');
    await sql.end();
    return;
  }

  const userId = user[0].id;

  const userRoles = await sql`
    SELECT ur.user_id, ur.role_id, r.key as role_key, r.is_active as role_is_active, ur.revoked_at, ur.valid_from, ur.valid_until
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = ${userId}
  `;
  console.log('--- User Roles ---');
  console.table(userRoles);

  const permissions = await sql`
    SELECT p.resource, p.action, p.is_active as perm_active, rp.scope_kind
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = ${userId}
      AND ur.revoked_at IS NULL
    ORDER BY p.resource, p.action
  `;
  console.log(`--- Granted Permissions (Total: ${permissions.length}) ---`);
  console.table(permissions);

  await sql.end();
}

checkAdminGrants();
