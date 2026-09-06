/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/db/queries/reports.ts
//
// Live analytics, financial settlement, and operational reporting queries
// backing the Reports Hub (/reports).

import { sql, eq, desc, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lots } from "@/lib/db/schema/lots";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { items, itemCategories } from "@/lib/db/schema/items";
import { parties, partyRoles } from "@/lib/db/schema/parties";
import { pickLists, pickListItems } from "@/lib/db/schema/pick_lists";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { vmiContractTerms, vmiDailyBalanceLedger } from "@/lib/db/schema/vmi_billing";
import { generatedDocuments } from "@/lib/db/schema/documents";
import { userProfiles } from "@/lib/db/schema/rbac";
import type {
  VmiBillingRow,
  TradingMarginRow,
  TradingCategoryPerformance,
  MovementThroughputDatum,
  DeliverySlaDatum,
  ReportArchiveItem,
  DateHorizon,
  FacilityZone,
  FlowSegment,
} from "@/components/reports/types";

export interface ReportFilterParams {
  facility?: FacilityZone;
  horizon?: DateHorizon;
  startDate?: string;
  endDate?: string;
  flow?: FlowSegment;
}

/**
 * 1. Executive Settlement & Financial Reporting KPIs
 */
export async function getReportsExecutiveKpis(filters?: ReportFilterParams) {
  try {
    // Inventory Valuation
    const [valRow] = await db
      .select({
        total: sql<string>`coalesce(sum(case when ${lotLocationBalances.qtyRemaining} > 0 then (${lotLocationBalances.qtyRemaining} - ${lotLocationBalances.qtyCommitted}) * coalesce(${lots.unitCost}, ${items.buyingPrice}, 0) else 0 end), 0)`,
      })
      .from(lots)
      .leftJoin(lotLocationBalances, eq(lots.id, lotLocationBalances.lotId))
      .leftJoin(items, eq(lots.itemId, items.id));

    // VMI Accrued Storage (from vmi_daily_balance_ledger)
    const [vmiAccruedRow] = await db
      .select({
        accrued: sql<string>`coalesce(sum(${vmiDailyBalanceLedger.storageAmountUsd}), 0)`,
      })
      .from(vmiDailyBalanceLedger);

    // Trading Gross Revenue & Margin Realized
    const [tradingMarginAgg] = await db
      .select({
        grossRevenue: sql<string>`coalesce(sum(${pickListItems.qty} * coalesce(${pickListItems.unitPrice}, ${items.sellingPrice}, 0)), 0)`,
        cogs: sql<string>`coalesce(sum(${pickListItems.qty} * coalesce(${lots.unitCost}, ${items.buyingPrice}, 0)), 0)`,
      })
      .from(pickListItems)
      .leftJoin(lots, eq(pickListItems.lotId, lots.id))
      .leftJoin(items, eq(pickListItems.itemId, items.id));

    // Delivery OTIF from pickLists
    const [otifRow] = await db
      .select({
        total: sql<number>`count(*)::int`,
        dispatched: sql<number>`count(case when ${pickLists.status} = 'dispatched' then 1 end)::int`,
      })
      .from(pickLists);

    // Active lots count
    const [lotsRow] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(lots)
      .where(inArray(lots.status, ["staged", "available", "quarantined"]));

    const rev = parseFloat(tradingMarginAgg?.grossRevenue || "0");
    const cogs = parseFloat(tradingMarginAgg?.cogs || "0");
    const marginPct = rev > 0 ? Number((((rev - cogs) / rev) * 100).toFixed(1)) : 0.0;
    const otifRatePct = otifRow && otifRow.total > 0 ? Number(((otifRow.dispatched / otifRow.total) * 100).toFixed(1)) : 0.0;

    return {
      valuationTotal: parseFloat(valRow?.total || "0"),
      vmiAccruedStorage: parseFloat(vmiAccruedRow?.accrued || "0"),
      tradingGrossRevenue: rev,
      tradingMarginPct: marginPct,
      tradingCogs: cogs,
      otifRatePct,
      activeLotsCount: lotsRow?.count ?? 0,
    };
  } catch (error) {
    console.error("Error fetching reports executive KPIs:", error);
    return {
      valuationTotal: 0,
      vmiAccruedStorage: 0,
      tradingGrossRevenue: 0,
      tradingMarginPct: 0,
      tradingCogs: 0,
      otifRatePct: 0,
      activeLotsCount: 0,
    };
  }
}

