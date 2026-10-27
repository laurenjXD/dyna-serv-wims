"use server";

// Server Actions backing `/settings/team` — Team directory, Dynamic RBAC roles,
// granular permission matrix, and per-user audit trails.

import { eq, isNull, and, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  userProfiles,
  userRoles,
  roles,
  permissions,
  rolePermissions,
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
          .where(isNull(userRoles.revokedAt)),
        [],
      ),
      withSettingsTimeout(
        db
          .select({ userId: userPartyScopes.userId, partyName: parties.name })
          .from(userPartyScopes)
          .innerJoin(parties, eq(userPartyScopes.partyId, parties.id))
          .where(isNull(userPartyScopes.revokedAt)),
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
        roleKeys: userRoleList.length > 0 ? userRoleList : ["warehouse_staff"],
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
    return { ok: true, data: [] };
  }
}

// ── Dynamic RBAC Roles & Permissions ────────────────────────

const DEFAULT_MODULE_CAPS = [
  { module: "Dashboard", view: true, create: false, edit: false, approve: false, delete: false },
  { module: "Receiving (WRR)", view: true, create: true, edit: true, approve: false, delete: false },
  { module: "Master Inventory", view: true, create: false, edit: true, approve: false, delete: false },
  { module: "Outgoing & Picking", view: true, create: true, edit: true, approve: false, delete: false },
  { module: "Approvals", view: false, create: false, edit: false, approve: false, delete: false },
  { module: "Documents", view: true, create: true, edit: false, approve: false, delete: false },
  { module: "Reports & Billing", view: false, create: false, edit: false, approve: false, delete: false },
  { module: "Master Data", view: false, create: false, edit: false, approve: false, delete: false },
];

const MODULE_PERMISSION_MAP: Record<string, Array<{ resource: string; action: string; field: "view" | "create" | "edit" | "approve" | "delete" }>> = {
  Dashboard: [{ resource: "reporting", action: "read", field: "view" }],
  "Receiving (WRR)": [
    { resource: "receiving", action: "view", field: "view" },
    { resource: "receiving", action: "scan", field: "create" },
    { resource: "receiving", action: "confirm", field: "approve" },
  ],
  "Master Inventory": [
    { resource: "inventory", action: "read", field: "view" },
    { resource: "inventory", action: "manage", field: "edit" },
  ],
  "Outgoing & Picking": [
    { resource: "pick_list", action: "read", field: "view" },
    { resource: "pick_list", action: "generate", field: "create" },
    { resource: "pick_list", action: "execute", field: "edit" },
  ],
  Approvals: [{ resource: "fifo_override", action: "approve", field: "approve" }],
  Documents: [
    { resource: "documents", action: "read", field: "view" },
    { resource: "documents", action: "generate", field: "create" },
    { resource: "documents", action: "download", field: "edit" },
  ],
  "Reports & Billing": [
    { resource: "reporting", action: "read", field: "view" },
    { resource: "reporting", action: "export", field: "create" },
    { resource: "vmi_statements", action: "read", field: "view" },
  ],
  "Master Data": [
    { resource: "parties", action: "read", field: "view" },
    { resource: "parties", action: "manage", field: "edit" },
    { resource: "items", action: "read", field: "view" },
    { resource: "items", action: "manage", field: "edit" },
    { resource: "locations", action: "read", field: "view" },
    { resource: "locations", action: "manage", field: "edit" },
  ],
};

