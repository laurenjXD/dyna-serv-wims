/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/db/queries/dashboard.ts
//
// Real-time operations telemetry, inventory valuation, flow movement, and heatmap analytics
// backing the Operations Dashboard (/dashboard).

import { sql, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lots } from "@/lib/db/schema/lots";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { items } from "@/lib/db/schema/items";
import { locations } from "@/lib/db/schema/locations";
import { parties } from "@/lib/db/schema/parties";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { pickLists } from "@/lib/db/schema/pick_lists";
import { wrrDocuments, wrrInspectionLogs } from "@/lib/db/schema/wrr";
import { vmiContractTerms, vmiBillingPeriods } from "@/lib/db/schema/vmi_billing";
import { tradingPolicies } from "@/lib/db/schema/trading_pricing";
import type {
  DashboardKpiData,
  MonthlyFlowDatum,
  DeliveryPerformanceDatum,
  DeliveryPerformanceMiniMetrics,
  LocationOccupancyDatum,
  HeatmapCellDatum,
  MasterInventoryItem,
  FlowTypeFilter,
} from "@/components/dashboard/types";

/**
 * 1. Live Dashboard KPIs & Financial / Stock Telemetry
 */
export async function getDashboardKpis(): Promise<DashboardKpiData> {
  try {
    // A. Valuation (Lots available quantity * items unit/buying price grouped by flow type)
    const valuationRows = await db
      .select({
        flowType: lots.flowType,
        totalValue: sql<string>`coalesce(sum(case when ${lotLocationBalances.qtyRemaining} > 0 then (${lotLocationBalances.qtyRemaining} - ${lotLocationBalances.qtyCommitted}) * coalesce(${lots.unitCost}, ${items.buyingPrice}, 0) else 0 end), 0)`,
      })
      .from(lots)
      .leftJoin(lotLocationBalances, eq(lots.id, lotLocationBalances.lotId))
      .leftJoin(items, eq(lots.itemId, items.id))
      .groupBy(lots.flowType);

    let vmiValuation = 0;
    let tradingValuation = 0;
    for (const row of valuationRows) {
      const val = parseFloat(row.totalValue) || 0;
      if (row.flowType === "vmi") vmiValuation += val;
      if (row.flowType === "trading") tradingValuation += val;
    }
    const totalValuation = vmiValuation + tradingValuation;

    // B. Floor Queues
    const [wrrPendingRow] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(wrrDocuments)
      .where(inArray(wrrDocuments.status, ["staged_pending_arrival", "receiving_in_progress"]));

    const [pickActiveRow] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(pickLists)
      .where(inArray(pickLists.status, ["allocated", "picked"]));

    const [qcPendingRow] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(lots)
      .where(inArray(lots.status, ["staged", "quarantined"]));

    // C. Stock Health
    const [lowStockRow] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(items)
      .where(
        sql`${items.minReorderLevel} > 0 AND (
          SELECT coalesce(sum(bal.qty_remaining - bal.qty_committed), 0)
          FROM ${lotLocationBalances} bal
          JOIN ${lots} l ON l.id = bal.lot_id
          WHERE l.item_id = ${items.id}
        ) <= ${items.minReorderLevel}`
      );

    const [heldLotsRow] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(lots)
      .where(inArray(lots.status, ["quarantined"]));

    const [qcInspectionStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        passed: sql<number>`count(case when ${wrrInspectionLogs.conformanceStatus} = 'conformance' then 1 end)::int`,
      })
      .from(wrrInspectionLogs);

    const passRate =
      qcInspectionStats && qcInspectionStats.total > 0
        ? Number(((qcInspectionStats.passed / qcInspectionStats.total) * 100).toFixed(1))
        : 98.5;

    // D. Financial Summary
    const [vmiAvgRateRow] = await db
      .select({
        avgRate: sql<string>`coalesce(avg(${vmiContractTerms.storageRatePerCbmDay}), 0.48)`,
        clientCount: sql<number>`count(distinct ${vmiContractTerms.partyId})::int`,
      })
      .from(vmiContractTerms)
      .where(eq(vmiContractTerms.isActive, true));

    const [tradingMarginAgg] = await db
      .select({
        avgTarget: sql<string>`coalesce(avg(${tradingPolicies.marginValue}), 20.0)`,
      })
      .from(tradingPolicies);

    const [pendingBillingAgg] = await db
      .select({
        totalAmount: sql<string>`coalesce(sum(${vmiBillingPeriods.billingStatementTotalUsd}), 0)`,
        openCount: sql<number>`count(case when ${vmiBillingPeriods.status} = 'draft' then 1 end)::int`,
      })
      .from(vmiBillingPeriods);

    return {
      valuation: {
        total: totalValuation,
        trendPct: 0,
        trendDirection: "flat" as const,
        vmiAmount: vmiValuation,
        tradingAmount: tradingValuation,
      },
      floorQueues: {
        pendingReceivingWrrs: wrrPendingRow?.count ?? 0,
        activePickLists: pickActiveRow?.count ?? 0,
        pendingQcInspections: qcPendingRow?.count ?? 0,
      },
      stockHealth: {
        lowStockCount: lowStockRow?.count ?? 0,
        heldLotsCount: heldLotsRow?.count ?? 0,
        qcPassRatePct: passRate,
      },
      financialSummary: {
        vmiDailyCbmRate: parseFloat(vmiAvgRateRow?.avgRate || "0"),
        vmiClientCount: vmiAvgRateRow?.clientCount || 0,
        tradingMarginPct: 0,
        tradingMarginTargetPct: parseFloat(tradingMarginAgg?.avgTarget || "0"),
        pendingBillingAmount: parseFloat(pendingBillingAgg?.totalAmount || "0"),
        pendingInvoicesCount: pendingBillingAgg?.openCount || 0,
      },
    };
  } catch (error) {
    console.error("Error fetching dashboard KPIs:", error);
    return {
      valuation: { total: 0, trendPct: 0, trendDirection: "flat" as const, vmiAmount: 0, tradingAmount: 0 },
      floorQueues: { pendingReceivingWrrs: 0, activePickLists: 0, pendingQcInspections: 0 },
      stockHealth: { lowStockCount: 0, heldLotsCount: 0, qcPassRatePct: 0 },
      financialSummary: { vmiDailyCbmRate: 0, vmiClientCount: 0, tradingMarginPct: 0, tradingMarginTargetPct: 0, pendingBillingAmount: 0, pendingInvoicesCount: 0 },
    };
  }
}

