import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './lib/db/schema/index.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  console.log('Connecting to:', connectionString?.split('@')[1]);
  const client = postgres(connectionString, {
    prepare: false,
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });
  const start = Date.now();
  const rows = await db.select().from(schema.userProfiles).limit(5);
  console.log(`Query succeeded in ${Date.now() - start}ms:`, rows);
  await client.end();
}

main().catch(console.error);
