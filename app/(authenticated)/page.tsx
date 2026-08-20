// `/` — authenticated landing page / dashboard.
//
// Traceability:
//   specs/05-ui-shell-and-navigation/design.md §3.2 (`/` route: capability
//     "none", surface "shared"; §3.3 floor vs. office shell behavior;
//     §3.2 office dashboard summary widgets).
//   specs/05-ui-shell-and-navigation/requirements.md R11.2 (floor vs. office
//     summary shape per resolved surface), R11.5 (no raw financial metrics
//     on `/`).
//   specs/00-steering/brand-design-system.md §3 (floor primary actions,
//     touch targets, dark surface), §6 (no glassmorphism on floor), §9
//     (floor CTA h-16 full-width), §10 (active: press feedback, no hover
//     on floor).
//   specs/00-steering/revision-log.md (2026-08-07 landing page routing
//     decision: `/` owns operational queues; `/reports` owns KPI analytics).
//
// Surface: "shared" — floor tier for warehouse_staff sessions, office tier
//   for supervisor/administrator/party_user sessions.
//
// All inventory aggregates read lot_inventory_totals (never raw lot_location_balances).
// KPI/financial analytics remain on /reports; this page owns operational queues.

import { eq } from "drizzle-orm";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { resolveSessionPresentationTier } from "@/lib/shell/surface";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { listWrrDocuments, listRecentWrrDocuments } from "@/lib/db/queries/receiving";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";
import { listPickLists, listRecentPickLists } from "@/lib/db/queries/withdrawals";
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import { listTransferRequests } from "@/lib/db/queries/transfers";
import { listInspectionCases } from "@/lib/db/queries/transfers";
import type { InspectionCaseListRow } from "@/lib/db/queries/transfers";
import { listPendingApprovalRequests } from "@/lib/db/queries/approvals";
import type { ApprovalRequestRow } from "@/lib/db/queries/approvals";
import { getInventoryKpis } from "@/lib/analytics/queries/inventory";
import {
  getPickListQtyAndCbmTrend,
  getDispatchRate,
  getPickListCountByFlow,
} from "@/lib/analytics/queries/outbound";
import { toNumber } from "@/lib/analytics/queries/shared";
import { listStockView } from "@/lib/db/queries/inventory";
import type { StockViewRow } from "@/lib/db/queries/inventory";
import { FloorLanding } from "./_components/FloorLanding";
import { OfficeLanding, type RecentActivityItem } from "./_components/OfficeLanding";
import type { WeeklyTrendDatum } from "@/components/analytics/WeeklyTrendChart";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreetingPeriod(hour: number): string {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function getTodayString(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Derived inventory preview (top N items by total available stock) ──────────
// Groups listStockView rows by item, sums qtyRemaining, sorts descending, takes
// top N. Returns items with their FIFO/FEFO-ordered lot summary.

type ItemPreviewRow = {
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  totalQty: number;
  lots: Array<{
    lotId: string;
    lotNumber: string;
    locationLabel: string;
    qtyRemaining: number;
  }>;
};

function buildInventoryPreview(
  stockRows: StockViewRow[],
  topN: number,
): ItemPreviewRow[] {
  // Group by itemId, accumulate total qty.
  const byItem = new Map<string, ItemPreviewRow>();
  for (const row of stockRows) {
    const existing = byItem.get(row.itemId);
    if (existing) {
      existing.totalQty += row.qtyRemaining;
      // Preserve FIFO/FEFO lot order established by listStockView (already sorted
      // by expiryDate ASC, createdAt ASC per the query). Add lot if not already present.
      if (!existing.lots.find((l) => l.lotId === row.lotId && l.locationLabel === row.locationLabel)) {
        existing.lots.push({
          lotId: row.lotId,
          lotNumber: row.lotNumber,
          locationLabel: row.locationLabel,
          qtyRemaining: row.qtyRemaining,
        });
      }
    } else {
      byItem.set(row.itemId, {
        itemId: row.itemId,
        itemCode: row.itemCode,
        itemName: row.itemName,
        uom: row.uom,
        totalQty: row.qtyRemaining,
        lots: [
          {
            lotId: row.lotId,
            lotNumber: row.lotNumber,
            locationLabel: row.locationLabel,
            qtyRemaining: row.qtyRemaining,
          },
        ],
      });
    }
  }
  // Sort items descending by total available qty, take top N.
  return Array.from(byItem.values())
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, topN);
}


// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function Home() {

  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();

  if (resolution.kind !== "authorized") {
    return null;
  }

  const { context } = resolution;
  const tier = resolveSessionPresentationTier(context.activeRoleKeys);

  // ─── Capability flags ────────────────────────────────────────────────
  const hasReceivingAccess =
    (await requirePermission(resolver, "receiving.view")).kind === "authorized";
  const hasPickListAccess =
    (await requirePermission(resolver, "pick_list.read")).kind === "authorized";
  const hasTransferAccess =
    (await requirePermission(resolver, "transfer.view")).kind === "authorized";
  const hasInspectionAccess =
    (await requirePermission(resolver, "inspection.perform")).kind === "authorized";
  const hasApprovalAccess =
    (await requirePermission(resolver, "fifo_override.approve")).kind === "authorized";
  const hasReportingAccess =
    (await requirePermission(resolver, "reporting.read")).kind === "authorized";
  const hasFinancialAccess =
    (await requirePermission(resolver, "reporting.financial_read")).kind === "authorized";

  // ─── Display name for greeting ───────────────────────────────────────
  const profileRows = await db
    .select({ displayName: userProfiles.displayName })
    .from(userProfiles)
    .where(eq(userProfiles.id, context.userId))
    .limit(1);
  const displayName = profileRows[0]?.displayName ?? "";
  const firstName = displayName.split(" ")[0] || "there";

  const now = new Date();
  const greeting = getGreetingPeriod(now.getHours());
  const dateString = getTodayString();

  // ─── Capability-gated count aggregates (all tiers) ───────────────────
  const openWrrs = hasReceivingAccess
    ? (
        await listWrrDocuments(db, {
          limit: 1,
          offset: 0,
          status: "receiving_in_progress",
        })
      ).total
    : 0;

  const openPickLists = hasPickListAccess
    ? (
        await listPickLists(db, {
          limit: 1,
          offset: 0,
          status: "allocated",
        })
      ).total
    : 0;

  const pendingTransfers = hasTransferAccess
    ? (
        await listTransferRequests(db, {
          limit: 1,
          offset: 0,
          status: "staged",
        })
      ).total
    : 0;

  const openInspections = hasInspectionAccess
    ? (
        await listInspectionCases(db, {
          status: "open",
          limit: 1,
        })
      ).total
    : 0;

  const pendingApprovals = hasApprovalAccess
    ? (await listPendingApprovalRequests(db, { limit: 1, offset: 0 })).total
    : 0;

  // ─── Floor variant ────────────────────────────────────────────────────
  if (tier === "floor") {
    return (
      <FloorLanding
        firstName={firstName}
        greeting={greeting}
        dateString={dateString}
        openWrrs={openWrrs}
        openPickLists={openPickLists}
        pendingTransfers={pendingTransfers}
        openInspections={openInspections}
      />
    );
  }

  // ─── Weekly/monthly outgoing trend ranges ──────────────────────────────
  // Weekly: last 7 days (inclusive of today). Monthly: month-to-date.
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // ─── Office variant — additional data fetches ─────────────────────────
  // All run in parallel for performance.
  const [
    inventoryKpis,
    stockRows,
    openWrrRows,
    openPickListRows,
    openInspectionRows,
    approvalRows,
    weeklyTrendRows,
    monthlyTrendRows,
    recentWrrRows,
    recentPickListRows,
    dispatchRateRow,
    flowActivityRows,
  ] = await Promise.all([
    // Low Stock Items KPI — operational stock-count metric, gated
    // reporting.read (NOT reporting.financial_read — that gate was wrong
    // for a non-financial count; see specs/05 R11.5 gate-fix decision).
    hasReportingAccess ? getInventoryKpis() : Promise.resolve(null),
    // Master inventory preview — uses listStockView (lot_inventory_totals-backed)
    // Gated reporting.financial_read so only supervisors/admins see it.
    hasFinancialAccess ? listStockView(db) : Promise.resolve([] as StockViewRow[]),
    // Action queue rows (max 3 each)
    hasReceivingAccess
      ? listWrrDocuments(db, { limit: 3, offset: 0, status: "receiving_in_progress" })
      : Promise.resolve({ rows: [] as WrrDocumentRow[], total: 0 }),
    hasPickListAccess
      ? listPickLists(db, { limit: 3, offset: 0, status: "allocated" })
      : Promise.resolve({ rows: [] as PickListRow[], total: 0 }),
    hasInspectionAccess
      ? listInspectionCases(db, { status: "open", limit: 3 })
      : Promise.resolve({ rows: [] as InspectionCaseListRow[], total: 0 }),
    hasApprovalAccess
      ? listPendingApprovalRequests(db, { limit: 3, offset: 0 })
      : Promise.resolve({ rows: [] as ApprovalRequestRow[], total: 0 }),
    // Weekly transaction line graph (R11.3/R11.5 — outgoing qty + CBM only)
    hasPickListAccess
      ? getPickListQtyAndCbmTrend({ startDate: weekStart, endDate: now }, "all", "day")
      : Promise.resolve([] as Array<{ period: string; total_qty: string; total_cbm: string }>),
    // Monthly outgoing KPI summary (month-to-date) — daily granularity
    // (2026-08-19: was period="month", collapsing the whole range into one
    // bucket; changed to "day" so the total can be shown as a bar graph,
    // not just a single number).
    hasPickListAccess
      ? getPickListQtyAndCbmTrend({ startDate: monthStart, endDate: now }, "all", "day")
      : Promise.resolve([] as Array<{ period: string; total_qty: string; total_cbm: string }>),
    // Recent Activity feed source — genuinely recency-sorted (createdAt
    // DESC), distinct from the oldest-first action-queue rows above.
    hasReceivingAccess
      ? listRecentWrrDocuments(db, { limit: 5 })
      : Promise.resolve([] as WrrDocumentRow[]),
    hasPickListAccess
      ? listRecentPickLists(db, { limit: 5 })
      : Promise.resolve([] as PickListRow[]),
    // Dispatch rate ring + flow-type activity bar chart (2026-08-17 restyle)
    // — same weekly range as the Weekly Outgoing Trend chart they sit next to.
    hasPickListAccess
      ? getDispatchRate({ startDate: weekStart, endDate: now })
      : Promise.resolve(null as { dispatched: string; not_dispatched: string } | null),
    hasPickListAccess
      ? getPickListCountByFlow({ startDate: weekStart, endDate: now })
      : Promise.resolve([] as Array<{ flow_type: string; count: string }>),
  ]);

  // Build top-5 inventory preview from stock rows.
  const inventoryPreview = buildInventoryPreview(stockRows, 5);

  // Weekly trend: one point per day, quantity + CBM. No $/sales series
  // (R11.5 — no pricing/billing backend exists yet).
  const weeklyTrend: WeeklyTrendDatum[] = (
    weeklyTrendRows as Array<{ period: string | Date; total_qty: string; total_cbm: string }>
  ).map((row) => ({
    period: new Date(row.period).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    qty: toNumber(row.total_qty),
    cbm: toNumber(row.total_cbm),
  }));

  // Monthly outgoing: daily-granularity rows for the bar graph, plus the
  // month-to-date sum for the headline number (2026-08-19 — was a single
  // stat block, now a graph per user request).
  const monthlyTrendTyped = monthlyTrendRows as Array<{ period: string | Date; total_qty: string }>;
  const monthlyOutgoingQty = monthlyTrendTyped.reduce((sum, row) => sum + toNumber(row.total_qty), 0);
  const monthlyTrend: WeeklyTrendDatum[] = monthlyTrendTyped.map((row) => ({
    period: new Date(row.period).toLocaleDateString("en-US", { day: "numeric" }),
    qty: toNumber(row.total_qty),
    cbm: 0,
  }));

  // Dispatch rate ring data (2026-08-17 restyle) — null when the session
  // lacks pick_list.read, same omission pattern as the heatmap.
  const dispatchRate = hasPickListAccess && dispatchRateRow
    ? {
        dispatched: toNumber(dispatchRateRow.dispatched),
        notDispatched: toNumber(dispatchRateRow.not_dispatched),
      }
    : null;

  // Flow-type activity bar chart data (2026-08-17 restyle).
  const flowActivity = hasPickListAccess
    ? flowActivityRows.map((row) => ({ flowType: row.flow_type, count: toNumber(row.count) }))
    : null;

  // Recent Activity feed (R11.3) — built from listRecentWrrDocuments/
  // listRecentPickLists (createdAt DESC), NOT the openWrrRows/
  // openPickListRows action-queue rows above (those are oldest-first —
  // reusing them here previously surfaced the stalest items as "recent",
  // a data-honesty bug caught by design-system-auditor 2026-08-16).
  //
  // Dedup against the action queues (2026-08-17): a WRR/pick list that's
  // both freshly created AND still open legitimately matches both this
  // recency query and the open-queue query above, so it rendered in both
  // panels simultaneously — the "duplicated open queues" the user reported.
  // Recent Activity is meant to be "what just happened," the action queues
  // are "what still needs action" — excluding already-queued ids here keeps
  // each item in exactly one panel rather than redefining either query.
  const openQueueIds = new Set<string>([
    ...openWrrRows.rows.map((wrr) => `wrr-${wrr.id}`),
    ...openPickListRows.rows.map((pl) => `pl-${pl.id}`),
  ]);
  const recentActivity: RecentActivityItem[] = [
    ...recentWrrRows.map((wrr) => ({
      id: `wrr-${wrr.id}`,
      description: `Receiving in progress: ${wrr.wrrNumber}${wrr.vendorPartyName ? ` from ${wrr.vendorPartyName}` : ""}`,
      timestamp: wrr.createdAt.toISOString(),
    })),
    ...recentPickListRows.map((pl) => ({
      id: `pl-${pl.id}`,
      description: `Pick List allocated: ${pl.pickListNumber}`,
      timestamp: pl.createdAt.toISOString(),
    })),
  ]
    .filter((entry) => !openQueueIds.has(entry.id))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 5);

  // "office" and "party" tiers both receive the office content shape.
  return (
    <OfficeLanding
      dateString={dateString}
      openWrrs={openWrrs}
      openPickLists={openPickLists}
      pendingTransfers={pendingTransfers}
      openInspections={openInspections}
      pendingApprovals={pendingApprovals}
      inventoryKpis={inventoryKpis}
      hasReceivingAccess={hasReceivingAccess}
      hasPickListAccess={hasPickListAccess}
      hasTransferAccess={hasTransferAccess}
      hasInspectionAccess={hasInspectionAccess}
      hasApprovalAccess={hasApprovalAccess}
      hasFinancialAccess={hasFinancialAccess}
      hasReportingAccess={hasReportingAccess}
      openWrrRows={openWrrRows.rows}
      openPickListRows={openPickListRows.rows}
      openInspectionRows={openInspectionRows.rows}
      pendingApprovalRows={approvalRows.rows}
      inventoryPreview={inventoryPreview}
      recentActivity={recentActivity}
      weeklyTrend={weeklyTrend}
      monthlyOutgoingQty={monthlyOutgoingQty}
      monthlyTrend={monthlyTrend}
      dispatchRate={dispatchRate}
      flowActivity={flowActivity}
    />
  );
}