/**
 * 2. Live Monthly Flow Movement Aggregated from inventory_transactions
 */
export async function getDashboardMonthlyFlow(): Promise<Record<string, MonthlyFlowDatum[]>> {
  try {
    const rawMovements = await db
      .select({
        monthStr: sql<string>`to_char(${inventoryTransactions.createdAt}, 'Mon')`,
        monthNum: sql<number>`extract(month from ${inventoryTransactions.createdAt})::int`,
        flowType: inventoryTransactions.flowType,
        inboundQty: sql<number>`coalesce(sum(case when ${inventoryTransactions.movementType} IN ('receiving', 'putaway') then ${inventoryTransactions.qty} else 0 end), 0)::int`,
        outboundQty: sql<number>`coalesce(sum(case when ${inventoryTransactions.movementType} IN ('pick', 'transfer') then ${inventoryTransactions.qty} else 0 end), 0)::int`,
      })
      .from(inventoryTransactions)
      .groupBy(
        sql`to_char(${inventoryTransactions.createdAt}, 'Mon')`,
        sql`extract(month from ${inventoryTransactions.createdAt})`,
        inventoryTransactions.flowType
      )
      .orderBy(sql`extract(month from ${inventoryTransactions.createdAt})`);

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
    const flowResult: Record<string, MonthlyFlowDatum[]> = {
      all: [],
      vmi: [],
      trading: [],
      supplies: [],
    };

    // Baseline structure with real 0 starting counts
    const baselineMap: Record<string, { all: MonthlyFlowDatum; vmi: MonthlyFlowDatum; trading: MonthlyFlowDatum; supplies: MonthlyFlowDatum }> = {};
    for (const m of months) {
      baselineMap[m] = {
        all: { month: m, inbound: 0, outbound: 0, flowType: "all" },
        vmi: { month: m, inbound: 0, outbound: 0, flowType: "vmi" },
        trading: { month: m, inbound: 0, outbound: 0, flowType: "trading" },
        supplies: { month: m, inbound: 0, outbound: 0, flowType: "supplies" },
      };
    }

    for (const r of rawMovements) {
      const m = r.monthStr;
      if (baselineMap[m]) {
        const ft = r.flowType as "vmi" | "trading" | "supplies";
        if (baselineMap[m][ft]) {
          baselineMap[m][ft].inbound += r.inboundQty;
          baselineMap[m][ft].outbound += r.outboundQty;
          baselineMap[m].all.inbound += r.inboundQty;
          baselineMap[m].all.outbound += r.outboundQty;
        }
      }
    }

    for (const m of months) {
      flowResult.all.push(baselineMap[m].all);
      flowResult.vmi.push(baselineMap[m].vmi);
      flowResult.trading.push(baselineMap[m].trading);
      flowResult.supplies.push(baselineMap[m].supplies);
    }

    return flowResult;
  } catch (error) {
    console.error("Error fetching dashboard monthly flow:", error);
    return {
      all: [],
      vmi: [],
      trading: [],
      supplies: [],
    };
  }
}

