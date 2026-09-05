import type {
  VmiBillingRow,
  TradingMarginRow,
  TradingCategoryPerformance,
  MovementThroughputDatum,
  DeliverySlaDatum,
  LocationOccupancyDatum,
  ReportArchiveItem,
  PreBuiltTemplate,
} from "../types";

// ─── 1. VMI Client Storage & CBM Billing Reconciliation Seed ─────────────────
export const VMI_BILLING_SEED: VmiBillingRow[] = [
  {
    id: "vmi-001",
    clientName: "Siemens AG",
    clientCode: "SIE-DE",
    allocatedSpaceCbm: 450,
    occupiedCbm: 382,
    utilizationPct: 85,
    contractedRatePerCbmDay: 0.48,
    mtdAccruedStorage: 5684.16,
    unbilledDays: 31,
    billingStatus: "Ready to Invoice",
    contactPerson: "K. Becker (Supply Chain VP)",
    currency: "USD",
  },
  {
    id: "vmi-002",
    clientName: "ABB Group",
    clientCode: "ABB-CH",
    allocatedSpaceCbm: 300,
    occupiedCbm: 215,
    utilizationPct: 72,
    contractedRatePerCbmDay: 0.50,
    mtdAccruedStorage: 3332.50,
    unbilledDays: 31,
    billingStatus: "Ready to Invoice",
    contactPerson: "M. Rossi (Logistics Director)",
    currency: "USD",
  },
  {
    id: "vmi-003",
    clientName: "Fanuc Corporation",
    clientCode: "FAN-JP",
    allocatedSpaceCbm: 250,
    occupiedCbm: 198,
    utilizationPct: 79,
    contractedRatePerCbmDay: 0.46,
    mtdAccruedStorage: 2823.36,
    unbilledDays: 31,
    billingStatus: "Ready to Invoice",
    contactPerson: "T. Tanaka (APAC Operations)",
    currency: "USD",
  },
  {
    id: "vmi-004",
    clientName: "Ampleon Philippines",
    clientCode: "AMP-PH",
    allocatedSpaceCbm: 200,
    occupiedCbm: 142,
    utilizationPct: 71,
    contractedRatePerCbmDay: 0.52,
    mtdAccruedStorage: 2289.04,
    unbilledDays: 31,
    billingStatus: "Draft Generated",
    contactPerson: "R. Dela Cruz (Plant Mgr)",
    currency: "USD",
  },
  {
    id: "vmi-005",
    clientName: "Schneider Electric",
    clientCode: "SCH-FR",
    allocatedSpaceCbm: 180,
    occupiedCbm: 120,
    utilizationPct: 67,
    contractedRatePerCbmDay: 0.49,
    mtdAccruedStorage: 1822.80,
    unbilledDays: 31,
    billingStatus: "Paid",
    contactPerson: "J. Dupont (Finance Lead)",
    currency: "USD",
  },
];

// ─── 2. Trading Revenue, COGS & Realized Margin Seed ──────────────────────────
export const TRADING_MARGIN_SEED: TradingMarginRow[] = [
  { period: "Mar 2026", grossRevenue: 420000, cogs: 340200, marginPct: 19.0, targetMarginPct: 20.0 },
  { period: "Apr 2026", grossRevenue: 460000, cogs: 368000, marginPct: 20.0, targetMarginPct: 20.0 },
  { period: "May 2026", grossRevenue: 510000, cogs: 418200, marginPct: 18.0, targetMarginPct: 20.0 },
  { period: "Jun 2026", grossRevenue: 540000, cogs: 432000, marginPct: 20.0, targetMarginPct: 20.0 },
  { period: "Jul 2026", grossRevenue: 590000, cogs: 483800, marginPct: 18.0, targetMarginPct: 20.0 },
  { period: "Aug 2026 (MTD)", grossRevenue: 640000, cogs: 522240, marginPct: 18.4, targetMarginPct: 20.0 },
];

// ─── 3. Trading Product Line Margin Breakdown Seed ────────────────────────────
export const TRADING_CATEGORY_SEED: TradingCategoryPerformance[] = [
  {
    category: "Bearings & Transmission",
    unitsSold: 3450,
    grossRevenue: 245000,
    cogs: 190120,
    netMargin: 54880,
    marginPct: 22.4,
    deltaVsSlaPct: 2.4,
  },
  {
    category: "Robotics & Automation",
    unitsSold: 820,
    grossRevenue: 182000,
    cogs: 137956,
    netMargin: 44044,
    marginPct: 24.2,
    deltaVsSlaPct: 4.2,
  },
  {
    category: "Hydraulics & Seals",
    unitsSold: 2180,
    grossRevenue: 118000,
    cogs: 94636,
    netMargin: 23364,
    marginPct: 19.8,
    deltaVsSlaPct: -0.2,
  },
  {
    category: "Industrial Drives",
    unitsSold: 1240,
    grossRevenue: 95000,
    cogs: 78755,
    netMargin: 16245,
    marginPct: 17.1,
    deltaVsSlaPct: -2.9,
  },
];

