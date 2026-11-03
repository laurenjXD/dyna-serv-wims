"use server";

// Server Actions backing `/settings/team` — Team directory, Dynamic RBAC roles,
// granular permission matrix, and per-user audit trails.

import { eq, isNull, and, desc, sql, gt, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  userProfiles,
  userRoles,
  roles,
  userPartyScopes,
  parties,
  auditLog,
} from "@/lib/db/schema";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/guard";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { inviteUserSchema, suspendUserSchema, type InviteUserInput } from "@/lib/user-settings/schemas";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { parseUserAgentDevice } from "@/lib/user-settings/device-parser";
import { withSettingsTimeout } from "@/lib/user-settings/with-timeout";
import { Resend } from "resend";
import { generateTeamInvitationEmailHtml } from "@/lib/notifications/email-composer-templates";
import { roleLabel } from "@/lib/user-settings/roles";
import { z } from "zod";
import { saveRoleSchema, replaceUserRolesSchema, roleChangeSchema, type SaveRoleInput } from "@/lib/rbac/admin-schemas";
import type { EffectiveGrant, PermissionOption, UserAccess } from "@/lib/rbac/admin-types";
export type { EffectiveGrant, PermissionOption } from "@/lib/rbac/admin-types";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type InvitationEmailProvider = "supabase" | "resend";

function getInvitationEmailProvider(): InvitationEmailProvider {
  return process.env.INVITATION_EMAIL_PROVIDER === "supabase" ? "supabase" : "resend";
}

async function requireUsersCapability(action: "read" | "invite" | "activate" | "deactivate") {
  const resolver = await createPageResolver();
  return requirePermission(resolver, `users.${action}`);
}

async function getInviteRedirectUrl(): Promise<string> {
  let origin = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  if (!origin) {
    try {
      const headersList = await headers();
      const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
      const proto = headersList.get("x-forwarded-proto") ?? "http";
      if (host) origin = `${proto}://${host}`;
    } catch {
      // Server actions invoked outside a request use the local development URL.
    }
  }

  const resolvedOrigin = (origin ?? "http://localhost:3000").replace(/\/+$/, "");
  try {
    const url = new URL(resolvedOrigin);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported URL protocol");
    // Invite links return the session in the browser URL fragment. A server
    // callback cannot read that fragment, so deliver the link directly to
    // the client onboarding page.
    return `${url.origin}/accept-invite`;
  } catch {
    throw new Error("The application URL is invalid. Set NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_APP_URL before sending invitations.");
  }
}

function getInvitationConfigurationError(): string | null {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === "placeholder-service-key") {
    return "Invitation email is not configured on the server. Add SUPABASE_SERVICE_ROLE_KEY in the deployment environment.";
  }

  if (!process.env.DATABASE_URL_RUNTIME && !process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    return "Invitation setup is not configured on the server. Add DATABASE_URL_RUNTIME, DATABASE_URL, or POSTGRES_URL in the deployment environment.";
  }

  if (getInvitationEmailProvider() === "resend" && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)) {
    return "Invitation email is not configured on the server. Add RESEND_API_KEY and RESEND_FROM_EMAIL in the deployment environment.";
  }

  return null;
}

async function generateAndSendInvitationEmail({
  serviceClient,
  email,
  displayName,
  role,
  redirectTo,
  linkType,
}: {
  serviceClient: ReturnType<typeof createServiceRoleClient>;
  email: string;
  displayName: string;
  role: string;
  redirectTo: string;
  linkType: "invite" | "recovery";
}) {
  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: linkType,
    email,
    options: { redirectTo },
  });

  const actionLink = linkData?.properties?.action_link;
  if (linkError || !actionLink) {
    return { ok: false as const, error: linkError?.message ?? "Failed to generate the invitation link." };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL;
  if (!resendApiKey || !resendFrom) {
    return { ok: false as const, error: "Invitation email is not configured on the server." };
  }

  const resend = new Resend(resendApiKey);
  const { error: sendError } = await resend.emails.send({
    from: resendFrom,
    to: [email],
    subject: "Your Dyna-Serv WIMS invitation",
    html: generateTeamInvitationEmailHtml({
      displayName,
      roleName: roleLabel(role),
      inviteUrl: actionLink,
    }),
  });

  if (sendError) return { ok: false as const, error: sendError.message };
  return { ok: true as const };
}

