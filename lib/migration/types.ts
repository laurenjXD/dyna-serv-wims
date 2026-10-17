export type MigrationSeverity = "blocking" | "warning";

export interface MigrationIssue {
  severity: MigrationSeverity;
  code: string;
  message: string;
  sheet?: string;
  row?: number;
}

export interface UbotPartyDraft {
  sourceRow: number;
  name: string;
  address1?: string;
  address2?: string;
  paymentTerms?: string;
  active: boolean;
  role: "supplier" | "end_customer";
}

export interface UbotItemDraft {
  sourceRow: number;
  code: string;
  name: string;
  category?: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  spq?: number;
  boxesPerPallet?: number;
  volumeCm3?: number;
  volumeCbm?: number;
  spqMeter?: number;
}

export interface UbotLocationDraft {
  sourceRow: number;
  label: string;
  zone: string;
  rack: string;
  level: string;
  position: string;
  locationType: "receiving_bay" | "storage";
  maxCbmCapacity?: number;
}

export interface UbotOpeningBalanceDraft {
  sourceRow: number;
  locationLabel: string;
  itemCode: string;
  lotNumber: string;
  quantity: number;
  boxes?: number;
  ownerPartyName: string;
  flowType: "vmi";
}

export interface UbotRateDraft {
  sourceRow: number;
  partyName: string;
  chargeType: string;
  basis?: string;
  rate: number;
  currency: string;
  active: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface UbotMigrationDraft {
  profileKey: "ubot-vmi-v1";
  organizationName: "UBoT Incorporated Limited";
  flowType: "vmi";
  openingDate: string;
  parties: UbotPartyDraft[];
  items: UbotItemDraft[];
  locations: UbotLocationDraft[];
  openingBalances: UbotOpeningBalanceDraft[];
  rates: UbotRateDraft[];
  referenceSheets: string[];
  issues: MigrationIssue[];
}
