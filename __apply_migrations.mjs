import postgres from "postgres";
import { readFileSync } from "fs";
const envText = readFileSync(".env.local", "utf8");
const url = envText.match(/DATABASE_URL="([^"]+)"/)[1];
const sql = postgres(url, { ssl: "require", connect_timeout: 20 });

const files = [
  "0033_trading_pricing.sql",
  "0034_vmi_billing_tables.sql",
  "0035_items_vmi_movement_category.sql",
  "0038_trading_pricing_rbac_capabilities.sql",
  "0039_trading_pricing_rls_policies.sql",
  "0040_vmi_manpower_hours_log.sql",
];

for (const f of files) {
  const path = `supabase/migrations/${f}`;
  const text = readFileSync(path, "utf8");
  console.log(`\n=== Applying ${f} ===`);
  try {
    await sql.unsafe(text);
    console.log(`OK: ${f}`);
  } catch (e) {
    console.error(`FAILED: ${f}:`, e.message);
    break;
  }
}
await sql.end();
