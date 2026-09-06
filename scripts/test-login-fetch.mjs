import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function testPassword(email, password) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (res.ok) {
    console.log(`>>> [SUCCESS!] Email: ${email} | Password: "${password}"`);
    return true;
  } else {
    console.log(`[FAILED] ${email} with "${password}": ${data.error_description || data.msg || data.message}`);
    return false;
  }
}

async function main() {
  const passwords = [
    'password',
    'password123',
    'Password123!',
    'admin',
    'admin123',
    'Admin123!',
    'mastruepasatrue',
    'dynaserv',
    'dynaserv123',
    'DynaServ123!',
    '123456',
    '12345678',
  ];

  console.log('Testing dev-admin@dynaserv.test...');
  for (const pw of passwords) {
    if (await testPassword('dev-admin@dynaserv.test', pw)) return;
  }

  console.log('\nTesting admin@dyna-serv.com...');
  for (const pw of passwords) {
    if (await testPassword('admin@dyna-serv.com', pw)) return;
  }
}

main();
