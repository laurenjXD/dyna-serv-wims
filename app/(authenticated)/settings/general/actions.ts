"use server";

// Server Actions backing `/settings/general` — Facility, Scanner Engine, and Floor Alert configurations.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";

export interface GeneralSettingsData {
  facility: {
    companyName: string;
    facilityName: string;
    physicalAddress: string;
    contactPhone: string;
    contactEmail: string;
    tinNumber: string;
    defaultZone: string;
    timezone: string;
    dateFormat: string;
    timeClockFormat: "12h" | "24h";
  };
  scanner: {
    continuousStream: boolean;
    torchDefault: boolean;
    tapToFocus: boolean;
    symbologies: {
      code128: boolean;
      qrCode: boolean;
      dataMatrix: boolean;
      gs1128: boolean;
    };
    hapticFeedback: boolean;
    audioAlertTone: boolean;
  };
  alerts: {
    lowStockThresholdUnits: number;
    lowStockThresholdCbm: number;
    emailAlertsEnabled: boolean;
    qcQuarantineAlerts: boolean;
    dailyPdfReportSubscription: boolean;
    subscriptionEmail: string;
  };
}

const DEFAULT_SETTINGS: GeneralSettingsData = {
  facility: {
    companyName: "Dyna-Serv Logistics Philippines Inc.",
    facilityName: "Main Warehouse & Logistics Hub — Biñan",
    physicalAddress: "Lot 14 Block 3, Laguna Technopark Special Economic Zone, Biñan, Laguna 4024, Philippines",
    contactPhone: "+63 (49) 541-2345 / +63 917 555 8899",
    contactEmail: "warehouse.ops@dyna-serv.com",
    tinNumber: "008-765-432-000",
    defaultZone: "Zone A — Intake & Staging",
    timezone: "Asia/Manila (GMT+8)",
    dateFormat: "YYYY-MM-DD",
    timeClockFormat: "12h",
  },
  scanner: {
    continuousStream: true,
    torchDefault: false,
    tapToFocus: true,
    symbologies: {
      code128: true,
      qrCode: true,
      dataMatrix: true,
      gs1128: true,
    },
    hapticFeedback: true,
    audioAlertTone: true,
  },
  alerts: {
    lowStockThresholdUnits: 50,
    lowStockThresholdCbm: 5.0,
    emailAlertsEnabled: true,
    qcQuarantineAlerts: true,
    dailyPdfReportSubscription: true,
    subscriptionEmail: "operations@dyna-serv.example",
  },
};

// In-memory persistent store fallback for active session
let runtimeGeneralSettings = { ...DEFAULT_SETTINGS };

export async function getGeneralSettings(): Promise<{ ok: true; data: GeneralSettingsData } | { ok: false; error: string }> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "users.read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access restricted to administrators." };
  }

  return { ok: true, data: runtimeGeneralSettings };
}

export async function saveGeneralSettings(settings: GeneralSettingsData): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "users.read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access restricted to administrators." };
  }

  runtimeGeneralSettings = { ...settings };

  // Record audit log
  try {
    await db.insert(auditLog).values({
      actorUserId: permission.context.userId,
      actorRole: permission.context.activeRoleKeys[0] ?? "administrator",
      action: "general_settings_updated",
      entityType: "system_preferences",
      entityId: permission.context.userId,
      diffData: {
        companyName: settings.facility.companyName,
        facilityName: settings.facility.facilityName,
        physicalAddress: settings.facility.physicalAddress,
        defaultZone: settings.facility.defaultZone,
        scannerContinuous: settings.scanner.continuousStream,
        lowStockUnits: settings.alerts.lowStockThresholdUnits,
      },
      correlationId: `GEN-${Date.now()}`,
    });
  } catch {
    // ignore logging failure
  }

  revalidatePath("/settings/general");
  return { ok: true };
}
