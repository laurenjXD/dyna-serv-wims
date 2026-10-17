"use server";

// Server Actions backing `/settings/general` — Facility, Scanner Engine, and Floor Alert configurations.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { auditLog, systemSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  printTemplate: {
    companyName: string;
    subtitle: string;
    facilityAddress: string;
    contactInfo: string;
    logoUrl?: string;
    taxOrPezaReg?: string;
    isoAccreditation?: string;
    headerAlignment?: "left" | "center";
    titleAlignment?: "left" | "center";
    showSignatures?: boolean;
    showDisclaimer?: boolean;
    previewOrientation: "portrait" | "landscape";
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
  printTemplate: {
    companyName: "DYNA-SERV ENTERPRISES / LOGISTICS",
    subtitle: "Warehouse Inventory Management System (WIMS)",
    facilityAddress: "Lot 14 Block 3, Laguna Technopark Special Economic Zone, Biñan, Laguna 4024",
    contactInfo: "Tel: +63 (49) 541-2345 | Mobile: +63 917 555 8899 | Email: warehouse.ops@dyna-serv.com",
    logoUrl: "/logo-hd.png",
    taxOrPezaReg: "",
    isoAccreditation: "",
    headerAlignment: "left",
    titleAlignment: "left",
    showSignatures: true,
    showDisclaimer: false,
    previewOrientation: "portrait",
  },
};

const SETTINGS_QUERY_TIMEOUT_MS = 8000;

async function withSettingsQueryTimeout<T>(request: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("General settings query timed out")),
      SETTINGS_QUERY_TIMEOUT_MS,
    );
  });

  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export async function getGeneralSettings(): Promise<{ ok: true; data: GeneralSettingsData } | { ok: false; error: string }> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "users.read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access restricted to administrators." };
  }

  try {
    const [stored] = await withSettingsQueryTimeout(
      db.select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, "general")),
    );
    return {
      ok: true,
      data: stored?.value
        ? ({ ...DEFAULT_SETTINGS, ...(stored.value as Partial<GeneralSettingsData>) } as GeneralSettingsData)
        : DEFAULT_SETTINGS,
    };
  } catch (error) {
    console.error("[settings/general] failed to load settings", error);
    return { ok: false, error: "General settings could not be loaded." };
  }
}

export async function saveGeneralSettings(settings: GeneralSettingsData): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "users.read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "Access restricted to administrators." };
  }

  await db.insert(systemSettings).values({ key: "general", value: settings, updatedBy: permission.context.userId }).onConflictDoUpdate({
    target: systemSettings.key,
    set: { value: settings, updatedAt: new Date(), updatedBy: permission.context.userId },
  });

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
