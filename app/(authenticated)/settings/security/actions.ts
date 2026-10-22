"use server";

// Server Actions backing `/settings/security` — Network-gated BYOD, 2FA/Auth policies,
// active session inspection & termination, and immutable whole-system audit trail.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, rbacSecurityEvents, systemSettings, userProfiles } from "@/lib/db/schema";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { parseUserAgentDevice } from "@/lib/user-settings/device-parser";
import { withSettingsTimeout } from "@/lib/user-settings/with-timeout";
import { securitySettingsSchema } from "@/lib/user-settings/settings-schemas";

export interface SecuritySettingsData {
  network: {
    wifiEnforcementEnabled: boolean;
    allowedIpRanges: string[];
  };
  authRules: {
    passwordMinLength: number;
    requireSpecialChars: boolean;
    passwordExpiryDays: number;
    mfaPolicy: "optional" | "enforced" | "role_gated";
    shiftQrLoginEnabled: boolean;
  };
  sessionConfig: {
    mobileIdleTimeoutMinutes: number;
    desktopIdleTimeoutMinutes: number;
  };
}

export interface ActiveSessionItem {
  id: string;
  userId: string;
  userName: string;
  employeeId: string;
  deviceAlias: string;
  browserUserAgent: string;
  ipAddress: string;
  connectedZone: string;
  sessionUuid: string;
  loginTime: string;
  lastActiveTime: string;
  status: "active" | "idle";
}

export interface SystemAuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  targetEntity: string;
  targetId: string | null;
  module: "Floor & Stock" | "Financial & Billing" | "RBAC & Admin" | "Security & BYOD";
  severity: "info" | "warning" | "critical";
  deviceContext: string;
  changesDelta: Record<string, { before: unknown; after: unknown }> | null;
  rawDetails: string;
}

const DEFAULT_SECURITY_SETTINGS: SecuritySettingsData = {
  network: {
    wifiEnforcementEnabled: true,
    allowedIpRanges: ["192.168.10.0/24", "10.200.0.0/16", "172.16.50.0/24"],
  },
  authRules: {
    passwordMinLength: 10,
    requireSpecialChars: true,
    passwordExpiryDays: 90,
    mfaPolicy: "role_gated",
    shiftQrLoginEnabled: true,
  },
  sessionConfig: {
    mobileIdleTimeoutMinutes: 15,
    desktopIdleTimeoutMinutes: 60,
  },
};

let runtimeSecuritySettings = { ...DEFAULT_SECURITY_SETTINGS };

export async function getSecuritySettings(): Promise<{ ok: true; data: SecuritySettingsData } | { ok: false; error: string }> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "users.read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access denied to security settings." };
  }

  try {
    const [stored] = await withSettingsTimeout(
      db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, "security")),
      [],
    );

    const parsed = securitySettingsSchema.safeParse(stored?.value);
    if (parsed.success) {
      runtimeSecuritySettings = parsed.data;
    }
  } catch {
    // fallback to runtime state
  }

  return { ok: true, data: runtimeSecuritySettings };
}

export async function saveSecuritySettings(settings: SecuritySettingsData): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "users.read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access denied." };
  }

  const parsed = securitySettingsSchema.safeParse(settings);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Review the security settings and try again." };
  }

  await db.insert(systemSettings).values({
    key: "security",
    value: parsed.data,
    updatedBy: permission.context.userId,
  }).onConflictDoUpdate({
    target: systemSettings.key,
    set: { value: parsed.data, updatedAt: new Date(), updatedBy: permission.context.userId },
  });

  runtimeSecuritySettings = parsed.data;

  // Write audit record with full policy snapshot
  try {
    await db.insert(auditLog).values({
      actorUserId: permission.context.userId,
      actorRole: permission.context.activeRoleKeys[0] ?? "administrator",
      action: "security_policy_updated",
      entityType: "system_security",
      entityId: permission.context.userId,
      diffData: {
        settings: parsed.data as unknown as Record<string, unknown>,
        wifiEnforcement: parsed.data.network.wifiEnforcementEnabled,
        allowedIpRangesCount: parsed.data.network.allowedIpRanges.length,
        passwordMinLength: parsed.data.authRules.passwordMinLength,
        mfaPolicy: parsed.data.authRules.mfaPolicy,
        mobileIdleTimeoutMinutes: parsed.data.sessionConfig.mobileIdleTimeoutMinutes,
      },
      correlationId: `SEC-${Date.now()}`,
    });
  } catch {
    // ignore logging failure
  }

  revalidatePath("/settings/security");
  return { ok: true };
}

function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    const cleanIp = ip.trim();
    const cleanCidr = cidr.trim();
    if (cleanIp === cleanCidr) return true;
    if (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp === "localhost") return true;

    if (!cleanCidr.includes("/")) {
      return cleanIp === cleanCidr;
    }

    const [range, bitsStr] = cleanCidr.split("/");
    const bits = parseInt(bitsStr, 10);
    if (isNaN(bits) || bits < 0 || bits > 32) return false;

    const ipToLong = (addr: string) =>
      addr
        .split(".")
        .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);

    const ipLong = ipToLong(cleanIp);
    const rangeLong = ipToLong(range);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;

    return (ipLong & mask) === (rangeLong & mask);
  } catch {
    return false;
  }
}

