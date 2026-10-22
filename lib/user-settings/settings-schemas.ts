import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);
const ipv4Cidr = z.string().trim().refine((value) => {
  const [address, prefix] = value.split("/");
  const octets = address?.split(".") ?? [];
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)) return false;
  return prefix === undefined || (/^\d{1,2}$/.test(prefix) && Number(prefix) >= 0 && Number(prefix) <= 32);
}, "Enter a valid IPv4 address or CIDR range.");

export const securitySettingsSchema = z.object({
  network: z.object({
    wifiEnforcementEnabled: z.boolean(),
    allowedIpRanges: z.array(ipv4Cidr).max(100),
  }),
  authRules: z.object({
    passwordMinLength: z.number().int().min(8).max(128),
    requireSpecialChars: z.boolean(),
    passwordExpiryDays: z.number().int().min(0).max(3650),
    mfaPolicy: z.enum(["optional", "enforced", "role_gated"]),
    shiftQrLoginEnabled: z.boolean(),
  }),
  sessionConfig: z.object({
    mobileIdleTimeoutMinutes: z.number().int().min(1).max(1440),
    desktopIdleTimeoutMinutes: z.number().int().min(1).max(1440),
  }),
});

export const generalSettingsSchema = z.object({
  facility: z.object({
    companyName: nonEmptyText,
    facilityName: nonEmptyText,
    physicalAddress: nonEmptyText,
    contactPhone: nonEmptyText,
    contactEmail: z.string().trim().email(),
    tinNumber: z.string().trim().min(1),
    defaultZone: nonEmptyText,
    timezone: nonEmptyText,
    dateFormat: z.enum(["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"]),
    timeClockFormat: z.enum(["12h", "24h"]),
  }),
  scanner: z.object({
    continuousStream: z.boolean(),
    torchDefault: z.boolean(),
    tapToFocus: z.boolean(),
    symbologies: z.object({
      code128: z.boolean(),
      qrCode: z.boolean(),
      dataMatrix: z.boolean(),
      gs1128: z.boolean(),
    }),
    hapticFeedback: z.boolean(),
    audioAlertTone: z.boolean(),
  }),
  alerts: z.object({
    lowStockThresholdUnits: z.number().int().min(0).max(1_000_000),
    lowStockThresholdCbm: z.number().min(0).max(1_000_000),
    emailAlertsEnabled: z.boolean(),
    qcQuarantineAlerts: z.boolean(),
    dailyPdfReportSubscription: z.boolean(),
    subscriptionEmail: z.string().trim().email(),
  }),
  printTemplate: z.object({
    companyName: nonEmptyText,
    subtitle: nonEmptyText,
    facilityAddress: nonEmptyText,
    contactInfo: nonEmptyText,
    logoUrl: z.string().max(4_000_000).optional(),
    taxOrPezaReg: z.string().optional(),
    isoAccreditation: z.string().optional(),
    headerAlignment: z.enum(["left", "center"]).optional(),
    titleAlignment: z.enum(["left", "center"]).optional(),
    showSignatures: z.boolean().optional(),
    showDisclaimer: z.boolean().optional(),
    previewOrientation: z.enum(["portrait", "landscape"]),
  }),
});

export type ValidatedSecuritySettings = z.infer<typeof securitySettingsSchema>;
export type ValidatedGeneralSettings = z.infer<typeof generalSettingsSchema>;
