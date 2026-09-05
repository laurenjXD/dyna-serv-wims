// `components/dashboard/data/seedData.ts` — Realistic seed data for WMS Operations Dashboard.

import type {
  DashboardKpiData,
  MonthlyFlowDatum,
  DeliveryPerformanceDatum,
  DeliveryPerformanceMiniMetrics,
  LocationOccupancyDatum,
  HeatmapCellDatum,
  MasterInventoryItem,
  BinAuditRecord,
} from "../types";

export const DASHBOARD_KPIS_SEED: DashboardKpiData = {
  valuation: {
    total: 2480500,
    trendPct: 4.2,
    trendDirection: "up",
    vmiAmount: 1600000,
    tradingAmount: 880500,
  },
  floorQueues: {
    pendingReceivingWrrs: 12,
    activePickLists: 8,
    pendingQcInspections: 3,
  },
  stockHealth: {
    lowStockCount: 5,
    heldLotsCount: 2,
    qcPassRatePct: 97.4,
  },
  financialSummary: {
    vmiDailyCbmRate: 0.48,
    vmiClientCount: 3,
    tradingMarginPct: 18.4,
    tradingMarginTargetPct: 20.0,
    pendingBillingAmount: 34200,
    pendingInvoicesCount: 7,
  },
};

// Grouped Bar Chart: Monthly Flow Movement (Jan - Aug) scaled 0 - 600
export const MONTHLY_FLOW_DATA: Record<string, MonthlyFlowDatum[]> = {
  all: [
    { month: "Jan", inbound: 420, outbound: 380, flowType: "all" },
    { month: "Feb", inbound: 460, outbound: 410, flowType: "all" },
    { month: "Mar", inbound: 510, outbound: 480, flowType: "all" },
    { month: "Apr", inbound: 490, outbound: 520, flowType: "all" },
    { month: "May", inbound: 540, outbound: 510, flowType: "all" },
    { month: "Jun", inbound: 580, outbound: 550, flowType: "all" },
    { month: "Jul", inbound: 530, outbound: 570, flowType: "all" },
    { month: "Aug", inbound: 590, outbound: 580, flowType: "all" },
  ],
  vmi: [
    { month: "Jan", inbound: 260, outbound: 230, flowType: "vmi" },
    { month: "Feb", inbound: 290, outbound: 250, flowType: "vmi" },
    { month: "Mar", inbound: 320, outbound: 300, flowType: "vmi" },
    { month: "Apr", inbound: 310, outbound: 330, flowType: "vmi" },
    { month: "May", inbound: 340, outbound: 320, flowType: "vmi" },
    { month: "Jun", inbound: 370, outbound: 350, flowType: "vmi" },
    { month: "Jul", inbound: 330, outbound: 360, flowType: "vmi" },
    { month: "Aug", inbound: 380, outbound: 370, flowType: "vmi" },
  ],
  trading: [
    { month: "Jan", inbound: 110, outbound: 100, flowType: "trading" },
    { month: "Feb", inbound: 120, outbound: 110, flowType: "trading" },
    { month: "Mar", inbound: 140, outbound: 130, flowType: "trading" },
    { month: "Apr", inbound: 130, outbound: 140, flowType: "trading" },
    { month: "May", inbound: 150, outbound: 140, flowType: "trading" },
    { month: "Jun", inbound: 160, outbound: 150, flowType: "trading" },
    { month: "Jul", inbound: 150, outbound: 160, flowType: "trading" },
    { month: "Aug", inbound: 160, outbound: 160, flowType: "trading" },
  ],
  supplies: [
    { month: "Jan", inbound: 50, outbound: 50, flowType: "supplies" },
    { month: "Feb", inbound: 50, outbound: 50, flowType: "supplies" },
    { month: "Mar", inbound: 50, outbound: 50, flowType: "supplies" },
    { month: "Apr", inbound: 50, outbound: 50, flowType: "supplies" },
    { month: "May", inbound: 50, outbound: 50, flowType: "supplies" },
    { month: "Jun", inbound: 50, outbound: 50, flowType: "supplies" },
    { month: "Jul", inbound: 50, outbound: 50, flowType: "supplies" },
    { month: "Aug", inbound: 50, outbound: 50, flowType: "supplies" },
  ],
};