let runtimeCustomRoles: DynamicRole[] = [
  {
    id: "role-admin",
    key: "administrator",
    name: "System Administrator",
    description: "Unrestricted platform governance, user administration, and financial approvals.",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    isSystem: true,
    capabilities: DEFAULT_MODULE_CAPS.map((m) => ({ ...m, view: true, create: true, edit: true, approve: true, delete: true })),
  },
  {
    id: "role-sup",
    key: "supervisor",
    name: "Shift Supervisor",
    description: "Floor oversight, FIFO/FEFO override sign-offs, and stock quarantine management.",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    isSystem: true,
    capabilities: DEFAULT_MODULE_CAPS.map((m) => ({ ...m, view: true, create: true, edit: true, approve: m.module === "Approvals" || m.module === "Receiving (WRR)", delete: false })),
  },
  {
    id: "role-staff",
    key: "warehouse_staff",
    name: "Floor Operator",
    description: "Physical receiving intake, mobile barcode scanning, and pick execution.",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    isSystem: true,
    capabilities: DEFAULT_MODULE_CAPS,
  },
  {
    id: "role-audit",
    key: "audit_lead",
    name: "Audit & Inventory Clerk",
    description: "Cycle count verification, stock adjustment reviews, and discrepancy audits.",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    isSystem: false,
    capabilities: DEFAULT_MODULE_CAPS.map((m) => ({ ...m, view: true, create: false, edit: m.module === "Master Inventory", approve: false, delete: false })),
  },
];

export async function listRoles(): Promise<ActionResult<DynamicRole[]>> {
  const permission = await requireUsersCapability("read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access denied." };
  }

  try {
    const dbRoles = await db.select().from(roles).where(eq(roles.isActive, true));
    if (dbRoles.length > 0) {
      const grants = await db
        .select({ roleId: rolePermissions.roleId, resource: permissions.resource, action: permissions.action })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id));
      const mapped: DynamicRole[] = dbRoles.map((r) => {
        const matchingRuntime = runtimeCustomRoles.find((cr) => cr.key === r.key);
        const roleGrants = grants.filter((grant) => grant.roleId === r.id);
        const capabilities = DEFAULT_MODULE_CAPS.map((moduleCap) => ({ ...moduleCap }));
        for (const mapping of Object.values(MODULE_PERMISSION_MAP).flat()) {
          const moduleName = Object.entries(MODULE_PERMISSION_MAP).find(([, entries]) => entries.includes(mapping))?.[0];
          const target = capabilities.find((cap) => cap.module === moduleName);
          if (target && roleGrants.some((grant) => grant.resource === mapping.resource && grant.action === mapping.action)) {
            target[mapping.field] = true;
          }
        }
        return {
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description ?? "",
          color: matchingRuntime?.color || (r.key === "administrator" ? "bg-purple-100 text-purple-800 border-purple-200" : "bg-blue-100 text-blue-800 border-blue-200"),
          isSystem: r.isSystem,
          capabilities: r.isSystem && matchingRuntime ? matchingRuntime.capabilities : capabilities,
        };
      });
      return { ok: true, data: mapped };
    }
  } catch {
    // fallback
  }

  return { ok: true, data: runtimeCustomRoles };
}

export async function saveDynamicRole(role: DynamicRole): Promise<ActionResult> {
  const permission = await requireUsersCapability("activate");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access denied." };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const existing = await tx.select().from(roles).where(eq(roles.key, role.key)).limit(1);
      const current = existing[0];
      if (current?.isSystem) {
        throw new Error("System-defined roles cannot be edited.");
      }

      const saved = current
        ? (await tx.update(roles).set({ name: role.name, description: role.description, isActive: true, updatedAt: new Date() }).where(eq(roles.id, current.id)).returning({ id: roles.id }))[0]
        : (await tx.insert(roles).values({ key: role.key, name: role.name, description: role.description, isSystem: false, isActive: true }).returning({ id: roles.id }))[0];
      if (!saved) throw new Error("Unable to save role.");

      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, saved.id));
      const catalog = await tx.select({ id: permissions.id, resource: permissions.resource, action: permissions.action }).from(permissions).where(eq(permissions.isActive, true));
      const grants = role.capabilities.flatMap((cap) => (MODULE_PERMISSION_MAP[cap.module] ?? [])
        .filter((entry) => cap[entry.field])
        .map((entry) => {
          const permissionRow = catalog.find((p) => p.resource === entry.resource && p.action === entry.action);
          return permissionRow ? { roleId: saved.id, permissionId: permissionRow.id, scopeKind: "global" as const } : null;
        }).filter((grant): grant is { roleId: string; permissionId: string; scopeKind: "global" } => Boolean(grant)));
      if (grants.length > 0) await tx.insert(rolePermissions).values(grants).onConflictDoNothing();

      return saved.id;
    });

    const existingIdx = runtimeCustomRoles.findIndex((r) => r.id === role.id || r.key === role.key);
    const persistedRole = { ...role, id: result, isSystem: false };
    if (existingIdx >= 0) runtimeCustomRoles[existingIdx] = persistedRole;
    else runtimeCustomRoles.push(persistedRole);

    // Write audit record
    await db.insert(auditLog).values({
      actorUserId: permission.context.userId,
      actorRole: permission.context.activeRoleKeys[0] ?? "administrator",
      action: "dynamic_role_saved",
      entityType: "roles",
      entityId: result,
      diffData: {
        roleKey: role.key,
        name: role.name,
        capabilities: role.capabilities,
      },
      correlationId: `ROLE-${Date.now()}`,
    }).catch(() => {});
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to persist custom role." };
  }

  revalidatePath("/settings/team");
  return { ok: true, data: undefined };
}