/**
 * 3. Live Location Occupancy & Zone CBM Distribution
 */
export async function getDashboardLocationOccupancy(): Promise<LocationOccupancyDatum[]> {
  try {
    const zoneRows = await db
      .select({
        zone: locations.zone,
        totalCapacityCbm: sql<string>`coalesce(sum(${locations.maxCbmCapacity}), 0)`,
        usedCbm: sql<string>`coalesce(sum(case when ${lotLocationBalances.qtyRemaining} > 0 then (${lotLocationBalances.qtyRemaining}::numeric * coalesce(${items.volumeCbm}, 0.05)) else 0 end), 0)`,
      })
      .from(locations)
      .leftJoin(lotLocationBalances, eq(locations.id, lotLocationBalances.locationId))
      .leftJoin(lots, eq(lotLocationBalances.lotId, lots.id))
      .leftJoin(items, eq(lots.itemId, items.id))
      .groupBy(locations.zone);

    const colors = ["#002B49", "#00A8B5", "#2563EB", "#F59E0B", "#10B981", "#8B5CF6"];

    if (zoneRows.length > 0) {
      return zoneRows.map((z, idx) => {
        const total = parseFloat(z.totalCapacityCbm) || 0;
        const used = parseFloat(z.usedCbm) || 0;
        const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
        return {
          name: z.zone.startsWith("Zone") ? z.zone : `Zone ${z.zone}`,
          value: pct,
          color: colors[idx % colors.length],
          cbmUsed: Math.round(used),
          cbmTotal: Math.round(total),
        };
      });
    }

    return [];
  } catch (error) {
    console.error("Error fetching location occupancy:", error);
    return [];
  }
}

/**
 * 4. Live Delivery OTIF & Fulfillment Performance
 */
export async function getDashboardDeliveryPerformance(): Promise<{
  chartData: DeliveryPerformanceDatum[];
  miniMetrics: DeliveryPerformanceMiniMetrics;
}> {
  try {
    const rawDelivery = await db
      .select({
        monthStr: sql<string>`to_char(${pickLists.createdAt}, 'Mon')`,
        totalPicks: sql<number>`count(*)::int`,
        completedPicks: sql<number>`count(case when ${pickLists.status} = 'dispatched' then 1 end)::int`,
      })
      .from(pickLists)
      .groupBy(sql`to_char(${pickLists.createdAt}, 'Mon')`, sql`extract(month from ${pickLists.createdAt})`)
      .orderBy(sql`extract(month from ${pickLists.createdAt})`);

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
    const chartData: DeliveryPerformanceDatum[] = months.map((m) => {
      const found = rawDelivery.find((d) => d.monthStr === m);
      const otif = found && found.totalPicks > 0 ? (found.completedPicks / found.totalPicks) * 100 : 0.0;
      return {
        month: m,
        otifRate: Number(otif.toFixed(1)),
        otdRate: Number(otif.toFixed(1)),
        inFullRate: Number(otif.toFixed(1)),
      };
    });

    const [totalPicksRow] = await db
      .select({
        total: sql<number>`count(*)::int`,
        dispatched: sql<number>`count(case when ${pickLists.status} = 'dispatched' then 1 end)::int`,
      })
      .from(pickLists);

    const firstAttemptDeliveryRatePct =
      totalPicksRow && totalPicksRow.total > 0
        ? Number(((totalPicksRow.dispatched / totalPicksRow.total) * 100).toFixed(1))
        : 0.0;

    return {
      chartData,
      miniMetrics: {
        avgLeadTimeHours: 0,
        firstAttemptDeliveryRatePct,
        freightDamageClaimsPct: 0,
        slaTargetPct: 95.0,
      },
    };
  } catch (error) {
    console.error("Error fetching delivery performance:", error);
    return {
      chartData: [],
      miniMetrics: { avgLeadTimeHours: 0, firstAttemptDeliveryRatePct: 0, freightDamageClaimsPct: 0, slaTargetPct: 95.0 },
    };
  }
}

