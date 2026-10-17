import { eq } from "drizzle-orm";
import { systemSettings } from "@/lib/db/schema";
import { withSettingsTimeout } from "@/lib/user-settings/with-timeout";

export type DocumentTemplate = {
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

export const DEFAULT_DOCUMENT_TEMPLATE: DocumentTemplate = {
  companyName: "DYNA-SERV GLOBAL CORPORATION",
  subtitle: "Warehouse Inventory Management System (WIMS)",
  facilityAddress: "Lot 14 Block 3, Laguna Technopark Special Economic Zone, Biñan, Laguna 4024",
  contactInfo: "Tel: +63 (49) 541-2345 | Mobile: +63 917 555 8899 | Email: warehouse.ops@dyna-serv.com",
  logoUrl: "/logo-hd.png",
  taxOrPezaReg: "",
  isoAccreditation: "",
  headerAlignment: "left",
  titleAlignment: "left",
  showSignatures: true,
  showDisclaimer: true,
  previewOrientation: "portrait",
};

type DbLike = {
  select: (...args: any[]) => any;
};

/** Loads the Settings > General document template without requiring settings-page access. */
export async function getDocumentTemplate(db: DbLike): Promise<DocumentTemplate> {
  const rows = await withSettingsTimeout(
    db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, "general")),
    [] as Array<{ value: unknown }>,
  );
  const stored = rows[0];
  const value = stored?.value as { printTemplate?: Partial<DocumentTemplate> } | undefined;
  return { ...DEFAULT_DOCUMENT_TEMPLATE, ...(value?.printTemplate ?? {}) };
}
