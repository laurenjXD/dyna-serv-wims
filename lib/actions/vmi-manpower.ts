"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { vmiManpowerHoursLog, vmiRecurringFeeLines } from "@/lib/db/schema/vmi_billing";

export type LogManpowerHoursState = {
  ok?: boolean;
  error?: string;
};

export async function logManpowerHoursAction(
  _prevState: LogManpowerHoursState,
  formData: FormData,
): Promise<LogManpowerHoursState> {
  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return { ok: false, error: "Unauthorized to log manpower hours." };
  }

  const partyId = String(formData.get("partyId") ?? "");
  const recurringFeeLineId = String(formData.get("recurringFeeLineId") ?? "");
  const periodStartDate = String(formData.get("periodStartDate") ?? "");
  const periodEndDate = String(formData.get("periodEndDate") ?? "");
  const hoursStr = String(formData.get("hours") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!partyId || !periodStartDate || !periodEndDate) {
    return { ok: false, error: "Organization and period dates are required." };
  }

  const hours = parseFloat(hoursStr);
  if (isNaN(hours) || hours < 0) {
    return { ok: false, error: "Hours must be a non-negative number." };
  }

  try {
    let targetFeeLineId = recurringFeeLineId;
    if (!targetFeeLineId) {
      // Find active manpower recurring fee line for this party
      const existingFeeLine = await db
        .select({ id: vmiRecurringFeeLines.id })
        .from(vmiRecurringFeeLines)
        .where(
          and(
            eq(vmiRecurringFeeLines.partyId, partyId),
            eq(vmiRecurringFeeLines.feeType, "manpower"),
            eq(vmiRecurringFeeLines.isActive, true),
          ),
        )
        .limit(1);

      if (existingFeeLine.length > 0) {
        targetFeeLineId = existingFeeLine[0].id;
      } else {
        // Create default manpower recurring fee line ($10.00/hr)
        const [newLine] = await db
          .insert(vmiRecurringFeeLines)
          .values({
            partyId,
            feeType: "manpower",
            label: "Warehouse Manpower / Overtime",
            flatAmountUsd: "0.00",
            manpowerRatePerHour: "10.00",
            isActive: true,
          })
          .returning({ id: vmiRecurringFeeLines.id });
        targetFeeLineId = newLine.id;
      }
    }

    // Upsert into vmi_manpower_hours_log
    const existingLog = await db
      .select({ id: vmiManpowerHoursLog.id })
      .from(vmiManpowerHoursLog)
      .where(
        and(
          eq(vmiManpowerHoursLog.recurringFeeLineId, targetFeeLineId),
          eq(vmiManpowerHoursLog.periodStartDate, periodStartDate),
          eq(vmiManpowerHoursLog.periodEndDate, periodEndDate),
        ),
      )
      .limit(1);

    if (existingLog.length > 0) {
      await db
        .update(vmiManpowerHoursLog)
        .set({
          hours: hours.toFixed(2),
          notes: notes || null,
          recordedByUserId: permResult.context.userId ?? null,
        })
        .where(eq(vmiManpowerHoursLog.id, existingLog[0].id));
    } else {
      await db.insert(vmiManpowerHoursLog).values({
        partyId,
        recurringFeeLineId: targetFeeLineId,
        periodStartDate,
        periodEndDate,
        hours: hours.toFixed(2),
        notes: notes || null,
        recordedByUserId: permResult.context.userId ?? null,
      });
    }

    revalidatePath("/billing-pricing");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save manpower hours.";
    return { ok: false, error: message };
  }
}
