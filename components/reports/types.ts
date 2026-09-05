// TypeScript definitions for Warehouse Reports & Financial Settlement Hub

export type DateHorizon = "7D" | "30D" | "90D" | "custom";

export type FacilityZone = "all" | "main-dc-a" | "main-dc-b" | "cold-chain";

export type FlowSegment = "all" | "vmi" | "trading" | "supplies";

export type IntervalType = "daily" | "weekly" | "monthly";

export type HeatmapMetricType = "pickActivity" | "inventoryAging" | "varianceRate";

export type ReportCategory = "Financial" | "Inventory" | "Operations" | "Settlement";

export type ReportFormat = "PDF" | "CSV" | "XLSX";

export type ReportStatus = "Ready" | "Processing" | "Failed";

export interface VmiBillingRow {
  id: string;
  clientName: string;
  clientCode: string;
  allocatedSpaceCbm: number;
  occupiedCbm: number;
  utilizationPct: number;
  contractedRatePerCbmDay: number;
  mtdAccruedStorage: number;
  unbilledDays: number;
  billingStatus: "Ready to Invoice" | "Draft Generated" | "Paid";
  contactPerson: string;
  currency: string;
}

export interface TradingMarginRow {
  period: string;
  grossRevenue: number;
  cogs: number;
  marginPct: number;
  targetMarginPct: number;
}

export interface TradingCategoryPerformance {
  category: string;
  unitsSold: number;
  grossRevenue: number;
  cogs: number;
  netMargin: number;
  marginPct: number;
  deltaVsSlaPct: number;
}

export interface MovementThroughputDatum {
  label: string;
  inboundQty: number;
  outboundQty: number;
  vmiQty?: number;
  tradingQty?: number;
  suppliesQty?: number;
}

export interface DeliverySlaDatum {
  period: string;
  otifRate: number;
  otdRate: number;
  fillRate: number;
  targetOtif: number;
}

export interface LocationOccupancyDatum {
  zone: string;
  percentage: number;
  cbm: number;
  color: string;
}

export interface ReportArchiveItem {
  id: string;
  reportName: string;
  category: ReportCategory;
  dateRangeCovered: string;
  generatedBy: {
    name: string;
    role: string;
    avatarUrl?: string;
  };
  generatedAt: string;
  fileSizeFormatted: string;
  format: ReportFormat;
  status: ReportStatus;
  downloadUrl?: string;
}

export interface PreBuiltTemplate {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  lastRunDate: string;
  scheduleFrequency: string;
  supportedFormats: ReportFormat[];
  recordCount: number;
  estimatedGenerationSec: number;
}

export interface ReportFilterState {
  facility: FacilityZone;
  horizon: DateHorizon;
  startDate: string;
  endDate: string;
  flow: FlowSegment;
}
