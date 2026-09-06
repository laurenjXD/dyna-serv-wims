import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function runMigration(filePath) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set in .env.local');
    process.exit(1);
  }

  console.log(`Applying migration: ${path.basename(filePath)}...`);
  const sqlContent = fs.readFileSync(filePath, 'utf-8');
  
  const sql = postgres(connectionString, { prepare: false, connect_timeout: 10 });
  try {
    await sql.unsafe(sqlContent);
    console.log(`[SUCCESS] Migration ${path.basename(filePath)} applied successfully!`);
    await sql.end();
  } catch (err) {
    console.error(`[ERROR] Migration failed:`, err);
    await sql.end();
    process.exit(1);
  }
}

const targetMigration = process.argv[2] || 'supabase/migrations/0046_storage_buckets_and_policies.sql';
runMigration(targetMigration);
