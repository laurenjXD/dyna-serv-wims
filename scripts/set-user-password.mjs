import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function setPassword(userId, email, newPassword) {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      password: newPassword,
      email_confirm: true,
    }),
  });

  const data = await res.json();
  if (res.ok) {
    console.log(`[PASSWORD UPDATED] ${email} -> "${newPassword}"`);
  } else {
    console.error(`[ERROR] Failed to update ${email}:`, data);
  }
}

async function main() {
  const users = [
    { id: '1ae54a1a-230e-40ba-8b6f-2e474985bfa2', email: 'dev-admin@dynaserv.test' },
    { id: 'a03a0722-a321-42ac-8ee4-7abfba4349a6', email: 'admin@dyna-serv.com' },
    { id: '3f3b7ccd-9250-47be-9605-d5427633c17b', email: 'dev-supervisor@dynaserv.test' },
    { id: 'a9d40a8a-e045-4045-97aa-51983763adb6', email: 'dev-floor@dynaserv.test' },
    { id: '1aae5cb2-31ba-4aaf-90ec-81c2d91dd233', email: 'dev-party@dynaserv.test' },
  ];

  for (const u of users) {
    await setPassword(u.id, u.email, 'Admin1234!');
  }
}

main();
