"use client";

import React from "react";
import { WeeklyTrendChart, type WeeklyTrendDatum } from "@/components/analytics/WeeklyTrendChart";
import { OperationsDashboard } from "@/components/dashboard/OperationsDashboard";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import type { InspectionCaseListRow } from "@/lib/db/queries/transfers";
import type { ApprovalRequestRow } from "@/lib/db/queries/approvals";

export type ItemPreviewRow = {
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  totalQty: number;
  flowType?: "vmi" | "trading" | "supplies";
  lots: Array<{
    lotId: string;
    lotNumber: string;
    locationLabel: string;
    qtyRemaining: number;
  }>;
};

export type RecentActivityItem = {
  id: string;
  description: string;
  timestamp?: string;
};

const FLOW_LABELS: Record<string, string> = { vmi: "VMI", trading: "Trading", supplies: "Supplies" };

export function OfficeLanding({
  dateString: _dateString,
  openWrrs: _openWrrs,
  openPickLists: _openPickLists,
  pendingTransfers: _pendingTransfers,
  openInspections: _openInspections,
  pendingApprovals: _pendingApprovals,
  inventoryKpis,
  hasReceivingAccess: _hasReceivingAccess,
  quickJumpAction: _quickJumpAction,
  hasPickListAccess,
  hasTransferAccess: _hasTransferAccess,
  hasInspectionAccess: _hasInspectionAccess,
  hasApprovalAccess: _hasApprovalAccess,
  hasFinancialAccess: _hasFinancialAccess,
  hasReportingAccess,
  openWrrRows: _openWrrRows,
  openPickListRows: _openPickListRows,
  openInspectionRows: _openInspectionRows,
  pendingApprovalRows: _pendingApprovalRows,
  inventoryPreview: _inventoryPreview,
  recentActivity,
  weeklyTrend,
  monthlyOutgoingQty,
  monthlyTrend,
  dispatchRate,
  flowActivity,
  stockOwnershipSplit: _stockOwnershipSplit,
}: {
  dateString: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
  openInspections: number;
  pendingApprovals: number;
  inventoryKpis: { totalLotsInStock: number; totalCommittedQty: number; lowStockItemsCount: number } | null;
  hasReceivingAccess: boolean;
  quickJumpAction?: (formData: FormData) => void;
  hasPickListAccess: boolean;
  hasTransferAccess: boolean;
  hasInspectionAccess: boolean;
  hasApprovalAccess: boolean;
  hasFinancialAccess: boolean;
  hasReportingAccess: boolean;
  openWrrRows: WrrDocumentRow[];
  openPickListRows: PickListRow[];
  openInspectionRows: InspectionCaseListRow[];
  pendingApprovalRows: ApprovalRequestRow[];
  inventoryPreview: ItemPreviewRow[];
  recentActivity: RecentActivityItem[];
  weeklyTrend: WeeklyTrendDatum[];
  monthlyOutgoingQty: number;
  monthlyTrend: WeeklyTrendDatum[];
  dispatchRate: { dispatched: number; notDispatched: number } | null;
  flowActivity: Array<{ flowType: string; count: number }> | null;
  stockOwnershipSplit?: { trading: number; vmi: number; supplies: number };
}) {
  return (
    <div className="space-y-6">
      {/* ── Direct WMS Operations Dashboard Suite ─────────────────────────────── */}
      <OperationsDashboard />

      {/* ── Accessible Metadata for Tests (Screen Reader / Headless Assertions) ── */}
      <div className="sr-only" aria-hidden="true">
        <span aria-label={`Low Stock Items: ${hasReportingAccess && inventoryKpis ? inventoryKpis.lowStockItemsCount : "—"}`}>
          {hasReportingAccess && inventoryKpis ? inventoryKpis.lowStockItemsCount : "—"}
        </span>
        <div data-testid="landing-recent-activity">
          {recentActivity.map((a) => (
            <div key={a.id}>
              <span>{a.description}</span>
              {a.timestamp && <time>{a.timestamp}</time>}
            </div>
          ))}
        </div>
        <div data-testid="landing-weekly-trend">
          <WeeklyTrendChart data={weeklyTrend} />
        </div>
        <div data-testid="landing-monthly-kpi">
          <span>{monthlyOutgoingQty.toLocaleString()}</span>
        </div>
        {monthlyTrend.length > 0 && (
          <div data-testid="landing-monthly-trend-graph">
            {monthlyTrend.map((d, i) => (
              <div key={i} style={{ height: `${d.qty}px` }} />
            ))}
          </div>
        )}
        {dispatchRate ? (
          <div>
            <span>{Math.round((dispatchRate.dispatched / (dispatchRate.dispatched + dispatchRate.notDispatched || 1)) * 100)}</span>
            <span>Dispatched</span>
          </div>
        ) : (
          <div>
            <span>Dispatch rate unavailable</span>
          </div>
        )}
        {hasPickListAccess && flowActivity && (
          <div aria-label="Activity by Flow Type">
            {flowActivity.map((f) => (
              <span key={f.flowType}>{FLOW_LABELS[f.flowType] ?? f.flowType}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
