// `/` — authenticated landing page / dashboard.
//
// Traceability:
//   specs/05-ui-shell-and-navigation/design.md §3.2 (`/` route: capability
//     "none", surface "shared"; §3.3 floor vs. office shell behavior;
//     §3.2 office heatmap widget gated by reporting.read at the widget level).
//   specs/05-ui-shell-and-navigation/requirements.md R11.2 (floor vs. office
//     summary shape per resolved surface), R11.5 (no raw financial metrics
//     on `/`), R11.6 (reporting.read → ActivityHeatmap widget, office/party
//     only).
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

import Link from "next/link";
import {
  PackageCheck,
  ListChecks,
  ArrowLeftRight,
  ClipboardList,
  FlaskConical,
  TrendingDown,
  ShieldAlert,
} from "lucide-react";
import { eq } from "drizzle-orm";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { resolveSessionPresentationTier } from "@/lib/shell/surface";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { listWrrDocuments } from "@/lib/db/queries/receiving";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";
import { listPickLists } from "@/lib/db/queries/withdrawals";
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import { listTransferRequests } from "@/lib/db/queries/transfers";
import { listInspectionCases } from "@/lib/db/queries/transfers";
import type { InspectionCaseListRow } from "@/lib/db/queries/transfers";
import { listPendingApprovalRequests } from "@/lib/db/queries/approvals";
import type { ApprovalRequestRow } from "@/lib/db/queries/approvals";
import { getInventoryKpis } from "@/lib/analytics/queries/inventory";
import { getActivityHeatmap } from "@/lib/analytics/queries/heatmap";
import { listStockView } from "@/lib/db/queries/inventory";
import type { StockViewRow } from "@/lib/db/queries/inventory";
import { KpiCard } from "@/components/analytics/KpiCard";
import { KpiCardGroup } from "@/components/analytics/KpiCardGroup";
import { HomeDashboardHeatmapSection } from "./_components/HomeDashboardHeatmapSection";
import type { FlowType } from "@/components/analytics/types";

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

function toFlowType(filter: string): FlowType {
  const lower = filter.toLowerCase();
  if (lower === "vmi" || lower === "trading" || lower === "supplies") return lower;
  return "all";
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

// ─── Floor surface ─────────────────────────────────────────────────────────────
//
// brand-design-system.md §3/§6/§9: dark navy bg, solid surfaces (no
// glassmorphism), h-16 full-width primary CTA, active: press feedback only
// (no hover), all text ≥ 16px, floor primary touch targets 64px min.
//
// 4 tappable count cards: Open WRRs, Active Picks, Pending Transfers, Open Inspections.

function FloorLanding({
  firstName,
  greeting,
  dateString,
  openWrrs,
  openPickLists,
  pendingTransfers,
  openInspections,
}: {
  firstName: string;
  greeting: string;
  dateString: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
  openInspections: number;
}) {
  return (
    <div className="flex min-h-full flex-col gap-6 bg-brand-navy px-4 py-6">
      {/* ── Greeting header ──────────────────────────────────────────────── */}
      <header>
        <h1 className="font-heading text-headline-lg font-extrabold text-white">
          Good {greeting}, {firstName}
        </h1>
        <p className="mt-1 font-body text-body-md text-white/70">{dateString}</p>
      </header>

      {/* ── Shift Overview ────────────────────────────────────────────────
          brand-design-system.md §3: floor primary touch targets 64px min.
          4 tappable count cards, each linking to the relevant floor page. */}
      <section
        aria-label="Shift overview"
        data-testid="landing-task-counts"
      >
        <h2 className="mb-3 font-label text-body-md uppercase tracking-wide text-white/70">
          Shift Overview
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/receiving"
            data-testid="floor-card-wrrs"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-white/10 px-3 py-4 text-center motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
          >
            <PackageCheck size={24} strokeWidth={2} aria-hidden="true" className="text-white/70" />
            <span className="font-heading text-data-display font-extrabold text-white">
              {openWrrs}
            </span>
            <span className="font-body text-body-md text-white/70">Open WRRs</span>
          </Link>
          <Link
            href="/outgoing"
            data-testid="floor-card-picks"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-white/10 px-3 py-4 text-center motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
          >
            <ListChecks size={24} strokeWidth={2} aria-hidden="true" className="text-white/70" />
            <span className="font-heading text-data-display font-extrabold text-white">
              {openPickLists}
            </span>
            <span className="font-body text-body-md text-white/70">Active Picks</span>
          </Link>
          <Link
            href="/transfers"
            data-testid="floor-card-transfers"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-white/10 px-3 py-4 text-center motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
          >
            <ArrowLeftRight size={24} strokeWidth={2} aria-hidden="true" className="text-white/70" />
            <span className="font-heading text-data-display font-extrabold text-white">
              {pendingTransfers}
            </span>
            <span className="font-body text-body-md text-white/70">Pending Transfers</span>
          </Link>
          <Link
            href="/inspection"
            data-testid="floor-card-inspections"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-white/10 px-3 py-4 text-center motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
          >
            <FlaskConical size={24} strokeWidth={2} aria-hidden="true" className="text-white/70" />
            <span className="font-heading text-data-display font-extrabold text-white">
              {openInspections}
            </span>
            <span className="font-body text-body-md text-white/70">Open Inspections</span>
          </Link>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────
          Full-width bg-brand-red h-16 per §9 floor primary action rules. */}
      <Link
        href="/receiving"
        data-testid="landing-work-queue-cta"
        className="mt-auto flex h-16 w-full items-center justify-center rounded-xl bg-brand-red font-label text-body-md uppercase tracking-wide text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy motion-safe:transition-transform motion-safe:duration-100 active:scale-[0.97]"
      >
        View All Open Work
      </Link>
    </div>
  );
}

