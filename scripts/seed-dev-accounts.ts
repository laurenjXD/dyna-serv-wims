// One-time dev seed: creates one Supabase Auth user + user_profiles row +
// role assignment per system role (administrator, supervisor,
// warehouse_staff, party_user), so the app can actually be logged into and
// clicked through in this environment. There is no other seed/bootstrap
// mechanism in this repo (package.json has no db:seed script, and
// supabase/migrations/0005_rbac_constraints_and_seed.sql seeds only the RBAC
// *catalog* — roles/permissions/role_permissions — never any user row).
//
// Not part of the app runtime — run manually via `npx tsx scripts/seed-dev-accounts.ts`.
// Safe to re-run: each step checks for an existing row/user by email or
// unique key before inserting, so re-running just reports what already
// exists rather than erroring or duplicating rows.
//
// Uses the service-role Supabase client (lib/supabase/server.ts) to call
// the Auth admin API directly — this script is meant to run from a trusted
// local/dev machine only, never in a request path.

import { createServiceRoleClient } from "../lib/supabase/server";
import { db } from "../lib/db/client";
import { userProfiles, userRoles, roles, parties, partyRoles, userPartyScopes } from "../lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const DEV_PASSWORD = "DynaServDev2026!";

const ACCOUNTS: Array<{
  roleKey: "administrator" | "supervisor" | "warehouse_staff" | "party_user";
  email: string;
  displayName: string;
}> = [
  { roleKey: "administrator", email: "dev-admin@dynaserv.test", displayName: "Dev Administrator" },
  { roleKey: "supervisor", email: "dev-supervisor@dynaserv.test", displayName: "Dev Supervisor" },
  { roleKey: "warehouse_staff", email: "dev-floor@dynaserv.test", displayName: "Dev Floor Staff" },
  { roleKey: "party_user", email: "dev-party@dynaserv.test", displayName: "Dev Party Contact" },
];

async function main() {
  const supabase = createServiceRoleClient();

  // Look up existing role catalog rows (seeded by migration 0005) — this
  // script assigns users to those roles, it never creates roles.
  const roleRows = await db.select().from(roles);
  const roleIdByKey = new Map(roleRows.map((r) => [r.key, r.id]));
  for (const { roleKey } of ACCOUNTS) {
    if (!roleIdByKey.has(roleKey)) {
      throw new Error(
        `Role "${roleKey}" not found in the roles table — has migration 0005_rbac_constraints_and_seed.sql been applied?`,
      );
    }
  }

  // A party_user needs an active user_party_scopes row pointing at a real
  // party. Reuse an existing party if one exists; otherwise create one
  // minimal test party so the portal has something to scope against.
  let testParty = (await db.select().from(parties).where(eq(parties.code, "DEV-VENDOR-01")))[0];
  if (!testParty) {
    [testParty] = await db
      .insert(parties)
      .values({
        code: "DEV-VENDOR-01",
        name: "Dev Test Vendor Co.",
        contactPerson: "Dev Party Contact",
        email: "dev-party@dynaserv.test",
        isActive: true,
      })
      .returning();
    console.log(`Created test party: ${testParty.name} (${testParty.id})`);

    // Inbound-supplying role so this party can also exercise the
    // vendor/supplier-only portal surfaces (e.g. the pre-ship label page).
    await db.insert(partyRoles).values({ partyId: testParty.id, role: "vendor" });
  } else {
    console.log(`Reusing existing test party: ${testParty.name} (${testParty.id})`);
  }

  for (const account of ACCOUNTS) {
    console.log(`\n--- ${account.roleKey} (${account.email}) ---`);

    // 1. Supabase Auth user — re-run-safe by checking for an existing user
    // with this email first (admin API has no upsert-by-email).
    let authUserId: string;
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    const existing = existingUsers.users.find((u) => u.email === account.email);

    if (existing) {
      authUserId = existing.id;
      console.log(`Auth user already exists: ${authUserId}`);
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: account.email,
        password: DEV_PASSWORD,
        email_confirm: true,
      });
      if (createError) throw createError;
      authUserId = created.user.id;
      console.log(`Created auth user: ${authUserId}`);
    }

    // 2. user_profiles row.
    const existingProfile = (
      await db.select().from(userProfiles).where(eq(userProfiles.id, authUserId))
    )[0];
    if (!existingProfile) {
      await db.insert(userProfiles).values({
        id: authUserId,
        displayName: account.displayName,
        status: "active",
        activatedAt: new Date(),
      });
      console.log(`Created user_profiles row.`);
    } else {
      console.log(`user_profiles row already exists.`);
    }

    // 3. Active user_roles assignment.
    const roleId = roleIdByKey.get(account.roleKey)!;
    const existingRole = (
      await db
        .select()
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, authUserId),
            eq(userRoles.roleId, roleId),
            isNull(userRoles.revokedAt),
          ),
        )
    )[0];
    if (!existingRole) {
      await db.insert(userRoles).values({
        userId: authUserId,
        roleId,
        grantReason: "Dev seed — scripts/seed-dev-accounts.ts",
      });
      console.log(`Assigned role: ${account.roleKey}`);
    } else {
      console.log(`Role assignment already exists: ${account.roleKey}`);
    }

    // 4. party_user also needs an active user_party_scopes row. flowType is
    // left null so the seeded account can see both VMI and Trading portal
    // surfaces during testing (per rbac.ts's documented null-means-all-flows
    // semantics, Supplies excluded regardless).
    if (account.roleKey === "party_user") {
      const existingScope = (
        await db
          .select()
          .from(userPartyScopes)
          .where(
            and(
              eq(userPartyScopes.userId, authUserId),
              eq(userPartyScopes.partyId, testParty.id),
              isNull(userPartyScopes.revokedAt),
            ),
          )
      )[0];
      if (!existingScope) {
        await db.insert(userPartyScopes).values({
          userId: authUserId,
          partyId: testParty.id,
          flowType: null,
          grantReason: "Dev seed — scripts/seed-dev-accounts.ts",
        });
        console.log(`Assigned party scope: ${testParty.name} (all flows)`);
      } else {
        console.log(`Party scope already exists.`);
      }
    }
  }

  console.log(`\nDone. Password for every seeded account: ${DEV_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
