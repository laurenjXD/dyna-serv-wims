// `components/dashboard/types.ts` — TypeScript definitions for WMS Operations Dashboard.

export type FlowTypeFilter = "all" | "vmi" | "trading" | "supplies";

export interface DashboardKpiData {
  valuation: {
    total: number;
    trendPct: number;
    trendDirection: "up" | "down" | "flat";
    vmiAmount: number;
    tradingAmount: number;
  };
  floorQueues: {
    pendingReceivingWrrs: number;
    activePickLists: number;
    pendingQcInspections: number;
  };
  stockHealth: {
    lowStockCount: number;
    heldLotsCount: number;
    qcPassRatePct: number;
  };
  financialSummary: {
    vmiDailyCbmRate: number;
    vmiClientCount: number;
    tradingMarginPct: number;
    tradingMarginTargetPct: number;
    pendingBillingAmount: number;
    pendingInvoicesCount: number;
  };
}

export interface MonthlyFlowDatum {
  month: string;
  inbound: number;
  outbound: number;
  flowType: FlowTypeFilter;
}

export interface DeliveryPerformanceDatum {
  month: string;
  otifRate: number;
  otdRate: number;
  inFullRate: number;
}

export interface DeliveryPerformanceMiniMetrics {
  avgLeadTimeHours: number;
  firstAttemptDeliveryRatePct: number;
  freightDamageClaimsPct: number;
  slaTargetPct: number;
}

export interface LocationOccupancyDatum {
  name: string;
  value: number;
  color: string;
  cbmUsed: number;
  cbmTotal: number;
}

export type HeatmapMetricView = "pickActivity" | "inventoryAging" | "varianceRate";

export interface BinSkuActivity {
  sku: string;
  itemName: string;
  action: "PICK" | "PUTAWAY" | "INSPECTION" | "CYCLE_COUNT";
  qty: number;
  uom: string;
  lotNumber: string;
  timestamp: string;
  operatorBadge: string;
  notes?: string;
}

export interface BinAuditRecord {
  binId: string;
  date: string;
  dayNumber: number;
  monthName: string;
  year: number;
  metricType: HeatmapMetricView;
  metricValue: number;
  metricFormatted: string;
  status: "normal" | "warning" | "critical" | "idle";
  activities: BinSkuActivity[];
  discrepancyLog?: string;
  holdReason?: string;
  qaNotes?: string;
}

export interface HeatmapCellDatum {
  binRow: string;
  day: number;
  isWeekend: boolean;
  pickActivityCount: number;
  inventoryAgingDays: number;
  varianceRatePct: number;
  auditRecord: BinAuditRecord;
}

export interface MasterInventoryItem {
  id: string;
  itemCode: string;
  description: string;
  flowType: "vmi" | "trading" | "supplies";
  partyName: string;
  availableQty: number;
  uom: string;
  reorderLevel: number;
  status: "available" | "low_stock" | "held";
  lotCount: number;
  primaryLocation: string;
}