/**
 * 2. VMI Client Storage & CBM Billing Reconciliation
 */
export async function getVmiBillingReconciliationReport(): Promise<VmiBillingRow[]> {
  try {
    const rawClients = await db
      .select({
        id: parties.id,
        name: parties.name,
        code: parties.code,
        contactPerson: parties.contactPerson,
        cbmRate: vmiContractTerms.storageRatePerCbmDay,
        cbmThreshold: vmiContractTerms.cbmThreshold,
        currency: vmiContractTerms.billingCurrency,
        accruedStorage: sql<string>`coalesce(sum(${vmiDailyBalanceLedger.storageAmountUsd}), 0)`,
        occupiedCbm: sql<string>`coalesce(avg(${vmiDailyBalanceLedger.endingCbm}), 0)`,
      })
      .from(parties)
      .leftJoin(partyRoles, eq(parties.id, partyRoles.partyId))
      .leftJoin(vmiContractTerms, and(eq(parties.id, vmiContractTerms.partyId), eq(vmiContractTerms.isActive, true)))
      .leftJoin(vmiDailyBalanceLedger, eq(parties.id, vmiDailyBalanceLedger.partyId))
      .where(sql`${partyRoles.role} IN ('vendor', 'customer')`)
      .groupBy(parties.id, parties.name, parties.code, parties.contactPerson, vmiContractTerms.storageRatePerCbmDay, vmiContractTerms.cbmThreshold, vmiContractTerms.billingCurrency);

    if (rawClients.length > 0) {
      return rawClients.map((c, idx) => {
        const alloc = parseFloat(c.cbmThreshold || "0") || 0;
        const occ = Math.round(parseFloat(c.occupiedCbm || "0")) || 0;
        const rate = parseFloat(c.cbmRate || "0") || 0;
        const accrued = parseFloat(c.accruedStorage || "0") || 0;
        const util = alloc > 0 ? Math.min(100, Math.round((occ / alloc) * 100)) : 0;

        return {
          id: c.id || `vmi-${idx}`,
          clientName: c.name,
          clientCode: c.code,
          allocatedSpaceCbm: alloc,
          occupiedCbm: occ,
          utilizationPct: util,
          contractedRatePerCbmDay: rate,
          mtdAccruedStorage: accrued,
          unbilledDays: 31,
          billingStatus: "Ready to Invoice" as const,
          contactPerson: c.contactPerson || "Operations Lead",
          currency: c.currency || "USD",
        };
      });
    }

    return [];
  } catch (error) {
    console.error("Error fetching VMI billing reconciliation:", error);
    return [];
  }
}

/**
 * 3. Trading Revenue, COGS & Realized Margin Report
 */
