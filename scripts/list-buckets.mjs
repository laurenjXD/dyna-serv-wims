import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkBuckets() {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false });
  const rows = await sql`SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id`;
  console.log('LIVE STORAGE BUCKETS IN SUPABASE:');
  console.table(rows);
  await sql.end();
}

checkBuckets();