export interface TeamMember {
  id: string;
  email: string | null;
  displayName: string;
  employeeId: string;
  phone: string;
  avatarUrl: string | null;
  status: string;
  roleKeys: string[];
  partyNames: string[];
  activeDevice: string;
  sessionStatus: "connected" | "idle" | "offline";
  sessionUuid: string;
  lastSignInAt: string | null;
}

export interface DynamicRole {
  id: string;
  key: string;
  name: string;
  description: string;
  color: string;
  isSystem: boolean;
  isActive: boolean;
  grants: EffectiveGrant[];
  capabilities: Array<{
    module: string;
    view: boolean;
    create: boolean;
    edit: boolean;
    approve: boolean;
    delete: boolean;
  }>;
}

export interface UserAuditItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  timestamp: string;
  deviceContext: string;
  details: string;
}

export interface ActivePartyOption {
  id: string;
  name: string;
}

export async function listActiveParties(): Promise<ActionResult<ActivePartyOption[]>> {
  const permission = await requireUsersCapability("read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access denied." };
  }

  try {
    const rows = await withSettingsTimeout(
      db
        .select({ id: parties.id, name: parties.name })
        .from(parties)
        .where(eq(parties.isActive, true)),
      [],
    );

    return { ok: true, data: rows };
  } catch (err) {
    console.error("Failed to list active parties:", err);
    return { ok: true, data: [] };
  }
}

export async function listTeamMembers(): Promise<ActionResult<TeamMember[]>> {
  const permission = await requireUsersCapability("read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have access to view team members." };
  }

  try {
    const serviceClient = createServiceRoleClient();
    // Keep the profile directory independent from optional enrichment. A
    // slow Auth admin request or an unavailable auth.sessions view must not
    // turn a populated directory into an empty one.
    const [profiles, activeRoleRows, activeScopeRows, authUsersRes, sessionRows] = await Promise.all([
      withSettingsTimeout(
        db.select({ id: userProfiles.id, displayName: userProfiles.displayName, status: userProfiles.status }).from(userProfiles),
        [],
      ),
      withSettingsTimeout(
        db
          .select({ userId: userRoles.userId, roleKey: roles.key })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(and(isNull(userRoles.revokedAt), lte(userRoles.validFrom, new Date()), or(isNull(userRoles.validUntil), gt(userRoles.validUntil, new Date())), eq(roles.isActive, true))),
        [],
      ),
      withSettingsTimeout(
        db
          .select({ userId: userPartyScopes.userId, partyName: parties.name })
          .from(userPartyScopes)
          .innerJoin(parties, eq(userPartyScopes.partyId, parties.id))
          .where(and(isNull(userPartyScopes.revokedAt), lte(userPartyScopes.validFrom, new Date()), or(isNull(userPartyScopes.validUntil), gt(userPartyScopes.validUntil, new Date())), eq(parties.isActive, true))),
        [],
      ),
      withSettingsTimeout(
        serviceClient.auth.admin.listUsers().catch(() => ({ data: { users: [] } })),
        { data: { users: [] } },
        5000,
      ),
      withSettingsTimeout(
        db.execute(sql`
          SELECT DISTINCT ON (user_id)
            id, user_id, updated_at, user_agent, ip::text as ip_address
          FROM auth.sessions
          ORDER BY user_id, updated_at DESC;
        `).catch(() => []) as Promise<Array<{
          id: string;
          user_id: string;
          updated_at: string | Date;
          user_agent: string | null;
          ip_address: string | null;
        }>>,
        [],
      ),
    ]);

    const authUserMap = new Map((authUsersRes?.data?.users ?? []).map((u) => [u.id, u]));
    const sessionMap = new Map((sessionRows as Array<{ user_id: string; id: string; updated_at: string | Date; user_agent: string | null }>).map((s) => [s.user_id, s]));
    const now = Date.now();

    const members: TeamMember[] = profiles.map((p) => {
      const auth = authUserMap.get(p.id);
      const shortId = p.id.replace(/-/g, "").substring(0, 4).toUpperCase();
      const userRoleList = activeRoleRows.filter((r) => r.userId === p.id).map((r) => r.roleKey);
      const latestSession = sessionMap.get(p.id);

      let activeDevice = "No Active Session";
      let sessionStatus: "connected" | "idle" | "offline" = "offline";
      let sessionUuid = "—";

      if (latestSession) {
        const parsed = parseUserAgentDevice(latestSession.user_agent);
        activeDevice = parsed.deviceAlias;
        sessionUuid = `SESS-${latestSession.id.substring(0, 8).toUpperCase()}`;
        const diffMinutes = (now - new Date(latestSession.updated_at).getTime()) / (60 * 1000);
        if (diffMinutes <= 15) {
          sessionStatus = "connected";
        } else if (diffMinutes <= 60) {
          sessionStatus = "idle";
        } else {
          sessionStatus = "offline";
        }
      }

      return {
        id: p.id,
        displayName: p.displayName || auth?.user_metadata?.displayName || "Team Member",
        email: auth?.email ?? null,
        employeeId: (auth?.user_metadata?.employee_id as string) || `EMP-${shortId}`,
        phone: (auth?.user_metadata?.phone as string) || (auth?.phone ?? "—"),
        avatarUrl: (auth?.user_metadata?.avatar_url as string) || null,
        status: p.status,
        roleKeys: userRoleList,
        partyNames: activeScopeRows.filter((s) => s.userId === p.id).map((s) => s.partyName),
        activeDevice,
        sessionStatus,
        sessionUuid,
        lastSignInAt: auth?.last_sign_in_at ?? null,
      };
    });

    return { ok: true, data: members };
  } catch (err) {
    console.error("Failed to list team members:", err);
    return { ok: false, error: "Unable to load the team directory. Refresh and try again." };
  }
}