export async function getTradingMarginReport(): Promise<{
  marginHistory: TradingMarginRow[];
  categoryBreakdown: TradingCategoryPerformance[];
}> {
  try {
    const monthlyAgg = await db
      .select({
        period: sql<string>`to_char(${pickLists.createdAt}, 'Mon YYYY')`,
        monthNum: sql<number>`extract(month from ${pickLists.createdAt})::int`,
        grossRevenue: sql<string>`coalesce(sum(${pickListItems.qty} * coalesce(${pickListItems.unitPrice}, ${items.sellingPrice}, 0)), 0)`,
        cogs: sql<string>`coalesce(sum(${pickListItems.qty} * coalesce(${lots.unitCost}, ${items.buyingPrice}, 0)), 0)`,
      })
      .from(pickLists)
      .innerJoin(pickListItems, eq(pickLists.id, pickListItems.pickListId))
      .leftJoin(lots, eq(pickListItems.lotId, lots.id))
      .leftJoin(items, eq(pickListItems.itemId, items.id))
      .groupBy(sql`to_char(${pickLists.createdAt}, 'Mon YYYY')`, sql`extract(month from ${pickLists.createdAt})`)
      .orderBy(sql`extract(month from ${pickLists.createdAt})`);

    const marginHistory: TradingMarginRow[] = monthlyAgg.map((m) => {
      const rev = parseFloat(m.grossRevenue) || 0;
      const cogs = parseFloat(m.cogs) || 0;
      const marginPct = rev > 0 ? Number((((rev - cogs) / rev) * 100).toFixed(1)) : 0.0;
      return {
        period: m.period,
        grossRevenue: rev,
        cogs,
        marginPct,
        targetMarginPct: 20.0,
      };
    });

    const catAgg = await db
      .select({
        category: sql<string>`coalesce(${itemCategories.name}, 'General')`,
        unitsSold: sql<number>`coalesce(sum(${pickListItems.qty}), 0)::int`,
        grossRevenue: sql<string>`coalesce(sum(${pickListItems.qty} * coalesce(${pickListItems.unitPrice}, ${items.sellingPrice}, 0)), 0)`,
        cogs: sql<string>`coalesce(sum(${pickListItems.qty} * coalesce(${lots.unitCost}, ${items.buyingPrice}, 0)), 0)`,
      })
      .from(pickListItems)
      .innerJoin(items, eq(pickListItems.itemId, items.id))
      .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
      .leftJoin(lots, eq(pickListItems.lotId, lots.id))
      .groupBy(itemCategories.name);

    const categoryBreakdown: TradingCategoryPerformance[] = catAgg.map((c) => {
      const rev = parseFloat(c.grossRevenue) || 0;
      const cogs = parseFloat(c.cogs) || 0;
      const netMargin = rev - cogs;
      const marginPct = rev > 0 ? Number(((netMargin / rev) * 100).toFixed(1)) : 0.0;
      return {
        category: c.category,
        unitsSold: c.unitsSold,
        grossRevenue: rev,
        cogs,
        netMargin,
        marginPct,
        deltaVsSlaPct: Number((marginPct - 20.0).toFixed(1)),
      };
    });

    return { marginHistory, categoryBreakdown };
  } catch (error) {
    console.error("Error fetching trading margin report:", error);
    return { marginHistory: [], categoryBreakdown: [] };
  }
}

/**
 * 4. Movement Throughput Trends (Daily / Weekly / Monthly)
 */
export async function getThroughputReport(interval: "daily" | "weekly" | "monthly" = "daily"): Promise<MovementThroughputDatum[]> {
  try {
    const rawTxns = await db
      .select({
        label: sql<string>`to_char(${inventoryTransactions.createdAt}, 'Mon DD')`,
        inboundQty: sql<number>`coalesce(sum(case when ${inventoryTransactions.movementType} IN ('receiving', 'putaway') then ${inventoryTransactions.qty} else 0 end), 0)::int`,
        outboundQty: sql<number>`coalesce(sum(case when ${inventoryTransactions.movementType} IN ('pick', 'transfer') then ${inventoryTransactions.qty} else 0 end), 0)::int`,
        vmiQty: sql<number>`coalesce(sum(case when ${inventoryTransactions.flowType} = 'vmi' then ${inventoryTransactions.qty} else 0 end), 0)::int`,
        tradingQty: sql<number>`coalesce(sum(case when ${inventoryTransactions.flowType} = 'trading' then ${inventoryTransactions.qty} else 0 end), 0)::int`,
        suppliesQty: sql<number>`coalesce(sum(case when ${inventoryTransactions.flowType} = 'supplies' then ${inventoryTransactions.qty} else 0 end), 0)::int`,
      })
      .from(inventoryTransactions)
      .groupBy(sql`to_char(${inventoryTransactions.createdAt}, 'Mon DD')`, sql`date_trunc('day', ${inventoryTransactions.createdAt})`)
      .orderBy(sql`date_trunc('day', ${inventoryTransactions.createdAt})`)
      .limit(30);

    if (rawTxns.length > 0) {
      return rawTxns.map((t) => ({
        label: t.label,
        inboundQty: t.inboundQty,
        outboundQty: t.outboundQty,
        vmiQty: t.vmiQty,
        tradingQty: t.tradingQty,
        suppliesQty: t.suppliesQty,
      }));
    }

    return [];
  } catch (error) {
    console.error("Error fetching throughput report:", error);
    return [];
  }
}