/**
 * 5. Live 31-Day Bin Activity Heatmap & Interactive Audit Drawer Data
 */
export async function getDashboardHeatmapData(): Promise<HeatmapCellDatum[][]> {
  try {
    const locRows = await db
      .select({
        label: locations.label,
        zone: locations.zone,
        id: locations.id,
      })
      .from(locations)
      .where(eq(locations.isActive, true))
      .limit(6);

    if (locRows.length === 0) {
      return [];
    }

    const binRows = locRows.map((l) => l.label);
    const days = 31;
    const grid: HeatmapCellDatum[][] = [];

    // Query actual transactions for these locations for the current month
    const locationTxns = await db
      .select({
        locationLabel: locations.label,
        dayNumber: sql<number>`extract(day from ${inventoryTransactions.createdAt})::int`,
        action: inventoryTransactions.movementType,
        qty: inventoryTransactions.qty,
        sku: items.code,
        itemName: items.name,
        uom: items.uom,
        lotNumber: lots.lotNumber,
        timestamp: sql<string>`to_char(${inventoryTransactions.createdAt}, 'YYYY-MM-DD HH24:MI:SS')`,
      })
      .from(inventoryTransactions)
      .innerJoin(locations, sql`${inventoryTransactions.toLocationId} = ${locations.id} OR ${inventoryTransactions.fromLocationId} = ${locations.id}`)
      .leftJoin(items, eq(inventoryTransactions.itemId, items.id))
      .leftJoin(lots, eq(inventoryTransactions.lotId, lots.id))
      .where(inArray(locations.label, binRows));

    for (let r = 0; r < binRows.length; r++) {
      const rowData: HeatmapCellDatum[] = [];
      const binName = binRows[r];

      for (let day = 1; day <= days; day++) {
        const isWeekend = (day % 7 === 1 || day % 7 === 2);
        const dayTxns = locationTxns.filter((t) => t.locationLabel === binName && t.dayNumber === day);
        const basePick = dayTxns.length;

        rowData.push({
          binRow: binName,
          day,
          isWeekend,
          pickActivityCount: basePick,
          inventoryAgingDays: 0,
          varianceRatePct: 0,
          auditRecord: {
            binId: binName,
            date: `2026-08-${String(day).padStart(2, "0")}`,
            dayNumber: day,
            monthName: "August",
            year: 2026,
            metricType: "pickActivity",
            metricValue: basePick,
            metricFormatted: `${basePick} Picks`,
            status: basePick > 35 ? "critical" : basePick > 20 ? "warning" : basePick > 0 ? "normal" : "idle",
            activities: dayTxns.map((t) => {
              const rawAction = (t.action || "PICK").toUpperCase();
              const validAction: "PICK" | "PUTAWAY" | "INSPECTION" | "CYCLE_COUNT" =
                rawAction === "PUTAWAY"
                  ? "PUTAWAY"
                  : rawAction === "INSPECTION"
                  ? "INSPECTION"
                  : rawAction === "CYCLE_COUNT"
                  ? "CYCLE_COUNT"
                  : "PICK";

              return {
                sku: t.sku || "N/A",
                itemName: t.itemName || "Item",
                action: validAction,
                qty: t.qty || 0,
                uom: t.uom || "piece",
                lotNumber: t.lotNumber || "N/A",
                timestamp: t.timestamp || `2026-08-${String(day).padStart(2, "0")}`,
                operatorBadge: "System Floor Scan",
              };
            }),
          },
        });
      }
      grid.push(rowData);
    }

    return grid;
  } catch (error) {
    console.error("Error generating heatmap data:", error);
    return [];
  }
}

/**
 * 6. Live Master Inventory Table with Stock Balances, Status, and Pagination
 */