// Delivery Performance multi-line chart data
export const DELIVERY_PERFORMANCE_DATA: DeliveryPerformanceDatum[] = [
  { month: "Jan", otifRate: 94.2, otdRate: 96.1, inFullRate: 98.0 },
  { month: "Feb", otifRate: 95.0, otdRate: 96.8, inFullRate: 98.1 },
  { month: "Mar", otifRate: 96.4, otdRate: 97.5, inFullRate: 98.9 },
  { month: "Apr", otifRate: 95.8, otdRate: 97.2, inFullRate: 98.6 },
  { month: "May", otifRate: 97.1, otdRate: 98.4, inFullRate: 99.0 },
  { month: "Jun", otifRate: 96.8, otdRate: 98.0, inFullRate: 98.8 },
  { month: "Jul", otifRate: 97.9, otdRate: 98.9, inFullRate: 99.3 },
  { month: "Aug", otifRate: 98.2, otdRate: 99.1, inFullRate: 99.5 },
];

export const DELIVERY_MINI_METRICS: DeliveryPerformanceMiniMetrics = {
  avgLeadTimeHours: 18.5,
  firstAttemptDeliveryRatePct: 97.8,
  freightDamageClaimsPct: 0.35,
  slaTargetPct: 95.0,
};

// Warehouse Location Occupancy Donut Chart
export const LOCATION_OCCUPANCY_DATA: LocationOccupancyDatum[] = [
  { name: "Zone A Storage", value: 38, color: "#002060", cbmUsed: 1900, cbmTotal: 5000 },
  { name: "Zone B Racks", value: 28, color: "#2563EB", cbmUsed: 1400, cbmTotal: 5000 },
  { name: "Cold Storage", value: 18, color: "#0D9488", cbmUsed: 900, cbmTotal: 5000 },
  { name: "Overflow", value: 16, color: "#F59E0B", cbmUsed: 800, cbmTotal: 5000 },
];

// Generate 6x31 Heatmap Grid data (Rows A1-01 to A1-06 across August 2026)
const BIN_ROWS = ["A1-01", "A1-02", "A1-03", "A1-04", "A1-05", "A1-06"];

export function generateHeatmapGrid(month = "Aug", year = 2026): HeatmapCellDatum[] {
  const daysInMonth = 31;
  const cells: HeatmapCellDatum[] = [];

  BIN_ROWS.forEach((row, rowIndex) => {
    for (let day = 1; day <= daysInMonth; day++) {
      // Deterministic calculation for consistent rendering
      const dayOfWeek = (day + 5) % 7; // Aug 1 2026 is Saturday
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const pickCount = isWeekend
        ? Math.floor((Math.sin(day * 1.5 + rowIndex) + 1) * 6)
        : Math.floor((Math.cos(day * 0.8 + rowIndex) + 1) * 22) + 8;

      const agingDays = Math.floor(((rowIndex * 7 + day * 3) % 45) + 3);
      const varianceRate = Number(((Math.sin(day * 2 + rowIndex) + 1) * 1.8).toFixed(1));

      const isHighVariance = varianceRate > 2.5;
      const isHeld = (rowIndex === 2 && day === 14) || (rowIndex === 4 && day === 22);

      const auditRecord: BinAuditRecord = {
        binId: `${row}-P${((day % 4) + 1).toString().padStart(2, "0")}`,
        date: `${year}-08-${day.toString().padStart(2, "0")}`,
        dayNumber: day,
        monthName: month,
        year,
        metricType: "pickActivity",
        metricValue: pickCount,
        metricFormatted: `${pickCount} picks/hr`,
        status: isHeld ? "critical" : isHighVariance ? "warning" : pickCount > 0 ? "normal" : "idle",
        activities: [
          {
            sku: "DSGC-SUP-8841",
            itemName: "Omron Industrial Sensor Switch",
            action: "PICK",
            qty: 120,
            uom: "BOX",
            lotNumber: `LOT-2026-08-${day.toString().padStart(2, "0")}-A`,
            timestamp: `08:${10 + (day % 45)}:00`,
            operatorBadge: "OP-4491 (J. Reyes)",
            notes: "Standard pick execution against PL-08819",
          },
          {
            sku: "VMI-ELC-7740",
            itemName: "Schneider Variable Frequency Drive",
            action: "PUTAWAY",
            qty: 40,
            uom: "BOX",
            lotNumber: `LOT-2026-08-${day.toString().padStart(2, "0")}-B`,
            timestamp: `11:${15 + (day % 30)}:00`,
            operatorBadge: "OP-3108 (M. Santos)",
            notes: "Inbound putaway from WRR-2026-0041",
          },
          {
            sku: "TRD-MCH-0028",
            itemName: "SKF High-Precision Roller Bearings",
            action: "INSPECTION",
            qty: 15,
            uom: "PCS",
            lotNumber: `LOT-2026-08-${day.toString().padStart(2, "0")}-C`,
            timestamp: `14:30:00`,
            operatorBadge: "QC-1092 (A. Tan)",
            notes: isHeld ? "Quarantine seal affixed - visual seal breach observed" : "QC passed visual inspection",
          },
        ],
        discrepancyLog: isHighVariance
          ? `Discrepancy flag: Cycle count recorded 44 units vs. system ledger 45 units (-1 discrepancy).`
          : undefined,
        holdReason: isHeld
          ? `QA Hold Ticket #QA-8812: Suspected packaging integrity compromise during staging.`
          : undefined,
        qaNotes: `Daily bin audit verified by Supervisor badge #SUP-0012 at 17:00.`,
      };

      cells.push({
        binRow: row,
        day,
        isWeekend,
        pickActivityCount: pickCount,
        inventoryAgingDays: agingDays,
        varianceRatePct: varianceRate,
        auditRecord,
      });
    }
  });

  return cells;
}