// ─── Office surface ────────────────────────────────────────────────────────────
//
// 3-row office dashboard:
// Row 1: KPI strip (operational counts, gated by capability)
// Row 2: Activity heatmap (gated reporting.read, omitted entirely if missing)
// Row 3: Master Inventory Preview (left) + Action Queues (right)

function OfficeLanding({
  dateString,
  // KPI counts — each omitted (shown as "-") if user lacks the capability
  openWrrs,
  openPickLists,
  pendingTransfers,
  openInspections,
  pendingApprovals,
  inventoryKpis,
  hasReceivingAccess,
  hasPickListAccess,
  hasTransferAccess,
  hasInspectionAccess,
  hasApprovalAccess,
  hasFinancialAccess,
  // Heatmap — null means the user lacks reporting.read
  heatmapData,
  heatmapFilter,
  // Action queue rows (max 3 each)
  openWrrRows,
  openPickListRows,
  openInspectionRows,
  pendingApprovalRows,
  // Master inventory preview (top 5 items by stock level)
  inventoryPreview,
}: {
  dateString: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
  openInspections: number;
  pendingApprovals: number;
  inventoryKpis: { totalLotsInStock: number; totalCommittedQty: number; lowStockItemsCount: number } | null;
  hasReceivingAccess: boolean;
  hasPickListAccess: boolean;
  hasTransferAccess: boolean;
  hasInspectionAccess: boolean;
  hasApprovalAccess: boolean;
  hasFinancialAccess: boolean;
  heatmapData: Array<{ date: string; count: number }> | null;
  heatmapFilter: FlowType;
  openWrrRows: WrrDocumentRow[];
  openPickListRows: PickListRow[];
  openInspectionRows: InspectionCaseListRow[];
  pendingApprovalRows: ApprovalRequestRow[];
  inventoryPreview: ItemPreviewRow[];
}) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-6 lg:px-8 lg:py-10">
      {/* Page header */}
      <header className="mb-6">
        <h1 className="font-heading text-headline-xl font-extrabold text-on-surface lg:hidden">
          Overview Dashboard
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">{dateString}</p>
      </header>

      {/* ── Row 1: KPI strip ───────────────────────────────────────────────
          6 operational count cards. Capability-gated: card shows "—" not an
          error state when the session lacks the required capability.
          brand-design-system.md §2: data-display (Space Grotesk SemiBold) for
          numbers, label (Inter SemiBold uppercase) for captions.
          Left-accent-bar only on nonzero attention items: low stock, pending
          approvals. */}
      <section aria-label="Key performance indicators" className="mb-8">
        <KpiCardGroup>
          {hasReceivingAccess ? (
            <KpiCard
              label="Open WRRs"
              value={openWrrs}
              trend={{ direction: "flat", pct: 0 }}
              icon={<PackageCheck size={22} />}
              linkTo="/receiving"
            />
          ) : (
            <KpiCard
              label="Open WRRs"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<PackageCheck size={22} />}
            />
          )}

          {hasPickListAccess ? (
            <KpiCard
              label="Active Picks"
              value={openPickLists}
              trend={{ direction: "flat", pct: 0 }}
              icon={<ListChecks size={22} />}
              linkTo="/outgoing"
            />
          ) : (
            <KpiCard
              label="Active Picks"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<ListChecks size={22} />}
            />
          )}

          {hasTransferAccess ? (
            <KpiCard
              label="Pending Transfers"
              value={pendingTransfers}
              trend={{ direction: pendingTransfers > 0 ? "up" : "flat", pct: 0 }}
              icon={<ArrowLeftRight size={22} />}
              statusColor={pendingTransfers > 0 ? "pending" : undefined}
              linkTo="/transfers"
            />
          ) : (
            <KpiCard
              label="Pending Transfers"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<ArrowLeftRight size={22} />}
            />
          )}

          {hasInspectionAccess ? (
            <KpiCard
              label="Open Inspections"
              value={openInspections}
              trend={{ direction: openInspections > 0 ? "up" : "flat", pct: 0 }}
              icon={<FlaskConical size={22} />}
              statusColor={openInspections > 0 ? "pending" : undefined}
              linkTo="/inspection"
            />
          ) : (
            <KpiCard
              label="Open Inspections"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<FlaskConical size={22} />}
            />
          )}

          {/* Low Stock — gated reporting.financial_read (inventory KPIs) */}
          {hasFinancialAccess && inventoryKpis ? (
            <KpiCard
              label="Low Stock Items"
              value={inventoryKpis.lowStockItemsCount}
              trend={{ direction: inventoryKpis.lowStockItemsCount > 0 ? "up" : "flat", pct: 0 }}
              icon={<TrendingDown size={22} />}
              statusColor={inventoryKpis.lowStockItemsCount > 0 ? "held" : undefined}
              linkTo="/inventory"
            />
          ) : (
            <KpiCard
              label="Low Stock Items"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<TrendingDown size={22} />}
            />
          )}

          {/* Pending Approvals — gated fifo_override.approve */}
          {hasApprovalAccess ? (
            <KpiCard
              label="Pending Approvals"
              value={pendingApprovals}
              trend={{ direction: pendingApprovals > 0 ? "up" : "flat", pct: 0 }}
              icon={<ShieldAlert size={22} />}
              statusColor={pendingApprovals > 0 ? "pending" : undefined}
              linkTo="/approvals"
            />
          ) : (
            <KpiCard
              label="Pending Approvals"
              value="—"
              trend={{ direction: "flat", pct: 0 }}
              icon={<ShieldAlert size={22} />}
            />
          )}
        </KpiCardGroup>
      </section>

      {/* ── Row 2: Activity Heatmap ───────────────────────────────────────
          Gated reporting.read — omitted entirely if session lacks it (no
          locked placeholder). brand-design-system.md §3.2 R11.6. */}
      {heatmapData !== null && (
        <section aria-label="Inventory activity heatmap" className="mb-8">
          <HomeDashboardHeatmapSection
            data={heatmapData}
            flowFilter={heatmapFilter}
          />
        </section>
      )}

      {/* ── Row 3: Master Inventory Preview + Action Queues ───────────────
          Two panels side by side on desktop, stacked on mobile. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">

        {/* Left: Master Inventory Preview (top 5 items by stock level) */}
        <section aria-label="Top inventory items" className="rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
          <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4">
            <h2 className="font-heading text-headline-md font-semibold text-on-surface">
              Top Stock Items
            </h2>
            <Link
              href="/inventory"
              className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              View All
            </Link>
          </div>

          {inventoryPreview.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-body text-body-md text-text-grey">No stock items available.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      Item
                    </th>
                    <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      Stock
                    </th>
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      Lots / Locations
                    </th>
                    <th className="sr-only px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {inventoryPreview.map((item) => {
                    // Collect dispersed locations (unique location labels across all lots)
                    const locations = [...new Set(item.lots.map((l) => l.locationLabel))];
                    const lotCount = item.lots.length;
                    return (
                      <tr key={item.itemId} className="hover:bg-surface-light-grey/50">
                        <td className="px-4 py-3">
                          <p className="font-mono text-mono-md font-bold text-on-surface">
                            {item.itemCode}
                          </p>
                          <p className="mt-0.5 font-body text-body-sm text-text-grey">
                            {item.itemName}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-mono-md text-on-surface">
                          {item.totalQty.toLocaleString()}
                          <span className="ml-1 font-body text-body-sm text-text-grey">
                            {item.uom}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-body text-body-sm text-text-grey">
                            {lotCount} lot{lotCount !== 1 ? "s" : ""}
                          </p>
                          <p className="mt-0.5 font-mono text-mono-md text-on-surface">
                            {locations.slice(0, 3).join(", ")}
                            {locations.length > 3 ? ` +${locations.length - 3}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <Link
                              href={`/inventory?item=${item.itemCode}`}
                              className="inline-flex h-8 items-center rounded border border-outline-variant/30 px-2 font-label text-body-sm text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                            >
                              Balance
                            </Link>
                            <Link
                              href={`/inventory?item=${item.itemCode}&view=lots`}
                              className="inline-flex h-8 items-center rounded border border-outline-variant/30 px-2 font-label text-body-sm text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                            >
                              Lots
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right: Action Queues */}
        <aside className="space-y-4">
          {/* Open WRRs */}
          {hasReceivingAccess && (
            <div className="rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
              <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
                <h3 className="font-heading text-headline-md font-semibold text-on-surface">
                  Open WRRs
                </h3>
                <Link
                  href="/receiving"
                  className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  View all
                </Link>
              </div>
              {openWrrRows.length === 0 ? (
                <p className="px-4 py-4 font-body text-body-md text-status-available">
                  All clear
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/30">
                  {openWrrRows.map((wrr) => (
                    <div key={wrr.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-mono text-mono-md font-bold text-on-surface truncate">
                          {wrr.wrrNumber}
                        </p>
                        <p className="font-body text-body-sm text-text-grey truncate">
                          {wrr.vendorPartyName ?? "—"}
                        </p>
                      </div>
                      <Link
                        href={`/receiving/${wrr.id}/receive`}
                        className="shrink-0 inline-flex h-9 items-center rounded bg-brand-red px-3 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        Receive
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Allocated Pick Lists */}
          {hasPickListAccess && (
            <div className="rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
              <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
                <h3 className="font-heading text-headline-md font-semibold text-on-surface">
                  Active Pick Lists
                </h3>
                <Link
                  href="/outgoing"
                  className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  View all
                </Link>
              </div>
              {openPickListRows.length === 0 ? (
                <p className="px-4 py-4 font-body text-body-md text-status-available">
                  All clear
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/30">
                  {openPickListRows.map((pl) => (
                    <div key={pl.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <p className="font-mono text-mono-md font-bold text-on-surface truncate">
                        {pl.pickListNumber}
                      </p>
                      <Link
                        href={`/pick-lists/${pl.id}/pick`}
                        className="shrink-0 inline-flex h-9 items-center rounded bg-brand-red px-3 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        Pick
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pending Approvals */}
          {hasApprovalAccess && (
            <div className="rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
              <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
                <h3 className="font-heading text-headline-md font-semibold text-on-surface">
                  Pending Approvals
                </h3>
                <Link
                  href="/approvals"
                  className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  View all
                </Link>
              </div>
              {pendingApprovalRows.length === 0 ? (
                <p className="px-4 py-4 font-body text-body-md text-status-available">
                  All clear
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/30">
                  {pendingApprovalRows.map((req) => (
                    <div key={req.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <p className="font-label text-label uppercase text-status-pending truncate">
                        {req.approvalType.replace(/_/g, " ")}
                      </p>
                      <Link
                        href={`/approvals/${req.id}`}
                        className="shrink-0 inline-flex h-9 items-center rounded bg-brand-red px-3 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        Review
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Open Inspection Cases */}
          {hasInspectionAccess && (
            <div className="rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
              <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
                <h3 className="font-heading text-headline-md font-semibold text-on-surface">
                  Open Inspections
                </h3>
                <Link
                  href="/inspection"
                  className="font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  View all
                </Link>
              </div>
              {openInspectionRows.length === 0 ? (
                <p className="px-4 py-4 font-body text-body-md text-status-available">
                  All clear
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/30">
                  {openInspectionRows.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-mono text-mono-md font-bold text-on-surface truncate">
                          {c.itemCode}
                        </p>
                        <p className="font-body text-body-sm text-text-grey truncate">
                          {c.lotNumber}
                        </p>
                      </div>
                      <Link
                        href={`/inspection/${c.id}`}
                        className="shrink-0 inline-flex h-9 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        Inspect
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const { filter: filterParam } = await searchParams;
  const heatmapFilter = toFlowType(filterParam ?? "all");

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

  // ─── Office variant — additional data fetches ─────────────────────────
  // All run in parallel for performance.
  const [
    inventoryKpis,
    heatmapData,
    stockRows,
    openWrrRows,
    openPickListRows,
    openInspectionRows,
    approvalRows,
  ] = await Promise.all([
    // Inventory KPIs — gated reporting.financial_read
    hasFinancialAccess ? getInventoryKpis() : Promise.resolve(null),
    // Activity heatmap — gated reporting.read; null → omit entirely
    hasReportingAccess ? getActivityHeatmap(heatmapFilter) : Promise.resolve(null),
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
  ]);

  // Build top-5 inventory preview from stock rows.
  const inventoryPreview = buildInventoryPreview(stockRows, 5);

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
      heatmapData={heatmapData}
      heatmapFilter={heatmapFilter}
      openWrrRows={openWrrRows.rows}
      openPickListRows={openPickListRows.rows}
      openInspectionRows={openInspectionRows.rows}
      pendingApprovalRows={approvalRows.rows}
      inventoryPreview={inventoryPreview}
    />
  );
}