// ─── 4. Throughput & Movement Volume Seed ─────────────────────────────────────
export const THROUGHPUT_DAILY_SEED: MovementThroughputDatum[] = [
  { label: "Mon 08/25", inboundQty: 2450, outboundQty: 2180, vmiQty: 1800, tradingQty: 550, suppliesQty: 100 },
  { label: "Tue 08/26", inboundQty: 2800, outboundQty: 2400, vmiQty: 2050, tradingQty: 620, suppliesQty: 130 },
  { label: "Wed 08/27", inboundQty: 3100, outboundQty: 2750, vmiQty: 2300, tradingQty: 690, suppliesQty: 110 },
  { label: "Thu 08/28", inboundQty: 2600, outboundQty: 2300, vmiQty: 1900, tradingQty: 590, suppliesQty: 110 },
  { label: "Fri 08/29", inboundQty: 3870, outboundQty: 3610, vmiQty: 2850, tradingQty: 890, suppliesQty: 130 },
];

export const THROUGHPUT_WEEKLY_SEED: MovementThroughputDatum[] = [
  { label: "Week 31 (Aug 1-7)", inboundQty: 14200, outboundQty: 12800, vmiQty: 10200, tradingQty: 3400, suppliesQty: 600 },
  { label: "Week 32 (Aug 8-14)", inboundQty: 15400, outboundQty: 14100, vmiQty: 11100, tradingQty: 3700, suppliesQty: 600 },
  { label: "Week 33 (Aug 15-21)", inboundQty: 16100, outboundQty: 14900, vmiQty: 11800, tradingQty: 3650, suppliesQty: 650 },
  { label: "Week 34 (Aug 22-28)", inboundQty: 14820, outboundQty: 13240, vmiQty: 10900, tradingQty: 3320, suppliesQty: 600 },
];

export const THROUGHPUT_MONTHLY_SEED: MovementThroughputDatum[] = [
  { label: "May 2026", inboundQty: 54000, outboundQty: 49500, vmiQty: 39500, tradingQty: 12500, suppliesQty: 2000 },
  { label: "Jun 2026", inboundQty: 58200, outboundQty: 53100, vmiQty: 42000, tradingQty: 13800, suppliesQty: 2400 },
  { label: "Jul 2026", inboundQty: 61500, outboundQty: 56800, vmiQty: 45000, tradingQty: 14100, suppliesQty: 2400 },
  { label: "Aug 2026 (MTD)", inboundQty: 60520, outboundQty: 55040, vmiQty: 44000, tradingQty: 14090, suppliesQty: 2430 },
];

// ─── 5. Delivery SLA & OTIF Fulfillment Seed ──────────────────────────────────
export const DELIVERY_SLA_SEED: DeliverySlaDatum[] = [
  { period: "Aug 01-05", otifRate: 94.2, otdRate: 97.4, fillRate: 98.8, targetOtif: 95.0 },
  { period: "Aug 06-10", otifRate: 95.8, otdRate: 98.2, fillRate: 99.1, targetOtif: 95.0 },
  { period: "Aug 11-15", otifRate: 96.4, otdRate: 98.6, fillRate: 99.4, targetOtif: 95.0 },
  { period: "Aug 16-20", otifRate: 95.1, otdRate: 97.9, fillRate: 99.0, targetOtif: 95.0 },
  { period: "Aug 21-25", otifRate: 97.2, otdRate: 99.1, fillRate: 99.6, targetOtif: 95.0 },
  { period: "Aug 26-31", otifRate: 96.8, otdRate: 98.8, fillRate: 99.3, targetOtif: 95.0 },
];

// ─── 6. Location Occupancy & Capacity Utilization Seed ────────────────────────
export const LOCATION_OCCUPANCY_SEED: LocationOccupancyDatum[] = [
  { zone: "Zone A High-Bay", percentage: 38, cbm: 760, color: "#2563EB" },
  { zone: "Zone B Racks", percentage: 28, cbm: 560, color: "#0F172A" },
  { zone: "Cold Storage", percentage: 18, cbm: 360, color: "#0D9488" },
  { zone: "Overflow & Bulk", percentage: 16, cbm: 320, color: "#F59E0B" },
];