// Master Inventory Table Seed Data (Realistic Industrial Automation / Mechanical Parts)
export const MASTER_INVENTORY_SEED: MasterInventoryItem[] = [
  {
    id: "item-001",
    itemCode: "DSGC-SUP-8841",
    description: "Omron Industrial Optical Proximity Sensor Switch 24V DC",
    flowType: "supplies",
    partyName: "Siemens AG",
    availableQty: 1450,
    uom: "PCS",
    reorderLevel: 300,
    status: "available",
    lotCount: 4,
    primaryLocation: "A1-01-01",
  },
  {
    id: "item-002",
    itemCode: "SUP-ITM-0192",
    description: "Festo Pneumatic Solenoid Direct Actuator Valve 5/2-Way",
    flowType: "supplies",
    partyName: "SKF Logistics",
    availableQty: 45,
    uom: "PCS",
    reorderLevel: 100,
    status: "low_stock",
    lotCount: 1,
    primaryLocation: "A1-02-04",
  },
  {
    id: "item-003",
    itemCode: "DSGC-INT-3301",
    description: "Allen-Bradley ControlLogix 5580 Programmable Automation Controller",
    flowType: "vmi",
    partyName: "ABB Group",
    availableQty: 0,
    uom: "BOX",
    reorderLevel: 50,
    status: "held",
    lotCount: 2,
    primaryLocation: "A1-03-02",
  },
  {
    id: "item-004",
    itemCode: "VMI-ELC-7740",
    description: "Schneider Electric Altivar 320 3-Phase Variable Frequency Inverter",
    flowType: "vmi",
    partyName: "Fanuc Corp",
    availableQty: 820,
    uom: "BOX",
    reorderLevel: 150,
    status: "available",
    lotCount: 6,
    primaryLocation: "A1-04-01",
  },
  {
    id: "item-005",
    itemCode: "TRD-MCH-0028",
    description: "SKF High-Precision Sealed Spherical Roller Bearings 120mm",
    flowType: "trading",
    partyName: "SKF Logistics",
    availableQty: 310,
    uom: "PCS",
    reorderLevel: 80,
    status: "available",
    lotCount: 3,
    primaryLocation: "A1-05-03",
  },
  {
    id: "item-006",
    itemCode: "DSGC-QLD-5510",
    description: "Siemens Sinamics S120 High Performance Single Motor Servo Module",
    flowType: "trading",
    partyName: "Siemens AG",
    availableQty: 12,
    uom: "PCS",
    reorderLevel: 25,
    status: "low_stock",
    lotCount: 1,
    primaryLocation: "A1-06-02",
  },
];