// ── Dynamic RBAC Roles & Permissions ────────────────────────

// Every role operation uses an authenticated, transaction-local identity. The
// internal database functions independently authorize and audit the operation;
// no direct table mutation or process-local role fallback is permitted here.
async function runRbacCommand<T>(userId: string, statement: SQL): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', ${"authenticated"}, true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    return await tx.execute(statement) as unknown as T;
  });
}

async function requireAccessAdministration(write: boolean) {
  const resolver = await createPageResolver();
  const result = await requirePermission(resolver, "access_assignments.read");
  if (result.kind !== "authorized" || !write) return result;
  if (!result.context.activeRoleKeys.includes("administrator")) return { kind: "forbidden" as const };
  for (const capability of ["access_assignments.grant", "access_assignments.revoke"]) {
    const permission = await requirePermission(resolver, capability);
    if (permission.kind !== "authorized") return permission;
  }
  return result;
}

function rbacError(error: unknown): string {
  // PostgreSQL exception messages from these controlled functions are deliberately
  // user-safe. Never send query text, parameters, stack traces or connection data.
  const message = error instanceof Error ? error.message : "";
  if (/^(Access denied|Only an active|Only existing active|Only pending|System roles|System-defined roles|Role not found|User not found|Account not found|Unsupported permission|Unsupported or inactive|Invalid |Duplicate |The last |Cannot |Organization|An Organization-scoped|Scoped |Global |A role cannot|A saved role|A role with|A change reason|A status|A reason|Too many|Role key|Role name|Role is |Permission |Selected |Custom role)/i.test(message)) return message;
  return "Unable to update or read access settings. Refresh and try again. If this continues, contact an administrator.";
}

function refreshAccessViews() {
  revalidatePath("/settings/team");
  revalidatePath("/", "layout");
}

export async function listPermissionCatalog(): Promise<ActionResult<PermissionOption[]>> {
  const permission = await requireAccessAdministration(false);
  if (permission.kind !== "authorized") return { ok: false, error: "Access denied." };
  try {
    const rows = await runRbacCommand<Array<{ permission_id: string; resource: string; action: string; description: string | null; scope_kind: "global" | "assigned_party" }>>(
      permission.context.userId, sql`select * from rbac_internal.admin_permission_catalog()`,
    );
    return { ok: true, data: rows.map((row) => ({ permissionId: row.permission_id, resource: row.resource, action: row.action, description: row.description, scopeKind: row.scope_kind })) };
  } catch (error) { return { ok: false, error: rbacError(error) }; }
}

export async function listRoles(): Promise<ActionResult<DynamicRole[]>> {
  const permission = await requireAccessAdministration(false);
  if (permission.kind !== "authorized") return { ok: false, error: "Access denied." };
  try {
    const rows = await runRbacCommand<Array<{ data: Array<Omit<DynamicRole, "color" | "capabilities">> }>>(
      permission.context.userId, sql`select rbac_internal.admin_list_roles() as data`,
    );
    return { ok: true, data: (rows[0]?.data ?? []).map((role) => ({ ...role, color: "bg-slate-100 text-slate-800 border-slate-200", capabilities: [] })) };
  } catch (error) { return { ok: false, error: rbacError(error) }; }
}