// ─── 7. Pre-Built Operational Templates Seed ─────────────────────────────────
export const PRE_BUILT_TEMPLATES_SEED: PreBuiltTemplate[] = [
  {
    id: "tpl-01",
    title: "Master Stock Position & Valuation",
    description: "Full itemized valuation, SKU quantities, and safety stock deficits across VMI, Trading, and Supplies.",
    category: "Inventory",
    lastRunDate: "Today at 08:30 AM",
    scheduleFrequency: "Daily at 06:00 AM",
    supportedFormats: ["PDF", "CSV", "XLSX"],
    recordCount: 1420,
    estimatedGenerationSec: 3,
  },
  {
    id: "tpl-02",
    title: "VMI Consignment & CBM Storage Invoice",
    description: "Client-by-client space consumption, average daily CBM, contracted rates, and unbilled storage balance.",
    category: "Settlement",
    lastRunDate: "Aug 31, 2026",
    scheduleFrequency: "Monthly on 1st",
    supportedFormats: ["PDF", "XLSX"],
    recordCount: 380,
    estimatedGenerationSec: 2,
  },
  {
    id: "tpl-03",
    title: "Monthly Throughput Movement & Flow",
    description: "Detailed operational logs of Inbound WRRs, outbound pick lists, dock turnaround, and net volumetric delta.",
    category: "Operations",
    lastRunDate: "Yesterday at 05:00 PM",
    scheduleFrequency: "Weekly on Monday",
    supportedFormats: ["PDF", "CSV", "XLSX"],
    recordCount: 8900,
    estimatedGenerationSec: 4,
  },
  {
    id: "tpl-04",
    title: "Trading Margin Realization & COGS Audit",
    description: "Product line financial performance, margin gaps against the 20% SLA, and customer invoice reconciliations.",
    category: "Financial",
    lastRunDate: "Aug 28, 2026",
    scheduleFrequency: "Bi-Weekly",
    supportedFormats: ["PDF", "XLSX"],
    recordCount: 650,
    estimatedGenerationSec: 2,
  },
  {
    id: "tpl-05",
    title: "OTIF & Carrier Delivery Performance",
    description: "SLA adherence curves, dock-to-delivery lead times, on-time rates, and vehicle dispatch logs.",
    category: "Operations",
    lastRunDate: "Today at 09:15 AM",
    scheduleFrequency: "Daily at 07:00 AM",
    supportedFormats: ["PDF", "CSV"],
    recordCount: 1240,
    estimatedGenerationSec: 2,
  },
];

// ─── 8. Generated Reports Archive & Audit Log Seed ───────────────────────────
export const REPORT_ARCHIVE_SEED: ReportArchiveItem[] = [
  {
    id: "rep-001",
    reportName: "Monthly_Inventory_Valuation_Aug2026.pdf",
    category: "Inventory",
    dateRangeCovered: "Aug 01, 2026 – Aug 31, 2026",
    generatedBy: { name: "L. Quidit", role: "Warehouse Supervisor" },
    generatedAt: "2 hours ago",
    fileSizeFormatted: "2.4 MB",
    format: "PDF",
    status: "Ready",
  },
  {
    id: "rep-002",
    reportName: "VMI_Siemens_CBM_Recon_Aug2026.xlsx",
    category: "Settlement",
    dateRangeCovered: "Aug 01, 2026 – Aug 31, 2026",
    generatedBy: { name: "Finance Automated Agent", role: "System Schedule" },
    generatedAt: "4 hours ago",
    fileSizeFormatted: "480 KB",
    format: "XLSX",
    status: "Ready",
  },
  {
    id: "rep-003",
    reportName: "Trading_COGS_Margin_Audit_Q3_Draft.pdf",
    category: "Financial",
    dateRangeCovered: "Jul 01, 2026 – Aug 31, 2026",
    generatedBy: { name: "A. Santos", role: "Commercial Controller" },
    generatedAt: "Yesterday at 16:45",
    fileSizeFormatted: "1.8 MB",
    format: "PDF",
    status: "Ready",
  },
  {
    id: "rep-004",
    reportName: "OTIF_Carrier_SLA_Week34.csv",
    category: "Operations",
    dateRangeCovered: "Aug 22, 2026 – Aug 28, 2026",
    generatedBy: { name: "R. Tan", role: "Logistics Lead" },
    generatedAt: "Aug 29, 2026",
    fileSizeFormatted: "920 KB",
    format: "CSV",
    status: "Ready",
  },
  {
    id: "rep-005",
    reportName: "Master_Lot_Traceability_Export.xlsx",
    category: "Inventory",
    dateRangeCovered: "Jan 01, 2026 – Aug 31, 2026",
    generatedBy: { name: "L. Quidit", role: "Warehouse Supervisor" },
    generatedAt: "Aug 28, 2026",
    fileSizeFormatted: "5.2 MB",
    format: "XLSX",
    status: "Ready",
  },
  {
    id: "rep-006",
    reportName: "Fanuc_Consignment_Billing_Period8.pdf",
    category: "Settlement",
    dateRangeCovered: "Aug 01, 2026 – Aug 31, 2026",
    generatedBy: { name: "Billing Engine v2", role: "Cron Job" },
    generatedAt: "Just now",
    fileSizeFormatted: "1.1 MB",
    format: "PDF",
    status: "Processing",
  },
];
