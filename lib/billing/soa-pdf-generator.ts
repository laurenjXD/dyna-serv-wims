// `soa-pdf-generator.ts` — 7-Document Supporting Billing Package Generator
//
// Generates reproducible, auditable Statement of Account (SOA) packages and
// sub-schedules directly from system data and posted billing ledger records.
//
// Supporting Documents:
//   1. Billing Statement / SOA
//   2. Delivery & Distribution Detail
//   3. LOA Detail
//   4. Surety Bond & Other Charges Detail
//   5. Manpower Detail
//   6. Summary of Charges
//   7. Detailed Warehousing Charges

export interface SoaHeaderData {
  soaNumber: string;
  customerName: string;
  contractNumber: string;
  billingPeriodLabel: string;
  currency: string;
  exchangeRate: number;
  issueDate: string;
  dueDate: string;
  openingBalanceUsd: number;
  currentChargesUsd: number;
  debitAdjustmentsUsd: number;
  creditsUsd: number;
  paymentsAppliedUsd: number;
  outstandingBalanceUsd: number;
}

export interface WarehousingDailyRow {
  date: string;
  beginningCbm: number;
  inboundFgCbm: number;
  inboundRawCbm: number;
  outboundFgCbm: number;
  outboundRawCbm: number;
  endingCbm: number;
  rateUsd: number;
  amountUsd: number;
}

export interface DeliveryDetailRow {
  date: string;
  drReference: string;
  consignee: string;
  deliveryChargesUsd: number;
  documentationChargesUsd: number;
  remarks: string;
}

export interface LoaDetailRow {
  permitNumber: string;
  itemScope: string;
  validFrom: string;
  validTo: string;
  monthlyFeeUsd: number;
}

export interface ManpowerDetailRow {
  role: string;
  hours: number;
  ratePerHour: number;
  amountUsd: number;
  notes?: string;
}

export interface OtherChargeRow {
  chargeName: string;
  chargeCode: string;
  basis: string;
  amountUsd: number;
  notes?: string;
}

export interface CategorySummaryRow {
  category: string;
  label: string;
  amountUsd: number;
}

export interface FullBillingPackageData {
  header: SoaHeaderData;
  summary: CategorySummaryRow[];
  warehousingSchedule?: WarehousingDailyRow[];
  deliverySchedule?: DeliveryDetailRow[];
  loaSchedule?: LoaDetailRow[];
  manpowerSchedule?: ManpowerDetailRow[];
  otherChargesSchedule?: OtherChargeRow[];
}

/**
 * Generates the structured content JSON for all 7 sections of the supporting
 * billing package from database ledger and calculation records.
 */
export function generateBillingPackageContent(data: FullBillingPackageData) {
  const sections = [];

  // Section 1: Billing Statement / SOA Header
  sections.push({
    sectionNumber: 1,
    title: "Billing Statement / Statement of Account",
    header: data.header,
  });

  // Section 2: Delivery & Distribution Detail
  if (data.deliverySchedule && data.deliverySchedule.length > 0) {
    sections.push({
      sectionNumber: 2,
      title: "Delivery & Distribution Detail",
      rows: data.deliverySchedule,
    });
  }

  // Section 3: LOA Detail
  if (data.loaSchedule && data.loaSchedule.length > 0) {
    sections.push({
      sectionNumber: 3,
      title: "Letter of Authority (LOA) Detail",
      rows: data.loaSchedule,
    });
  }

  // Section 4: Surety Bond & Other Charges Detail
  if (data.otherChargesSchedule && data.otherChargesSchedule.length > 0) {
    sections.push({
      sectionNumber: 4,
      title: "Surety Bond & Other Contractual Charges Detail",
      rows: data.otherChargesSchedule,
    });
  }

  // Section 5: Manpower Detail
  if (data.manpowerSchedule && data.manpowerSchedule.length > 0) {
    sections.push({
      sectionNumber: 5,
      title: "Manpower Activity Detail",
      rows: data.manpowerSchedule,
    });
  }

  // Section 6: Summary of Charges
  sections.push({
    sectionNumber: 6,
    title: "Summary of Charges by Category",
    rows: data.summary,
  });

  // Section 7: Detailed Warehousing Charges
  if (data.warehousingSchedule && data.warehousingSchedule.length > 0) {
    sections.push({
      sectionNumber: 7,
      title: "Detailed Warehousing Daily CBM Calculation Schedule",
      rows: data.warehousingSchedule,
    });
  }

  return {
    documentNumber: data.header.soaNumber,
    generatedAt: new Date().toISOString(),
    totalSections: sections.length,
    sections,
  };
}