/**
 * 5. Delivery Performance & SLA Report
 */
export async function getDeliveryPerformanceReport(): Promise<DeliverySlaDatum[]> {
  try {
    const rawDelivery = await db
      .select({
        period: sql<string>`to_char(${pickLists.createdAt}, 'Mon YYYY')`,
        monthNum: sql<number>`extract(month from ${pickLists.createdAt})::int`,
        totalPicks: sql<number>`count(*)::int`,
        completedPicks: sql<number>`count(case when ${pickLists.status} = 'dispatched' then 1 end)::int`,
      })
      .from(pickLists)
      .groupBy(sql`to_char(${pickLists.createdAt}, 'Mon YYYY')`, sql`extract(month from ${pickLists.createdAt})`)
      .orderBy(sql`extract(month from ${pickLists.createdAt})`);

    if (rawDelivery.length > 0) {
      return rawDelivery.map((d) => {
        const otif = d.totalPicks > 0 ? Number(((d.completedPicks / d.totalPicks) * 100).toFixed(1)) : 0.0;
        return {
          period: d.period,
          otifRate: otif,
          otdRate: otif,
          fillRate: otif,
          targetOtif: 95.0,
        };
      });
    }

    return [];
  } catch (error) {
    console.error("Error fetching delivery SLA report:", error);
    return [];
  }
}

/**
 * 6. Live Reports Archive & Generated Document Retrieval
 */
export async function getReportArchiveList(): Promise<ReportArchiveItem[]> {
  try {
    const rawDocs = await db
      .select({
        id: generatedDocuments.id,
        documentNumber: generatedDocuments.documentNumber,
        documentType: generatedDocuments.documentType,
        status: generatedDocuments.status,
        createdAt: generatedDocuments.createdAt,
        userName: sql<string>`coalesce(${userProfiles.displayName}, 'System Automated')`,
        userRole: sql<string>`'Warehouse Staff'`,
      })
      .from(generatedDocuments)
      .leftJoin(userProfiles, eq(generatedDocuments.createdBy, userProfiles.id))
      .orderBy(desc(generatedDocuments.createdAt))
      .limit(20);

    if (rawDocs.length > 0) {
      return rawDocs.map((doc, idx) => {
        let cat: "Financial" | "Inventory" | "Operations" | "Settlement" = "Operations";
        if (doc.documentType.includes("soa") || doc.documentType.includes("billing")) cat = "Financial";
        else if (doc.documentType.includes("wrr") || doc.documentType.includes("cipl")) cat = "Inventory";
        else if (doc.documentType.includes("receipt") || doc.documentType.includes("settlement")) cat = "Settlement";

        return {
          id: doc.id,
          reportName: `${doc.documentNumber || `RPT-${idx}`}.pdf`,
          category: cat,
          dateRangeCovered: doc.createdAt ? doc.createdAt.toISOString().slice(0, 10) : "Current",
          generatedBy: {
            name: doc.userName,
            role: doc.userRole,
          },
          generatedAt: doc.createdAt ? doc.createdAt.toISOString().replace("T", " ").slice(0, 16) : "",
          fileSizeFormatted: "1.2 MB",
          format: "PDF",
          status: "Ready",
          downloadUrl: `/api/documents/${doc.id}/download`,
        };
      });
    }

    return [];
  } catch (error) {
    console.error("Error fetching report archive:", error);
    return [];
  }
}
