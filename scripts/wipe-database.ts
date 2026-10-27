import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';
import { createServiceRoleClient } from '../lib/supabase/server';
import { db } from '../lib/db/client';
import { parties, partyRoles, userPartyScopes, userProfiles, userRoles, roles } from '../lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is missing in .env.local');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false });

const TABLES_TO_TRUNCATE = [
  // WRR & Inbound
  'wrr_item_unit_scans',
  'wrr_item_putaway_allocations',
  'wrr_items',
  'wrr_documents',
  'wrr_inspection_logs',
  'carton_status_history',

  // Outgoing, Commitments, Pick Lists
  'pick_list_items',
  'pick_lists',
  'inventory_commitment_lines',
  'inventory_commitments',

  // Inspection, Transfers, Approvals
  'inspection_evidence',
  'inspection_dispositions',
  'inspection_cases',
  'transfer_lines',
  'transfer_requests',
  'approval_decisions',
  'approval_requests',

  // Inventory, Units, Balances, Lots, Locations
  'inventory_units',
  'inventory_transactions',
  'lot_location_balances',
  'lots',
  'locations',

  // Items & Pricing
  'trading_invoice_lines',
  'trading_policies',
  'items',

  // Parties & Scopes
  'party_roles',
  'user_party_scopes',
  'parties',

  // VMI Billing, Contracts, Ledger
  'vmi_charge_lines',
  'vmi_daily_balance_ledger',
  'vmi_manpower_hours_log',
  'vmi_payments',
  'vmi_permits',
  'vmi_recurring_fee_lines',
  'vmi_billing_periods',
  'vmi_contract_terms',

  // Documents & Sequences & Notifications & Audit
  'document_events',
  'generated_documents',
  'document_number_sequences',
  'notifications',
  'audit_log',
  'rbac_security_events',
];

async function main() {
  console.log('--- Starting Operational Database Wipeout ---');

  console.log(`Truncating ${TABLES_TO_TRUNCATE.length} operational tables...`);
  const tableList = TABLES_TO_TRUNCATE.map((t) => `"${t}"`).join(', ');
  
  await sql.unsafe(`TRUNCATE TABLE ${tableList} CASCADE;`);
  console.log('Successfully truncated all operational tables.');

  // Clean Storage buckets via Supabase Admin Storage API
  try {
    const supabase = createServiceRoleClient();
    const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
    if (!bucketErr && buckets && buckets.length > 0) {
      for (const bucket of buckets) {
        const { data: files } = await supabase.storage.from(bucket.name).list('', { limit: 1000 });
        if (files && files.length > 0) {
          const filePaths = files.map((f) => f.name);
          await supabase.storage.from(bucket.name).remove(filePaths);
          console.log(`Cleaned ${filePaths.length} objects from storage bucket: ${bucket.name}`);
        } else {
          console.log(`Storage bucket "${bucket.name}" is already empty.`);
        }
      }
    }
  } catch (err: unknown) {
    console.log('Note on storage cleanup:', err instanceof Error ? err.message : err);
  }

  // Re-create baseline test vendor and party scope for party_user
  console.log('\n--- Rebuilding Baseline Seed for Dev Party ---');
  const [testParty] = await db
    .insert(parties)
    .values({
      code: 'DEV-VENDOR-01',
      name: 'Dev Test Vendor Co.',
      contactPerson: 'Dev Party Contact',
      email: 'dev-party@dynaserv.test',
      isActive: true,
    })
    .returning();
  console.log(`Created baseline test party: ${testParty.name} (${testParty.id})`);

  await db.insert(partyRoles).values({ partyId: testParty.id, role: 'supplier' });

  // Link party_user accounts to DEV-VENDOR-01
  const partyUsers = await db
    .select({ id: userProfiles.id, displayName: userProfiles.displayName })
    .from(userProfiles)
    .innerJoin(userRoles, eq(userRoles.userId, userProfiles.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.key, 'party_user'), isNull(userRoles.revokedAt)));

  for (const user of partyUsers) {
    await db.insert(userPartyScopes).values({
      userId: user.id,
      partyId: testParty.id,
      flowType: null,
      grantReason: 'Baseline seed after wipeout',
    });
    console.log(`Linked party user "${user.displayName}" (${user.id}) to ${testParty.name}`);
  }

  console.log('\n--- Preserved Table Summary ---');
  const preservedTables = [
    'roles',
    'permissions',
    'role_permissions',
    'user_profiles',
    'user_roles',
    'user_party_scopes',
    'parties',
    'party_roles',
    'item_categories',
    'forex_rates',
  ];

  for (const table of preservedTables) {
    const [{ count }] = await sql.unsafe(`SELECT COUNT(*) as count FROM "${table}"`);
    console.log(`- ${table}: ${count} rows`);
  }

  console.log('\nOperational database wipeout completed successfully!');
  await sql.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Error during wipeout:', err);
  await sql.end();
  process.exit(1);
});