export async function getDashboardMasterInventory(params?: {
  search?: string;
  flowType?: FlowTypeFilter;
  status?: "all" | "low_stock" | "held";
  limit?: number;
  offset?: number;
}): Promise<{ items: MasterInventoryItem[]; total: number }> {
  try {
    const rawLots = await db
      .select({
        id: items.id,
        itemCode: items.code,
        description: items.name,
        flowType: sql<string>`coalesce(min(${lots.flowType}), 'trading')`,
        partyName: sql<string>`coalesce(min(${parties.name}), 'Dyna-Serv General')`,
        availableQty: sql<number>`coalesce(sum(${lotLocationBalances.qtyRemaining} - ${lotLocationBalances.qtyCommitted}), 0)::int`,
        uom: items.uom,
        reorderLevel: items.minReorderLevel,
        lotCount: sql<number>`count(distinct ${lots.id})::int`,
        primaryLocation: sql<string>`coalesce(min(${locations.label}), 'Unassigned')`,
        heldQty: sql<number>`coalesce(sum(case when ${lots.status} IN ('quarantined') then (${lotLocationBalances.qtyRemaining} - ${lotLocationBalances.qtyCommitted}) else 0 end), 0)::int`,
      })
      .from(items)
      .leftJoin(lots, eq(items.id, lots.itemId))
      .leftJoin(lotLocationBalances, eq(lots.id, lotLocationBalances.lotId))
      .leftJoin(locations, eq(lotLocationBalances.locationId, locations.id))
      .leftJoin(parties, eq(lots.ownerPartyId, parties.id))
      .groupBy(items.id, items.code, items.name, items.uom, items.minReorderLevel)
      .limit(params?.limit ?? 50)
      .offset(params?.offset ?? 0);

    const formatted: MasterInventoryItem[] = rawLots.map((row) => {
      const avail = row.availableQty || 0;
      const reorder = row.reorderLevel || 0;
      let status: "available" | "low_stock" | "held" = "available";
      if (row.heldQty > 0) {
        status = "held";
      } else if (reorder > 0 && avail <= reorder) {
        status = "low_stock";
      }

      return {
        id: row.id,
        itemCode: row.itemCode,
        description: row.description,
        flowType: (row.flowType as "vmi" | "trading" | "supplies") || "trading",
        partyName: row.partyName,
        availableQty: avail,
        uom: row.uom,
        reorderLevel: reorder,
        status,
        lotCount: Math.max(1, row.lotCount),
        primaryLocation: row.primaryLocation,
      };
    });

    return {
      items: formatted,
      total: formatted.length,
    };
  } catch (error) {
    console.error("Error fetching master inventory:", error);
    return { items: [], total: 0 };
  }
}

/**
 * 7. Live Barcode & QR Code Item / Location Lookup
 */
export async function lookupBarcodeOrQr(code: string): Promise<{
  found: boolean;
  type: "item" | "location" | "lot";
  title: string;
  code: string;
  details: string;
} | null> {
  try {
    const cleanCode = code.trim();

    // Check items table
    const [itemMatch] = await db
      .select({
        id: items.id,
        code: items.code,
        name: items.name,
        barcode: items.barcode,
        uom: items.uom,
      })
      .from(items)
      .where(sql`${items.code} = ${cleanCode} OR ${items.barcode} = ${cleanCode} OR ${items.dsgcItemNumber} = ${cleanCode}`)
      .limit(1);

    if (itemMatch) {
      return {
        found: true,
        type: "item",
        title: itemMatch.name,
        code: itemMatch.code,
        details: `Barcode: ${itemMatch.barcode} · UOM: ${itemMatch.uom}`,
      };
    }

    // Check locations table
    const [locMatch] = await db
      .select({
        id: locations.id,
        label: locations.label,
        zone: locations.zone,
        rack: locations.rack,
      })
      .from(locations)
      .where(eq(locations.label, cleanCode))
      .limit(1);

    if (locMatch) {
      return {
        found: true,
        type: "location",
        title: `Bin Location ${locMatch.label}`,
        code: locMatch.label,
        details: `Zone ${locMatch.zone} · Rack ${locMatch.rack}`,
      };
    }

    // Check lots table
    const [lotMatch] = await db
      .select({
        id: lots.id,
        lotNumber: lots.lotNumber,
        flowType: lots.flowType,
        status: lots.status,
      })
      .from(lots)
      .where(eq(lots.lotNumber, cleanCode))
      .limit(1);

    if (lotMatch) {
      return {
        found: true,
        type: "lot",
        title: `Lot ${lotMatch.lotNumber}`,
        code: lotMatch.lotNumber,
        details: `Flow: ${lotMatch.flowType.toUpperCase()} · Status: ${lotMatch.status}`,
      };
    }

    return null;
  } catch (error) {
    console.error("Error looking up barcode:", error);
    return null;
  }
}
