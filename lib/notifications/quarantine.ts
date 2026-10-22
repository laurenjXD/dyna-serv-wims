import { and, eq, inArray, isNull, or, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema/notifications";
import { roles, userProfiles, userRoles } from "@/lib/db/schema/rbac";
import { systemSettings } from "@/lib/db/schema/system_settings";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Emits one in-app quarantine alert per active supervisor/administrator. */
export async function emitQuarantineAlert(sourceRefId: string, wrrNumber: string): Promise<number> {
  try {
    const [settingsRow] = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, "general"));
    const settings = settingsRow?.value as { alerts?: { qcQuarantineAlerts?: boolean } } | undefined;
    if (settings?.alerts?.qcQuarantineAlerts === false) return 0;

    const recipients = await db
      .select({ userId: userProfiles.id })
      .from(userProfiles)
      .innerJoin(userRoles, eq(userRoles.userId, userProfiles.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(
        eq(userProfiles.status, "active"),
        inArray(roles.key, ["administrator", "supervisor"]),
        eq(roles.isActive, true),
        isNull(userRoles.revokedAt),
        or(isNull(userRoles.validUntil), gt(userRoles.validUntil, new Date())),
      ));
    const ids = [...new Set(recipients.map((row) => row.userId))];
    if (ids.length === 0) return 0;

    const serviceClient = createServiceRoleClient();
    let created = 0;
    for (const recipientUserId of ids) {
      const { error } = await serviceClient.from("notifications").insert({
        recipient_user_id: recipientUserId,
        category: "quarantine",
        title: "Quality quarantine hold created",
        body: `Inbound WRR ${wrrNumber} created a quarantine hold requiring inspection review.`,
        source_type: "wrr_item",
        source_id: sourceRefId,
        flow_type: null,
        expires_at: null,
      });
      if (!error) created += 1;
    }
    return created;
  } catch (error) {
    console.error("[notifications] quarantine alert failed", error);
    return 0;
  }
}