export async function deleteDynamicRole(roleId: string): Promise<ActionResult> {
  const permission = await requireUsersCapability("deactivate");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access denied." };
  }

  try {
    const target = (await db.select().from(roles).where(eq(roles.id, roleId)).limit(1))[0];
    if (!target) return { ok: false, error: "Role not found." };
    if (target.isSystem) return { ok: false, error: "System-defined roles cannot be deleted." };
    await db.update(roles).set({ isActive: false, updatedAt: new Date() }).where(eq(roles.id, roleId));
    runtimeCustomRoles = runtimeCustomRoles.filter((r) => r.id !== roleId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to deactivate role." };
  }

  revalidatePath("/settings/team");
  return { ok: true, data: undefined };
}

// ── Per-User Administrative Audit Trail ─────────────────────

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
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access denied." };
  }

  const serviceClient = createServiceRoleClient();
  await serviceClient.auth.admin.signOut(userId).catch(() => {});

  // Write audit record
  try {
    await db.insert(auditLog).values({
      actorUserId: permission.context.userId,
      actorRole: permission.context.activeRoleKeys[0] ?? "administrator",
      action: "session_revoked",
      entityType: "user_sessions",
      entityId: userId,
      diffData: {
        event: "emergency_session_revoked",
        targetUserId: userId,
      },
      correlationId: `REVOKE-${Date.now()}`,
    });
  } catch {
    // ignore logging failure
  }

  revalidatePath("/settings/team");
  return { ok: true, data: undefined };
}

export async function inviteUser(input: InviteUserInput): Promise<ActionResult<{ userId: string }>> {
  const permission = await requireUsersCapability("invite");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have access to invite team members." };
  }

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
    // Persist the local account before reporting success. If this fails after
    // Supabase created/sent the invite, remove the orphaned auth user.
    await db.insert(userProfiles).values({
      id: newUserId,
      displayName: parsed.data.displayName,
      status: "invited",
      activatedByUserId: permission.context.userId,
    });

    // Assign the pre-validated role and optional party scope.
    const [roleRow] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.key, parsed.data.role), eq(roles.isActive, true)))
      .limit(1);

    if (!roleRow) throw new Error("Selected role is no longer available.");
    await db.insert(userRoles).values({
      userId: newUserId,
      roleId: roleRow.id,
      grantedByUserId: permission.context.userId,
    });

    // 3. Assign party scope if provided
    if (parsed.data.partyId) {
      await db.insert(userPartyScopes).values({
        userId: newUserId,
        partyId: parsed.data.partyId,
        grantedByUserId: permission.context.userId,
      });
    }

    // Log to audit_log; an audit failure must not invalidate an otherwise
    // complete invitation.
    await db.insert(auditLog).values({
      actorUserId: permission.context.userId,
      actorRole: permission.context.activeRoleKeys[0] ?? "administrator",
      action: "user_invited",
      entityType: "user_profiles",
      entityId: newUserId,
      diffData: {
        email: parsed.data.email,
        displayName: parsed.data.displayName,
        role: parsed.data.role,
      },
      correlationId: `INVITE-${Date.now()}`,
    }).catch(() => {});
  } catch (error) {
    await db.delete(userPartyScopes).where(eq(userPartyScopes.userId, newUserId)).catch(() => {});
    await db.delete(userRoles).where(eq(userRoles.userId, newUserId)).catch(() => {});
    await db.delete(userProfiles).where(eq(userProfiles.id, newUserId)).catch(() => {});
    await serviceClient.auth.admin.deleteUser(newUserId).catch(() => {});
    return { ok: false, error: error instanceof Error ? error.message : "Unable to finish setting up the invited account." };
  }

  revalidatePath("/settings/team");
  return { ok: true, data: { userId: newUserId } };
}