export async function saveDynamicRole(input: SaveRoleInput): Promise<ActionResult> {
  const permission = await requireAccessAdministration(true);
  if (permission.kind !== "authorized") return { ok: false, error: "Access denied." };
  const parsed = saveRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid role" };
  const role = parsed.data;
  try {
    await runRbacCommand(permission.context.userId, sql`select rbac_internal.admin_save_role(
      ${role.id ?? null}::uuid, ${role.key}, ${role.name}, ${role.description}, ${JSON.stringify(role.grants)}::jsonb, ${role.reason}
    ) as id`);
    refreshAccessViews();
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: rbacError(error) }; }
}

export async function deleteDynamicRole(roleId: string, reason: string): Promise<ActionResult> {
  const permission = await requireAccessAdministration(true);
  if (permission.kind !== "authorized") return { ok: false, error: "Access denied." };
  const parsed = roleChangeSchema.safeParse({ roleId, reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid role change" };
  try {
    await runRbacCommand(permission.context.userId, sql`select rbac_internal.admin_deactivate_role(${parsed.data.roleId}::uuid, ${parsed.data.reason})`);
    refreshAccessViews();
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: rbacError(error) }; }
}

export async function getUserAccess(userId: string): Promise<ActionResult<UserAccess>> {
  const permission = await requireAccessAdministration(false);
  if (permission.kind !== "authorized") return { ok: false, error: "Access denied." };
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, error: "Invalid account" };
  try {
    const rows = await runRbacCommand<Array<{ data: UserAccess }>>(permission.context.userId, sql`select rbac_internal.admin_get_user_access(${userId}::uuid) as data`);
    if (!rows[0]?.data) return { ok: false, error: "User not found." };
    return { ok: true, data: rows[0].data };
  } catch (error) { return { ok: false, error: rbacError(error) }; }
}

export async function replaceUserRoles(input: { userId: string; roleIds: string[]; reason: string }): Promise<ActionResult> {
  const permission = await requireAccessAdministration(true);
  if (permission.kind !== "authorized") return { ok: false, error: "Access denied." };
  const parsed = replaceUserRolesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid role assignment" };
  try {
    await runRbacCommand(permission.context.userId, sql`select rbac_internal.admin_replace_user_roles(
      ${parsed.data.userId}::uuid, ARRAY[${sql.join(parsed.data.roleIds.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[] , ${parsed.data.reason}
    )`);
    refreshAccessViews();
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: rbacError(error) }; }
}
function formatTeamActionLabel(rawAction: string): string {
  const map: Record<string, string> = {
    profile_updated: "Identity Details Updated",
    auth_password_changed: "Security Password Changed",
    user_invited: "Operator Invitation Issued",
    user_suspended: "Operator Account Suspended",
    user_reactivated: "Operator Account Reactivated",
    dynamic_role_saved: "Dynamic Role Matrix Modified",
    session_revoked: "BYOD Device Session Revoked",
    wrr_created: "Receiving Intake Staged",
    stock_transferred: "Floor Stock Relocated",
    inspection_disposition: "Inspection Case Completed",
    login_qr_binding: "Shift QR Check-In Bound",
  };
  return map[rawAction] || rawAction.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getUserAuditTrail(userId: string): Promise<ActionResult<UserAuditItem[]>> {
  const permission = await requireUsersCapability("read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access denied." };
  }

  try {
    const rows = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        createdAt: auditLog.createdAt,
        diffData: auditLog.diffData,
      })
      .from(auditLog)
      .where(eq(auditLog.actorUserId, userId))
      .orderBy(desc(auditLog.createdAt))
      .limit(20);

    if (rows.length > 0) {
      return {
        ok: true,
        data: rows.map((r) => {
          let details = "";
          if (typeof r.diffData === "string") {
            details = r.diffData;
          } else if (r.diffData && typeof r.diffData === "object") {
            const entries = Object.entries(r.diffData);
            if (entries.length > 0) {
              details = entries
                .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                .join(", ");
            }
          }
          if (!details) {
            details = `${formatTeamActionLabel(r.action)} on ${r.entityType}`;
          }
          return {
            id: r.id,
            action: formatTeamActionLabel(r.action),
            entityType: r.entityType,
            entityId: r.entityId,
            timestamp: r.createdAt.toISOString(),
            deviceContext: "Recorded audit event",
            details,
          };
        }),
      };
    }
    return { ok: true, data: [] };
  } catch {
    // Never fabricate audit activity when the database is empty or unavailable.
    return { ok: true, data: [] };
  }
}

