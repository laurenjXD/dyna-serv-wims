import { describe, expect, it } from "vitest";
import { generalSettingsSchema, securitySettingsSchema } from "../settings-schemas";

const validSecuritySettings = {
  network: { wifiEnforcementEnabled: true, allowedIpRanges: ["192.168.10.0/24"] },
  authRules: {
    passwordMinLength: 10,
    requireSpecialChars: true,
    passwordExpiryDays: 90,
    mfaPolicy: "role_gated" as const,
    shiftQrLoginEnabled: true,
  },
  sessionConfig: { mobileIdleTimeoutMinutes: 15, desktopIdleTimeoutMinutes: 60 },
};

describe("settings payload schemas", () => {
  it("rejects unsafe security timeout and password values", () => {
    expect(securitySettingsSchema.safeParse({
      ...validSecuritySettings,
      authRules: { ...validSecuritySettings.authRules, passwordMinLength: 4 },
    }).success).toBe(false);
    expect(securitySettingsSchema.safeParse({
      ...validSecuritySettings,
      sessionConfig: { mobileIdleTimeoutMinutes: 0, desktopIdleTimeoutMinutes: 60 },
    }).success).toBe(false);
  });

  it("accepts the approved security policy shape", () => {
    expect(securitySettingsSchema.safeParse(validSecuritySettings).success).toBe(true);
    expect(securitySettingsSchema.safeParse({
      ...validSecuritySettings,
      network: { ...validSecuritySettings.network, allowedIpRanges: ["not-an-ip"] },
    }).success).toBe(false);
  });

  it("rejects invalid general contact and document values", () => {
    const result = generalSettingsSchema.safeParse({
      facility: {
        companyName: "Company", facilityName: "Warehouse", physicalAddress: "Address",
        contactPhone: "123", contactEmail: "not-an-email", tinNumber: "TIN",
        defaultZone: "Zone A", timezone: "UTC", dateFormat: "YYYY-MM-DD", timeClockFormat: "24h",
      },
      scanner: {
        continuousStream: true, torchDefault: false, tapToFocus: true,
        symbologies: { code128: true, qrCode: true, dataMatrix: true, gs1128: true },
        hapticFeedback: true, audioAlertTone: true,
      },
      alerts: {
        lowStockThresholdUnits: 10, lowStockThresholdCbm: 1, emailAlertsEnabled: true,
        qcQuarantineAlerts: true, dailyPdfReportSubscription: true, subscriptionEmail: "ops@example.com",
      },
      printTemplate: {
        companyName: "Company", subtitle: "WIMS", facilityAddress: "Address", contactInfo: "Contact",
        previewOrientation: "portrait",
      },
    });
    expect(result.success).toBe(false);
  });
});