export async function suspendUser(input: { userId: string; reason: string }): Promise<ActionResult> {
  const permission = await requireUsersCapability("deactivate");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have access to suspend users." };
  }

  const parsed = suspendUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db
    .update(userProfiles)
    .set({
      status: "inactive",
      deactivatedAt: new Date(),
      deactivatedByUserId: permission.context.userId,
      deactivationReason: parsed.data.reason,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.id, parsed.data.userId));

  const serviceClient = createServiceRoleClient();
  await serviceClient.auth.admin.signOut(parsed.data.userId).catch(() => {});

  // Log to auditLog
  try {
    await db.insert(auditLog).values({
      actorUserId: permission.context.userId,
      actorRole: permission.context.activeRoleKeys[0] ?? "administrator",
      action: "user_suspended",
      entityType: "user_profiles",
      entityId: parsed.data.userId,
      diffData: {
        status: { before: "active", after: "inactive" },
        reason: parsed.data.reason,
      },
      correlationId: `SUSPEND-${Date.now()}`,
    });
  } catch {
    // ignore logging failure
  }

  revalidatePath("/settings/team");
  return { ok: true, data: undefined };
}

export async function reactivateUser(userId: string): Promise<ActionResult> {
  const permission = await requireUsersCapability("activate");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have access to reactivate users." };
  }

  await db
    .update(userProfiles)
    .set({
      status: "active",
      activatedAt: new Date(),
      activatedByUserId: permission.context.userId,
      deactivatedAt: null,
      deactivationReason: null,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.id, userId));

  // Log to auditLog
  try {
    await db.insert(auditLog).values({
      actorUserId: permission.context.userId,
      actorRole: permission.context.activeRoleKeys[0] ?? "administrator",
      action: "user_reactivated",
      entityType: "user_profiles",
      entityId: userId,
      diffData: {
        status: { before: "inactive", after: "active" },
      },
      correlationId: `REACTIVATE-${Date.now()}`,
    });
  } catch {
    // ignore logging failure
  }

  revalidatePath("/settings/team");
  return { ok: true, data: undefined };
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
  const permission = await requireUsersCapability("deactivate");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have access to cancel invitations." };
  }

  const [profile] = await db
    .select({ id: userProfiles.id, displayName: userProfiles.displayName, status: userProfiles.status })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);

  if (!profile || profile.status !== "invited") {
    return { ok: false, error: "Only pending invitations can be removed." };
  }

  // 1. Remove scopes and roles
  await db.delete(userPartyScopes).where(eq(userPartyScopes.userId, userId)).catch(() => {});
  await db.delete(userRoles).where(eq(userRoles.userId, userId)).catch(() => {});

  // 2. Remove user profile
  await db.delete(userProfiles).where(eq(userProfiles.id, userId));

  // 3. Remove auth user from Supabase
  const serviceClient = createServiceRoleClient();
  await serviceClient.auth.admin.deleteUser(userId).catch(() => {});

  // 4. Audit log
  await db.insert(auditLog).values({
    actorUserId: permission.context.userId,
    actorRole: permission.context.activeRoleKeys[0] ?? "administrator",
    action: "invite_cancelled",
    entityType: "user_profiles",
    entityId: userId,
    diffData: {
      displayName: profile.displayName,
    },
    correlationId: `CANCEL-${Date.now()}`,
  }).catch(() => {});

  revalidatePath("/settings/team");
  return { ok: true, data: undefined };
}