/**
 * Reads the effective policy without requiring the caller to have the admin
 * settings capability. Operational enforcement points use this function;
 * the page-facing getSecuritySettings remains permission-gated.
 */
export async function getEffectiveSecuritySettings(): Promise<SecuritySettingsData> {
  try {
    const [stored] = await withSettingsTimeout(
      db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, "security")),
      [],
    );
    const parsed = securitySettingsSchema.safeParse(stored?.value);
    if (parsed.success) {
      runtimeSecuritySettings = parsed.data;
    }
  } catch {
    // Keep the last validated policy if the settings store is unavailable.
  }
  return runtimeSecuritySettings;
}

export async function verifyFloorNetworkAccess(): Promise<{ allowed: boolean; reason?: string }> {
  const effectiveSettings = await getEffectiveSecuritySettings();

  if (!effectiveSettings.network.wifiEnforcementEnabled) {
    return { allowed: true };
  }

  try {
    const headersList = await headers();
    const forwarded = headersList.get("x-forwarded-for");
    const realIp = headersList.get("x-real-ip");
    const clientIp = (forwarded ? forwarded.split(",")[0].trim() : realIp) || "127.0.0.1";

    if (clientIp === "127.0.0.1" || clientIp === "::1" || clientIp.startsWith("::ffff:127.0.0.1")) {
      return { allowed: true };
    }

    const isAllowed = effectiveSettings.network.allowedIpRanges.some((cidr) => isIpInCidr(clientIp, cidr));
    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Floor scanning and stock operations are restricted to internal warehouse Wi-Fi. (Client IP: ${clientIp})`,
      };
    }
  } catch {
    // Non-request context
  }

  return { allowed: true };
}



export async function listActiveSessions(): Promise<{ ok: true; data: ActiveSessionItem[] } | { ok: false; error: string }> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "users.read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access denied." };
  }

  try {
    const settingsRes = await getSecuritySettings();
    const allowedRanges = settingsRes.ok ? settingsRes.data.network.allowedIpRanges : [];
    const mobileTimeoutMinutes = settingsRes.ok ? settingsRes.data.sessionConfig.mobileIdleTimeoutMinutes : 15;
    const desktopTimeoutMinutes = settingsRes.ok ? settingsRes.data.sessionConfig.desktopIdleTimeoutMinutes : 60;

    // Query real active sessions from PostgreSQL auth.sessions joined with auth.users & user_profiles
    const rawSessions = await withSettingsTimeout((db.execute(sql`
      SELECT 
        s.id as session_id,
        s.user_id,
        s.created_at,
        s.updated_at,
        s.user_agent,
        s.ip::text as ip_address,
        u.email,
        u.raw_user_meta_data,
        p.display_name,
        p.status as profile_status
      FROM auth.sessions s
      LEFT JOIN auth.users u ON u.id = s.user_id
      LEFT JOIN public.user_profiles p ON p.id = s.user_id
      ORDER BY s.updated_at DESC
      LIMIT 50;
    `)) as Promise<Array<{
      session_id: string;
      user_id: string;
      created_at: string | Date;
      updated_at: string | Date;
      user_agent: string | null;
      ip_address: string | null;
      email: string | null;
      raw_user_meta_data: Record<string, unknown> | null;
      display_name: string | null;
      profile_status: string | null;
    }>>, []);

    const now = Date.now();
    const sessions: ActiveSessionItem[] = rawSessions.map((s) => {
      const shortId = (s.user_id || "").replace(/-/g, "").substring(0, 4).toUpperCase();
      const parsed = parseUserAgentDevice(s.user_agent);
      const rawIp = s.ip_address?.replace(/\/32$/, "").trim() || "127.0.0.1";
      const isAllowed = allowedRanges.some((cidr) => isIpInCidr(rawIp, cidr));

      const updatedTime = new Date(s.updated_at).getTime();
      const diffMinutes = (now - updatedTime) / (60 * 1000);
      const timeoutLimit = parsed.isMobile ? mobileTimeoutMinutes : desktopTimeoutMinutes;
      const isSessionActive = diffMinutes <= timeoutLimit;

      return {
        id: s.session_id,
        userId: s.user_id,
        userName: s.display_name || (s.raw_user_meta_data?.displayName as string) || s.email?.split("@")[0] || "Operator",
        employeeId: (s.raw_user_meta_data?.employee_id as string) || `EMP-${shortId}`,
        deviceAlias: parsed.deviceAlias,
        browserUserAgent: parsed.browserSummary,
        ipAddress: rawIp,
        connectedZone: isAllowed ? "Authorized Warehouse Wi-Fi" : "External / Remote Network",
        sessionUuid: `SESS-${s.session_id.substring(0, 8).toUpperCase()}`,
        loginTime: new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        lastActiveTime: new Date(s.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        status: isSessionActive ? "active" : "idle",
      };
    });

    return { ok: true, data: sessions };
  } catch (err) {
    console.error("Failed to query real sessions:", err);
    return { ok: true, data: [] };
  }
}

export async function terminateAllMobileSessions(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "users.read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access denied." };
  }

  // Real emergency kill-switch: identify mobile sessions and delete from auth.sessions
  try {
    const rawSessions = (await db.execute(sql`
      SELECT id, user_id, user_agent FROM auth.sessions;
    `)) as Array<{ id: string; user_id: string; user_agent: string | null }>;

    const mobileSessionIds = rawSessions
      .filter((s) => parseUserAgentDevice(s.user_agent).isMobile)
      .map((s) => s.id);

    let count = 0;
    if (mobileSessionIds.length > 0) {
      await db.execute(sql`
        DELETE FROM auth.sessions WHERE id = ANY(${mobileSessionIds}::uuid[]);
      `);
      count = mobileSessionIds.length;
    }

    // Write audit record
    await db.insert(auditLog).values({
      actorUserId: permission.context.userId,
      actorRole: permission.context.activeRoleKeys[0] ?? "administrator",
      action: "emergency_killswitch_executed",
      entityType: "system_sessions",
      entityId: permission.context.userId,
      diffData: {
        disconnectedDeviceCount: count,
        terminatedSessionIds: mobileSessionIds,
        event: "floor_mobile_sessions_terminated",
      },
      correlationId: `KILLSWITCH-${Date.now()}`,
    }).catch(() => {});

    revalidatePath("/settings/security");
    return { ok: true, count };
  } catch (err) {
    console.error("Failed to terminate mobile sessions:", err);
    revalidatePath("/settings/security");
    return { ok: false, error: "Failed to execute emergency session termination." };
  }
}

export async function getSystemAuditEvents(): Promise<{ ok: true; data: SystemAuditEvent[] } | { ok: false; error: string }> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "users.read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access denied." };
  }

  let dbEventsList: SystemAuditEvent[] = [];
  try {
    const rawEvents = await withSettingsTimeout(
      db
        .select({
        id: auditLog.id,
        actorUserId: auditLog.actorUserId,
        actorRole: auditLog.actorRole,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        beforeData: auditLog.beforeData,
        afterData: auditLog.afterData,
        diffData: auditLog.diffData,
        correlationId: auditLog.correlationId,
        createdAt: auditLog.createdAt,
        actorName: userProfiles.displayName,
      })
      .from(auditLog)
      .leftJoin(userProfiles, eq(auditLog.actorUserId, userProfiles.id))
      .orderBy(desc(auditLog.createdAt))
        .limit(100),
      [],
    );

    if (rawEvents.length > 0) {
      dbEventsList = rawEvents.map((e) => {
        let changesDelta: Record<string, { before: unknown; after: unknown }> | null = null;
        if (e.diffData && typeof e.diffData === "object") {
          changesDelta = e.diffData as Record<string, { before: unknown; after: unknown }>;
        } else if (e.beforeData || e.afterData) {
          changesDelta = {
            snapshot: {
              before: e.beforeData,
              after: e.afterData,
            },
          };
        }

        const entity = e.entityType.toLowerCase();
        const auditModule: SystemAuditEvent["module"] =
          entity.includes("wrr") || entity.includes("lot") || entity.includes("item") || entity.includes("pick")
            ? "Floor & Stock"
            : entity.includes("billing") || entity.includes("margin") || entity.includes("soa") || entity.includes("tariff")
            ? "Financial & Billing"
            : entity.includes("role") || entity.includes("user") || entity.includes("permission")
            ? "RBAC & Admin"
            : "Security & BYOD";

        return {
          id: e.id,
          timestamp: e.createdAt.toISOString(),
          actor: e.actorName ? `${e.actorName} (${e.actorRole})` : `System (${e.actorRole})`,
          action: e.action,
          targetEntity: `${e.entityType.toUpperCase()}-${e.entityId ? e.entityId.substring(0, 8) : "REF"}`,
          targetId: e.entityId,
          module: auditModule,
          severity: (e.action.toLowerCase().includes("error") || e.action.toLowerCase().includes("block") || e.action.toLowerCase().includes("revoke")
            ? "critical"
            : e.action.toLowerCase().includes("override") || e.action.toLowerCase().includes("suspend")
            ? "warning"
            : "info") as SystemAuditEvent["severity"],
          deviceContext: `System (${e.correlationId.substring(0, 8)})`,
          changesDelta,
          rawDetails: JSON.stringify({
            action: e.action,
            entityType: e.entityType,
            entityId: e.entityId,
            diff: e.diffData,
          }),
        };
      });
    }
  } catch {
    // Database initial state
  }

  return { ok: true, data: dbEventsList };
}
