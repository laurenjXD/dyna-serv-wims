import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema/notifications";
import { roles, userProfiles, userRoles } from "@/lib/db/schema/rbac";
import { systemSettings } from "@/lib/db/schema/system_settings";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const LOW_STOCK_COOLDOWN_HOURS = 24;

type GeneralSettingsValue = {
  alerts?: {
    lowStockThresholdUnits?: number;
    lowStockThresholdCbm?: number;
    emailAlertsEnabled?: boolean;
    subscriptionEmail?: string;
  };
};

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Re-evaluates current stock after an authoritative inventory mutation.
 * Item min_reorder_level wins; the General Settings thresholds are the
 * fallback for catalog items that do not have an item-specific threshold.
 * Notifications are intentionally advisory and never participate in stock
 * mutations or receipt/dispatch success.
 */
export async function emitLowStockAlerts(): Promise<number> {
  try {
    const [settingsRow] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, "general"))
      .limit(1);
    const settings = (settingsRow?.value ?? {}) as GeneralSettingsValue;
    const fallbackUnits = numberOrZero(settings.alerts?.lowStockThresholdUnits);
    const fallbackCbm = numberOrZero(settings.alerts?.lowStockThresholdCbm);

    const lowStockRows = await db.execute(sql`
      WITH current_stock AS (
        SELECT
          i.id,
          i.code,
          i.name,
          i.uom,
          i.min_reorder_level,
          COALESCE(SUM(CASE WHEN l.status = 'available'::lot_status
            THEN COALESCE(lit.qty_remaining, 0) - COALESCE(lit.qty_committed, 0)
            ELSE 0 END), 0)::int AS available_qty,
          COALESCE(SUM(CASE WHEN l.status = 'available'::lot_status
            THEN ((COALESCE(lit.qty_remaining, 0) - COALESCE(lit.qty_committed, 0))::numeric / NULLIF(i.spq, 0)) * i.volume_cbm
            ELSE 0 END), 0)::numeric AS available_cbm
        FROM items i
        LEFT JOIN lots l ON l.item_id = i.id
        LEFT JOIN lot_location_balances lit ON lit.lot_id = l.id
        WHERE i.is_active = true
        GROUP BY i.id, i.code, i.name, i.uom, i.min_reorder_level
      )
      SELECT id, code, name, uom, min_reorder_level, available_qty, available_cbm,
        CASE WHEN min_reorder_level > 0 THEN min_reorder_level ELSE ${fallbackUnits} END AS effective_units
      FROM current_stock
      WHERE available_qty <= CASE WHEN min_reorder_level > 0 THEN min_reorder_level ELSE ${fallbackUnits} END
        OR (${fallbackCbm} > 0 AND available_cbm <= ${fallbackCbm})
    `) as Array<{
      id: string;
      code: string;
      name: string;
      uom: string;
      min_reorder_level: number;
      available_qty: number;
      available_cbm: string | number;
      effective_units: number;
    }>;

    if (lowStockRows.length === 0) return 0;

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

    const uniqueRecipientIds = [...new Set(recipients.map((row) => row.userId))];
    const cooldownStart = new Date(Date.now() - LOW_STOCK_COOLDOWN_HOURS * 60 * 60 * 1000);
    const serviceClient = createServiceRoleClient();
    let created = 0;

    for (const item of lowStockRows) {
      for (const recipientId of uniqueRecipientIds) {
        const existing = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(and(
            eq(notifications.recipientUserId, recipientId),
            eq(notifications.category, "low_stock"),
            eq(notifications.sourceId, item.id),
            gt(notifications.createdAt, cooldownStart),
          ))
          .limit(1);
        if (existing.length > 0) continue;

        const { error } = await serviceClient.from("notifications").insert({
          recipient_user_id: recipientId,
          category: "low_stock",
          title: `Low stock: ${item.code}`,
          body: `${item.name} has ${item.available_qty.toLocaleString()} ${item.uom} available; alert threshold is ${Number(item.effective_units).toLocaleString()} ${item.uom}.`,
          source_type: "item",
          source_id: item.id,
          flow_type: null,
          expires_at: null,
        });
        if (error) throw error;
        created += 1;
      }
    }

    if (created > 0 && settings.alerts?.emailAlertsEnabled && settings.alerts.subscriptionEmail && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: [settings.alerts.subscriptionEmail],
        subject: `WIMS low-stock alert (${lowStockRows.length} item${lowStockRows.length === 1 ? "" : "s"})`,
        html: `<p>Low-stock notifications were created for ${lowStockRows.length} item(s) in Dyna-Serv WIMS.</p><p>Review the in-app notifications for the authoritative item quantities and thresholds.</p>`,
      }).catch((error) => console.error("[notifications] low-stock email failed", error));
    }

    return created;
  } catch (error) {
    console.error("[notifications] low-stock evaluation failed", error);
    return 0;
  }
}