export async function revokeUserSession(userId: string): Promise<ActionResult> {
  const permission = await requireUsersCapability("deactivate");
  if (permission.kind !== "authorized" || !z.string().uuid().safeParse(userId).success) return { ok: false, error: "Access denied." };
  // Supabase's admin signOut accepts an access token, not an account ID.
  // Never claim successful revocation for a request that cannot perform it.
  return { ok: false, error: "Session-only revocation is unavailable. Suspend the account to block its next protected request." };
}
export async function inviteUser(input: InviteUserInput): Promise<ActionResult<{ userId: string }>> {
  const permission = await requireUsersCapability("invite");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have access to invite team members." };
  }

  const access = await requireAccessAdministration(true);
  if (access.kind !== "authorized") return { ok: false, error: "Only an access administrator can invite and assign account roles." };

  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const configurationError = getInvitationConfigurationError();
  if (configurationError) return { ok: false, error: configurationError };

  try {
    const [roleRow] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.key, parsed.data.role), eq(roles.isActive, true)))
      .limit(1);
    if (!roleRow) {
      return { ok: false, error: "The selected role is not available. Refresh the page and try again." };
    }
  } catch {
    return { ok: false, error: "Unable to verify the selected role. Please try again." };
  }

  let redirectTo: string;
  try {
    redirectTo = await getInviteRedirectUrl();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The invitation redirect URL is invalid." };
  }

  const serviceClient = createServiceRoleClient();
  const provider = getInvitationEmailProvider();
  const userMetadata = {
    displayName: parsed.data.displayName,
    employee_id: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
  };
  const inviteResult = provider === "supabase"
    ? await serviceClient.auth.admin.inviteUserByEmail(parsed.data.email, {
        data: userMetadata,
        redirectTo,
      })
    : await serviceClient.auth.admin.generateLink({
        type: "invite",
        email: parsed.data.email,
        options: { data: userMetadata, redirectTo },
      });
  const { data: authData, error: authError } = inviteResult;

  if (authError || !authData?.user) {
    return { ok: false, error: authError?.message ?? "Failed to create the invited account." };
  }

  if (provider === "resend") {
    const inviteEmail = await generateAndSendInvitationEmail({
      serviceClient,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      redirectTo,
      linkType: "invite",
    });
    if (!inviteEmail.ok) {
      await serviceClient.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return { ok: false, error: inviteEmail.error };
    }
  }

  const newUserId = authData.user.id;

  try {
    // Provision profile, scope, controlled role assignment and audit together.
    // If any step fails the local transaction rolls back before Auth cleanup.
    await db.transaction(async (tx) => {
      await tx.insert(userProfiles).values({
        id: newUserId, displayName: parsed.data.displayName, status: "invited",
        activatedByUserId: permission.context.userId,
      });
      const [roleRow] = await tx.select({ id: roles.id }).from(roles)
        .where(and(eq(roles.key, parsed.data.role), eq(roles.isActive, true))).limit(1);
      if (!roleRow) throw new Error("Selected role is no longer available.");
      if (parsed.data.partyId) {
        await tx.insert(userPartyScopes).values({ userId: newUserId, partyId: parsed.data.partyId, grantedByUserId: permission.context.userId });
      }
      // Write the invitation event before switching to authenticated, which
      // intentionally has no direct INSERT policy on audit_log.
      await tx.insert(auditLog).values({
        actorUserId: permission.context.userId, actorRole: "administrator",
        action: "user_invited", entityType: "user_profiles", entityId: newUserId,
        diffData: { email: parsed.data.email, displayName: parsed.data.displayName, role: parsed.data.role },
        correlationId: crypto.randomUUID(),
      });
      await tx.execute(sql`select set_config('role', ${"authenticated"}, true)`);
      await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: permission.context.userId })}, true)`);
      await tx.execute(sql`select rbac_internal.admin_replace_user_roles(${newUserId}::uuid, ARRAY[${roleRow.id}::uuid], ${"Initial administrator invitation assignment"})`);
    });  } catch (error) {
    await serviceClient.auth.admin.deleteUser(newUserId).catch(() => {});
    return { ok: false, error: error instanceof Error ? error.message : "Unable to finish setting up the invited account." };
  }

  revalidatePath("/settings/team");
  return { ok: true, data: { userId: newUserId } };
}

export async function suspendUser(input: { userId: string; reason: string }): Promise<ActionResult> {
  const permission = await requireUsersCapability("deactivate");
  if (permission.kind !== "authorized" || !permission.context.activeRoleKeys.includes("administrator")) return { ok: false, error: "Access denied." };
  const parsed = suspendUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await runRbacCommand(permission.context.userId, sql`select rbac_internal.admin_set_user_active(${parsed.data.userId}::uuid, false, ${parsed.data.reason})`);
    // Database profile checks deny the next protected request immediately;
    // do not claim Auth session revocation by passing a user UUID as a JWT.
    refreshAccessViews();
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: rbacError(error) }; }
}

export async function reactivateUser(userId: string): Promise<ActionResult> {
  const permission = await requireUsersCapability("activate");
  if (permission.kind !== "authorized" || !permission.context.activeRoleKeys.includes("administrator")) return { ok: false, error: "Access denied." };
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, error: "Invalid account" };
  try {
    await runRbacCommand(permission.context.userId, sql`select rbac_internal.admin_set_user_active(${userId}::uuid, true, ${"Administrator reactivated account"})`);
    refreshAccessViews();
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: rbacError(error) }; }
}
export async function resendInvite(userId: string): Promise<ActionResult> {
  const permission = await requireUsersCapability("invite");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have access to invite team members." };
  }

  const configurationError = getInvitationConfigurationError();
  if (configurationError) return { ok: false, error: configurationError };

  const [profile] = await db
    .select({ id: userProfiles.id, displayName: userProfiles.displayName, status: userProfiles.status })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);

  if (!profile || profile.status !== "invited") {
    return { ok: false, error: "Only pending invitations can be resent." };
  }

  const serviceClient = createServiceRoleClient();
  const { data: authUser, error: getUserError } = await serviceClient.auth.admin.getUserById(userId);
  if (getUserError || !authUser?.user?.email) {
    return { ok: false, error: "Could not locate user account to resend invite." };
  }

  let redirectTo: string;
  try {
    redirectTo = await getInviteRedirectUrl();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The invitation redirect URL is invalid." };
  }

  // If Supabase has already confirmed the email, use a recovery action link
  // as the secure credential-reset mechanism, but deliver it inside the same
  // branded onboarding email through Resend. Supabase generates the token;
  // Resend only transports our custom message and never receives credentials.
  const provider = getInvitationEmailProvider();
  if (provider === "supabase") {
    const { error: emailError } = authUser.user.email_confirmed_at
      ? await serviceClient.auth.resetPasswordForEmail(authUser.user.email, { redirectTo })
      : await serviceClient.auth.admin.inviteUserByEmail(authUser.user.email, {
          data: {
            displayName: profile.displayName,
            employee_id: (authUser.user.user_metadata?.employee_id as string) || `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
          },
          redirectTo,
        });
    if (emailError) return { ok: false, error: emailError.message };
  } else {
    const inviteEmail = await generateAndSendInvitationEmail({
      serviceClient,
      email: authUser.user.email,
      displayName: profile.displayName,
      role: "warehouse_staff",
      redirectTo,
      linkType: authUser.user.email_confirmed_at ? "recovery" : "invite",
    });
    if (!inviteEmail.ok) return { ok: false, error: inviteEmail.error };
  }

  // Audit log
  await db.insert(auditLog).values({
    actorUserId: permission.context.userId,
    actorRole: permission.context.activeRoleKeys[0] ?? "administrator",
    action: "invite_resent",
    entityType: "user_profiles",
    entityId: userId,
    diffData: {
      email: authUser.user.email,
      displayName: profile.displayName,
    },
    correlationId: `RESEND-${Date.now()}`,
  }).catch(() => {});

  revalidatePath("/settings/team");
  return { ok: true, data: undefined };
}

export async function cancelInvite(userId: string): Promise<ActionResult> {
  const permission = await requireAccessAdministration(true);
  if (permission.kind !== "authorized") return { ok: false, error: "Access denied." };
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, error: "Invalid account" };
  try {
    await runRbacCommand(permission.context.userId, sql`select rbac_internal.admin_cancel_invite(${userId}::uuid, ${"Administrator cancelled pending invitation"})`);
    refreshAccessViews();
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: rbacError(error) }; }
}