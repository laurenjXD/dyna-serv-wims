import postgres from 'postgres';

async function testConnection(name, url) {
  console.log(`Testing ${name}...`);
  try {
    const sql = postgres(url, { connect_timeout: 5, idle_timeout: 5 });
    const result = await sql`SELECT 1 as res`;
    console.log(`[SUCCESS] ${name}:`, result);
    await sql.end();
    return true;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message || err);
    return false;
  }
}

async function main() {
  await testConnection('Port 6543 (Current in .env.local)', 'postgresql://postgres.umyvanbqxwoebvgcxjep:mastruepasatrue@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres');
  await testConnection('Port 5432 (Pooler Session)', 'postgresql://postgres.umyvanbqxwoebvgcxjep:mastruepasatrue@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres');
  await testConnection('Direct Host 5432', 'postgresql://postgres:mastruepasatrue@db.umyvanbqxwoebvgcxjep.supabase.co:5432/postgres');
}

main();
