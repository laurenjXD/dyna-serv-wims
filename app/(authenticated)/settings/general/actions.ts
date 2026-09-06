"use server";

// Server Actions backing `/settings/general` — Facility, Scanner Engine, and Floor Alert configurations.

import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";

export interface GeneralSettingsData {
  facility: {
    warehouseId: string;
    warehouseName: string;
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
    warehouseId: "WH-01",
    warehouseName: "Main Laguna Hub — Biñan (WH-01)",
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
  revalidatePath("/settings/general");
  return { ok: true };
}
