import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function testLogin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.log(`[LOGIN FAILED] ${email} with password "${password}": ${error.message}`);
    return false;
  }
  console.log(`>>> [LOGIN SUCCESS!] Email: ${email}, Password: "${password}"`);
  return true;
}

async function main() {
  const passwordsToTry = ['password', 'password123', 'Password123!', 'admin', 'admin123', 'mastruepasatrue', 'dynaserv', 'dynaserv123', '123456', '12345678'];
  console.log('Testing dev-admin@dynaserv.test...');
  for (const pw of passwordsToTry) {
    const ok = await testLogin('dev-admin@dynaserv.test', pw);
    if (ok) return;
  }
  console.log('Testing admin@dyna-serv.com...');
  for (const pw of passwordsToTry) {
    const ok = await testLogin('admin@dyna-serv.com', pw);
    if (ok) return;
  }
}

main();
