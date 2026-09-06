import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkTables() {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false });
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;
  console.log(`Total public tables in live Supabase: ${tables.length}`);
  console.log(tables.map(t => t.table_name).join(', '));
  await sql.end();
}

checkTables();
